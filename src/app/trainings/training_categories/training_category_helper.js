const NotificationHelper = require("../../notifications/notification_helper");

const NotificationType = require("../../notifications/notification_type.json");
const {decrypt } = require('../../../util/encryption_helper');
module.exports = {
    sendNotificationOnCRUD: async notificationData => {
        try {
            const trainingCategoryName = notificationData.trainingCategory.name?.find(
                x => x.lang === "en" || x.lang === "ar"
            )?.value;

            const notification = {
                subscriber: notificationData.subscriber,
                title: [{ lang: "en", value: `Course category ${notificationData.action}` }],
                message: [
                    {
                        lang: "en",
                        value: `Admin User "${decrypt(notificationData.createdBy.firstName)}" ${notificationData.action} "${trainingCategoryName}" training category`,
                    },
                ],
                notificationType: NotificationType["TRAINING_CATEGORY_" + notificationData.action],
                notifyAllAdmin: true,
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
                            firstName: decrypt(notificationData.createdBy.firstName) ,
                            lastName: decrypt(notificationData.createdBy.lastName),
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
            throw Error(e.message);
        }
    },
};
