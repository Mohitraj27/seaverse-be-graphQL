const BatchStatus = require("./batch_status.json");

module.exports = {
    types: `
        enum BatchStatus {
            ${Object.keys(BatchStatus).join(" ")}
        }
        type BatchEmployeeInfo {
            trainingRegistration: TrainingRegistration
            employee: Employee
            employeeName: String
            employeeEmail: String
            employeeCivilIdOrPassport: String
            employeeRigNumber: String
            employeeDesignation: String
        }
        type BatchOtherInfo {
            status: String
            markedAt: String
        }
        type Batch {
            _id: ID
            UID: String
            organization: Organization
            organizationName: [LocalisedData]
            training: Training
            trainingTitle: [LocalisedData]
            trainingDuration: Int
            trainer: Employee
            trainerName: String
            employees: [BatchEmployeeInfo]
            startDate: String
            endDate: String
            trainingMode: String
            status: String
            purchaseInfo: BatchOtherInfo
            certificateInfo: BatchOtherInfo
            invoiceInfo: BatchOtherInfo
            paymentInfo: BatchOtherInfo
            createdAt: String
            updatedAt: String
        }
        type BatchList {
            batches: [Batch]
            totalCount: Int
        }
        input BatchOtherInfoInput {
            status: BatchStatus
        }
        input BatchInput {
            purchaseInfo: BatchOtherInfoInput
            certificateInfo: BatchOtherInfoInput
            invoiceInfo: BatchOtherInfoInput
            paymentInfo: BatchOtherInfoInput
        }
        input BatchFilterInput {
            search: String
            organization: ID
            training: ID
            trainer: ID
            employee: ID
            status: BatchStatus
            dateFrom: String
            dateTo: String
        }
    `,
    queries: `
        getBatches(pageInput: PageInput, filterInput: BatchFilterInput): BatchList!
    `,
    mutations: `
        updateBatch(id: ID!, input: BatchInput!): Batch!
        deleteBatch(id: ID!): Batch!   
    `,
};
