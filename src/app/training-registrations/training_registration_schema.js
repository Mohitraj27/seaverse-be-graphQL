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
            training: ID
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
            users: [ID]
        }
        type OverallTrainingProgress {
            _id: ID
            subscriber: Subscriber
            learningPlan: LearningPlan
            training: Training
            user: User
            trainingRegistration: ID
            trainingModuleContentIds: [ID]
            trainingModuleIds: [ID]
            mandatoryModules: Int
            completedModules: Int
            isComplete: Boolean
            status: Status
            retryCount: Int
            progressPercentage: String
            isEnrolled: Boolean
            moduleCount: Int
            totalDuration: Int
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
        enum groupTypeEnums {
            designation
            role
            subRole
            regStatus
            vessel
            vesselType
            vesselStatus
            custom
        }
        input GroupInputForEnroll {
            groupType: groupTypeEnums!
            groupId: String!
        }
        enum enrollType {
            ENROLL
            UNENROLL
        }
        input TrainingRegistrationInput {
            type: enrollType!
            training: ID
            trainings: [ID]
            learningPlan: ID
            trainingDuration: Int
            certificateValidity: Int
            trainer: ID
            startDate: String
            endDate: String
            groups: [GroupInputForEnroll]
            users: [String]
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
        type trainingEnrollmentRes {
            message: String!
        }
        input verifyRegistrationEmailsInput {
            training: ID
            users: [String]!
            type: enrollType!
        }
        type verifyRegistrationEmailsRes {
            unregEmails: [String]
            invalidEmails: [String]
            alreadyEnrolledEmails: [String]
            notEnrolledEmails: [String]
            remainingEmails: [String]
            status: Boolean
        }
        enum Status {
            NOT_STARTED
            IN_PROGRESS
            COMPLETED
        }
        type userDetails {
            firstName: String!
            lastName: String
            status: Status!
        }
        type getTrainingRegsRes {
            learningPlanName: String
            users: [userDetails]
        }
        input getTrainingRegsInput {
            training: ID!
            isEnrolled: Boolean!
        }
        input myCourseFilterInput {
            search: String
            status: Status
        }
        type myCoursesRes {
            status: Boolean
            message: String
            courses: [OverallTrainingProgress]
        }
        type reportData {
            _id : ID
            name : String
            isRegistered : Boolean
            EmployeeId : String
            designation : String
            vesselName : String
            lastSeen : String
            coursesCount : Int 
            averageProgressPercentage : Int
            isDeleted : Boolean
        }
        type learnerReportResponse {
            filePath : String
            fileName : String
            employeesData : [reportData]
        }
        input learnerReportInput {
            pageInput: PageInput
            export : Boolean
            filterInput : learnerReportFilter
        }
        input learnerReportFilter {
            isRegistered : Boolean
            isDeleted : Boolean
            vesselName : String
            name : String
        }
    `,
    queries: `
        getTrainingRegistrations(input: getTrainingRegsInput!): [getTrainingRegsRes!]!
        getTrainingRegistration(id: ID): TrainingRegistration!
        getAssignedTrainings(pageInput: PageInput, filterInput: AssignedTrainingRegistrationFilterInput): TrainingRegistrationList!
        myCourses(filterInput: myCourseFilterInput): myCoursesRes!
        getTrainingRegistrationReports(input :learnerReportInput ):learnerReportResponse
    `,
    mutations: `
        """used for assign course to employee"""
        createTrainingRegistration(input: TrainingRegistrationInput!): trainingEnrollmentRes!
        verifyRegistrationEmails(input: verifyRegistrationEmailsInput!): verifyRegistrationEmailsRes!
        updateTrainingRegistration(id: ID!, input: TrainingRegistrationUpdateInput!): TrainingRegistration!
        deleteTrainingRegistration(id: ID!): TrainingRegistration!
        updateTrainingRegistrationFeedback(id: ID!, input: FeedbackAttemptInput!): TrainingRegistration!
    `,
};
