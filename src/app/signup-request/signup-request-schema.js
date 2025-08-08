const signupStatus = require("./signup-status.json");
const operationtype = require('./signup-request-operation.json');
const vesselstatus = require('../../util/vessel_status.json');
const sortingFieldJSONData = require('./sortingField.json');
module.exports = {
    types: `
        enum signupStatus {
             ${Object.keys(signupStatus).join(" ")}
        }
        enum OperationType {
            ${Object.keys(operationtype).join(" ")}
        }
        enum vesselStatus {
            ${Object.keys(vesselstatus).join(" ")}
        }
        enum sortingField {
            ${Object.keys(sortingFieldJSONData).join(" ")}
        }
        input SignupRequestPageInput {
            limit: Int
            skip: Int
            sortingField: sortingField
            sortingOrder: Int
        }
        input SignupRequestApprovalInput {
            userId: ID!
            operationType: OperationType!
            employeeId: String
            designation: ID
            vesselName: ID
            vesselStatus: vesselStatus
            isRegistered: Boolean
        }
        type SignupRequest {
            _id: ID
            firstName: String
            lastName: String
            email: String
            requestDate: String
            signupStatus: signupStatus
            userId: ID
            isDeleted: Boolean
            createdAt: String
            updatedAt: String
        }
        type SignupRequestList {
            items: [SignupRequest]
            pendingStatusCount: Int
        }          
        type SignupRequestdetails {
            userId: ID
            firstName: String
            lastName: String
            email: String
        }
        type SignupRequestApproval{
            status: Boolean!
            message: String!
        }
    `,
    queries: `
        getSignupRequest(id:ID, search: String,pageInput: SignupRequestPageInput): SignupRequestList!
        getUserSignupDetails(id:ID!): SignupRequestdetails!
    `,
    mutations: ` 
        processSignupRequestApproval(input: SignupRequestApprovalInput!): SignupRequestApproval!
      `
};