const NotificationType = require("./notification_type.json");

module.exports = {
    types: `
        enum NotificationType {
	        ${Object.keys(NotificationType).join(" ")}
	    }
        type NotificationAffected {
            targetRef: String
            target: JSON
            notes: String
            miscellaneous: [String]
        }
        type NotificationAdditionalInfo {
            infoType: String
            infoData: JSON
        }
        type Notification {
            _id: ID
            subscriber: Subscriber
            title: [LocalisedData]
            message: [LocalisedData]
            notificationType: String
            notifyAdmin: Boolean
            notifiers: [User]
            employeeNotifiers: [Employee]
            affected: [NotificationAffected]
            additionalInfo: [NotificationAdditionalInfo]
            status: String
            createdBy: User
            createdAt: String
            updatedAt: String
            icon: String
        }
        type NotificationList {
            notifications: [Notification]
            totalCount: Int
        }
        input NotificationFilterInput {
            notificationType: String
            search: String
            dateFrom: String
            dateTo: String
        }
    `,
    queries: `
        getNotifications(pageInput: PageInput, filterInput: NotificationFilterInput): NotificationList
    `,
    subscriptions: `
        onNotification: Notification
    `,
};
