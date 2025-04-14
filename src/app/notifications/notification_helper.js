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
            throw Error(e.message);
        }
    },
    createNotificationhelper :async function({
        subscriber,
        titleValue,
        messageValue,
        notificationType,
        notifyAllAdmin = false,
        notifiers = [],
        additionalInfo =[],
        employeeNotifiers = [],
        affected = [],
        icon = NotificationIcon.STABLE,
        createdBy = null,
        status = "SENT",
        isRead = false
    })  {
        const notifications = [];
    
        notifications.push({
            subscriber,
            title: [{ lang: "en", value: titleValue }], 
            message: [{ lang: "en", value: messageValue }], 
            notificationType,
            notifyAllAdmin,
            notifiers,
            additionalInfo,
            employeeNotifiers,
            affected,
            icon,
            createdBy,
            status,
            isRead,
        });
        
        if (notifications.length > 0) {
            try {
                 this.createNotification(notifications);
            } catch (error) {
                throw Error(error.message);
            }
        }
    }, 
};
