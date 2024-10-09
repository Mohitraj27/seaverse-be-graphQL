const { ObjectId } = require("../../tools");
const {
    AuthUser,
    CustomError,
    ErrorName,
    Role,
    CurrentDateTime,
    DbTransactionHelper,
} = require("../../util");

const { QuizContent } = require("./quiz_content_model");

const { QuizContentHelper } = require("./quiz_content_helper");
const SubRoleHelper = require("../user/sub-roles/sub_role_helper");
const LogHelper = require("../logs/log_helper");

const ApprovalStatus = require("../trainings/approval_status.json");
const Permission = require("../user/sub-roles/permission.json");
const LogType = require("../logs/log_type.json");

module.exports.queries = {
    getQuizContents: async ({ pageInput, filterInput }, context) => {
        const { role, userPermissions, subscriberId } = AuthUser(context);

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50;

        let filterConditions = { subscriber: subscriberId };
        let selections = "";
        let populations = [];

        if (filterInput) {
            if (filterInput.search)
                filterConditions["title.value"] = {
                    $regex: ".*" + filterInput.search + ".*",
                    $options: "i",
                };
        }

        const fetchResult = async () => {
            return {
                quizContents: await QuizContent.find(filterConditions)
                    .lean()
                    .populate(populations)
                    .sort({ createdAt: "descending" })
                    .skip(skip)
                    .limit(limit)
                    .select(selections),
                totalCount: await QuizContent.countDocuments(filterConditions),
            };
        };

        if (context.platform === Role.EMPLOYEE && role === Role.EMPLOYEE) {
            filterConditions.isPublic = true;
            filterConditions.approvalStatus = ApprovalStatus.APPROVED;
            filterConditions.isActive = true;
            selections = "-quiz.questionAnswers.answerKey";
            return await fetchResult();
        } else if (context.platform === Role.ADMIN) {
            if (
                !SubRoleHelper.hasPermission({
                    currentRole: role,
                    currentPermissions: userPermissions,
                    requiredPermission: [
                        Permission.GET_TRAININGS,
                        Permission.CREATE_TRAINING,
                        Permission.UPDATE_TRAINING,
                        Permission.GET_QUIZZES,
                    ],
                    requiredAll: false,
                })
            ) {
                throw CustomError(ErrorName.FORBIDDEN);
            }

            if (filterInput.approvalStatus)
                filterConditions.approvalStatus = filterInput.approvalStatus;

            if (filterInput.isActive != null) filterConditions.isActive = filterInput.isActive;

            populations = ["createdBy"];

            return await fetchResult();
        }

        throw CustomError(ErrorName.FORBIDDEN);
    },
    getQuizContent: async ({ id }, context) => {
        const { role, userPermissions, subscriberId } = AuthUser(context);

        const existingQuizContent = await QuizContent.findOne({
            _id: id,
            subscriber: subscriberId,
        })
            .lean()
            .populate("createdBy");

        if (!existingQuizContent) throw CustomError(ErrorName.NOT_FOUND);

        if (
            context.platform === Role.ADMIN &&
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [
                    Permission.GET_TRAININGS,
                    Permission.CREATE_TRAINING,
                    Permission.UPDATE_TRAINING,
                    Permission.UPDATE_QUIZ,
                ],
                requiredAll: false,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        } else if (context.platform === Role.EMPLOYEE && !existingQuizContent.isPublic) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        return existingQuizContent;
    },
};

