const { CustomError, ErrorName } = require("../../util");

const { Organization } = require("./organization_model");

const NotificationHelper = require("../notifications/notification_helper");
const CounterHelper = require("../counters/counter_helper");

const NotificationType = require("../notifications/notification_type.json");

const generateOrganizationUID = async ({ subscriberId, session }) => {
    const savedCounter = await CounterHelper.updateCounter({
        subscriberId,
        modelName: Organization.modelName,
        session,
    });

    if (!savedCounter) throw CustomError(ErrorName.FAILED);
    return `ORG-${savedCounter.count}`;
};

module.exports = {
    generateOrganizationUID,
    sendNotificationOnCRUD: async notificationData => {
        try {
            const organizationName = notificationData.organization.name?.find(
                x => x.lang === "en" || x.lang === "ar"
            )?.value;

            const notification = {
                subscriber: notificationData.subscriber,
                title: [{ lang: "en", value: `Organization ${notificationData.action}` }],
                notifyAllAdmin: true,
                notifiers: [],
                employeeNotifiers: [],
                affected: [
                    {
                        targetRef: "Organization",
                        target: notificationData.organization._id,
                    },
                ],
                additionalInfo: [
                    {
                        infoType: "UPDATER_INFO",
                        infoData: {
                            _id: notificationData.createdBy._id,
                            firstName: notificationData.createdBy.firstName,
                            lastName: notificationData.createdBy.lastName,
                        },
                    },
                    {
                        infoType: "ORGANIZATION_INFO",
                        infoData: {
                            _id: notificationData.organization._id,
                            name: notificationData.organization.name,
                        },
                    },
                ],
                createdBy: notificationData.createdBy,
            };

            notification.notificationType =
                NotificationType["ORGANIZATION_" + notificationData.action];

            notification.message = [
                {
                    lang: "en",
                    value: `Admin User "${notificationData.createdBy.firstName}" ${notificationData.action} "${organizationName}" organization`,
                },
            ];

            // await NotificationHelper.createNotification(notification);
        } catch (e) {
            throw Error(e?.message);
        }
    },
};
