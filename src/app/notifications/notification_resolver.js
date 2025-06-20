const { ObjectId, SubscriptionFilter, PubSubHelper, Moment } = require("../../tools");
const { Role, AuthUser, CustomError, ErrorName } = require("../../util");

const { Notification } = require("./notification_model");

const SubRoleHelper = require("../user/sub-roles/sub_role_helper");

const NotificationEvent = require("./notification_event.json");
const Permission = require("../user/sub-roles/permission.json");
const { SubRole } = require("../user/sub-roles/sub_role_model");
const { User } = require("../user/user_model");

module.exports.queries = {
    getNotifications: async ({ pageInput, filterInput }, context) => {
        const {
            role,
            userId,
            userPermissions,
            subscriberId,
            employeeId,
            isOrganizationManager,
            managingOrganization,
        } = AuthUser(context);
        try {

            const pageLimit = [];
            const skip = pageInput?.skip ?? 0;
            const isSeeAllPage = filterInput?.isSeeAllPage ?? false;
            const selectUserRequests = filterInput?.selectUserRequests ?? false;
            pageLimit.push(
                {
                    $skip: skip
                },
            );

            const selectFirstThreeDays = [];
            const userRequestsFilter = [];
            if ((skip === 0)&& !selectUserRequests && !isSeeAllPage) {
                selectFirstThreeDays.push({
                    $match: {
                        $expr: {
                            $gte: [
                                "$createdAt",
                                new Date(new Date() - 3 * 24 * 60 * 60 * 1000)
                            ]
                        }
                    }
                })
                pageLimit.push(
                    {
                        $limit: pageInput?.limit ?? 10000
                    }
                );
            } else {
                pageLimit.push(
                    {
                        $limit: pageInput?.limit ?? 50
                    }
                );
            }

            let filterConditions = { /* subscriber: subscriberId, */ isDeleted: { $ne: true } };

            if (filterInput) {
                if (filterInput.notificationType) {
                    filterConditions.notificationType = filterInput.notificationType;
                }

                if (filterInput.search) {
                    filterConditions.$or = [
                        {
                            "title.value": {
                                $regex: ".*" + filterInput.search + ".*",
                                $options: "i",
                            },
                        },
                        {
                            "message.value": {
                                $regex: ".*" + filterInput.search + ".*",
                                $options: "i",
                            },
                        },
                    ];
                }

                if (filterInput.dateFrom || filterInput.dateTo) {
                    filterConditions.createdAt = {};
                    if (filterInput.dateFrom)
                        filterConditions.createdAt.$gte = Moment(filterInput.dateFrom)
                            .startOf("day")
                            .toDate();

                    if (filterInput.dateTo)
                        filterConditions.createdAt.$lte = Moment(filterInput.dateTo)
                            .endOf("day")
                            .toDate();
                }

                if(selectUserRequests){
                    userRequestsFilter.push({
                        $match :{
                            isUserRequest : true
                        }
                    })
                }else{
                    userRequestsFilter.push({
                        $match :{
                            isUserRequest : {$ne : true}
                        }
                    })
                }
            }

            const fetchResult = async pipeline => {
                let result = Notification.aggregatePaginate(
                    Notification.aggregate([
                        ...pipeline,
                        {
                            $addFields: {
                                isRead: {
                                    $in: [
                                        userId,
                                        {
                                            $ifNull: ["$usersMarkedAsRead", []]
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            $facet: {
                                notifications: [
                                    {
                                        $addFields: {
                                            isRead: {
                                                $in: [
                                                    userId,
                                                    {
                                                        $ifNull: ["$usersMarkedAsRead", []]
                                                    }
                                                ]
                                            }
                                        }
                                    },
                                    ...userRequestsFilter,
                                    ...selectFirstThreeDays,
                                    {
                                        $sort: { createdAt: -1 }
                                    },
                                    ...pageLimit,
                                ],
                                counts: [
                                    {
                                        $group: {
                                            _id: null,
                                            isReadTrueCount: {
                                                $sum: {
                                                    $cond: [{ $eq: ["$isRead", true] }, 1, 0]
                                                }
                                            },
                                            isReadFalseCount: {
                                                $sum: {
                                                    $cond: [{ $eq: ["$isRead", false] }, 1, 0]
                                                }
                                            }
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            $project: {
                                notifications: 1,
                                notificationReadInfo: { $arrayElemAt: ["$counts", 0] }
                            }
                        }
                    ]),
                    {
                        // offset: skip,
                        // limit,
                        sort: { createdAt: "-1" },
                        customLabels: {
                            docs: "notifications",
                            totalDocs: "totalCount",
                            offset: "skip",
                        },
                        // pagination: limit !== 0,
                        allowDiskUse: true,
                    }
                );
                return result;
            };


            const subRoleAdminId = await SubRole.findOne({ name: Role.ADMIN, primaryRole: Role.ADMIN }).select("_id");

            const checkIfAdmin = await User.findOne({
                _id: userId,
                subRoles: subRoleAdminId._id
            }).lean().select("roleAssignmentDate");

            if (context.platform === Role.ADMIN) {
                filterConditions.$or = [
                    {
                        $and: [
                            { isNotificatonForAdmin: true },
                            { notifiers: {$in : [userId]} },
                        ]   
                    },
                    { notifyAllAdmin: true },
                ];

                if (checkIfAdmin?.roleAssignmentDate) {
                    filterConditions.$or[0].$and.push({ createdAt: { $gt: checkIfAdmin.roleAssignmentDate } });
                    filterConditions.$or[1] = {
                        $and: [
                            { notifyAllAdmin: true },
                            { createdAt: { $gt: checkIfAdmin.roleAssignmentDate } }
                        ]
                    } 
                }

                const pipeline = [{ $match: filterConditions }];
                let result = await fetchResult(pipeline);
                return result

            } else if (context.platform === Role.ADMIN && checkIfAdmin) {

                filterConditions.$or = [
                    {
                        $and: [
                            { isNotificatonForAdmin: true },
                            { notifiers: {$in : [userId]} },
                        ]   
                    },
                    { notifyAllAdmin: true },
                ];

                if (checkIfAdmin?.roleAssignmentDate) {
                    filterConditions.$or[0].$and.push({ createdAt: { $gt: checkIfAdmin.roleAssignmentDate } });
                    filterConditions.$or[1] = {
                        $and: [
                            { notifyAllAdmin: true },
                            { createdAt: { $gt: checkIfAdmin.roleAssignmentDate } }
                        ]
                    }
                }

                const pipeline = [{ $match: filterConditions }];

                return fetchResult(pipeline);

            } else if (context.platform === Role.LEARNER) {

                filterConditions.$and = [
                    { notifyAllAdmin:  {$ne :true} },
                    { isNotificatonForAdmin : {$ne :true}},
                    { notifiers: {$in : [userId]} },
                ];

                const pipeline = [{ $match: filterConditions }];
                const result = await fetchResult(pipeline);

                return result;
            }

            return {
                notifications: [],
                totalCount: 0,
            };
        } catch (error) {
            throw CustomError(ErrorName.FAILED, error.message);
        }
    },
    getNotificationsForApp: async ({ pageInput, filterInput }, context) => {
        const {
            role,
            userId,
            userPermissions,
            subscriberId,
            employeeId,
            isOrganizationManager,
            managingOrganization,
        } = AuthUser(context);
        try {

            const pageLimit = [];
            const skip = pageInput?.skip ?? 0;
            pageLimit.push(
                {
                    $skip: skip
                },
            );
            pageLimit.push(
                {
                    $limit: pageInput?.limit ?? 50
                }
            );

            const selectFirstThreeDays = [];


            /*  if (skip === 0) {
                 selectFirstThreeDays.push({
                     $match: {
                         $expr: {
                             $gte: [
                                 "$createdAt",
                                 new Date(new Date() - 3 * 24 * 60 * 60 * 1000)
                             ]
                         }
                     }
                 })
                 pageLimit.push(
                     {
                         $limit: pageInput?.limit ?? 10000
                     }
                 );
             } else {
                 pageLimit.push(
                     {
                         $limit: pageInput?.limit ?? 50
                     }
                 );
             } */

            let filterConditions = { /* subscriber: subscriberId, */ isDeleted: { $ne: true } };

            if (filterInput) {
                if (filterInput.notificationType) {
                    filterConditions.notificationType = filterInput.notificationType;
                }

                if (filterInput.search) {
                    filterConditions.$or = [
                        {
                            "title.value": {
                                $regex: ".*" + filterInput.search + ".*",
                                $options: "i",
                            },
                        },
                        {
                            "message.value": {
                                $regex: ".*" + filterInput.search + ".*",
                                $options: "i",
                            },
                        },
                    ];
                }

                if (filterInput.dateFrom || filterInput.dateTo) {
                    filterConditions.createdAt = {};
                    if (filterInput.dateFrom)
                        filterConditions.createdAt.$gte = Moment(filterInput.dateFrom)
                            .startOf("day")
                            .toDate();

                    if (filterInput.dateTo)
                        filterConditions.createdAt.$lte = Moment(filterInput.dateTo)
                            .endOf("day")
                            .toDate();
                }
            }

            const fetchResult = async pipeline => {
                let result = Notification.aggregatePaginate(
                    Notification.aggregate([
                        {
                            $match: {
                                $or: [
                                    { notifiers: { $in: [userId] } },
                                    { notifyAllAdmin: true },
                                ]
                            }
                        },
                        ...pipeline,
                        {
                            $addFields: {
                                isRead: {
                                    $in: [
                                        userId,
                                        {
                                            $ifNull: ["$usersMarkedAsRead", []]
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            $facet: {
                                notifications: [
                                    {
                                        $addFields: {
                                            isRead: {
                                                $in: [
                                                    userId,
                                                    {
                                                        $ifNull: ["$usersMarkedAsRead", []]
                                                    }
                                                ]
                                            }
                                        }
                                    },
                                    ...selectFirstThreeDays,
                                    {
                                        $sort: { createdAt: -1 }
                                    },
                                    ...pageLimit,
                                ],
                                counts: [
                                    ...selectFirstThreeDays,
                                    { $sort: { createdAt: -1 } },
                                    ...pageLimit,
                                    {
                                        $group: {
                                            _id: null,
                                            isReadTrueCount: {
                                                $sum: {
                                                    $cond: [{ $eq: ["$isRead", true] }, 1, 0]
                                                }
                                            },
                                            isReadFalseCount: {
                                                $sum: {
                                                    $cond: [{ $eq: ["$isRead", false] }, 1, 0]
                                                }
                                            }
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            $project: {
                                notifications: 1,
                                notificationReadInfo: { $arrayElemAt: ["$counts", 0] }
                            }
                        }
                    ]),
                    {
                        sort: { createdAt: "-1" },
                        customLabels: {
                            docs: "notifications",
                            totalDocs: "totalCount",
                            offset: "skip",
                        },
                        allowDiskUse: true,
                    }
                );
                return result;
            };


            const subRoleAdminId = await SubRole.findOne({ name: Role.ADMIN, primaryRole: Role.ADMIN }).select("_id");

            const checkIfAdmin = await User.findOne({
                _id: userId,
                subRoles: subRoleAdminId._id
            }).lean();

            if (context.platform === Role.ADMIN) {

                filterConditions.$and = [
                    { notifyAdmin: true },
                ];

                const pipeline = [{ $match: filterConditions }];
                let result = await fetchResult(pipeline);
                return result

            } else if (context.platform === Role.ADMIN && checkIfAdmin) {

                filterConditions.$and = [
                    { notifyAdmin: true },
                ];

                const pipeline = [{ $match: filterConditions }];

                return fetchResult(pipeline);

            } else if (context.platform === Role.LEARNER) {

                filterConditions.$and = [
                    { notifyAllAdmin:  {$ne :true} },
                    { isNotificatonForAdmin : {$ne :true}},
                    { notifiers: {$in : [userId]} },
                ];

                const pipeline = [{ $match: filterConditions }];
                const result = await fetchResult(pipeline);

                return result;
            }

            return {
                notifications: [],
                totalCount: 0,
            };
        } catch (error) {
            throw CustomError(GET_NOTIFICATION_FAILED, error.message);
        }
    },
};
module.exports.mutations = {
    markEachNotificationAsRead: async ({ notificationId }, context) => {

        if (!notificationId) throw new CustomError(ErrorName.BAD_REQUEST, "Notification ID is required");

        try {

            const { userId } = AuthUser(context);
            if (!userId) throw new CustomError(ErrorName.BAD_REQUEST, "User not found");

            const updatedNotification = await Notification.findByIdAndUpdate(
                notificationId,
                { $addToSet: { usersMarkedAsRead: userId } },
                { new: true }
            );

            if (!updatedNotification) throw new CustomError(ErrorName.BAD_REQUEST, "Notification not found");

            return {
                status: "01",
                message: "Notification marked as read successfully"
            };

        } catch (error) {
            throw Error(error.message);
        }

    },
    markAllNotificationsAsRead: async (args, context) => {
        const {
            userId,
            subscriberId,
            employeeId,
            isOrganizationManager,
            managingOrganization,
        } = AuthUser(context);

        try {
            const filter = {
                isDeleted: { $ne: true },
                usersMarkedAsRead: { $nin: [userId] },
            };

            if(context.platform === Role.ADMIN){
                filter.$or = [
                    {
                        $and: [
                            { isNotificatonForAdmin: true },
                            { notifiers: {$in : [userId]} },
                        ]   
                    },
                    { notifyAllAdmin: true },
                ];
            }

            if (context.platform === Role.LEARNER) {
                filter.$and = [
                    { notifyAllAdmin: { $ne: true } },
                    { isNotificatonForAdmin: { $ne: true } },
                    { notifiers: { $in: [userId] } },
                ];
            }

            const updatedNotifications = await Notification.updateMany(filter, {
                $addToSet: { usersMarkedAsRead: userId },
            });
            const count = updatedNotifications.nModified ?? 0;
            return {
                status: "SUCCESS",
                message: `${count} notifications marked as read successfully.`,
                totalCount: count,
            };
        } catch (error) {
            throw CustomError(ErrorName.NOTIFICATION_FAILED_TO_MARK_AS_READ, error.message);
        }
    },

};

module.exports.subscriptions = {
    onNotification: {
        subscribe: SubscriptionFilter(
            () => PubSubHelper.asyncIterator(NotificationEvent.ON_NOTIFICATION),
            (payload, args, context) => {
                const { isAuthenticated, role, userId, userPermissions, subscriberId, employeeId } =
                    AuthUser(context, false);

                const notification = payload.onNotification;
                console.log("notifiers: ",notification?.notifiers);
                const isTargetedNotifier = (notification?.notifiers || [])
                    .filter(x => x != null)
                    .map(x => x?.toString())
                    .includes(userId?.toString());


                const isAdminNotification =
                    notification.notifyAllAdmin === true ||
                    (notification.isNotificatonForAdmin === true && isTargetedNotifier);

                const isLearnerNotification =
                    isTargetedNotifier &&
                    !notification.isNotificatonForAdmin &&
                    !notification.notifyAllAdmin;

                if (role === Role.ADMIN && isAdminNotification) return true;
                if (isLearnerNotification) return true;

                return false;

                /* 
                //OLD CODE FOR REFERENCE
                if (isAuthenticated && userId && subscriberId) {
                    const notificationSubscriberId = ObjectId.isValid(notification.subscriber)
                        ? notification.subscriber
                        : notification.subscriber?._id;

                    if (notificationSubscriberId?.toString() === subscriberId.toString()) {
                        if (role === Role.ADMIN && notification.notifyAllAdmin === true) return true;
                        if (
                            notification.notifiers
                                ?.map(x => x.toString())
                                ?.includes(userId.toString()) ||
                            notification.employeeNotifiers
                                ?.map(x => x.toString())
                                ?.includes(employeeId.toString())
                        ) {
                            return true;
                        }
                    }
                } */
                

            }
        ),
    },
};




/**
 * 
 * 
 * AUTO ENROLLMENT NOTIFICATIONS -> BASIC TEST CASES 
 * --------------------------------------------------
 * 
 * created a course -> enrolled a learner -> notification should be triggered , send mail 
 * unenrolled the user from the course -> no notification should be triggered
 * re-enroll users to the same course -> notifications should be triggered , send mail
 * created a learning plan -> enrolled a learner -> notification should be triggered , send mail
 * manually unenrolled user is present for a course  -> not supposed to be enrolled automatically -> no notification should be triggered
 * updated a learner -> after updation the learner is part of a learning plan -> notification should be triggered , send mail
 * if the udpated learner is part of a learning plan with a course which he was unenrolled from - > the user shouldnt be enrolled , so no notification should be triggered
 * 
 */