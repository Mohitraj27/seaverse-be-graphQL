const { ObjectId } = require("../../../tools");
const { CustomError, ErrorName, AuthUser, DbTransactionHelper } = require("../../../util");

const { TrainingCategory } = require("./training_category_model");
const { TrainingSubCategory } = require("./training_sub_categories/training_sub_category_model");

const SubRoleHelper = require("../../user/sub-roles/sub_role_helper");
const LogHelper = require("../../logs/log_helper");

const Permission = require("../../user/sub-roles/permission.json");
const LogType = require("../../logs/log_type.json");

const TrainingCategoryHelper = require("./training_category_helper");

module.exports.queries = {
    getTrainingCategories: async ({ pageInput }, context) => {
        const { subscriberId } = AuthUser(context);

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50;
        let filterConditions = { subscriber: subscriberId };

        return TrainingCategory.aggregatePaginate(
            TrainingCategory.aggregate([
                {
                    $match: filterConditions,
                },
                {
                    $lookup: {
                        from: "trainingsubcategories",
                        localField: "_id",
                        foreignField: "category",
                        as: "subCategories",
                    },
                },
            ]),
            {
                offset: skip,
                limit,
                sort: { createdAt: "descending" },
                customLabels: {
                    docs: "trainingCategories",
                    totalDocs: "totalCount",
                    offset: "skip",
                },
                pagination: limit !== 0,
                allowDiskUse: true,
            }
        );
    },
};

module.exports.mutations = {
    createOrUpdateTrainingCategory: async ({ input }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            input._id &&
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [
                    Permission.UPDATE_TRAINING_CATEGORY,
                    Permission.ENABLE_DISABLE_TRAINING_CATEGORY,
                ],
                requiredAll: false,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        } else if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.CREATE_TRAINING_CATEGORY,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const trainingCategoryFilterConditions = {
            _id: input._id ?? ObjectId(),
            subscriber: subscriberId,
        };

        const trainingCategoryUpdateData = {};

        if (input.name) trainingCategoryUpdateData.name = input.name;

        if (typeof input.isActive === "boolean")
            trainingCategoryUpdateData.isActive = input.isActive;

        const savedTrainingCategory = await DbTransactionHelper.performDbTransaction(
            async session => {
                const savedTrainingCategory = await TrainingCategory.findOneAndUpdate(
                    trainingCategoryFilterConditions,
                    {
                        ...trainingCategoryFilterConditions,
                        ...trainingCategoryUpdateData,
                        $setOnInsert: {
                            createdBy: userId,
                        },
                        updatedBy: userId,
                    },
                    {
                        upsert: true,
                        new: true,
                        setDefaultsOnInsert: true,
                        runValidators: true,
                        lean: true,
                        session,
                    }
                );

                if (!savedTrainingCategory) throw CustomError(ErrorName.FAILED);

                savedTrainingCategory.subCategories = [];

                if (input.subCategories?.length) {
                    for (const subCategory of input.subCategories) {
                        const trainingSubCategoryFilterConditions = {
                            _id: subCategory._id ?? ObjectId(),
                            subscriber: subscriberId,
                            category: savedTrainingCategory._id,
                        };

                        const savedSubCategory = await TrainingSubCategory.findOneAndUpdate(
                            trainingSubCategoryFilterConditions,
                            {
                                ...trainingSubCategoryFilterConditions,
                                name: subCategory.name,
                                isActive: subCategory.isActive,
                                $setOnInsert: {
                                    createdBy: userId,
                                },
                                updatedBy: userId,
                            },
                            {
                                upsert: true,
                                new: true,
                                setDefaultsOnInsert: true,
                                runValidators: true,
                                lean: true,
                                session,
                            }
                        );

                        if (!savedSubCategory) throw CustomError(ErrorName.FAILED);
                        savedTrainingCategory.subCategories.push(savedSubCategory);
                    }
                }

                if (input.deletedSubCategories?.length) {
                    await TrainingSubCategory.deleteMany(
                        {
                            _id: { $in: input.deletedSubCategories },
                            subscriber: subscriberId,
                            category: savedTrainingCategory._id,
                        },
                        { lean: true, session }
                    );
                }

                return savedTrainingCategory;
            }
        );

        if (!savedTrainingCategory) throw CustomError(ErrorName.FAILED);

        //region notification & logging
        TrainingCategoryHelper.sendNotificationOnCRUD({
            subscriber: subscriberId,
            trainingCategory: savedTrainingCategory,
            action: input._id ? "UPDATED" : "CREATED",
            createdBy: userInfo,
        });

        LogHelper.logActivity({
            subscriber: subscriberId,
            logType: LogType.TRAINING_CATEGORY_LOG,
            operation: input._id ? "UPDATE" : "CREATE",
            ipInfo: context.ipInfo,
            affected: [
                {
                    targetRef: "TrainingCategory",
                    target: savedTrainingCategory._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "TRAINING_CATEGORY_INFO",
                    infoData: JSON.stringify(input),
                },
            ],
            createdBy: userInfo,
        });
        //endregion

        return savedTrainingCategory;
    },
    deleteTrainingCategory: async ({ id }, context) => {
        const { role, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.DELETE_TRAINING_CATEGORY,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const deletedTrainingCategory = await DbTransactionHelper.performDbTransaction(
            async session => {
                const deletedTrainingCategory = await TrainingCategory.findOneAndDelete(
                    { _id: id, subscriber: subscriberId },
                    { lean: true, session }
                ).populate("subCategories");

                if (!deletedTrainingCategory) throw CustomError(ErrorName.NOT_FOUND);

                await TrainingSubCategory.deleteMany(
                    { subscriber: subscriberId, category: id },
                    { lean: true, session }
                );

                return deletedTrainingCategory;
            }
        );

        if (!deletedTrainingCategory) throw CustomError(ErrorName.FAILED);

        //region notification & logging
        TrainingCategoryHelper.sendNotificationOnCRUD({
            subscriber: subscriberId,
            trainingCategory: deletedTrainingCategory,
            action: "DELETED",
            createdBy: userInfo,
        });

        LogHelper.logActivity({
            subscriber: subscriberId,
            logType: LogType.TRAINING_CATEGORY_LOG,
            operation: "DELETE",
            ipInfo: context.ipInfo,
            affected: [
                {
                    targetRef: "TrainingCategory",
                    target: deletedTrainingCategory._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "TRAINING_CATEGORY_INFO",
                    infoData: JSON.stringify(deletedTrainingCategory),
                },
            ],
            createdBy: userInfo,
        });
        //endregion

        return deletedTrainingCategory;
    },
};
