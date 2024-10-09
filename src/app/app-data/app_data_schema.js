module.exports = {
    types: `
        type DateTimeInfo {
            dateTime: String
            utcDateTime: String
            kwtDateTime: String
            date: String
            utcDate: String
            kwtDate: String
            time: String
            utcTime: String
            kwtTime: String
            hours: String
            utcHours: String
            kwtHours: String
        }
        type AppData {
            appInfo: String
            appSettings: AppSettings
            currentDateTime: DateTimeInfo
            user: User
            subscriptionInfo: SubscriptionInfo
        }
    `,
    queries: `
        getAppData: AppData!
    `,
};
