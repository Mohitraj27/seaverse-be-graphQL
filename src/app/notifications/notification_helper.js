const { PubSubHelper } = require("../../tools");

const { Notification } = require("./notification_model");

const NotificationEvent = require("./notification_event.json");
const NotificationIcon = require("./notification_icon.json");
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
    createNotificationhelper :async function({
        subscriber,
        titleValue,
        messageValue,
        notificationType,
        notifyAdmin = false,
        notifiers = [],
        employeeNotifiers = [],
        affected = [],
        icon = NotificationIcon.STABLE,
        createdBy = null,
        status = "SENT",
    })  {
        const notifications = [];
    
        notifications.push({
            subscriber,
            title: [{ lang: "en", value: titleValue }], 
            message: [{ lang: "en", value: messageValue }], 
            notificationType,
            notifyAdmin,
            notifiers,
            employeeNotifiers,
            affected,
            icon,
            createdBy,
            status,
        });
        
        if (notifications.length > 0) {
            try {
                console.log(notifications);
                 this.createNotification(notifications);
            } catch (error) {
                console.error("Failed to create notifications:", error);
            }
        }
    }, 
};
