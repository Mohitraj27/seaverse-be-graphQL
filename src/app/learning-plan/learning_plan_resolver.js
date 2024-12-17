const { LearningPlan } = require("./learning_plan_model");
const { CustomError } = require("../../util/error_helper");
const { ErrorName, AuthUser, Permission, SubRoleHelper, subscriberId, context } = require("../../util");
const { createLearningPlanHelper, getUsersAndCount, updateLearningPlanHelper, getLearningPlanAverageProgress } = require("./learning_plan_helper");
const { fetchTotalTrainerStatisticsGraph } = require("../statistics/statistics_helper");
const LearningPlanStatus = require("./enumFields/learning_plan_status.json");
const { Moment } = require("../../tools");
const LogHelper = require("../logs/log_helper");
const LogType = require("../logs/log_type.json");
const { get } = require("lodash");
const notificationiconEnum = require("../notifications/notification_icon.json");
const NotificationType = require("../notifications/notification_type.json");
const NotificationHelper = require("../notifications/notification_helper")
module.exports.mutations = {
    createLearningPlan: async ({ input }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
        try {
            const { subscriberId, userId, userInfo } = AuthUser(context);
            const result = await createLearningPlanHelper({ ...input, createdBy: userId, updatedBy: userId }, context);
            if (!result.success) {
                throw CustomError(ErrorName.LEARNING_PLAN_NOT_CREATED, result.errors[0]);
            }
            LogHelper.logActivity({
                subscriber: subscriberId,
                logType: LogType.LEARNING_PLAN_LOG,
                operation: "CREATE",
                ipInfo: context.ipInfo,
                affected: [
                    {
                        targetRef: "LearningPlan",
                        target: LearningPlan._id,
                    },
                ],
                additionalInfo: [
                    {
                        infoType: "LEARNING_PLAN_INFO",
                        infoData: JSON.stringify(result),
                    },
                ],
                createdBy: userInfo,
            });
            await NotificationHelper.createNotificationhelper({
                subscriber: subscriberId,
                titleValue: `New Learning Plan Created`,
                messageValue: `Learning plan ${result.learningPlan.title} has been successfully created by ${userInfo.firstName} ${userInfo.lastName}.`,
                notificationType: NotificationType.LEARNING_PLAN_CREATED,
                notifyAdmin: true,
                affected: [
                    {
                        targetRef: "LearningPlan",
                        target: result.learningPlan._id,
                    },
                ],
                status: 'SENT',
                icon: notificationiconEnum.SUCCESS,
                createdBy: userInfo,
            });
            return result.learningPlan;
        } catch (error) {
            throw CustomError(ErrorName.FAILED, error.message);
        }
    },
    updateLearningPlanStatus: async ({ input }, context) => {
        const { learningPlanIDs, newStatus } = input;
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
        try {
            if (!Array.isArray(learningPlanIDs) || learningPlanIDs.length === 0) {
                throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Learning Plan IDs must be provided.");
            }
            if (newStatus === LearningPlanStatus.DRAFT) {
                throw CustomError(ErrorName.INVALID_LEARNING_PLAN_STATUS_UPDATE, 'Learning Plan Status Update Cannot be DRAFT');
            }
            const existingLearningPlans = await LearningPlan.find({
                _id: { $in: learningPlanIDs },
            });
            if (existingLearningPlans.length !== learningPlanIDs.length) {
                throw CustomError(ErrorName.INVALID_LEARNING_PLAN, "One or more provided Learning Plan IDs do not exist.");
            }
            const updatedLearningPlans = await LearningPlan.updateMany(
                { _id: { $in: learningPlanIDs } },
                { $set: { status: newStatus, updatedBy: userId, updatedAt: new Date() } },
                { new: true }
            );
            const updatedPlans = await LearningPlan.find({ _id: { $in: learningPlanIDs } });
            LogHelper.logActivity({
                subscriber: subscriberId,
                logType: LogType.LEARNING_PLAN_LOG,
                operation: "UPDATE",
                ipInfo: context.ipInfo,
                affected: [
                    {
                        targetRef: "LearningPlan",
                        target: LearningPlan._id,
                    },
                ],
                additionalInfo: [
                    {
                        infoType: "LEARNING_PLAN_INFO",
                        infoData: JSON.stringify(updatedPlans),
                    },
                ],
                createdBy: userInfo,
            });
            await Promise.all(
                updatedPlans.map(plan =>
                    NotificationHelper.createNotificationhelper({
                        subscriber: subscriberId,
                        titleValue: `Learning Plan Status Updated`,
                        messageValue: `Learning plan ${plan.title} status has been successfully updated to ${newStatus} by ${userInfo.firstName} ${userInfo.lastName}.`,
                        notificationType: NotificationType.LEARNING_PLAN_STATUS_UPDATED,
                        notifyAdmin: true,
                        affected: [
                            {
                                targetRef: "LearningPlan",
                                target: plan._id,
                            },
                        ],
                        status: 'SENT',
                        icon: notificationiconEnum.SUCCESS,
                        createdBy: userInfo,
                    })
                )
            );
            return {
                success: true,
                message: `Updated ${updatedLearningPlans.nModified} Learning Plans to status ${newStatus}.`,
                updatedLearningPlans: updatedPlans,
            };
        } catch (error) {
            throw CustomError(ErrorName.FAILED, error.message);
        }
    },
    deleteLearningPlan: async ({ id }, context) => {
        const { userInfo, userId } = AuthUser(context);
        try {
            const { role, userId, userInfo, userPermissions, subscriberId } = AuthUser(context);

            const learningPlan = await LearningPlan.findById({ _id: id });
            if (!learningPlan) {
                throw CustomError(ErrorName.LEARNING_PLAN_NOT_FOUND, 'Learning Plan not found.');
            }
            if (learningPlan.isDeleted) {
                throw CustomError(ErrorName.ALREADY_DELETED, 'Learning Plan already deleted.');
            }
            if (![LearningPlanStatus.INACTIVE, LearningPlanStatus.DRAFT].includes(learningPlan.status)) {
                throw CustomError(ErrorName.INVALID_LEARNING_PLAN, 'Only Learning Plans with status INACTIVE or DRAFT can be deleted.');
            }
            learningPlan.isDeleted = true;
            learningPlan.updatedBy = userId;

            await learningPlan.save();
            LogHelper.logActivity({
                subscriber: subscriberId,
                logType: LogType.LEARNING_PLAN_LOG,
                operation: "DELETE",
                ipInfo: context.ipInfo,
                affected: [
                    {
                        targetRef: "LearningPlan",
                        target: learningPlan._id,
                    },
                ],
                additionalInfo: [
                    {
                        infoType: "LEARNING_PLAN_INFO",
                        infoData: JSON.stringify(learningPlan),
                    },
                ],
                createdBy: userInfo,
            });
            await NotificationHelper.createNotificationhelper({
                subscriber: subscriberId,
                titleValue: `Learning Plan Deleted`,
                messageValue: `Learning plan ${learningPlan.title ?? ""} has been successfully deleted by ${userInfo.firstName} ${userInfo.lastName}.`,
                notificationType: NotificationType.LEARNING_PLAN_DELETED,
                notifyAdmin: true,
                affected: [
                    {
                        targetRef: "LearningPlan",
                        target: learningPlan._id,
                    },
                ],
                status: 'SENT',
                icon: notificationiconEnum.SUCCESS,
                createdBy: userInfo,
            });
            return {
                success: true,
                message: 'Learning Plan  deleted successfully.'
            };
        } catch (error) {
            throw CustomError(ErrorName.FAILED, `${error.message}`);
        }

    },
    updateLearningPlan: async ({ id, input }, context) => {
        const { userId, userInfo } = AuthUser(context);
        try {
            const learningPlan = await LearningPlan.findById(id);
            if (!learningPlan) {
                throw CustomError(ErrorName.LEARNING_PLAN_NOT_FOUND, "Learning Plan not found");
            }
            const validation = await updateLearningPlanHelper(id, input, context);
            if (!validation.success) {
                throw CustomError(ErrorName.VALIDATION_FAILED, validation.errors.join(", "));
            }
            learningPlan.updatedBy = userId;
            learningPlan.updatedAt = new Date();
            learningPlan.isUpdated = true;

            await learningPlan.save();
            LogHelper.logActivity({
                subscriber: subscriberId,
                logType: LogType.LEARNING_PLAN_LOG,
                operation: "UPDATE",
                ipInfo: context.ipInfo,
                affected: [
                    {
                        targetRef: "LearningPlan",
                        target: learningPlan._id,
                    },
                ],
                additionalInfo: [
                    {
                        infoType: "LEARNING_PLAN_INFO",
                        infoData: JSON.stringify(learningPlan),
                    },
                ],
                createdBy: userInfo,
            });
            await NotificationHelper.createNotificationhelper({
                subscriber: subscriberId,
                titleValue: `Learning Plan Updated`,
                messageValue: `Learning plan has been successfully updated by ${userInfo.firstName} ${userInfo.lastName}.`,
                notificationType: NotificationType.LEARNING_PLAN_UPDATED,
                notifyAdmin: true,
                affected: [
                    {
                        targetRef: "LearningPlan",
                        target: learningPlan._id,
                    },
                ],
                status: 'SENT',
                icon: notificationiconEnum.SUCCESS,
                createdBy: userInfo,
            });
            return learningPlan;
        } catch (error) {
            throw CustomError(ErrorName.FAILED, error.message);
        }
    }
};
module.exports.queries = {
    getLearningPlans: async ({ filterInput, pageInput, status, search }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);
        const parsedSkip = Math.max(0, parseInt(pageInput?.skip) || 0);
        const parsedLimit = Math.max(1, parseInt(pageInput?.limit) || 50);
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
        try {
            const { subscriberId, userInfo } = AuthUser(context);

            const queryConditions = {
                ...filterInput,
                isDeleted: false,
            };
            if (filterInput?.title) {
                delete queryConditions.title;
            }

            if (filterInput?.status && Array.isArray(filterInput.status)) {
                queryConditions.status = { $in: filterInput.status };
            }
            if (filterInput?.audienceSelection) {
                queryConditions.audienceSelection = {
                    $in: Array.isArray(filterInput.audienceSelection)
                        ? filterInput.audienceSelection
                        : [filterInput.audienceSelection]
                };
            }
            let startDate, endDate;
            if (filterInput?.lastModified) {
                delete queryConditions.lastModified
                const today = Moment();
                switch (filterInput.lastModified) {
                    case "TODAY":
                        startDate = today.startOf("day").toDate();
                        endDate = today.endOf("day").toDate();
                        break;
                    case "YESTERDAY":
                        startDate = today.subtract(1, "day").startOf("day").toDate();
                        endDate = today.subtract(1, "day").endOf("day").toDate();
                        break;
                    case "LAST_7_DAYS":
                        startDate = today.subtract(7, "days").startOf("day").toDate();
                        endDate = Moment().endOf("day").toDate();
                        break;
                    case "LAST_30_DAYS":
                        startDate = today.subtract(30, "days").startOf("day").toDate();
                        endDate = Moment().endOf("day").toDate();
                        break;
                    case "LAST_3_MONTHS":
                        startDate = today.subtract(3, "months").startOf("day").toDate();
                        endDate = Moment().endOf("day").toDate();
                        break;
                    case "LAST_6_MONTHS":
                        startDate = today.subtract(6, "months").startOf("day").toDate();
                        endDate = Moment().endOf("day").toDate();
                        break;
                    case "LAST_YEAR":
                        startDate = today.subtract(1, "year").startOf("day").toDate();
                        endDate = Moment().endOf("day").toDate();
                        break;
                    default:
                        break;
                }

                if (startDate && endDate) {
                    queryConditions.updatedAt = { $gte: startDate, $lte: endDate };
                }
            }
            const totalCount = await LearningPlan.countDocuments(queryConditions);
            const learningPlans = await LearningPlan.aggregate([

                { $match: queryConditions },
                {
                    $lookup: {
                        from: "groups",
                        localField: "groupIDs",
                        foreignField: "_id",
                        as: "groupDetails"
                    }
                },
                {
                    $unwind: {
                        path: "$groupDetails",
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $lookup: {
                        from: "users",
                        localField: "createdBy",
                        foreignField: "_id",
                        as: "createdByDetails"
                    }
                },
                {
                    $addFields: {
                        createdByDetails: { $arrayElemAt: ["$createdByDetails", 0] }
                    }
                },
                {
                    $match: {
                        ...queryConditions,
                        ...(filterInput?.title?.trim() ? {
                            $or: [
                                { title: { $regex: filterInput.title, $options: "i" } },
                                { "createdByDetails.firstName": { $regex: filterInput.title, $options: "i" } },
                                { "createdByDetails.lastName": { $regex: filterInput.title, $options: "i" } }
                            ]
                        } : {})
                    }
                },
                {
                    $lookup: {
                        from: "users",
                        localField: "updatedBy",
                        foreignField: "_id",
                        as: "updatedByDetails"
                    }
                },
                {
                    $addFields: {
                        updatedByDetails: { $arrayElemAt: ["$updatedByDetails", 0] }
                    }
                },
                {
                    $lookup: {
                        from: "trainings",
                        localField: "selectCourses",
                        foreignField: "_id",
                        as: "courseDetails",
                        pipeline: [
                            {
                                $project: {
                                    _id: 1,
                                    UID: 1,
                                    trainingCategories: 1,
                                    trainingSubCategories: 1,
                                    title: 1,
                                    description: 1,
                                    instructions: 1,
                                    overview: 1,
                                    feedback: 1,
                                    feedbackContent: 1,
                                    images: 1,
                                    price: 1,
                                    durationHours: 1,
                                    certificateValidity: 1,
                                    targetAudienceId: 1,
                                    courseType: 1,
                                    enableFreeFlow: 1,
                                    unlockOn: 1,
                                    status: 1,
                                    trainingModuleContents: 1,
                                    courseId: 1,
                                    course_validity: 1,
                                    courseLevel: 1,
                                    hideCourseProgress: 1,
                                    allowMultipleAttempts: 1,
                                    attemptFlexibility: 1,
                                    attemptType: 1,
                                    setLimitAttempt: 1,
                                    disableFurtherAttemptsOnPass: 1,
                                    lockModulesBetweenAttempts: 1,
                                    setTimeLimitForModule: 1,
                                    approvalStatus: 1,
                                    certifications: 1,
                                    bannerImage: 1,
                                    coverImage: 1,
                                    appliedAt: 1,
                                    approvedAt: 1,
                                    rejectedAt: 1,
                                    isActive: 1,
                                    createdBy: 1,
                                    isDeleted: 1,
                                    createdAt: 1,
                                    trainingModules: 1,
                                    scorm: 1,
                                    groupTrainingModule: 1,
                                    skills: 1,
                                    userFeedback: 1,
                                    managerFeedback: 1,
                                    setFrequency: 1,
                                    enableEmailNotification: 1,
                                    setReminder: 1,
                                    setFrequencyDate: 1,
                                    manadatoryModules: 1,
                                    classroomModule: 1,
                                    authorName: 1,
                                    isOrdered: 1
                                },
                            },
                        ],
                    }
                },
                {
                    $addFields: {
                        selectCourses: {
                            $map: {
                                input: "$selectCourses",
                                as: "courseId",
                                in: {
                                    $let: {
                                        vars: {
                                            matchedCourse: {
                                                $arrayElemAt: [
                                                    {
                                                        $filter: {
                                                            input: "$courseDetails",
                                                            as: "course",
                                                            cond: { $eq: ["$$course._id", "$$courseId"] }
                                                        }
                                                    },
                                                    0
                                                ]
                                            }
                                        },
                                        in: {
                                            $mergeObjects: [
                                                { _id: "$$courseId" },
                                                "$$matchedCourse"
                                            ]
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                {
                    $project: {
                        _id: 1,
                        title: 1,
                        targetAudience: 1,
                        groupIDs: 1,
                        userObjectIds: 1,
                        status: 1,
                        audienceSelection: 1,
                        conditionType: 1,
                        isDeleted: 1,
                        createdAt: 1,
                        updatedAt: 1,
                        selectCourses: 1,
                        assignedLearnerIDs: 1,
                        conditionalCustomFields: 1,
                        emailNotification:1,
                        pushNotification:1,
                        "createdBy._id": "$createdByDetails._id",
                        "createdBy.firstName": "$createdByDetails.firstName",
                        "createdBy.lastName": "$createdByDetails.lastName",
                        "createdBy.email": "$createdByDetails.email",
                        "createdBy.role": "$createdByDetails.role",
                        "updatedBy._id": "$updatedByDetails._id",
                        "updatedBy.firstName": "$updatedByDetails.firstName",
                        "updatedBy.lastName": "$updatedByDetails.lastName",
                        "updatedBy.email": "$updatedByDetails.email",
                        "updatedBy.role": "$updatedByDetails.role"
                    }
                }
                ,
                { $sort: { updatedAt: -1 } },
                { $skip: parsedSkip },
                { $limit: parsedLimit },
            ]);
            for (const learningPlan of learningPlans) {
                const overallProgress = await getLearningPlanAverageProgress(learningPlan._id, status, search);
                learningPlan.overallProgress = overallProgress;
            }
            return {
                learningPlans: learningPlans,
                totalCount: learningPlans?.length,
            };
        } catch (error) {
            throw CustomError(ErrorName.FAILED, error.message);
        }
    },
    getLearningPlan: async ({ id, status, lastActivity, search, filteredLearnerData }, context) => {
        const { role, userId, userInfo, subscriberId } = AuthUser(context);
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

        try {
            const queryConditions = {
                _id: id,
                isDeleted: false,
            };
            if (queryConditions?.status && Array.isArray(queryConditions.status)) {
                queryConditions.status = { $in: queryConditions.status };
            }
            const learningPlan = await LearningPlan.aggregate([
                { $match: queryConditions },
                {
                    $lookup: {
                        from: "users",
                        localField: "userObjectIds",
                        foreignField: "_id",
                        as: "userObjectIds"
                    }
                },
                {
                    $lookup: {
                        from: "users",
                        localField: "createdBy",
                        foreignField: "_id",
                        as: "createdByDetails"
                    }
                },
                {
                    $addFields: {
                        createdByDetails: { $arrayElemAt: ["$createdByDetails", 0] }
                    }
                },
                {
                    $lookup: {
                        from: "users",
                        localField: "updatedBy",
                        foreignField: "_id",
                        as: "updatedByDetails"
                    }
                },
                {
                    $addFields: {
                        updatedByDetails: { $arrayElemAt: ["$updatedByDetails", 0] }
                    }
                },
                {
                    $lookup: {
                        from: "trainings",
                        localField: "selectCourses",
                        foreignField: "_id",
                        as: "courseDetails",
                        pipeline: [
                            {
                                $project: {
                                    _id: 1,
                                    UID: 1,
                                    trainingCategories: 1,
                                    trainingSubCategories: 1,
                                    title: 1,
                                    description: 1,
                                    instructions: 1,
                                    overview: 1,
                                    feedback: 1,
                                    feedbackContent: 1,
                                    images: 1,
                                    price: 1,
                                    durationHours: 1,
                                    certificateValidity: 1,
                                    targetAudienceId: 1,
                                    courseType: 1,
                                    enableFreeFlow: 1,
                                    unlockOn: 1,
                                    status: 1,
                                    trainingModuleContents: 1,
                                    courseId: 1,
                                    course_validity: 1,
                                    courseLevel: 1,
                                    hideCourseProgress: 1,
                                    allowMultipleAttempts: 1,
                                    attemptFlexibility: 1,
                                    attemptType: 1,
                                    setLimitAttempt: 1,
                                    disableFurtherAttemptsOnPass: 1,
                                    lockModulesBetweenAttempts: 1,
                                    setTimeLimitForModule: 1,
                                    approvalStatus: 1,
                                    certifications: 1,
                                    bannerImage: 1,
                                    appliedAt: 1,
                                    approvedAt: 1,
                                    rejectedAt: 1,
                                    isActive: 1,
                                    createdBy: 1,
                                    isDeleted: 1,
                                    createdAt: 1,
                                    trainingModules: 1,
                                    scorm: 1,
                                    groupTrainingModule: 1,
                                    skills: 1,
                                    userFeedback: 1,
                                    managerFeedback: 1,
                                    setFrequency: 1,
                                    enableEmailNotification: 1,
                                    setReminder: 1,
                                    setFrequencyDate: 1,
                                    manadatoryModules: 1,
                                    classroomModule: 1,
                                    authorName: 1,
                                    isOrdered: 1,
                                    coverImage: 1,
                                },
                            },
                        ],
                    }
                },
                {
                    $addFields: {
                        selectCourses: {
                            $map: {
                                input: "$selectCourses",
                                as: "courseId",
                                in: {
                                    $let: {
                                        vars: {
                                            matchedCourse: {
                                                $arrayElemAt: [
                                                    {
                                                        $filter: {
                                                            input: "$courseDetails",
                                                            as: "course",
                                                            cond: { $eq: ["$$course._id", "$$courseId"] }
                                                        }
                                                    },
                                                    0
                                                ]
                                            }
                                        },
                                        in: {
                                            $mergeObjects: [
                                                { _id: "$$courseId" },
                                                "$$matchedCourse"
                                            ]
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                {
                    $project: {
                        _id: 1,
                        title: 1,
                        targetAudience: 1,
                        groupIDs: 1,
                        userObjectIds: 1,
                        status: 1,
                        audienceSelection: 1,
                        conditionType: 1,
                        isDeleted: 1,
                        createdAt: 1,
                        updatedAt: 1,
                        selectCourses: 1,
                        assignedLearnerIDs: 1,
                        conditionalCustomFields: 1,
                        overallTrainingProgress:1,
                        emailNotification:1,
                        pushNotification:1,
                        "createdBy._id": "$createdByDetails._id",
                        "createdBy.firstName": "$createdByDetails.firstName",
                        "createdBy.lastName": "$createdByDetails.lastName",
                        "createdBy.email": "$createdByDetails.email",
                        "createdBy.role": "$createdByDetails.role",
                        "updatedBy._id": "$updatedByDetails._id",
                        "updatedBy.firstName": "$updatedByDetails.firstName",
                        "updatedBy.lastName": "$updatedByDetails.lastName",
                        "updatedBy.email": "$updatedByDetails.email",
                        "updatedBy.role": "$updatedByDetails.role"
                    }
                }
            ]);

            if (!learningPlan.length) {
                throw CustomError(ErrorName.NOT_FOUND, "Learning Plan not found");
            }

            const detailedPlan = learningPlan[0];
            detailedPlan.overallProgress = await getLearningPlanAverageProgress(detailedPlan._id, status, search, lastActivity,filteredLearnerData);

            return detailedPlan;
        } catch (error) {
            throw CustomError(ErrorName.FAILED, error.message);
        }
    },
    getUsersForLearningPlan: async ({ input }, context) => {
        const { role, userId, userInfo, subscriberId } = AuthUser(context);
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

        try {
            const { userIds, count } = await getUsersAndCount(input);
            return {
                userIds,
                count
            };
        } catch (error) {
            throw Error(error.message);
        }
    },
};
