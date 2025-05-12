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
        input HistorySignupRequestFilter {
            signupStatus: historysignupStatusEnum
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
            isRegistered: Boolean
        }
        type HistorySignupRequestList {
            items: [HistorySignupRequest]
            totalCount: Int
        }
        type deleteRejectedUserRequestOutput {
            success: Boolean
            message: String
        }
    `,
    queries: `
        getHistorySignupRequest(id:ID, search: String,filterInput : HistorySignupRequestFilter,pageInput: HistorySignupRequestPageInput): HistorySignupRequestList!
    `,
    mutations: ` 
        deleteRejectedUserRequests: deleteRejectedUserRequestOutput
      `
};