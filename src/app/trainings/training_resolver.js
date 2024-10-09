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

module.exports.queries = {
    getTrainings: async ({ pageInput, filterInput }, context) => {
        const { role, userPermissions, subscriberId } = AuthUser(context);

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50;

        let filterConditions = { subscriber: subscriberId };

        // if (
        //     !SubRoleHelper.hasPermission({
        //         currentRole: role,
        //         currentPermissions: userPermissions,
        //         requiredPermission: [
        //             Permission.GET_TRAININGS,
        //             Permission.CREATE_TRAINING_REGISTRATION,
        //             Permission.GET_TRAINING_REGISTRATIONS,
        //             Permission.GET_REGISTRATION_REPORTS,
        //         ],
        //         requiredAll: false,
        //     })
        // ) {
        //     throw CustomError(ErrorName.FORBIDDEN);
        // }

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

        //TODO:QUESTION: populate virtual or not?
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

        
        // if (
        //     !SubRoleHelper.hasPermission({
        //         currentRole: role,
        //         currentPermissions: userPermissions,
        //         requiredPermission: [
        //             Permission.GET_TRAININGS,
        //             Permission.GET_QUIZ_REPORTS,
        //             Permission.GET_FEEDBACK_REPORTS,
        //         ],
        //         requiredAll: false,
        //     })
        // ) {
        //     throw CustomError(ErrorName.FORBIDDEN);
        // }

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

        //  let scromUploadUrl = await ScromHelper.extractScromPackage(input);
        // let courseInfo = await ScromHelper.uploadToScormCloud(input);


        // if (courseInfo) {
        //     const { filename } = await input.scorm.url;
        //     input.scorm = {
        //         courseId: courseInfo.courseId,
        //         type: "CLOUD",
        //         fileName: filename
        //     }
        // }
        /*
        if (!Object.keys(input).length) throw CustomError(ErrorName.ARGUMENTS_REQUIRED);

        if (
            input._id &&
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.UPDATE_TRAINING,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        } else if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.CREATE_TRAINING,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        } */

        if (input.images) {
            input.images = await TrainingHelper.uploadTrainingImages({
                images: input.images,
            });
        }

        if (input.trainingModules?.length) {
            for (const trainingModule of input.trainingModules) {
                if (trainingModule.trainingModuleContents?.length) {
                    for (const trainingModuleContent of trainingModule.trainingModuleContents) {
                        if (trainingModuleContent.videos) {
                            trainingModuleContent.videos =
                                await TrainingModuleContentHelper.uploadTrainingModuleContentVideos(
                                    {
                                        videos: trainingModuleContent.videos,
                                    }
                                );
                        }

                        if (trainingModuleContent.audios) {
                            trainingModuleContent.audios =
                                await TrainingModuleContentHelper.uploadTrainingModuleContentAudios(
                                    {
                                        audios: trainingModuleContent.audios,
                                    }
                                );
                        }

                        if (trainingModuleContent.images) {
                            trainingModuleContent.images =
                                await TrainingModuleContentHelper.uploadTrainingModuleContentImages(
                                    {
                                        images: trainingModuleContent.images,
                                    }
                                );
                        }

                        if(trainingModuleContent.files){
                            trainingModuleContent.files =
                                await TrainingModuleContentHelper.uploadTrainingModuleContentFiles(
                                    {
                                        files: trainingModuleContent.files,
                                    }
                                )
                        }
                    }
                }
            }
        }

        // TODO:QUESTION: limit manager to particular trainings or not?
        const savedTraining = await DbTransactionHelper.performDbTransaction(async session => {
            const savedTraining = await TrainingHelper.createOrUpdateTraining(
                { input, session },
                context
            );
            savedTraining.trainingModules = [];

            if (input.trainingModules?.length) {
                // Save all training modules under the training
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

                    // console.log("savedTrainingModule:", savedTrainingModule._id);
                    savedTrainingModule.trainingModuleContents = [];

                    if (trainingModule.trainingModuleContents?.length) {
                        // Save all training module contents under each training module
                        for (const trainingModuleContent of trainingModule.trainingModuleContents) {
                            const savedTrainingModuleContent =
                                await TrainingModuleContentHelper.createOrUpdateTrainingModuleContent(
                                    {
                                        input: {
                                            ...trainingModuleContent,
                                            training: savedTraining,
                                            trainingModule: savedTrainingModule,
                                        },
                                        session,
                                    },
                                    context
                                );

                            // console.log(
                            //     "savedTrainingModuleContent:",
                            //     savedTrainingModuleContent._id
                            // );
                            savedTrainingModule.trainingModuleContents.push(
                                savedTrainingModuleContent
                            );
                        }
                    }

                    savedTraining.trainingModules.push(savedTrainingModule);
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

            if (input.deletedTrainingModuleContents?.length) {
                await TrainingModuleContent.deleteMany(
                    {
                        subscriber: subscriberId,
                        training: savedTraining._id,
                        $or: [
                            {
                                _id: { $in: input.deletedTrainingModuleContents },
                            },
                            {
                                trainingModule: { $in: input.deletedTrainingModules },
                            },
                        ],
                    },
                    { lean: true, session }
                );
            }

            return savedTraining;
        });

        if (!savedTraining) throw CustomError(ErrorName.FAILED);

        //region notification & logging
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
        //endregion

        return savedTraining;
    },
    deleteTraining: async ({ id }, context) => {
        const { role, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        // if (
        //     !SubRoleHelper.hasPermission({
        //         currentRole: role,
        //         currentPermissions: userPermissions,
        //         requiredPermission: Permission.DELETE_TRAINING,
        //         restrictOrganizationManager: isOrganizationManager,
        //     })
        // ) {
        //     throw CustomError(ErrorName.FORBIDDEN);
        // }

        const deletedTraining = await DbTransactionHelper.performDbTransaction(async session => {
            // TODO:QUESTION: change to soft delete or not?
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

        //region notification & logging
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
        //endregion

        return deletedTraining;
    },
    updateTrainingStatus: async ({ id, isActive }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        // if (
        //     !SubRoleHelper.hasPermission({
        //         currentRole: role,
        //         currentPermissions: userPermissions,
        //         requiredPermission: [
        //             Permission.ENABLE_DISABLE_TRAINING,
        //             Permission.UPDATE_TRAINING,
        //         ],
        //         requiredAll: false,
        //         restrictOrganizationManager: isOrganizationManager,
        //     })
        // ) {
        //     throw CustomError(ErrorName.FORBIDDEN);
        // }

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
