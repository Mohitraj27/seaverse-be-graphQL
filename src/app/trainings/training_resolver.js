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
const { LearningPlan } = require("../learning-plan/learning_plan_model");
const { TrainingModule } = require("./training_modules/training_module_model");
const LearningPlanStatus = require("../learning-plan/enumFields/learning_plan_status.json");
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
const { Subscriber } = require("../saas/subscriber/subscriber_model");

const { fork } = require("child_process");
const { decrypt } = require("../../util/encryption_helper");

module.exports.queries = {
    getTrainings: async ({ pageInput, filterInput }, context) => {
        const { role, userPermissions, subscriberId } = AuthUser(context);

        if (role && role === Role.LEARNER) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        try {
        const skip = pageInput?.skip ?? 0;
        let limit = pageInput?.limit ?? 50;

        let filterConditions = { subscriber: subscriberId, isDeleted: false };
        let sortOrder = { updatedAt: -1 };

        if (filterInput) {
            if (filterInput.search) {
                function escapeRegex(str) {
                    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                }
                const escapedSearch = escapeRegex(filterInput?.search);
                const searchRegex = {
                    $regex: ".*" + escapedSearch + ".*",
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
                    sortOrder = { updatedAt: -1 };
                } else {
                    sortOrder = { updatedAt: 1 };
                }
            }
        }

        
        const totalCount = await Training.countDocuments(filterConditions);

        
        const trainings = await Training.aggregate([
            { $match: filterConditions },
            { $sort: sortOrder },
            { $skip: skip },
            { $limit: limit },
            {
                $lookup: {
                    from: "users",
                    localField: "updatedBy",
                    foreignField: "_id",
                    as: "createdByDetails",
                    pipeline: [{ $project: { firstName: 1, lastName: 1, email: 1, _id: 1 } }],
                },
            },
            {
                $lookup: {
                    from: "overalltrainingprogresses",
                    localField: "_id",
                    foreignField: "training",
                    as: "trainingUsers",
                    pipeline: [
                        { $project: { _id: 1 } }
                    ]
                },
            },
            {
                $addFields: {
                    createdBy: { $arrayElemAt: ["$createdByDetails", 0] },
                    countOfUsers: { $size: "$trainingUsers" },
                },
            },
            {
                $project: {
                    createdByDetails: 0,
                    trainingUsers: 0
                }
            },
        ]);

        const decryptedTrainings = trainings?.map((training) => ({
            ...training,
            createdBy: {
                _id: training.createdBy?._id,
                firstName: decrypt(training?.createdBy?.firstName),
                lastName: training?.createdBy?.lastName ? decrypt(training?.createdBy?.lastName):'',
                email: decrypt(training?.createdBy?.email),
            },
        }));

        return {
            totalCount: totalCount,
            trainings: decryptedTrainings,
        };
        } catch (error) {
            console.error("Error in getTrainings:", error);
            throw CustomError(ErrorName.FAILED, error.message);
        }
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

        const totalUsersResult = await OverallTrainingProgress.aggregate([
            {
                $match: {
                    training: id,
                    isEnrolled: true
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "user",
                    foreignField: "_id",
                    as: "userInfo",
                    pipeline: [
                        {
                            $match: {
                                isDeleted: false
                            }
                        }
                    ]
                }
            },
            {
                $unwind: {
                    path: "$userInfo",
                    preserveNullAndEmptyArrays: false
                }
            },
            {
                $group: {
                    _id: null,
                    uniqueUsers: { $addToSet: '$user' }
                }
            },
            {
                $addFields: {
                    countOfUsers: { $size: '$uniqueUsers' }
                }
            },
            {
                $project: {
                    _id: 0,
                    countOfUsers: 1
                }
            }
        ]);
        const countOfUsers = totalUsersResult[0]?.countOfUsers || 0;

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
    checkCourseUpdateBeforeSync: async ({ input }, context) => {

        const { role, userId, userInfo } = AuthUser(context);

        const overallIds = input.overallIds;

        if (!overallIds || overallIds.length === 0) {
            throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Course ID is required");
        };

        if (overallIds.length > 0) {


            await OverallTrainingProgress.updateMany(
                { _id: { $in: overallIds } },
                {
                    progressPercentage: 0,
                    lastConsumedContent: {},
                    startDate: null,
                    finishedCourseFirstTime: false,
                    endDate: null,
                    status: 'NOT_STARTED',
                    timeSpend: 0,
                    totalDuration: 0,
                    contentData: [],
                    adminMarkedAsCompleted: false,
                }
            );

            await TrainingProgress.deleteMany(
                { overallTrainingProgress: { $in: overallIds } }
            );

            return {
                status: 1,
                message: "Courses cleared successfully!"
            };

        }

    },
    isCourseEnrolledForCurrentUser: async ({ trainingId }, context) => {

        const {userId} = AuthUser(context);

        if(!userId){
            throw CustomError(ErrorName.NOT_FOUND, "User not found!");
        }

        if(!trainingId){
            throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Training ID is required!");
        }

        const enrollment = await OverallTrainingProgress.findOne({
            training: trainingId,
            user: userId,
        }).select("isEnrolled -_id").lean();
        
        if(!enrollment){
            throw CustomError(ErrorName.NOT_FOUND, "Enrollment data not found!");
        }

        return  enrollment ? enrollment.isEnrolled : false;

    }
};

module.exports.mutations = {
    createOrUpdateTraining: async ({ input, coverImage, bannerImage }, context) => {

        const { role, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);
        const moduleContentIds = [];
        const isUpdate = input._id ? true : false;
        if (!input._id) {
            if (!input.authorName && input.status === "PUBLISHED") throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Author name is required");
            if (!input.title?.length || !input.title || input.title.some(item => item.value == "")) throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Course title is required");
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
                    totalDurationSeconds += trainingContent?.duration;
                }
            }
        }

        const totalDuration = (totalDurationSeconds);
        input.durationHours = totalDuration;

        const savedTraining = await DbTransactionHelper.performDbTransaction(async session => {

            const savedTraining = await TrainingHelper.createOrUpdateTraining(
                { input, coverImage, bannerImage, session },
                context
            );


            // Update the training duration in overall training progress if any
            await OverallTrainingProgress.updateMany(
                { training: savedTraining._id, status: "NOT_STARTED" },
                {
                    $set: { totalDuration: savedTraining.durationHours },
                    $inc: isUpdate ? { version: 1 } : {}
                },
                { session }
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
                await OverallTrainingProgress.updateMany(
                    { training: input._id, status: 'NOT_STARTED' },
                    { $set: { totalTrainingModules: input.trainingModules?.length } },
                    { session }
                )
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

            if (!input._id) {
                input._id = savedTraining._id;
            }

            return savedTraining;
        });

        if (input.migrationcoursesId && input.migrationcoursesId !== null && input._id) {

            const child = fork("./src/app/trainings/migration_enrollment.js");

            child.send({
                migrationcourseId: input.migrationcoursesId,
                trainingId: savedTraining._id,
            });

            child.on("error", error => {
                console.error("Error in child process:", error);
            });

        }

        if (!savedTraining) throw CustomError(ErrorName.FAILED);
        if (!isUpdate) {
            TrainingHelper.sendNotificationOnCRUD({
                subscriber: subscriberId,
                training: savedTraining,
                action: isUpdate ? "UPDATED" : "CREATED",
                createdBy: userInfo,
            });
        }
        LogHelper.logActivity({
            subscriber: subscriberId,
            logType: LogType.TRAINING_LOG,
            operation: isUpdate ? "UPDATE" : "CREATE",
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
        if (!id) throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Training ID is required");
        const checkLastCourse = await LearningPlan.findOne({
            selectCourses: { $in: ObjectId(id) },
            status: LearningPlanStatus.ACTIVE
        })

        if (checkLastCourse) {
            throw CustomError(
                ErrorName.FAILED,
                `This course is currently assigned to an active learning plan and cannot be deleted`
            );
        }


        let deletedTraining = await Training.findOne({
            _id: id,
            subscriber: subscriberId,
        });

        if (!deletedTraining) throw CustomError(ErrorName.NOT_FOUND);

        if (![ContentStatus.DRAFT, ContentStatus.RETIRED].includes(deletedTraining.status)) {
            throw CustomError(
                ErrorName.BAD_REQUEST,
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

        if (!deletedTraining) throw CustomError(ErrorName.BAD_REQUEST, "Failed to delete course");
        /* 
        TrainingHelper.sendNotificationOnCRUD({
            subscriber: subscriberId,
            training: deletedTraining,
            action: "DELETED",
            createdBy: userInfo,
        });
        */
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
 try {
 
        const { role, userId, userInfo, subscriberId: subscriberID } = AuthUser(context);
        let subscriberId;
        if (!subscriberID) {
            const subscriber = await Subscriber.findOne({ isActive: true }).select("_id");
            subscriberId = subscriber._id;
        } else {
            subscriberId = subscriberID;
        }

        // Refactored: process input in batches, move validation and structure extraction outside transaction
        const mongoose = require('mongoose');
        const BATCH_SIZE = 1; // Process one document per batch to minimize write conflicts
        if (!userId) throw CustomError(ErrorName.NOT_FOUND);
        if (!input) throw CustomError(ErrorName.ARGUMENTS_REQUIRED);

        // Preprocess input: handle offline sync, structure extraction, and validation outside transaction
        let processedInput = input;
        const modifiedCourseIds = new Set();
       const overallIds = input.map(item => item.overallId.toString());

        const notEnrolled = await OverallTrainingProgress.exists({
            _id: { $in: overallIds },
            isEnrolled: false,
        });

        if (notEnrolled) {
            return {
                status: 0,
                message: "User is not enrolled in one or more courses.",
            };
        }

        if (input[0]?.isFromOfflineSync) {
            if (!input[0].overallId) {
                throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Overall ID is required");
            }
            if (!input[0].trainingModules || input[0].trainingModules.length === 0) {
                throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Training modules are required");
            }

            const existingOverallTrainingProgress = await OverallTrainingProgress.findOne({
                _id: input[0].overallId,
            }).select('_id version');

            if (existingOverallTrainingProgress.version !== input[0].version) {
                const completedCourses = input.filter(item => {
                    return item.trainingModules.every(module => {
                        return module.contentDetails.every(content => {
                            return content.contentStatus === "COMPLETED";
                        });
                    });
                });

                if (completedCourses.length > 0) {
                    const completedCourseIds = completedCourses.map(item => item.overallId);
                    if (completedCourseIds) {
                        const onlineCourseData = await OverallTrainingProgress.find({ _id: { $in: completedCourseIds } }).select('_id status');
                        if (onlineCourseData.length > 0) {
                            const alreadyCompletedIds = onlineCourseData
                                .filter(course => course.status === "COMPLETED")
                                .map(course => course._id.toString());
                            const newlyCompletedCoursesOnline = completedCourses.filter(item =>
                                !alreadyCompletedIds.includes(item.overallId.toString())
                            );
                            const matchedCourses = [];
                            if (newlyCompletedCoursesOnline.length > 0) {
                                const newlyCompletedIds = newlyCompletedCoursesOnline.map(item => item.overallId);
                                const coursesWithDownloadData = await OverallTrainingProgress.find(
                                    { _id: { $in: newlyCompletedIds } },
                                    { _id: 1, contentFromDownload: 1 }
                                );
                                for (const completedCourse of newlyCompletedCoursesOnline) {
                                    const dbCourse = coursesWithDownloadData.find(
                                        course => course._id.toString() === completedCourse.overallId.toString()
                                    );
                                    if (!dbCourse || !dbCourse.contentFromDownload || dbCourse.contentFromDownload.length === 0) {
                                        continue;
                                    }
                                    const currentCourseStructure = TrainingHelper.extractCourseStructure(completedCourse.trainingModules);
                                    let matchFound = false;
                                    let matchedVersion = null;
                                    for (const downloadVersion of dbCourse.contentFromDownload) {
                                        const downloadStructure = TrainingHelper.extractCourseStructure(downloadVersion.courseDetails);
                                        if (TrainingHelper.areCourseStructuresEqual(currentCourseStructure, downloadStructure)) {
                                            matchFound = true;
                                            matchedVersion = downloadVersion?.courseDetails;
                                            matchedCourses.push({
                                                courseId: completedCourse.overallId,
                                                matchedVersion: matchedVersion,
                                                version: downloadVersion.version,
                                                totalTrainingModules: matchedVersion.length
                                            });
                                            modifiedCourseIds.add(completedCourse.overallId.toString());
                                            break;
                                        }
                                    }
                                }
                                if (matchedCourses.length > 0) {
                                    const courseIds = matchedCourses.map(course => course.courseId);
                                    const contentDataBulkOps = matchedCourses.map(matchedCourse => ({
                                        updateOne: {
                                            filter: { _id: matchedCourse.courseId },
                                            update: {
                                                $set: {
                                                    contentData: matchedCourse.matchedVersion,
                                                    status: "IN_PROGRESS",
                                                    progressPercentage: 0,
                                                    version: matchedCourse.version,
                                                    totalTrainingModules: matchedCourse.totalTrainingModules,
                                                    lastConsumedContent: null,
                                                }
                                            }
                                        }
                                    }));
                                    if (contentDataBulkOps.length > 0) {
                                        await OverallTrainingProgress.bulkWrite(contentDataBulkOps);
                                    }
                                    await TrainingProgress.deleteMany(
                                        { overallTrainingProgress: { $in: courseIds } }
                                    );
                                    processedInput = input.map(course => {
                                        if (modifiedCourseIds.has(course.overallId.toString())) {
                                            const matchedCourse = matchedCourses.find(mc => mc.courseId.toString() === course.overallId.toString());
                                            if (matchedCourse) {
                                                const updatedCourse = {
                                                    ...course,
                                                    trainingModules: matchedCourse.matchedVersion.map(module => ({
                                                        moduleId: module.moduleId,
                                                        contentDetails: module.contentIds.map(contentId => {
                                                            const existingContent = course.trainingModules
                                                                .flatMap(m => m.contentDetails || [])
                                                                .find(c => c.contentId === contentId);
                                                            return existingContent || {
                                                                contentId: contentId,
                                                                contentStatus: "COMPLETED",
                                                                duration: 0,
                                                                progressPercentage: 100
                                                            };
                                                        })
                                                    })),
                                                    processedByOfflineSync: true
                                                };
                                                return updatedCourse;
                                            }
                                        }
                                        return course;
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        const validateErrors = await TrainingHelper.validateSyncOfflineData(processedInput);
        if (validateErrors && validateErrors.length > 0) {
            throw CustomError(ErrorName.FAILED, validateErrors[0]);
        }
        processedInput.forEach((entry) => {
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

        // Process in batches of 1 to reduce transaction time and write conflicts
        const batches = [];
        for (let i = 0; i < processedInput.length; i += BATCH_SIZE) {
            batches.push(processedInput.slice(i, i + BATCH_SIZE));
        }

        for (const batch of batches) {
            let attempt = 0;
            let success = false;
            let lastError;
            // If batch size is 1, avoid using a transaction for single-document update
            while (attempt < 5 && !success) {
                let session = null;
                try {
                    let syncContentErrors = [];
                    if (batch.length === 1) {
                        // No transaction for single document
                        await TrainingHelper.addDataToOverallTrainingProgress(batch, syncContentErrors, null);
                        await TrainingHelper.updateTrainingProgress(batch, userId, subscriberId, null);
                        if (syncContentErrors.length > 0) {
                            throw CustomError(ErrorName.FAILED, syncContentErrors[0]);
                        }
                        success = true;
                    } else {
                        session = await mongoose.startSession();
                        await session.withTransaction(async () => {
                            if (batch.length > 0) {
                                await TrainingHelper.addDataToOverallTrainingProgress(batch, syncContentErrors, session);
                                await TrainingHelper.updateTrainingProgress(batch, userId, subscriberId, session);
                                if (syncContentErrors.length > 0) {
                                    throw CustomError(ErrorName.FAILED, syncContentErrors[0]);
                                }
                            }
                        });
                        success = true;
                    }
                } catch (err) {
                    lastError = err;
                    console.error('syncOfflineDataAndUpdateProgress batch error:', err, err.stack, err.errorLabels);
                    if (session && session.inTransaction()) {
                        await session.abortTransaction();
                    }
                    if (err.hasErrorLabel && err.hasErrorLabel('TransientTransactionError')) {
                        attempt++;
                        await new Promise(res => setTimeout(res, 100 * Math.pow(2, attempt)));
                    } else {
                        break;
                    }
                } finally {
                    if (session && session.endSession) {
                        await session.endSession();
                    }
                }
            }
            if (!success) {throw Error(lastError && lastError.message ? lastError.message : String(lastError))}
            else {
                console.log(`Batch processed successfully: ${JSON.stringify(batch)}`);
            }
        }
        return {
            status: 1,
            message: "Progress updated successfully!"
        }
        } catch (error) {
            console.error("Error syncing offline data:", error);
            throw CustomError(ErrorName.FAILED, error.message || "Failed to sync offline data");
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

        if (!fetchOverallTraining) throw CustomError(ErrorName.NOT_FOUND, "Course data not found!");

        const trainingModuleCount = await TrainingModule.find({ training: fetchOverallTraining.training._id }).countDocuments();

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
            fetchOverallTraining.finishedCourseFirstTime = false;
            fetchOverallTraining.endDate = null;
            fetchOverallTraining.status = 'NOT_STARTED';
            fetchOverallTraining.attemptCount++;
            fetchOverallTraining.timeSpend = 0;
            fetchOverallTraining.totalDuration = fetchOverallTraining.training.durationHours ?? 0;
            fetchOverallTraining.adminMarkedAsCompleted = false;
            fetchOverallTraining.totalTrainingModules = trainingModuleCount || fetchOverallTraining.totalTrainingModules;
            fetchOverallTraining.isCertificatePresent = fetchOverallTraining?.training?.isCertificate ?? false;
            fetchOverallTraining.assignedCertificateLayout = fetchOverallTraining?.training?.currentCertificateLayout;

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
