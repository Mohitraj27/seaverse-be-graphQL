const {
    CustomError,
    ErrorName,
    AuthUser,
    Role,
    DbTransactionHelper,
    CurrentDateTime,
} = require("../../util");
const { ObjectId } = require("../../tools");
const { Training } = require("./training_model");
const { TrainingModule } = require("./training_modules/training_module_model");
const {
    TrainingModuleContent,
} = require("./training_modules/training_module_contents/training_module_content_model");
const { TrainingCategory } = require("./training_categories/training_category_model");
const {
    TrainingSubCategory,
} = require("./training_categories/training_sub_categories/training_sub_category_model");

const TrainingHelper = require("./training_helper");
const TrainingModuleHelper = require("./training_modules/training_module_helper");
const TrainingModuleContentHelper = require("./training_modules/training_module_contents/training_module_content_helper");
const SubRoleHelper = require("../user/sub-roles/sub_role_helper");
const LogHelper = require("../logs/log_helper");

const Permission = require("../user/sub-roles/permission.json");
const ApprovalStatus = require("./approval_status.json");
const LogType = require("../logs/log_type.json");
const ScromHelper = require("./scrom_helper");
const ContentStatus = require("./training_modules/training_module_contents/content_status.json");
const {
    queries,
} = require("./training_modules/training_module_contents/training_module_content_resolver");
const { TrainingContentBridge } = require("./training_content_bridge/training_content_model");
const { TrainingProgress } = require("../training-registrations/training-progress/training_progress_model");
const { TrainingRegistration } = require("../training-registrations/training_registration_model");
const { OverallTrainingProgress } = require("../training-registrations/overall-course-progress/overall_progress_model");
const { populate, validate } = require("../contact-support/contact_support_model");
const { certificateLayout } = require("../../app/trainings/certificate_layout/certificateLayout_model");
const { createOrUpdateTrainingMigrationCourses } = require("../../app/trainings/migrationcourses/migrationcourses_helper");

module.exports.queries = {
    getTrainings: async ({ pageInput, filterInput }, context) => {
        const { role, userPermissions, subscriberId } = AuthUser(context);

        if (role && role === Role.LEARNER) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const skip = pageInput?.skip ?? 0;
        let limit = pageInput?.limit ?? 50;

        let filterConditions = { subscriber: subscriberId, isDeleted: false };
        let sortOrder = { updatedAt: -1 };
        if (filterInput) {

            if (filterInput.search) {
                const searchRegex = {
                    $regex: ".*" + filterInput.search + ".*",
                    $options: "i",
                };

                filterConditions["$or"] = [
                    { "title.value": searchRegex },
                    { authorName: searchRegex },
                ];
            }

            if (typeof filterInput.isActive === "boolean")
                filterConditions.isActive = filterInput.isActive;

            if (filterInput.status) filterConditions.status = filterInput.status;
            if (filterInput?.dateFilter) {
                if (filterInput.dateFilter === -1) {
                    sortOrder = { updatedAt: "descending" };
                } else {
                    sortOrder = { updatedAt: "ascending" };
                }
            }
        }

        const result = await Training.aggregate([
            { $match: filterConditions },
            { $sort: sortOrder },
            {
                $facet: {
                    trainings: [
                        { $skip: skip },
                        { $limit: limit },
                        {
                            $lookup: {
                                from: "users",
                                localField: "updatedBy",
                                foreignField: "_id",
                                as: "createdByDetails",
                            },
                        },
                        {
                            $lookup: {
                                from: "overalltrainingprogresses",
                                localField: "_id",
                                foreignField: "training",
                                as: "trainingUsers",
                            },
                        },
                        {
                            $addFields: {
                                createdBy: { $arrayElemAt: ["$createdByDetails", 0] },
                                countOfUsers: { $size: "$trainingUsers" },
                            },
                        },
                        { $project: { createdByDetails: 0 } },
                    ],
                },
            },
            {
                $project: {
                    trainings: 1
                },
            },
        ]);

        const { trainings } = result[0];
        return {
            totalCount: trainings.length,
            trainings,
        };
    },
    getTraining: async ({ id }, context) => {
        const { role, userPermissions, subscriberId } = AuthUser(context);

        const training = await Training.findOne({
            _id: id,
            subscriber: subscriberId,
        })
            .lean()
            .populate("createdBy")
            .populate("targetAudienceId")
            .populate({
                path: "trainingModules",
                match: { isDeleted: { $ne: true } },
                options: { sort: { order: 1 } },
            });

        const moduleBridgeIDs = training.trainingModules.map(module => module._id);

        const countOfUsers = await OverallTrainingProgress.countDocuments({
            training: { $in: training._id }
        });

        const latestContents = await TrainingContentBridge.find({
            trainingModule: { $in: moduleBridgeIDs },
            isDeleted: false,
        })
            .populate({
                path: 'trainingContent',
                model: 'TrainingModuleContent',
                populate: ({
                    path: "quiz",
                    model: "Question",
                    populate: [
                        {
                            path: 'choices',
                            select: { _id: 1, question: 1, choice: 1 }
                        }
                    ]
                })
            })
            .sort({ order: 1 });

        const moduleContentsMap = {};
        latestContents.forEach(content => {
            if (!moduleContentsMap[content.trainingModule]) {
                moduleContentsMap[content.trainingModule] = [];
            }
            moduleContentsMap[content.trainingModule].push(content.trainingContent);
        });

        training.trainingModules.forEach(module => {
            module.trainingModuleContents = moduleContentsMap[module._id] || [];
        });
        const migrationCoursesId = training.migrationCoursesId || null;
        return { ...training, countOfUsers, migrationCoursesId };
    },

};

