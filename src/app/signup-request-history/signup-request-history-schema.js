const signupStatus = require("../signup-request/signup-status.json");
const sortingFieldData = require('../signup-request/sortingField.json');
module.exports = {
    types: `
        enum historysignupStatusEnum {
             ${Object.keys(signupStatus).join(" ")}
        }
        enum SortingFieldHistorySignupRequest {
            ${Object.keys(sortingFieldData).join(" ")}
        }
        input HistorySignupRequestPageInput {
            limit: Int
            skip: Int
            sortingField: SortingFieldHistorySignupRequest
            sortingOrder: Int
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