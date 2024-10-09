const NotificationHelper = require("../../notifications/notification_helper");

const NotificationType = require("../../notifications/notification_type.json");

module.exports = {
    sendNotificationOnCRUD: async notificationData => {
        try {
            const trainingCategoryName = notificationData.trainingCategory.name?.find(
                x => x.lang === "en" || x.lang === "ar"
            )?.value;

            const notification = {
                subscriber: notificationData.subscriber,
                title: [{ lang: "en", value: `Training category ${notificationData.action}` }],
                message: [
                    {
                        lang: "en",
                        value: `Admin User "${notificationData.createdBy.firstName}" ${notificationData.action} "${trainingCategoryName}" training category`,
                    },
                ],
                notificationType: NotificationType["TRAINING_CATEGORY_" + notificationData.action],
                notifyAdmin: true,
                notifiers: [],
                employeeNotifiers: [],
                affected: [
                    {
                        targetRef: "TrainingCategory",
                        target: notificationData.trainingCategory._id,
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
                        infoType: "TRAINING_CATEGORY_INFO",
                        infoData: {
                            _id: notificationData.trainingCategory._id,
                            name: notificationData.trainingCategory.name,
                        },
                    },
                ],
                createdBy: notificationData.createdBy,
            };

            await NotificationHelper.createNotification(notification);
        } catch (e) {
            console.log("training_category_helper.sendNotificationOnCRUD:exception:", e?.message);
        }
    },
};