module.exports.mutations = {
    createOrUpdateTraining: async ({ input, coverImage, bannerImage }, context) => {

        const { role, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);
        const moduleContentIds = [];
        if (!input._id) {
            if (!input.authorName && input.status === "PUBLISHED") throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Author name is required");
            if (!input.title?.length) throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Title is required");
            if (!input.description?.length && input.status === "PUBLISHED") throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Description is required");
        }
        if (input.training?.length && input.trainingModules?.length) {
            moduleContentIds = await TrainingContentBridge.find(
                { training: input.training, trainingModule: { $in: input.trainingModules } }
            );
        }

        let totalDurationSeconds = 0;

        if (input.trainingModules?.length) {
            for (const module of input.trainingModules) {
                for (const content of module.trainingModuleContents || []) {
                    const trainingContent = await TrainingModuleContent.findOne({ _id: content._id }).select("duration").lean();
                    const duration = trainingContent?.duration || 0;
                    totalDurationSeconds += duration;
                }
            }
        }

        const totalDuration = Math.round(totalDurationSeconds);
        input.durationHours = totalDuration;

        const savedTraining = await DbTransactionHelper.performDbTransaction(async session => {

            const savedTraining = await TrainingHelper.createOrUpdateTraining(
                { input, coverImage, bannerImage, session },
                context
            );

            savedTraining.trainingModules = [];
            let savedTrainingModule;
            if (input.trainingModules?.length) {
                savedTrainingModule =
                    await TrainingModuleHelper.createOrUpdateTrainingModule(
                        {
                            input: {
                                ...input,
                                training: savedTraining,
                            },
                            session,
                        },
                        context
                    );
            }

            const savedTrainingModuleIDs = savedTrainingModule?.result?.upserted?.map(item => item._id)

            input.trainingModules?.forEach((trainingModule, index) => {
                if (!trainingModule._id) {
                    const newId = savedTrainingModuleIDs.shift();
                    if (newId) {
                        trainingModule._id = newId;
                    }
                }
            });

            if (input.trainingModules?.length) {
                savedTrainingContent = await TrainingModuleContentHelper.createOrUpdateTrainingModuleContentInTrainingCreation(
                    {
                        input: {
                            trainingModules: input.trainingModules,
                            training: savedTraining,
                        },
                        session,
                    },
                    context
                );
            }

            if (input.deletedTrainingModules?.length) {
                await TrainingModule.updateMany(
                    {
                        _id: { $in: input.deletedTrainingModules },
                        subscriber: subscriberId,
                        training: savedTraining._id,
                    },
                    { isDeleted: true },
                    { lean: true, session }
                );

                await TrainingContentBridge.updateMany(
                    {
                        training: savedTraining._id,
                        trainingModule: { $in: input.deletedTrainingModules },
                    },
                    { isDeleted: true },
                    { lean: true, session }
                );
            }

            if (input.migrationcoursesId && input.migrationcoursesId !== null && input._id) {
                await createOrUpdateTrainingMigrationCourses({ input }, session, context);
            } else {
                if (input.migrationcoursesId) {
                    const migrationcoursesIdObjectId = new ObjectId(input.migrationcoursesId);
                    savedTraining.migrationcoursesId = migrationcoursesIdObjectId;
                }
            }
            return savedTraining;
        });

        if (!savedTraining) throw CustomError(ErrorName.FAILED);
        TrainingHelper.sendNotificationOnCRUD({
            subscriber: subscriberId,
            training: savedTraining,
            action: input._id ? "UPDATED" : "CREATED",
            createdBy: userInfo,
        });

        LogHelper.logActivity({
            subscriber: subscriberId,
            logType: LogType.TRAINING_LOG,
            operation: input._id ? "UPDATE" : "CREATE",
            ipInfo: context.ipInfo,
            affected: [
                {
                    targetRef: "Training",
                    target: savedTraining._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "TRAINING_INFO",
                    infoData: JSON.stringify(input),
                },
            ],
            createdBy: userInfo,
        });
        const message = input._id ? `Training updated successfully` : `Training created successfully`;
        return {
            status: 1,
            message: message,
            trainingId: savedTraining._id,
            trainingName: savedTraining.title[0].value,
        };
    },
    deleteTraining: async ({ id }, context) => {

        const { role, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        let deletedTraining = await Training.findOne({
            _id: id,
            subscriber: subscriberId,
        });

        if (!deletedTraining) throw CustomError(ErrorName.NOT_FOUND);

        if (![ContentStatus.DRAFT, ContentStatus.RETIRED].includes(deletedTraining.status)) {
            throw CustomError(
                ErrorName.FORBIDDEN,
                `Deleting a course with status ${deletedTraining.status} is not allowed`
            );
        }

        try {
            deletedTraining.isDeleted = true;
            deletedTraining.isActive = false;
            deletedTraining.deletedDate = new Date();
            const updateTraining = await deletedTraining.save();

            if (updateTraining) {

                const updateOverallTrainingProgress = await OverallTrainingProgress.updateMany(
                    { training: id },
                    { isDeleted: true }
                )

            }

        } catch (error) {
            throw CustomError(ErrorName.FAILED, `Failed to delete course`);
        }

        if (!deletedTraining) throw CustomError(ErrorName.FORBIDDEN);
        TrainingHelper.sendNotificationOnCRUD({
            subscriber: subscriberId,
            training: deletedTraining,
            action: "DELETED",
            createdBy: userInfo,
        });

        LogHelper.logActivity({
            subscriber: subscriberId,
            logType: LogType.TRAINING_LOG,
            operation: "DELETE",
            ipInfo: context.ipInfo,
            affected: [
                {
                    targetRef: "Training",
                    target: deletedTraining._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "TRAINING_INFO",
                    infoData: JSON.stringify(deletedTraining),
                },
            ],
            createdBy: userInfo,
        });

        return deletedTraining;
    },
    updateTrainingStatus: async ({ input }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        const currentTraining = await Training.findOne({
            _id: input.id,
            subscriber: subscriberId,
        });
        if (!currentTraining) throw CustomError(ErrorName.NOT_FOUND, "Training not found.");
        const currentStatus = currentTraining.status;
        const updateFields = {};
        if (input.newStatus) {
            const newStatus = input.newStatus;
            const invalidUpdates = [];
            if (currentStatus === ContentStatus.PUBLISHED && newStatus === ContentStatus.DRAFT) {
                invalidUpdates.push({
                    name: currentTraining.title,
                    reason: "Published to Draft is not allowed directly. Must move to Retired first.",
                });
                throw CustomError(ErrorName.FORBIDDEN, "Invalid status transition: Published to Draft is not allowed.");
            } else if (
                currentStatus === ContentStatus.PUBLISHED &&
                newStatus === ContentStatus.RETIRED
            ) {
                updateFields.status = newStatus;
            } else if (
                currentStatus === ContentStatus.DRAFT &&
                newStatus === ContentStatus.PUBLISHED
            ) {
                updateFields.status = newStatus;
            } else if (
                currentStatus === ContentStatus.RETIRED &&
                newStatus === ContentStatus.PUBLISHED
            ) {
                updateFields.status = newStatus;
            } else {
                invalidUpdates.push({
                    name: currentTraining.title,
                    reason: "Invalid status transition.",
                });
                throw CustomError(ErrorName.FORBIDDEN, "Invalid status transition.");
            }
        }

        currentTraining.status = updateFields.status;
        currentTraining.updatedBy = userId;
        currentTraining.updatedAt = new Date();
        currentTraining.modifiedDate = new Date();
        await currentTraining.save();

        if (!currentTraining) throw CustomError(ErrorName.NOT_FOUND);

        return {
            status: 1,
            message: "Status updated successfully!"
        };
    },
    approveOrRejectTraining: async ({ id, approvalStatus }, context) => {
        const { role, userId, userInfo, subscriberId } = AuthUser(context);

        if (role !== Role.ADMIN) throw CustomError(ErrorName.FORBIDDEN);

        const savedTraining = await Training.findOneAndUpdate(
            {
                _id: id,
                subscriber: subscriberId,
            },
            {
                approvalStatus,
                ...(approvalStatus === ApprovalStatus.APPROVED
                    ? { approvedAt: CurrentDateTime().utcDateTime }
                    : approvalStatus === ApprovalStatus.REJECTED
                        ? { rejectedAt: CurrentDateTime().utcDateTime }
                        : undefined),
            },
            { new: true, lean: true }
        ).select("title approvalStatus approvedAt rejectedAt isActive createdBy");

        if (!savedTraining) throw CustomError(ErrorName.NOT_FOUND);

        TrainingHelper.sendNotificationOnCRUD({
            subscriber: subscriberId,
            training: savedTraining,
            action: approvalStatus,
            notifiers: [savedTraining.createdBy],
            createdBy: userInfo,
        });

        return savedTraining;
    },
    submitTrainingForApproval: async ({ id }, context) => {
        const { role, userId, userInfo, subscriberId } = AuthUser(context);

        const savedTraining = await Training.findOneAndUpdate(
            {
                _id: id,
                subscriber: subscriberId,
                createdBy: userId,
                $or: [{ approvalStatus: null }, { approvalStatus: ApprovalStatus.PREPARING }],
            },
            {
                approvalStatus:
                    role === Role.ADMIN ? ApprovalStatus.APPROVED : ApprovalStatus.PENDING,
                appliedAt: CurrentDateTime().utcDateTime,
            },
            { new: true, lean: true }
        ).select("approvalStatus appliedAt title");

        if (!savedTraining) throw CustomError(ErrorName.NOT_FOUND);

        if (role !== Role.ADMIN) {
            TrainingHelper.sendNotificationOnCRUD({
                subscriber: subscriberId,
                training: savedTraining,
                action: "APPROVAL_REQUEST",
                createdBy: userInfo,
            });
        }

        return savedTraining;
    },
    syncOfflineDataAndUpdateProgress: async ({ input }, context) => {

        const { role, userId, userInfo } = AuthUser(context);

        try {

            if (!userId) throw CustomError(ErrorName.NOT_FOUND);
            if (!input) throw CustomError(ErrorName.ARGUMENTS_REQUIRED);

            const validateErrors = await TrainingHelper.validateSyncOfflineData(input);

            if (validateErrors.length > 0) {
                throw CustomError(ErrorName.FAILED, validateErrors[0]);
            }

            input.forEach((entry) => {
                entry.trainingModules?.forEach((module) => {
                    module.contentDetails?.forEach((content) => {
                        if (content.progressPercentage == 100) {
                            content.contentStatus = 'COMPLETED';
                        } else if (content.progressPercentage == 0) {
                            content.contentStatus = 'NOT_STARTED';
                        } else if (content.progressPercentage > 0 && content.progressPercentage < 100) {
                            content.contentStatus = 'IN_PROGRESS';
                        }
                    })
                })
            })

            let updateTrainingProgress;
            const updatedTraining = await DbTransactionHelper.performDbTransaction(async session => {

                let syncContentErrors = [];
                const syncContentsToOverallTrainingProgress = await TrainingHelper.addDataToOverallTrainingProgress(input, syncContentErrors, session);

                updateTrainingProgress = await TrainingHelper.updateTrainingProgress(input, userId, session);

                if (syncContentErrors.length > 0) {
                    throw CustomError(ErrorName.FAILED, syncContentErrors[0]);
                }

            });

            if (updateTrainingProgress) {
                return {
                    status: 1,
                    message: "Progress updated successfully!"
                };
            }

        } catch (error) {
            throw Error(error.message);
        }

    },
    startOverTraining: async ({ overallId, user }, context) => {

        let userId;
        if (user) {
            userId = user;
        } else {
            userId = AuthUser(context).userId;
        }

        const fetchOverallTraining = await OverallTrainingProgress.findById(overallId).populate("training");

        const allowMultipleAttempts = fetchOverallTraining.training.allowMultipleAttempts;
        const attemptType = fetchOverallTraining.training.attemptType;
        let attemptLimit;

        if (allowMultipleAttempts && attemptType === 'LIMITED_ATTEMPT') {
            attemptLimit = fetchOverallTraining.training.setLimitAttempt;
        }

        if (!fetchOverallTraining) throw CustomError(ErrorName.NOT_FOUND);

        let updateOverallTrainingProgress;
        if (fetchOverallTraining.contentData) {

            if (attemptLimit && attemptLimit > 0 && fetchOverallTraining.attemptCount > attemptLimit) {
                throw CustomError(ErrorName.FAILED, "Your attempt limit has reached!");
            }

            fetchOverallTraining.contentData = [];
            fetchOverallTraining.progressPercentage = 0.00;
            fetchOverallTraining.lastConsumedContent = {};
            fetchOverallTraining.startDate = null;
            fetchOverallTraining.endDate = null;
            fetchOverallTraining.status = 'NOT_STARTED';
            fetchOverallTraining.attemptCount++;
            fetchOverallTraining.timeSpend = 0;
            fetchOverallTraining.totalDuration = fetchOverallTraining.training.durationHours ?? 0;

            updateOverallTrainingProgress = await fetchOverallTraining.save();
        }

        if (updateOverallTrainingProgress) {
            return {
                status: 1,
                message: "Course restarted successfully!"
            }
        } else {
            throw CustomError(ErrorName.FAILED);
        }

    }
};
