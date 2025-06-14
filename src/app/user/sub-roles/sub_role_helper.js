const { Role } = require("../../../util");

const NotificationHelper = require("../../notifications/notification_helper");

const NotificationType = require("../../notifications/notification_type.json");
const { decrypt} = require('../../../util/encryption_helper');
module.exports = {
    /**
     * Check whether user has permissions to do the operation
     * @param {String} currentRole - current user role
     * @param {Array<String>} currentPermissions - current user permissions
     * @param {String|Array<String>} requiredPermission - required permission(s) to do the operation
     * @param {boolean} requiredAll - whether all permissions required in the requiredPermission array - default: true
     * @param {boolean} restrictOrganizationManager - whether restrictOrganizationManager - default: false
     * @return {boolean} return true or false
     */
    hasPermission: ({
        currentRole,
        currentPermissions,
        primaryRole,
        requiredPermission,
        requiredAll = true,
        restrictOrganizationManager = false,
    }) => {
        if (currentRole === Role.ADMIN) {
            return true;
        } else if(primaryRole[0] === Role.ADMIN){
            return true;
        }
        else if (restrictOrganizationManager) {
            return false;
        } else if (currentRole === Role.EMPLOYEE && currentPermissions instanceof Array) {
            if (typeof requiredPermission === "string") {
                return currentPermissions.includes(requiredPermission);
            } else if (requiredPermission instanceof Array) {
                if (requiredAll) {
                    return requiredPermission.every(x => currentPermissions.includes(x));
                } else {
                    return requiredPermission.some(x => currentPermissions.includes(x));
                }
            }
        }

        return false;
    },
    sendNotificationOnCRUD: async notificationData => {
        try {
            const subRoleName = notificationData.subRole.name;

            const notification = {
                subscriber: notificationData.subscriber,
                title: [{ lang: "en", value: `Role ${notificationData.action}` }],
                notifyAllAdmin: true,
                isNotificatonForAdmin: true,
                notifiers: [],
                employeeNotifiers: [],
                affected: [
                    {
                        targetRef: "SubRole",
                        target: notificationData.subRole._id,
                    },
                ],
                additionalInfo: [
                    {
                        infoType: "UPDATER_INFO",
                        infoData: {
                            _id: notificationData.createdBy._id,
                            firstName: decrypt(notificationData.createdBy.firstName),
                            lastName: decrypt(notificationData.createdBy.lastName),
                        },
                    },
                    {
                        infoType: "SUB_ROLE_INFO",
                        infoData: {
                            _id: notificationData.subRole._id,
                            name: notificationData.subRole.name,
                        },
                    },
                ],
                createdBy: notificationData.createdBy,
            };

            notification.notificationType = NotificationType["SUB_ROLE_" + notificationData.action];

            notification.message = [
                {
                    lang: "en",
                    value: `Admin User "${decrypt(notificationData.createdBy.firstName)}" ${notificationData.action} "${subRoleName}" role`,
                },
            ];

            // await NotificationHelper.createNotification(notification);
        } catch (e) {
            throw Error(e.message);
        }
    },
};
