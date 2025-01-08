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
    try{
        const skip = pageInput?.skip ?? 0;
        const limit = pageInput?.limit ?? 50;
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
            return Notification.aggregatePaginate(Notification.aggregate(pipeline), {
                offset: skip,
                limit,
                sort: { createdAt: "descending" },
                customLabels: {
                    docs: "notifications",
                    totalDocs: "totalCount",
                    offset: "skip",
                },
                pagination: limit !== 0,
                allowDiskUse: true,
            });
        };


        const subRoleAdminId = await SubRole.findOne({ name: Role.ADMIN, primaryRole: Role.ADMIN }).select("_id");

        const checkIfAdmin = await User.findOne({
            _id: userId,
            subRoles: subRoleAdminId._id
        }).lean();
        
        if (context.platform === Role.ADMIN) {

            filterConditions.$and = [
                { notifyAdmin: true },
                { excludedUsers: { $ne: userId } },
            ];

            const pipeline = [{ $match: filterConditions }];

            return fetchResult(pipeline);

        } else if (context.platform === Role.ADMIN && checkIfAdmin) {

            filterConditions.$and = [
                { notifyAdmin: true },
                { excludedUsers: { $ne: userId } },
            ];

            const pipeline = [{ $match: filterConditions }];

            return fetchResult(pipeline);
            
        } else if (context.platform === Role.LEARNER) {

            filterConditions.$and = [
                { notifyAdmin: false },
                { notifiers: userId },
                { excludedUsers: { $ne: userId } }
            ];

            const pipeline = [{ $match: filterConditions }];
            const result = await fetchResult(pipeline);

            return result;
        }

        return {
            notifications: [],
            totalCount: 0,
        };
    } catch(error){
        throw CustomError(GET_NOTIFICATION_FAILED,error.message);
    }
},
};
module.exports.mutations = {
    dismissNotification: async ({ notificationId }, context) => {

        if (!notificationId) throw new CustomError(ErrorName.BAD_REQUEST, "Notification ID is required");

        try {

            const { userId } = AuthUser(context);
            if (!userId) throw new CustomError(ErrorName.BAD_REQUEST, "User not found");

            const notification = await Notification.findById(notificationId);

            if (!notification) throw new CustomError(ErrorName.BAD_REQUEST, "Notification not found");

            if (!notification.excludedUsers.includes(userId)) {
                notification.excludedUsers.push(userId);
            }

            const updatedNotification = await notification.save();

            if (updatedNotification) {
                return {
                    status: "01",
                    message: "Notification dismissed successfully"
                }
            } else {
                return {
                    status: "00",
                    message: "Notification dismiss failed"
                }
            }

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
                isRead: false,
                $or: [
                    { notifiers: userId },
                    { subscriber: subscriberId },
                    { employeeNotifiers: employeeId },
                ],
            };
    
            const count = await Notification.countDocuments(filter);
    
            if (count === 0) {
                return {
                    status: "SUCCESS",
                    message: "No notifications to mark as read.",
                    totalCount: count,
                };
            }
            await Notification.updateMany(filter, { $set: { isRead: true } });
    
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

                if (isAuthenticated && userId && subscriberId) {
                    const notificationSubscriberId = ObjectId.isValid(notification.subscriber)
                        ? notification.subscriber
                        : notification.subscriber?._id;

                    if (notificationSubscriberId?.toString() === subscriberId.toString()) {
                        if (role === Role.ADMIN && notification.notifyAdmin === true) return true;
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
                }

                return false;
            }
        ),
    },
};
