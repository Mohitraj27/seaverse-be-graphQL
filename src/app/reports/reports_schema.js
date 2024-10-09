module.exports = {
    types: `
        type TrainingProgressQuizReport {
            _id: ID
            trainingModuleContent: TrainingModuleContent
            quizAttempts: QuizAttemptAttempt
            totalAttempts: Int
        }
        type RevenueReport {
            trainingRegistrationInvoice: TrainingRegistrationInvoice
            totalRegistrations: Int
            organization:Organization
            training: Training
        }
        type QuizReport {
            employee: Employee
            trainingProgresses: TrainingProgressQuizReport

        }
        type FeedbackReport {
            employee: Employee
            trainer: Employee
            feedback: FeedbackAttempt
            startDate: String
        }
        type TrainingMatrixReport {
            employee: Employee
            trainingRegistrations: [TrainingRegistration]
        }
        type RevenueReportsList {
            revenueReports: [RevenueReport]
            totalCount: Int
        }
        type QuizReportsList {
            quizReports: [QuizReport]
            totalCount: Int
        }
        type FeedbackReportsList {
            feedbackReports: [FeedbackReport]
            training: Training
            totalCount: Int
        }
        type TrainingMatrixReportsList {
            trainingMatrixReports: [TrainingMatrixReport]
            totalCount: Int
        }
        input RevenueReportFilterInput {
            search: String
            training: ID
            organization: ID
            employee: ID
            dateFrom: String
            dateTo: String
        }
        input QuizReportFilterInput {
            search: String
            training: ID
            organization: ID
            employee: ID
            trainingCategory: ID
        }
        input FeedbackReportFilterInput {
            search: String
            training: ID
            organization: ID
            trainingCategory: ID
            dateFrom: String
            dateTo: String
        }
        input TrainingMatrixReportFilterInput {
            organization: ID
            search: String
        }
    `,
    queries: `
        getRevenueReports(pageInput: PageInput, filterInput: RevenueReportFilterInput): RevenueReportsList!
        getQuizReports(pageInput: PageInput, filterInput: QuizReportFilterInput): QuizReportsList!
        getFeedbackReports(pageInput: PageInput, filterInput: FeedbackReportFilterInput): FeedbackReportsList!
        getTrainingMatrixReports(pageInput: PageInput, filterInput: TrainingMatrixReportFilterInput): TrainingMatrixReportsList!
    `,
};
