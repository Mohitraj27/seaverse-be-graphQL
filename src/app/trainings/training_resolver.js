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
const ContentStatus = require("./training_modules/training_module_contents/content_status.json")
const { queries } = require("./training_modules/training_module_contents/training_module_content_resolver")

module.exports.queries = {
    getTrainings: async ({ pageInput, filterInput }, context) => {
        const { role, userPermissions, subscriberId } = AuthUser(context);

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50;

        let filterConditions = { subscriber: subscriberId };

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
        }

        return Training.aggregatePaginate(
            Training.aggregate([
                {
                    $match: filterConditions,
                },
                {
                    $lookup: {
                        from: TrainingCategory.collection.name,
                        localField: "trainingCategories",
                        foreignField: "_id",
                        as: "trainingCategories",
                    },
                },
                {
                    $lookup: {
                        from: TrainingSubCategory.collection.name,
                        localField: "trainingSubCategories",
                        foreignField: "_id",
                        as: "trainingSubCategories",
                    },
                },
                {
                    $lookup: {
                        from: TrainingModule.collection.name,
                        localField: "_id",
                        foreignField: "training",
                        pipeline: [
                            {
                                $lookup: {
                                    from: TrainingModuleContent.collection.name,
                                    localField: "_id",
                                    foreignField: "trainingModule",
                                    as: "trainingModuleContents",
                                },
                            },
                        ],
                        as: "trainingModules",
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
                sort: { createdAt: "descending" },
                customLabels: {
                    docs: "trainings",
                    totalDocs: "totalCount",
                    offset: "skip",
                },
                pagination: limit !== 0,
                allowDiskUse: true,
            }
        );
    },
    getTraining: async ({ id }, context) => {
        const { role, userPermissions, subscriberId } = AuthUser(context);
        return Training.findOne({
            _id: id,
            subscriber: subscriberId,
        })
            .lean()
            .populate("createdBy")
            .populate('targetAudienceId')
            .populate({
                path: "trainingModules",
                options: { sort: { displayPosition: 1 } },
                populate: {
                    path: "trainingModuleContents",
                    populate: "quizContent",
                    options: { sort: { displayPosition: 1 } },
                },
            });
    },
};

module.exports.mutations = {
    createOrUpdateTraining: async ({ input }, context) => {

        const { role, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (input.images) {
            input.images = await TrainingHelper.uploadTrainingImages({
                images: input.images,
            });
        }
        
        const moduleContentIds = [];

        if (input.trainingModules?.length) {
            for (const trainingModule of input.trainingModules) {
                if (trainingModule.trainingModuleContents) {
                    for (const trainingModuleContent of trainingModule.trainingModuleContents) {
                        moduleContentIds.push(trainingModuleContent._id);
                    }
                }
            }
        }

        if (moduleContentIds.length > 0) {

            const getTrainingModuleContentStatus = await TrainingModuleContent.find({
                _id: { $in: moduleContentIds },
            }).select("contentStatus");
            const areAllPublished = getTrainingModuleContentStatus.every(
                content => content.contentStatus === ContentStatus.PUBLISHED
            );
            if (!areAllPublished) {
                throw CustomError(ErrorName.NOT_ALL_PUBLISHED, "Selected training modules should be published!");
            }

        }

        const savedTraining = await DbTransactionHelper.performDbTransaction(async session => {

            const savedTraining = await TrainingHelper.createOrUpdateTraining(
                { input, session },
                context
            );

            savedTraining.trainingModules = [];

            if (input.trainingModules?.length) {
                for (const trainingModule of input.trainingModules) {
                    const savedTrainingModule =
                        await TrainingModuleHelper.createOrUpdateTrainingModule(
                            {
                                input: {
                                    ...trainingModule,
                                    training: savedTraining,
                                },
                                session,
                            },
                            context
                        );
                }
            }

            if (input.deletedTrainingModules?.length) {
                await TrainingModule.deleteMany(
                    {
                        _id: { $in: input.deletedTrainingModules },
                        subscriber: subscriberId,
                        training: savedTraining._id,
                    },
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

        return savedTraining;
    },
    deleteTraining: async ({ id }, context) => {
        const { role, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);
        const deletedTraining = await DbTransactionHelper.performDbTransaction(async session => {

            const deletedTraining = await Training.findOneAndDelete(
                { _id: id, subscriber: subscriberId },
                { lean: true, session }
            ).populate({ path: "trainingModules", populate: "trainingModuleContents" });

            if (!deletedTraining) throw CustomError(ErrorName.NOT_FOUND);

            await TrainingModule.deleteMany(
                { subscriber: subscriberId, training: id },
                { lean: true, session }
            );

            await TrainingModuleContent.deleteMany(
                { subscriber: subscriberId, training: id },
                { lean: true, session }
            );

            return deletedTraining;
        });

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
    updateTrainingStatus: async ({ id, isActive }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);
        const savedTraining = await Training.findOneAndUpdate(
            {
                _id: id,
                subscriber: subscriberId,
            },
            { isActive },
            { new: true, lean: true }
        ).select("title approvalStatus isActive");

        if (!savedTraining) throw CustomError(ErrorName.NOT_FOUND);

        TrainingHelper.sendNotificationOnCRUD({
            subscriber: subscriberId,
            training: savedTraining,
            action: isActive ? "ENABLED" : "DISABLED",
            createdBy: userInfo,
        });

        return savedTraining;
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
