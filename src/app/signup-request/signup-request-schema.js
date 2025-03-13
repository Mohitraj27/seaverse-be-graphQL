const signupStatus = require("./signup-status.json");
module.exports = {
    types: `
        enum signupStatus {
             ${Object.keys(signupStatus).join(" ")}
        }
        input SignupRequestPageInput {
            limit: Int
            skip: Int
        }
        type SignupRequest {
            _id: ID
            firstName: String
            lastName: String
            email: String
            requestDate: String
            signupStatus: signupStatus
            userId: ID
            country: String
            isDeleted: Boolean
            createdAt: String
            updatedAt: String
        }
        type SignupRequestList {
            items: [SignupRequest]
            pendingStatusCount: Int
        }          
    `,
    queries: `
        getSignupRequest(id:ID, search: String,pageInput: SignupRequestPageInput): SignupRequestList!
    `,
    mutations: `
      `
};