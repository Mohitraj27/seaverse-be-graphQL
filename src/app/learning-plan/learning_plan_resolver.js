const { LearningPlan } = require("./learning_plan_model");
const { CustomError } = require("../../util/error_helper");
const {
    ErrorName,
    AuthUser,
    Permission,
    SubRoleHelper,
    subscriberId,
    context,
} = require("../../util");
const {
    createLearningPlanHelper,
    getUsersAndCount,
    updateLearningPlanHelper,
    getLearningPlanAverageProgress,
    updateLearningPlanStatusActivationHelper,
} = require("./learning_plan_helper");
const { fetchTotalTrainerStatisticsGraph } = require("../statistics/statistics_helper");
const LearningPlanStatus = require("./enumFields/learning_plan_status.json");
const { Moment } = require("../../tools");
const LogHelper = require("../logs/log_helper");
const LogType = require("../logs/log_type.json");
const { get } = require("lodash");
const notificationiconEnum = require("../notifications/notification_icon.json");
const NotificationType = require("../notifications/notification_type.json");
const NotificationHelper = require("../notifications/notification_helper");
const LearningPlanAssignment = require("../learning-plan/assignedLearner/assignedLearnerModel");
const { decrypt, encrypt } = require("../../util/encryption_helper");
const {
    OverallTrainingProgress,
} = require("../training-registrations/overall-course-progress/overall_progress_model");
module.exports.mutations = {
    createLearningPlan: async ({ input }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
        try {
            const { subscriberId, userId, userInfo } = AuthUser(context);
            const result = await createLearningPlanHelper(
                { ...input, createdBy: userId, updatedBy: userId },
                context
            );
            if (!result?.success) {
                throw CustomError(ErrorName.LEARNING_PLAN_NOT_CREATED, result?.errors[0]);
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
                messageValue: `Learning plan "${
                    result?.learningPlan?.title ?? ""
                }" has been created by  ${decrypt(userInfo?.firstName)} ${
                    userInfo?.lastName ? decrypt(userInfo?.lastName) : ""
                }.`,
                notificationType: NotificationType.LEARNING_PLAN_CREATED,
                notifyAllAdmin: true,
                affected: [
                    {
                        targetRef: "LearningPlan",
                        target: result.learningPlan._id,
                    },
                ],
                status: "SENT",
                icon: notificationiconEnum.SUCCESS,
                createdBy: userInfo,
            });
            return result.learningPlan;
        } catch (error) {
            throw CustomError(ErrorName.LEARNING_PLAN_NOT_CREATED, error.message);
        }
    },
    updateLearningPlanStatus: async ({ input }, context) => {
        const { learningPlanIDs, newStatus } = input;
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
        try {
            if (!Array.isArray(learningPlanIDs) || learningPlanIDs.length === 0) {
                throw CustomError(
                    ErrorName.ARGUMENTS_REQUIRED,
                    "Learning Plan IDs must be provided."
                );
            }
            if (newStatus === LearningPlanStatus.DRAFT) {
                throw CustomError(
                    ErrorName.INVALID_LEARNING_PLAN_STATUS_UPDATE,
                    "Learning Plan Status Update Cannot be DRAFT"
                );
            }
            const existingLearningPlans = await LearningPlan.find({
                _id: { $in: learningPlanIDs },
            });
            if (existingLearningPlans.length !== learningPlanIDs.length) {
                throw CustomError(
                    ErrorName.INVALID_LEARNING_PLAN,
                    "One or more provided Learning Plan IDs do not exist."
                );
            }
            const updatedLearningPlans = await LearningPlan.updateMany(
                { _id: { $in: learningPlanIDs } },
                { $set: { status: newStatus, updatedBy: userId, updatedAt: new Date() } },
                { new: true }
            );
            const updatedPlans = await LearningPlan.find({ _id: { $in: learningPlanIDs } });
            console.log("data recied", existingLearningPlans);

            if (
                existingLearningPlans[0].status === LearningPlanStatus.INACTIVE &&
                newStatus === LearningPlanStatus.ACTIVE
            ) {
                console.log("data received", existingLearningPlans[0]);
                const data = existingLearningPlans[0];
                await updateLearningPlanStatusActivationHelper(data, context);
            }
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

            const actionInNotification =
                newStatus === LearningPlanStatus.ACTIVE ? "activated" : "deactivated";

            await Promise.all(
                updatedPlans.map(plan =>
                    NotificationHelper.createNotificationhelper({
                        subscriber: subscriberId,
                        titleValue: `Learning Plan Status Updated`,
                        messageValue: `Learning plan "${
                            plan.title
                        }" status changed to ${actionInNotification} by ${decrypt(
                            userInfo?.firstName
                        )} ${userInfo?.lastName ? decrypt(userInfo?.lastName) : ""}.`,
                        notificationType: NotificationType.LEARNING_PLAN_STATUS_UPDATED,
                        notifyAllAdmin: true,
                        affected: [
                            {
                                targetRef: "LearningPlan",
                                target: plan._id,
                            },
                        ],
                        status: "SENT",
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
            throw CustomError(ErrorName.FAILED_TO_UPDATE_STATUS, error.message);
        }
    },
    deleteLearningPlan: async ({ id }, context) => {
        const { userInfo, userId } = AuthUser(context);
        try {
            const { role, userId, userInfo, userPermissions, subscriberId } = AuthUser(context);

            const learningPlan = await LearningPlan.findById({ _id: id });
            if (!learningPlan) {
                throw CustomError(ErrorName.LEARNING_PLAN_NOT_FOUND, "Learning Plan not found.");
            }
            if (learningPlan.isDeleted) {
                throw CustomError(ErrorName.ALREADY_DELETED, "Learning Plan already deleted.");
            }
            if (
                ![LearningPlanStatus.INACTIVE, LearningPlanStatus.DRAFT].includes(
                    learningPlan.status
                )
            ) {
                throw CustomError(
                    ErrorName.INVALID_LEARNING_PLAN,
                    "Only Learning Plans with status INACTIVE or DRAFT can be deleted."
                );
            }
            learningPlan.isDeleted = true;
            learningPlan.updatedBy = userId;

            await learningPlan.save();
            await LearningPlanAssignment.deleteMany({ learningPlanId: id });
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
                messageValue: `Learning plan "${
                    learningPlan.title ?? ""
                }" has been deleted by ${decrypt(userInfo?.firstName)} ${
                    userInfo?.lastName ? decrypt(userInfo?.lastName) : ""
                }.`,
                notificationType: NotificationType.LEARNING_PLAN_DELETED,
                notifyAllAdmin: true,
                affected: [
                    {
                        targetRef: "LearningPlan",
                        target: learningPlan._id,
                    },
                ],
                status: "SENT",
                icon: notificationiconEnum.SUCCESS,
                createdBy: userInfo,
            });
            return {
                success: true,
                message: "Learning Plan  deleted successfully.",
            };
        } catch (error) {
            throw CustomError(ErrorName.FAILED_TO_DELETE_LEARNING_PLAN, `${error.message}`);
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
            if (!validation?.success) {
                throw CustomError(ErrorName.VALIDATION_FAILED, validation?.errors?.join(", "));
            }
            const updatedLearningPlan = await LearningPlan.findById(validation.learningPlan._id);
            const learningPlanName = updatedLearningPlan?.title ?? "";
            if (!updatedLearningPlan) {
                throw CustomError(
                    ErrorName.LEARNING_PLAN_NOT_FOUND,
                    "Updated Learning Plan not found"
                );
            }
            updatedLearningPlan.updatedBy = userId;
            updatedLearningPlan.updatedAt = new Date();
            updatedLearningPlan.isUpdated = true;

            // Save updated learning plan
            await updatedLearningPlan.save();
            LogHelper.logActivity({
                subscriber: subscriberId,
                logType: LogType.LEARNING_PLAN_LOG,
                operation: "UPDATE",
                ipInfo: context.ipInfo,
                affected: [
                    {
                        targetRef: "LearningPlan",
                        target: validation.learningPlan._id,
                    },
                ],
                additionalInfo: [
                    {
                        infoType: "LEARNING_PLAN_INFO",
                        infoData: JSON.stringify(validation.learningPlan),
                    },
                ],
                createdBy: userInfo,
            });
            await NotificationHelper.createNotificationhelper({
                subscriber: subscriberId,
                titleValue: `Learning Plan Updated`,
                messageValue: `Learning plan "${
                    learningPlanName ?? ""
                }" has been updated by ${decrypt(userInfo?.firstName)} ${
                    userInfo?.lastName ? decrypt(userInfo?.lastName) : ""
                }.`,
                notificationType: NotificationType.LEARNING_PLAN_UPDATED,
                notifyAllAdmin: true,
                affected: [
                    {
                        targetRef: "LearningPlan",
                        target: validation.learningPlan._id,
                    },
                ],
                status: "SENT",
                icon: notificationiconEnum.SUCCESS,
                createdBy: userInfo,
            });
            console.log("updated Learning Plan", updatedLearningPlan);
            return updatedLearningPlan;
        } catch (error) {
            throw CustomError(ErrorName.LEARNING_PLAN_NOT_UPDATED, error.message);
        }
    },
};
module.exports.queries = {
    // getLearningPlans: async ({ filterInput, pageInput, status, search }, context) => {
    //     const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
    //         AuthUser(context);
    //     const skip = pageInput?.skip || 0;
    //     const limit = pageInput?.limit || 50;

    //     if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
    //     try {
    //         const { subscriberId, userInfo } = AuthUser(context);

    //         const queryConditions = {
    //             ...filterInput,
    //             isDeleted: false,
    //         };
    //         if (filterInput?.title) {
    //             delete queryConditions.title;
    //         }

    //         if (filterInput?.status && Array.isArray(filterInput.status)) {
    //             queryConditions.status = { $in: filterInput.status };
    //         }
    //         if (filterInput?.audienceSelection) {
    //             queryConditions.audienceSelection = {
    //                 $in: Array.isArray(filterInput.audienceSelection)
    //                     ? filterInput.audienceSelection
    //                     : [filterInput.audienceSelection]
    //             };
    //         }
    //         let startDate, endDate;
    //         if (filterInput?.lastModified) {
    //             delete queryConditions.lastModified
    //             const today = Moment();
    //             const endOfToday = today.clone().endOf("day").toDate();
    //             switch (filterInput.lastModified) {
    //                 case "TODAY":
    //                     startDate = today.clone().startOf("day").toDate();
    //                     endDate = endOfToday;
    //                     break;
    //                 case "YESTERDAY":
    //                     startDate = today.clone().subtract(1, "day").startOf("day").toDate();
    //                     endDate = today.clone().subtract(1, "day").endOf("day").toDate();
    //                     break;
    //                 case "LAST_7_DAYS":
    //                     startDate = today.clone().subtract(7, "days").startOf("day").toDate();
    //                     endDate = endOfToday;
    //                     break;
    //                 case "LAST_30_DAYS":
    //                     startDate = today.clone().subtract(30, "days").startOf("day").toDate();
    //                     endDate = endOfToday;
    //                     break;
    //                 case "LAST_3_MONTHS":
    //                     startDate = today.clone().subtract(3, "months").startOf("day").toDate();
    //                     endDate = endOfToday;
    //                     break;
    //                 case "LAST_6_MONTHS":
    //                     startDate = today.clone().subtract(6, "months").startOf("day").toDate();
    //                     endDate = endOfToday;
    //                     break;
    //                 case "LAST_YEAR":
    //                     startDate = today.clone().subtract(12, "months").startOf("day").toDate();
    //                     endDate = endOfToday;
    //                     break;
    //                 default:
    //                     break;
    //             }

    //             if (startDate && endDate) {
    //                 queryConditions.updatedAt = { $gte: startDate, $lte: endDate };
    //             }
    //         }
    //         console.time('queryTime');
    //         const totalCount = await LearningPlan.countDocuments(queryConditions);

    //         const learningPlans = await LearningPlan.aggregate([
    //             { $match: queryConditions },
    //             { $sort: { updatedAt: -1 } },
    //             // { $skip: skip },
    //             // { $limit: limit },
    //             {
    //                 $lookup: {
    //                     from: "groups",
    //                     localField: "groupIDs",
    //                     foreignField: "_id",
    //                     as: "groupDetails"
    //                 }
    //             },
    //             {
    //                 $unwind: {
    //                     path: "$groupDetails",
    //                     preserveNullAndEmptyArrays: true
    //                 }
    //             },
    //             {
    //                 $lookup: {
    //                     from: "users",
    //                     localField: "createdBy",
    //                     foreignField: "_id",
    //                     as: "createdByDetails"
    //                 }
    //             },
    //             {
    //                 $addFields: {
    //                     createdByDetails: { $arrayElemAt: ["$createdByDetails", 0] }
    //                 }
    //             },
    //             {
    //                 $match: {
    //                     ...queryConditions,
    //                     ...(filterInput?.title?.trim() ? {
    //                         $or: [
    //                             { title: { $regex: filterInput.title, $options: "i" } },
    //                             { "createdByDetails.firstName": { $regex: filterInput.title, $options: "i" } },
    //                             { "createdByDetails.lastName": { $regex: filterInput.title, $options: "i" } }
    //                         ]
    //                     } : {})
    //                 }
    //             },
    //             {
    //                 $lookup: {
    //                     from: "trainings",
    //                     localField: "selectCourses",
    //                     foreignField: "_id",
    //                     as: "courseDetails",
    //                     pipeline: [
    //                         {
    //                             $project: {
    //                                 _id: 1,
    //                                 UID: 1,
    //                                 title: 1,
    //                                 status: 1,
    //                                 bannerImage: 1,
    //                                 coverImage: 1,
    //                                 isDeleted: 1,
    //                             },
    //                         },
    //                     ],
    //                 }
    //             },
    //             {
    //                 $lookup: {
    //                     from: "learningplanassignments",
    //                     localField: "_id",
    //                     foreignField: "learningPlanId",
    //                     as: "assignedLearners"
    //                 }
    //             },
    //             {
    //                 $addFields: {
    //                     assignedLearnerIDs: {
    //                         $map: {
    //                             input: "$assignedLearners",
    //                             as: "assignment",
    //                             in: "$$assignment.assignedLearnerId"
    //                         }
    //                     }
    //                 }
    //             },
    //             {
    //                 $addFields: {
    //                     selectCourses: {
    //                         $filter: {
    //                             input: "$courseDetails",
    //                             as: "course",
    //                             cond: { $eq: ["$$course.isDeleted", false] }
    //                         }
    //                     }
    //                 }
    //             },
    //             {
    //                 $lookup: {
    //                     from: "users",
    //                     localField: "assignedLearnerIDs",
    //                     foreignField: "_id",
    //                     as: "assignedLearners"
    //                 }
    //             },
    //             {
    //                 $addFields: {
    //                     numberOfAssignedLearners: {
    //                         $size: { $ifNull: ["$assignedLearners", []] }
    //                     },
    //                 }
    //             },
    //             {
    //                 $lookup: {
    //                     from: "users",
    //                     localField: "assignedLearnerIDs",
    //                     foreignField: "_id",
    //                     as: "assignedLearners"
    //                 }
    //             },
    //             {
    //                 $addFields: {
    //                     assignedLearnerIDs: {
    //                         $filter: {
    //                             input: "$assignedLearners",
    //                             as: "learner",
    //                             cond: { $eq: ["$$learner.isDeleted", false] }
    //                         }
    //                     }
    //                 }
    //             },
    //             {
    //                 $project: {
    //                     _id: 1,
    //                     title: 1,
    //                     status: 1,
    //                     isDeleted: 1,
    //                     createdAt: 1,
    //                     updatedAt: 1,
    //                     selectCourses: 1,
    //                     audienceSelection: 1,
    //                     numberOfAssignedLearners: 1,
    //                     "createdBy._id": "$createdByDetails._id",
    //                     "createdBy.firstName": "$createdByDetails.firstName",
    //                     "createdBy.lastName": "$createdByDetails.lastName",
    //                 }
    //             }
    //         ]);
    //         console.timeEnd('queryTime');

    //         for (const learningPlan of learningPlans) {
    //             const overallProgress = await getLearningPlanAverageProgress(learningPlan._id, status, search);
    //             learningPlan.overallProgress = overallProgress;
    //         }
    //         function filterData(data, statuses) {

    //             if (!statuses || statuses.length === 0) {
    //                 return data;
    //             }

    //             return data?.filter(item => {
    //                 const avgProgress = item.overallProgress?.averageProgress || 0;

    //                 return statuses.some(status => {
    //                     if (status === "NOT_STARTED" && avgProgress === 0) {
    //                         return true;
    //                     }

    //                     if (status === "IN_PROGRESS" && avgProgress > 0 && avgProgress < 100) {
    //                         return true;
    //                     }

    //                     if (status === "COMPLETED" && avgProgress === 100) {
    //                         return true;
    //                     }

    //                     return false;
    //                 });
    //             });
    //         }

    //         const lpData = filterData(learningPlans, status);

    //         if (status) {

    //             return {
    //                 learningPlans: lpData,
    //                 totalCount: lpData?.length,
    //             };
    //         }
    //         return {
    //             learningPlans: learningPlans,
    //             totalCount: learningPlans?.length,
    //         };
    //     } catch (error) {
    //         throw CustomError(ErrorName.FAILED_TO_FETCH_LEARNING_PLAN, error.message);
    //     }
    // },

    getLearningPlans: async ({ filterInput, pageInput, status, search }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);
        const skip = pageInput?.skip || 0;
        const limit = pageInput?.limit || 50;

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
                        : [filterInput.audienceSelection],
                };
            }
            let startDate, endDate;
            if (filterInput?.lastModified) {
                delete queryConditions.lastModified;
                const today = Moment();
                const endOfToday = today.clone().endOf("day").toDate();
                switch (filterInput.lastModified) {
                    case "TODAY":
                        startDate = today.clone().startOf("day").toDate();
                        endDate = endOfToday;
                        break;
                    case "YESTERDAY":
                        startDate = today.clone().subtract(1, "day").startOf("day").toDate();
                        endDate = today.clone().subtract(1, "day").endOf("day").toDate();
                        break;
                    case "LAST_7_DAYS":
                        startDate = today.clone().subtract(7, "days").startOf("day").toDate();
                        endDate = endOfToday;
                        break;
                    case "LAST_30_DAYS":
                        startDate = today.clone().subtract(30, "days").startOf("day").toDate();
                        endDate = endOfToday;
                        break;
                    case "LAST_3_MONTHS":
                        startDate = today.clone().subtract(3, "months").startOf("day").toDate();
                        endDate = endOfToday;
                        break;
                    case "LAST_6_MONTHS":
                        startDate = today.clone().subtract(6, "months").startOf("day").toDate();
                        endDate = endOfToday;
                        break;
                    case "LAST_YEAR":
                        startDate = today.clone().subtract(12, "months").startOf("day").toDate();
                        endDate = endOfToday;
                        break;
                    default:
                        break;
                }

                if (startDate && endDate) {
                    queryConditions.updatedAt = { $gte: startDate, $lte: endDate };
                }
            }

            // OPTIMIZED: Single aggregation pipeline with FULL progress details
            const pipeline = [
                { $match: queryConditions },
                { $sort: { updatedAt: -1 } },

                // Get creator details
                {
                    $lookup: {
                        from: "users",
                        localField: "createdBy",
                        foreignField: "_id",
                        as: "createdByDetails",
                        pipeline: [{ $project: { _id: 1, firstName: 1, lastName: 1 } }],
                    },
                },
                {
                    $addFields: {
                        createdByDetails: { $arrayElemAt: ["$createdByDetails", 0] },
                    },
                },

                // Apply title/name search filter
                {
                    $match: {
                        ...(filterInput?.title?.trim()
                            ? {
                                  $or: [
                                      { title: { $regex: filterInput.title, $options: "i" } },
                                      {
                                          "createdByDetails.firstName": {
                                              $regex: filterInput.title,
                                              $options: "i",
                                          },
                                      },
                                      {
                                          "createdByDetails.lastName": {
                                              $regex: filterInput.title,
                                              $options: "i",
                                          },
                                      },
                                  ],
                              }
                            : {}),
                    },
                },

                // Get course details
                {
                    $lookup: {
                        from: "trainings",
                        localField: "selectCourses",
                        foreignField: "_id",
                        as: "courseDetails",
                        pipeline: [
                            { $match: { isDeleted: false } },
                            {
                                $project: {
                                    _id: 1,
                                    UID: 1,
                                    title: 1,
                                    status: 1,
                                    bannerImage: 1,
                                    coverImage: 1,
                                },
                            },
                        ],
                    },
                },

                // Get assigned learner count
                {
                    $lookup: {
                        from: "learningplanassignments",
                        localField: "_id",
                        foreignField: "learningPlanId",
                        as: "assignments",
                    },
                },
                {
                    $lookup: {
                        from: "users",
                        localField: "assignments.assignedLearnerId",
                        foreignField: "_id",
                        as: "assignedLearners",
                        pipeline: [{ $match: { isDeleted: false } }, { $project: { _id: 1 } }],
                    },
                },

                // OPTIMIZED: Get only essential progress data (no user details)
                {
                    $lookup: {
                        from: "overalltrainingprogresses",
                        let: { learningPlanId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $in: ["$learningPlanId", "$learningPlan"] },
                                            { $ne: ["$isEnrolled", false] },
                                        ],
                                    },
                                },
                            },
                            // Group to get only summary data (no user details lookup)
                            {
                                $group: {
                                    _id: null,
                                    averageProgress: { $avg: "$progressPercentage" },
                                    totalTimeSpend: { $sum: "$timeSpend" },
                                    overallTrainingprogressStatus: { $addToSet: "$status" },
                                },
                            },
                            {
                                $project: {
                                    _id: 0,
                                    averageProgress: { $round: ["$averageProgress", 2] },
                                    totalTimeSpend: 1,
                                    overallTrainingprogressStatus: 1,
                                },
                            },
                        ],
                        as: "progressData",
                    },
                },

                // Project final structure using assignments for userCount
                {
                    $project: {
                        _id: 1,
                        title: 1,
                        status: 1,
                        isDeleted: 1,
                        createdAt: 1,
                        updatedAt: 1,
                        selectCourses: "$courseDetails",
                        audienceSelection: 1,
                        numberOfAssignedLearners: { $size: "$assignedLearners" },
                        "createdBy._id": "$createdByDetails._id",
                        "createdBy.firstName": "$createdByDetails.firstName",
                        "createdBy.lastName": "$createdByDetails.lastName",
                        overallProgress: {
                            $cond: {
                                if: { $gt: [{ $size: "$progressData" }, 0] },
                                then: {
                                    averageProgress: {
                                        $arrayElemAt: ["$progressData.averageProgress", 0],
                                    },
                                    totalTimeSpend: {
                                        $arrayElemAt: ["$progressData.totalTimeSpend", 0],
                                    },
                                    userCount: { $size: "$assignedLearners" }, // Use assignments count instead
                                    overallTrainingprogressStatus: {
                                        $arrayElemAt: [
                                            "$progressData.overallTrainingprogressStatus",
                                            0,
                                        ],
                                    },
                                },
                                else: {
                                    averageProgress: 0,
                                    totalTimeSpend: 0,
                                    userCount: { $size: "$assignedLearners" }, // Use assignments count for zero state too
                                    overallTrainingprogressStatus: [],
                                },
                            },
                        },
                    },
                },
            ];

            // Apply status filtering based on progress if needed
            if (status && status.length > 0) {
                pipeline.push({
                    $match: {
                        $expr: {
                            $or: status.map(s => {
                                if (s === "NOT_STARTED") {
                                    return { $eq: ["$overallProgress.averageProgress", 0] };
                                } else if (s === "IN_PROGRESS") {
                                    return {
                                        $and: [
                                            { $gt: ["$overallProgress.averageProgress", 0] },
                                            { $lt: ["$overallProgress.averageProgress", 100] },
                                        ],
                                    };
                                } else if (s === "COMPLETED") {
                                    return { $eq: ["$overallProgress.averageProgress", 100] };
                                }
                                return false;
                            }),
                        },
                    },
                });
            }

            // Get total count before pagination
            const countPipeline = [...pipeline];
            countPipeline.push({ $count: "total" });

            // Apply pagination to main pipeline
            pipeline.push({ $skip: skip });
            pipeline.push({ $limit: limit });

            const [learningPlansResult, countResult] = await Promise.all([
                LearningPlan.aggregate(pipeline),
                LearningPlan.aggregate(countPipeline),
            ]);

            // Post-process filtering is no longer needed since we're not returning users
            const learningPlans = learningPlansResult;

            for (const plan of learningPlans) {
                if (plan?.createdBy?.firstName) {
                    plan.createdBy.firstName = decrypt(plan.createdBy.firstName);
                }
                if (plan?.createdBy?.lastName) {
                    plan.createdBy.lastName = decrypt(plan.createdBy.lastName);
                }
            }

            const totalCount = countResult.length > 0 ? countResult[0].total : 0;
            return {
                learningPlans,
                totalCount,
            };
        } catch (error) {
            throw CustomError(ErrorName.FAILED_TO_FETCH_LEARNING_PLAN, error.message);
        }
    },
    getLearningPlan: async (
        { id, status, lastActivity, search, filteredLearnerData, pageInput },
        context
    ) => {
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
                        from: "learningplanassignments",
                        localField: "_id",
                        foreignField: "learningPlanId",
                        as: "assignedLearners",
                    },
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
                                    title: 1,
                                    description: 1,
                                    status: 1,
                                    images: 1,
                                    courseId: 1,
                                    bannerImage: 1,
                                    coverImage: 1,
                                    isDeleted: 1,
                                },
                            },
                        ],
                    },
                },
                {
                    $addFields: {
                        selectCourses: {
                            $filter: {
                                input: "$courseDetails",
                                as: "course",
                                cond: { $eq: ["$$course.isDeleted", false] },
                            },
                        },
                    },
                },
                {
                    $addFields: {
                        assignedLearnerIDs: {
                            $map: {
                                input: "$assignedLearners",
                                as: "assignment",
                                in: "$$assignment.assignedLearnerId",
                            },
                        },
                        numberOfAssignedLearners: {
                            $size: { $ifNull: ["$assignedLearners", []] },
                        },
                        userObjectIds: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: "$assignedLearners",
                                        as: "assignment",
                                        cond: { $eq: ["$$assignment.isManuallyAdded", true] },
                                    },
                                },
                                as: "filteredAssignment",
                                in: "$$filteredAssignment.assignedLearnerId",
                            },
                        },
                    },
                },
                {
                    $lookup: {
                        from: "users",
                        localField: "userObjectIds",
                        foreignField: "_id",
                        as: "userDetails",
                        pipeline: [
                            /* {
                                $match: { isDeleted: { $ne: true } }    //for gdpr change of keeping users name only 
                            }, */
                            {
                                $project: {
                                    _id: 1,
                                    firstName: 1,
                                    isRegistered: 1,
                                    lastName: 1,
                                    email: 1,
                                },
                            },
                        ],
                    },
                },
                {
                    $addFields: {
                        userObjectIds: {
                            $map: {
                                input: "$userDetails",
                                as: "user",
                                in: {
                                    _id: "$$user._id",
                                    firstName: "$$user.firstName",
                                    lastName: "$$user.lastName",
                                    isRegistered: "$$user.isRegistered",
                                    email: "$$user.email",
                                },
                            },
                        },
                    },
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
                        numberOfAssignedLearners: 1,
                        conditionalCustomFields: 1,
                        overallTrainingProgress: 1,
                        emailNotification: 1,
                        pushNotification: 1,
                    },
                },
            ]);

            if (!learningPlan.length) {
                throw CustomError(ErrorName.NOT_FOUND, "Learning Plan not found");
            }

            const detailedPlan = learningPlan[0];
            detailedPlan.overallProgress = await getLearningPlanAverageProgress(
                detailedPlan._id,
                status,
                search,
                lastActivity,
                filteredLearnerData,
                pageInput
            );
            if (detailedPlan?.userObjectIds?.length > 0) {
                detailedPlan.userObjectIds = detailedPlan.userObjectIds.map(user => ({
                    ...user,
                    firstName: decrypt(user.firstName),
                    lastName: user.lastName ? decrypt(user.lastName) : "",
                    email: decrypt(user.email),
                }));
            }
            return detailedPlan;
        } catch (error) {
            throw CustomError(ErrorName.FAILED_TO_FETCH_LEARNING_PLAN, error.message);
        }
    },
    getUsersForLearningPlan: async ({ input }, context) => {
        const { role, userId, userInfo, subscriberId } = AuthUser(context);
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

        try {
            input.fromUserCount = true;
            const { userIds, count } = await getUsersAndCount(input);
            return {
                userIds,
                count,
            };
        } catch (error) {
            throw Error(error.message);
        }
    },
    getUsersListforLearningPlan: async (
        { id, status, lastActivity, search, filteredLearnerData, pageInput, sortInput },
        context
    ) => {
        const { role, userId, userInfo, subscriberId } = AuthUser(context);
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

        const skip = pageInput?.skip ?? 0;
        const limit = pageInput?.limit ?? 50;

        try {
            const queryConditions = {
                learningPlan: { $in: [id] },
                isDeleted: { $ne: true },
            };

            const searchCondition = [];
            if (search?.trim()) {
                const encryptedSearch = encrypt(search.trim()?.toLowerCase());
                searchCondition.push({
                    $match: {
                        $or: [
                            { "usersList.firstName": { $regex: encryptedSearch, $options: "i" } },
                            { "usersList.lastName": { $regex: encryptedSearch, $options: "i" } },
                            { "usersList.email": { $regex: encryptedSearch, $options: "i" } },
                        ],
                    },
                });
            }

            const basePipeline = [
                {
                    $match: queryConditions,
                },
                {
                    $lookup: {
                        from: "users",
                        localField: "user",
                        foreignField: "_id",
                        as: "usersList",
                        pipeline: [
                            {
                                $project: {
                                    _id: 1,
                                    firstName: 1,
                                    lastName: 1,
                                    email: 1,
                                    lastLoginAt: 1,
                                    isRegistered: 1,
                                },
                            },
                        ],
                    },
                },
                { $unwind: "$usersList" },
                ...searchCondition,
                {
                    $group: {
                        _id: "$user",
                        averageProgress: { $avg: "$progressPercentage" },
                        statusSet: { $addToSet: "$status" },
                        totalTrainings: { $sum: 1 },
                        timeSpend: { $sum: "$timeSpend" },
                        completedTrainings: {
                            $sum: {
                                $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0],
                            },
                        },
                        user: { $first: "$usersList" },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        userId: "$user._id",
                        averageProgress: 1,
                        totalTrainings: 1,
                        completedTrainings: 1,
                        firstName: "$user.firstName",
                        lastName: "$user.lastName",
                        email: "$user.email",
                        lastLoginAt: "$user.lastLoginAt",
                        isRegistered: "$user.isRegistered",
                        timeSpend: 1,
                        lastLoginAtNumeric: {
                            $cond: {
                                if: { $type: "$user.lastLoginAt" },
                                then: { $toLong: "$user.lastLoginAt" },
                                else: 0,
                            },
                        },
                        status: {
                            $switch: {
                                branches: [
                                    {
                                        case: { $eq: ["$statusSet", ["NOT_STARTED"]] },
                                        then: "NOT_STARTED",
                                    },
                                    {
                                        case: { $eq: ["$statusSet", ["COMPLETED"]] },
                                        then: "COMPLETED",
                                    },
                                ],
                                default: "IN_PROGRESS",
                            },
                        },
                    },
                },
            ];

            if (status?.length > 0) {
                basePipeline.push({
                    $match: {
                        status: { $in: status },
                    },
                });
            }

            const dataPipeline = [...basePipeline];

            if (sortInput?.sortField) {
                const sortFieldMap = {
                    Name: "firstName",
                    status: "status",
                    progressPercentage: "averageProgress",
                    completedTrainings: "completedTrainings",
                    updatedAt: "lastLoginAtNumeric",
                };

                const field = sortFieldMap[sortInput.sortField];
                const sortOrder = sortInput.sortOrder ?? 1;

                if (field) {
                    dataPipeline.push({
                        $sort: {
                            [field]: sortOrder,
                            userId: 1,
                        },
                    });
                } else {
                    dataPipeline.push({
                        $sort: {
                            firstName: 1,
                            userId: 1,
                        },
                    });
                }
            } else {
                dataPipeline.push({
                    $sort: {
                        firstName: 1,
                        userId: 1,
                    },
                });
            }

            dataPipeline.push({ $skip: skip });
            dataPipeline.push({ $limit: limit });
            dataPipeline.push({
                $project: {
                    lastLoginAtNumeric: 0,
                },
            });

            const countPipeline = [...basePipeline, { $count: "totalCount" }];

            const [paginatedUsers, countResult] = await Promise.all([
                OverallTrainingProgress.aggregate(dataPipeline),
                OverallTrainingProgress.aggregate(countPipeline),
            ]);

            const totalCount = countResult[0]?.totalCount || 0;

            const decryptedResult = paginatedUsers.map((user) => ({
                ...user,
                firstName: decrypt(user.firstName),
                lastName: user.lastName ? decrypt(user.lastName) : "",
                email: decrypt(user.email),
            }));

            return {
                users: decryptedResult,
                totalCount,
            };
        } catch (error) {
            console.error(error);
            throw CustomError(
                "FAILED_TO_FETCH_USER_LIST_FOR_LEARNING_PLAN",
                error.message
            );
        }
    },
      
};
