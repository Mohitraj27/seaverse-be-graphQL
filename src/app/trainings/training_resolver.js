const {
    CustomError,
    ErrorName,
    AuthUser,
    Role,
    DbTransactionHelper,
    CurrentDateTime,
} = require("../../util");

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

module.exports.queries = {
    getTrainings: async ({ pageInput, filterInput }, context) => {
        const { role, userPermissions, subscriberId } = AuthUser(context);

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50;

        let filterConditions = { subscriber: subscriberId, isDeleted: false };
        let sortOrder = { createdAt: "descending" };
        if (filterInput) {
            if (filterInput.trainingCategory)
                filterConditions.trainingCategories = filterInput.trainingCategory;

            if (filterInput.trainingSubCategory)
                filterConditions.trainingSubCategories = filterInput.trainingSubCategory;

            if (filterInput.approvalStatus)
                filterConditions.approvalStatus = filterInput.approvalStatus;

            if (filterInput.search)
                filterConditions["title.value"] = {
                    $regex: ".*" + filterInput.search + ".*",
                    $options: "i",
                };

            if (typeof filterInput.isActive === "boolean")
                filterConditions.isActive = filterInput.isActive;

            if (filterInput.status) filterConditions.status = filterInput.status;
            if (filterInput.dateFilter === -1) {
                sortOrder = { createdAt: "descending" };
            } else {
                sortOrder = { createdAt: "ascending" };
            }
        }

        const result = await Training.aggregatePaginate(
            Training.aggregate([
                { $match: filterConditions },
                {
                    $lookup: {
                        from: TrainingModule.collection.name,
                        localField: "_id",
                        foreignField: "training",
                        as: "trainingModules",
                        pipeline: [
                            {
                                $lookup: {
                                    from: "TrainingContentBridge",
                                    localField: "trainingModuleContents",
                                    foreignField: "_id",
                                    as: "trainingContentBridges",
                                    pipeline: [
                                        {
                                            $lookup: {
                                                from: TrainingModuleContent.collection.name,
                                                localField: "trainingContent",
                                                foreignField: "_id",
                                                as: "trainingModuleContentDetails",
                                            },
                                        },
                                        {
                                            $unwind: "$trainingModuleContentDetails",
                                        },
                                        {
                                            $sort: { "trainingModuleContentDetails.version": -1 },
                                        },
                                        {
                                            $group: {
                                                _id: "$_id",
                                                trainingModuleContentDetails: { $first: "$trainingModuleContentDetails" },
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                },
                {
                    $lookup: {
                        from: "users",
                        localField: "createdBy",
                        foreignField: "_id",
                        as: "createdBy",
                    },
                },
                {
                    $unwind: "$createdBy",
                },
            ]),
            {
                offset: skip,
                limit,
                sort: sortOrder,
                customLabels: {
                    docs: "trainings",
                    totalDocs: "totalCount",
                    offset: "skip",
                },
                pagination: limit !== 0,
                allowDiskUse: true,
            }
        );

        console.log(result);

        return result;

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
                options: { sort: { displayPosition: 1 } },
                populate: {
                    path: "quizContent",
                    options: { sort: { displayPosition: 1 } },
                },
            });

        const moduleBridgeIDs = training.trainingModules.flatMap(module => module.trainingModuleContents);

        const latestContents = await TrainingContentBridge.find({
            _id: { $in: moduleBridgeIDs },
        })

        training.trainingModules.forEach(module => {
            module.trainingModuleContents = latestContents;
        });

        return training;

    },
};

module.exports.mutations = {
    createOrUpdateTraining: async ({ input, coverImage, bannerImage }, context) => {

        const { role, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        const moduleContentIds = [];

        if (input.training?.length && input.trainingModules?.length) {
            moduleContentIds = await TrainingContentBridge.find(
                { training: input.training, trainingModule: { $in: input.trainingModules } }
            );
        }

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

            const savedTrainingModuleIDs = savedTrainingModule.result.upserted.map(item => item._id)

            input.trainingModules.forEach((trainingModule, index) => {
                if (!trainingModule._id && savedTrainingModuleIDs[index]) {
                    trainingModule._id = savedTrainingModuleIDs[index];
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


        return {
            status: 1,
            message: "Training created successfully",
        };
    },
    deleteTraining: async ({ id }, context) => {
        const { role, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        const deletedTraining = await Training.findOne({
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
            deletedTraining.save();
        } catch {
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
        if (!currentTraining) throw CustomError(ErrorName.NOT_FOUND);
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
};
