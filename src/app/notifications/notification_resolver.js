const { ObjectId, SubscriptionFilter, PubSubHelper, Moment } = require("../../tools");
const { Role, AuthUser, CustomError, ErrorName } = require("../../util");

const { Notification } = require("./notification_model");

const SubRoleHelper = require("../user/sub-roles/sub_role_helper");

const NotificationEvent = require("./notification_event.json");
const Permission = require("../user/sub-roles/permission.json");

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

        const skip = pageInput?.skip ?? 0;
        const limit = pageInput?.limit ?? 50;
        let filterConditions = { subscriber: subscriberId, isDeleted: { $ne: true } };

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

        if (/* context.platform === Role.ADMIN &&  */role === Role.ADMIN) {
            filterConditions.notifyAdmin = true;

            const pipeline = [{ $match: filterConditions }];

            return fetchResult(pipeline);
        } else if (/* context.platform === Role.ADMIN &&  */role === Role.EMPLOYEE) {
            filterConditions.$or = [
                { notifiers: { $elemMatch: { $eq: userId } } },
                { employeeNotifiers: { $elemMatch: { $eq: employeeId } } },
            ];

            if (
                SubRoleHelper.hasPermission({
                    currentRole: role,
                    currentPermissions: userPermissions,
                    requiredPermission: Permission.GET_NOTIFICATIONS,
                })
            ) {
                filterConditions.$or.push({ notifyAdmin: true });
            }

            if (isOrganizationManager) {
                filterConditions.organization = managingOrganization;
            }

            const pipeline = [{ $match: filterConditions }];

            return fetchResult(pipeline);
        } else if (/* context.platform === Role.EMPLOYEE && */ role === Role.EMPLOYEE) {
            filterConditions.$or = [
                { notifiers: { $elemMatch: { $eq: userId } } },
                { employeeNotifiers: { $elemMatch: { $eq: employeeId } } },
            ];

            const pipeline = [{ $match: filterConditions }];

            return fetchResult(pipeline);
        }

        return {
            notifications: [],
            totalCount: 0,
        };
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
