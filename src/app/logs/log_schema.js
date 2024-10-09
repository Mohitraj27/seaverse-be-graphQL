const LogType = require("./log_type.json");

module.exports = {
    types: `
        enum LogType {
	        ${Object.keys(LogType).join(" ")}
	    }
        type LogAffected {
            targetRef: String
            target: JSON
            notes: String
            miscellaneous: [String]
        }
        type LogAdditionalInfo {
            infoType: String
            infoData: JSON
        }
        type Log {
            _id: ID
            subscriber: Subscriber
            title: [LocalisedData]
            message: [LocalisedData]
            logType: String
            affected: [LogAffected]
            additionalInfo: [LogAdditionalInfo]
            createdBy: User
            createdAt: String
            updatedAt: String
        }
        type LogList {
            logs: [Log]
            totalCount: Int
        }
    `,
    queries: `
        getLogs(pageInput: PageInput): LogList!
    `,
};
