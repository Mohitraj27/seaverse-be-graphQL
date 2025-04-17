const { CustomError, ErrorName } = require("../../util");

const { Batch } = require("./batch_model");

const CounterHelper = require("../counters/counter_helper");
const NotificationType = require("../notifications/notification_type.json");
const NotificationHelper = require("../notifications/notification_helper");

const generateBatchUID = async ({ subscriberId, session }) => {
    const savedCounter = await CounterHelper.updateCounter({
        subscriberId,
        modelName: Batch.modelName,
        session,
    });

    if (!savedCounter) throw CustomError(ErrorName.FAILED);
    return `BATCH-${savedCounter.count}`;
};

module.exports.BatchHelper = {
    generateBatchUID,
    sendNotificationOnCRUD: async notificationData => {
        try {
            const batchNumber = notificationData.batch.UID;

            const notification = {
                subscriber: notificationData.subscriber,
                title: [{ lang: "en", value: `Batch ${notificationData.action}` }],
                // notifyAdmin: true,
                notifiers: [],
                employeeNotifiers: [],
                affected: [
                    {
                        targetRef: "Batch",
                        target: notificationData.batch._id,
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
                        infoType: "BATCH_INFO",
                        infoData: {
                            _id: notificationData.batch._id,
                            UID: notificationData.batch.UID,
                        },
                    },
                ],
                createdBy: notificationData.createdBy,
            };

            notification.notificationType = NotificationType["BATCH_" + notificationData.action];

            notification.message = [
                {
                    lang: "en",
                    value: `Admin User "${notificationData.createdBy.firstName}" ${notificationData.action} "${batchNumber}" batch`,
                },
            ];

            await NotificationHelper.createNotification(notification);
        } catch (e) {
            throw Error(e.message);
        }
    },
};
