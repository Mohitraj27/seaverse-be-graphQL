module.exports = {
    types: `
        type Attendance {
            date: String
            status: String
        }
        type TrainingAttendance {
            _id: ID
            trainingRegistration: TrainingRegistration
            attendances: [Attendance]
        }
        type  TrainingRegistrationAttendance {
            _id: ID
            batch: Batch
            batchNumber: String
            training: Training
            organization: Organization
            employee: Employee
            trainer: Employee
            startDate: String
            endDate: String
            status: String
            remarks: String
        }
        type TrainingRegistrationAttendanceList {
            trainingRegistrationAttendance: [TrainingRegistrationAttendance]
            totalCount: Int
        }
        input AttendanceInput {
            """input should be in utc date format 'yyyy-MM-DD'"""
            date: String!
            """PRESENT"""
            status: String!
        }
        input TrainingAttendanceInput {
            trainingRegistrationId: ID!
            attendances: [AttendanceInput!]!
        }
        input TrainingRegistrationAttendanceFilterInput {
            batch: ID
            training: ID
            organization: ID
            startDate: String
            trainer: ID
        }
    `,
    queries: `
        getTrainingRegistrationAttendances(pageInput: PageInput, filterInput: TrainingRegistrationAttendanceFilterInput): TrainingRegistrationAttendanceList!
    `,
    mutations: `
        createOrUpdateTrainingAttendance(input: TrainingAttendanceInput!): TrainingAttendance!
    `,
};
