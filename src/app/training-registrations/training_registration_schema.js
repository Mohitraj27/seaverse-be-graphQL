const { TrainingMode } = require("./training_mode.js");

const TrainingRegistrationStatus = require("./training_registration_status.json");

module.exports = {
    types: `
        enum TrainingMode {
            ${Object.keys(TrainingMode).join(" ")}
        }
        enum TrainingRegistrationStatus {
            ${Object.keys(TrainingRegistrationStatus).join(" ")}
        }
        type TrainingRegistrationSortedTrainingModule {
            trainingModule: TrainingModule
            title: [LocalisedData]
            description: [LocalisedData]
            trainingModuleContents: [TrainingModuleContent]
        }
        type TrainingRegistration {
            _id: ID
            training: Training
            batch: Batch
            batchNumber: String
            trainingDuration: Int
            certificateValidity: Int
            sortedTrainingModules: [TrainingRegistrationSortedTrainingModule]
            organization: Organization
            branch: Branch
            employee: Employee
            trainer: Employee
            supervisor: Employee
            """
            Refer TrainingRegistrationStatus
            """
            status: String
            trainingProgressPercentage: Float
            startDate: String
            endDate: String
            invoice: TrainingRegistrationInvoice
            startedAt: String
            completedAt: String
            
            feedback: FeedbackAttempt
            
            trainingMode: String
            isRegistered: Boolean
            isActive: Boolean
            trainingProgresses: [TrainingProgress]
            trainingAttendance: TrainingAttendance
            trainingCertificate: TrainingCertificate
            scorm:Scorm
        }
        type TrainingRegistrationList {
            trainingRegistrations: [TrainingRegistration]
            totalCount: Int
        }

        input TrainingRegistrationSortedTrainingModuleInput {
            trainingModule: ID
            title: [LocalisedDataInput]
            description: [LocalisedDataInput]
            trainingModuleContents: [ID]
        }
        input EmployeeAndTrainerInput {
            employee: ID!
            trainer: ID
        }
        input TrainingRegistrationInput {
            employee: ID
            branch: ID
            organization: ID
            training: ID
            trainingDuration: Int
            certificateValidity: Int
            trainer: ID
            startDate: String
            endDate: String
            unitPrice: Float
            customPrice: Float
            remarks: String
            trainingMode: TrainingMode
        }
        input TrainingRegistrationUpdateInput {
            training: ID
            trainingDuration: Int
            certificateValidity: Int
            organization: ID
            branch: ID
            employeeAndTrainer: EmployeeAndTrainerInput
            supervisor: ID
            status: TrainingRegistrationStatus
            startDate: String
            endDate: String
            isActive: Boolean
            isRegistered: Boolean
        }
        input TrainingRegistrationFilterInput {
            search: String
            batch: ID
            trainer: ID
            employee: ID
            trainingCategory: ID
            training: ID
            organization: ID
            dateFrom: String
            dateTo: String
            status: TrainingRegistrationStatus
            invoiceStatus: TrainingRegistrationInvoiceStatus
        }
        input AssignedTrainingRegistrationFilterInput {
            organization: ID
        }
    `,
    queries: `
        getTrainingRegistrations(pageInput: PageInput, filterInput: TrainingRegistrationFilterInput): TrainingRegistrationList!
        getTrainingRegistration(id: ID): TrainingRegistration!
        getAssignedTrainings(pageInput: PageInput, filterInput: AssignedTrainingRegistrationFilterInput): TrainingRegistrationList!
    `,
    mutations: `
        """used for assign course to employee"""
        createTrainingRegistration(input: TrainingRegistrationInput!, invoiceInput: TrainingRegistrationInvoiceInput): TrainingRegistration
        updateTrainingRegistration(id: ID!, input: TrainingRegistrationUpdateInput!): TrainingRegistration!
        deleteTrainingRegistration(id: ID!): TrainingRegistration!
        updateTrainingRegistrationFeedback(id: ID!, input: FeedbackAttemptInput!): TrainingRegistration!
    `,
};