module.exports.mutations = {
    createOrUpdateQuizContent: async ({ input }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (!Object.keys(input).length) throw CustomError(ErrorName.ARGUMENTS_REQUIRED);

        if (
            input._id &&
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.UPDATE_QUIZ,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        } else if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.CREATE_QUIZ,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const quizContentFilterConditions = {
            _id: input._id ?? ObjectId(),
            subscriber: subscriberId,
        };

        const quizContentUpdateData = {};

        if (input.title) quizContentUpdateData.title = input.title;
        if (input.description) quizContentUpdateData.description = input.description;

        if (input.images) {
            quizContentUpdateData.images = await QuizContentHelper.uploadQuizContentImages({
                images: input.images,
                folderName: quizContentUpdateData._id,
            });
        }

        if (input.quiz) quizContentUpdateData.quiz = input.quiz;
        if (input.isPublic != null) quizContentUpdateData.isPublic = input.isPublic;
        if (input.isActive != null) quizContentUpdateData.isActive = input.isActive;

        const savedQuizContent = await DbTransactionHelper.performDbTransaction(async session => {
            if (!input._id) {
                quizContentUpdateData.UID = await QuizContentHelper.generateQuizContentUID({
                    subscriberId,
                    session,
                });
            }

            const savedQuizContent = await QuizContent.findOneAndUpdate(
                quizContentFilterConditions,
                {
                    ...quizContentFilterConditions,
                    ...quizContentUpdateData,
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

            if (!savedQuizContent) throw CustomError(ErrorName.FAILED);
            return savedQuizContent;
        });

        //region notification & logging
        QuizContentHelper.sendNotificationOnCRUD({
            subscriber: subscriberId,
            quizContent: savedQuizContent,
            action: input._id ? "UPDATED" : "CREATED",
            createdBy: userInfo,
        });

        LogHelper.logActivity({
            subscriber: subscriberId,
            logType: LogType.QUIZ_LOG,
            operation: input._id ? "UPDATE" : "CREATE",
            ipInfo: context.ipInfo,
            affected: [
                {
                    targetRef: "QuizContent",
                    target: savedQuizContent._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "QUIZ_CONTENT_INFO",
                    infoData: JSON.stringify(savedQuizContent),
                },
            ],
            createdBy: userInfo,
        });
        //endregion

        return savedQuizContent;
    },
    deleteQuizContent: async ({ id }, context) => {
        const { role, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.DELETE_QUIZ,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const deletedQuizContent = await QuizContent.findOneAndDelete(
            { _id: id, subscriber: subscriberId },
            { lean: true }
        );

        if (!deletedQuizContent) throw CustomError(ErrorName.NOT_FOUND);

        //region notification & logging
        QuizContentHelper.sendNotificationOnCRUD({
            subscriber: subscriberId,
            quizContent: deletedQuizContent,
            action: "DELETED",
            createdBy: userInfo,
        });

        LogHelper.logActivity({
            subscriber: subscriberId,
            logType: LogType.QUIZ_LOG,
            operation: "DELETE",
            ipInfo: context.ipInfo,
            affected: [
                {
                    targetRef: "QuizContent",
                    target: deletedQuizContent._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "QUIZ_CONTENT_INFO",
                    infoData: JSON.stringify(deletedQuizContent),
                },
            ],
            createdBy: userInfo,
        });
        //endregion

        return deletedQuizContent;
    },
    updateQuizContentStatus: async ({ id, isActive }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [Permission.ENABLE_DISABLE_QUIZ, Permission.UPDATE_QUIZ],
                requiredAll: false,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const savedQuizContent = await QuizContent.findOneAndUpdate(
            {
                _id: id,
                subscriber: subscriberId,
            },
            { isActive },
            { new: true, lean: true }
        ).select("title approvalStatus isActive");

        if (!savedQuizContent) throw CustomError(ErrorName.NOT_FOUND);

        QuizContentHelper.sendNotificationOnCRUD({
            subscriber: subscriberId,
            quizContent: savedQuizContent,
            action: isActive ? "ENABLED" : "DISABLED",
            createdBy: userInfo,
        });

        return savedQuizContent;
    },
    approveOrRejectQuizContent: async ({ id, approvalStatus }, context) => {
        const { role, userId, userInfo, subscriberId } = AuthUser(context);

        if (role !== Role.ADMIN) throw CustomError(ErrorName.FORBIDDEN);

        const savedQuizContent = await QuizContent.findOneAndUpdate(
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

        if (!savedQuizContent) throw CustomError(ErrorName.NOT_FOUND);

        QuizContentHelper.sendNotificationOnCRUD({
            subscriber: subscriberId,
            quizContent: savedQuizContent,
            action: approvalStatus,
            notifiers: [savedQuizContent.createdBy],
            createdBy: userInfo,
        });

        return savedQuizContent;
    },
    submitQuizContentForApproval: async ({ id }, context) => {
        const { role, userId, userInfo, subscriberId } = AuthUser(context);

        const savedQuizContent = await QuizContent.findOneAndUpdate(
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

        if (!savedQuizContent) throw CustomError(ErrorName.NOT_FOUND);

        if (role !== Role.ADMIN) {
            QuizContentHelper.sendNotificationOnCRUD({
                subscriber: subscriberId,
                quizContent: savedQuizContent,
                action: "APPROVAL_REQUEST",
                createdBy: userInfo,
            });
        }

        return savedQuizContent;
    },
};
