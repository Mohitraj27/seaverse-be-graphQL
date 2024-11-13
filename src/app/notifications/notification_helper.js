const { PubSubHelper } = require("../../tools");

const { Notification } = require("./notification_model");

const NotificationEvent = require("./notification_event.json");

module.exports = {
    createNotification: async input => {
        try {
            
            const notifications = await Notification.insertMany(
                input instanceof Array ? input : [input],
                { lean: true }
            );

            if (notifications) {
                for (const notification of notifications) {
                    await PubSubHelper.publish(NotificationEvent.ON_NOTIFICATION, {
                        onNotification: notification,
                    });
                }
            }
        } catch (e) {
            console.log("notification_helper.createNotification:exception:", e.message);
        }
    },
};
