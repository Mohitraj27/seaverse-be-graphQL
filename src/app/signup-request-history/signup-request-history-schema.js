const signupStatus = require("../signup-request/signup-status.json");
module.exports = {
    types: `
        enum historysignupStatusEnum {
             ${Object.keys(signupStatus).join(" ")}
        }
        
        input HistorySignupRequestPageInput {
            limit: Int
            skip: Int
        }
        type HistorySignupRequest {
            _id: ID
            firstName: String
            lastName: String
            email: String
            employeeId: String
            requestDate: String
            signupStatus: historysignupStatusEnum
            userId: ID
            country: String
            isDeleted: Boolean
            createdAt: String
            updatedAt: String
            decisionDate: String
        }
        type HistorySignupRequestList {
            items: [HistorySignupRequest]
        }
    `,
    queries: `
        getHistorySignupRequest(id:ID, search: String,pageInput: HistorySignupRequestPageInput): HistorySignupRequestList!
        
    `,
    mutations: ` 
      `
};