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

        type learnerMainReportData {
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
        type learnerMainReportResponse {
            filePath : String
            fileName : String
            employeesData : [learnerMainReportData]
        }
        input learnerMainReportInput {
            pageInput: PageInput
            export : Boolean
            filterInput : learnerMainReportFilter
        }
        input learnerMainReportFilter {
            isRegistered : Boolean
            isDeleted : Boolean
            vesselName : String
            name : String
        } 
        input singleLearnerReportInput {
            learnerId : ID
            pageInput: PageInput
            filter : singleLearnerReportFilter
            export : Boolean
        }
        input singleLearnerReportFilter{
            courseStatus:String
            dateRange : filterDateRange
        }
        input filterDateRange {
            startDate: String
            endDate : String
        }
        type singleLearnersReport {
            courseName : [String]
            duration : [Int]
            createdAt : String
            completionDate : String
            status : String
            updatedAt : String
            quizPercentage : Int
            totalTimeSpent : Int
            isPassed : Boolean
        }
        type singleLearnersReportOutput {
            filePath : String
            fileName : String
            learnerData : [singleLearnersReport]
        }
        input MainCoursesReportInput {
            filterInput: CourseFilterInput   
            pageInput: PageInput       
            export: Boolean                  
        }
        input CourseFilterInput {
            name: String            
            isDeleted: Boolean      
            status: String          
        }
        type CourseReportData {
            _id: ID
            title :  [LocalisedData]                       
            updatedAt: String                
            updatedBy: String                
            totalUsers: Int                  
            NOT_STARTED: Int                 
            IN_PROGRESS: Int                
            COMPLETED: Int                  
        }
        type mainCourseReportOutput {
            filePath : String
            fileName : String
            coursesData : [CourseReportData]
        }
    `,
    queries: `
        getRevenueReports(pageInput: PageInput, filterInput: RevenueReportFilterInput): RevenueReportsList!
        getQuizReports(pageInput: PageInput, filterInput: QuizReportFilterInput): QuizReportsList!
        getFeedbackReports(pageInput: PageInput, filterInput: FeedbackReportFilterInput): FeedbackReportsList!
        getTrainingMatrixReports(pageInput: PageInput, filterInput: TrainingMatrixReportFilterInput): TrainingMatrixReportsList!
        getMainLearnersReport(input :learnerMainReportInput ):learnerMainReportResponse
        getSingleLearnerReport(input: singleLearnerReportInput):singleLearnersReportOutput
        getMainCoursesReport(input: MainCoursesReportInput): mainCourseReportOutput
    `,
};
