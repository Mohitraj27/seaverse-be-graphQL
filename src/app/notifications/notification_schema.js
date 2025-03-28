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
            isRead: Boolean
            isUserRequest: Boolean
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
            isRead: Boolean
            selectUserRequests : Boolean
        }
        type dismissNotificationResponse {
            status: String
            message: String
        }
        type markAllNotificationsAsReadResponse {
            status: String
            message: String
            totalCount: Int
        }
        type GetNotificationsOutput {
            notifications: [NotificationWrapper]
            totalCount: Int
        }
        
        type NotificationWrapper {
            notifications: [Notification]  
            notificationReadInfo: NotificationReadInfo 
        }
        type NotificationReadInfo {
            isReadTrueCount: Int
            isReadFalseCount: Int
        }
    `,
    queries: `
        getNotifications(pageInput: PageInput, filterInput: NotificationFilterInput):GetNotificationsOutput
        getNotificationsForApp(pageInput: PageInput, filterInput: NotificationFilterInput):GetNotificationsOutput
    `,
    mutations: `
        markEachNotificationAsRead(notificationId: ID!): dismissNotificationResponse
        markAllNotificationsAsRead: markAllNotificationsAsReadResponse
    `,
    subscriptions: `
        onNotification: Notification
    `,
};
