module.exports = {
    types: `

        enum reportTypeEnum {
            ENROLLMENT
            QUIZ
            MODULE
        } 
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
            learnerId : ID
            isRegistered : Boolean
            EmployeeId : String
            email : String
            designation : String
            designationId : ID
            vesselName : String
            vesselId :ID
            vesselTypeName : String
            vesselTypeId : ID
            lastSeen : String
            coursesCount : Int 
            averageProgressPercentage : Float
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
            search : String
            vesselTypes : [ID]
            vesselIds : [ID]
            designations : [ID]
        } 
        input singleLearnerReportInput {
            learnerIds : [ID]!
            reportType : reportTypeEnum!
            pageInput: PageInput
            filter : singleLearnerReportFilter
            export : Boolean
        }
        input singleLearnerReportFilter{
            courseStatuses:[String]
            dateRange : filterDateRange
            title :String
        }
        input filterDateRange {
            startDate: String
            endDate : String
        }
        type singleLearnersReport {
            courseName : [String]
            firstName : String
            lastName : String
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
        input singleCourseReportInput {
            courseId : ID!
            reportType : String
            pageInput: PageInput
            filter : singleCourseReportFilter
            export : Boolean
        }
        input singleCourseReportFilter {
            search :String
            vesselName : [ID]
            vesselType : [ID]
            designation : [ID]
            courseStatus:[String]
            dateRange : filterDateRange
        }
        type singleCourseReportOutput {
            filePath : String
            fileName : String
            coursesData : [singleCourseEnrollmentReport]
        }
        type mainVesselReportOutput {
            filePath : String
            fileName : String
            vesselData : [mainVesselReportData]
        }
        type singleCourseEnrollmentReport {
            _id :ID
            learnerName : String
            trainingTitle : [LocalisedData] 
            email : String
            employeeId : String
            designation : String
            status : String
            currentVessel : String
            vesselType : String
            createdAt : String
            updatedAt : String
            completionDate : String
            timeSpent : Int
            quizPercentage : Int
            isPassed :Boolean
            modules : [moduleQuizInfo]
            
        }
        type  moduleQuizInfo {
            moduleName: [LocalisedData]
            percentage : String
            hasQuiz : Boolean
            isPassed : Boolean
        }
        type mainVesselReportData {
            vesselId : ID
            imoNumber : String
            vesselName : String
            typeOfVessel : String
            companyName : String
            ownerName : String
            onboardedCount : Int
            progress : Float
        }
        input customReportInput {
            dateRange : filterDateRange!
            courseIds : [ID]
            courseStatus: [String]
            vesselType : [ID]
            vesselName : [ID]
            designation :[ID]
            learnerStatus : [String]
            reportType : String!
        }
        type customReportGenerated{
            status : Boolean
            fileName : String
            filePath : String
            message : String
        }
        type customReportLogOutput{
            _id : ID
            from : String
            to : String
            generatedAt: String
            generatedBy : String
            filePath : MultiMediaInfo
        }

        input mainVesselReportInput {
            filterInput: vesselReportFilter   
            pageInput: PageInput       
            export: Boolean 
        }

        input vesselReportFilter {
          ownerName : [String]
          companyName : [String]
          vesselTypeIds : [ID]
          vesselNameIds : [ID]
        }

    `,
    queries: `
        getRevenueReports(pageInput: PageInput, filterInput: RevenueReportFilterInput): RevenueReportsList!
        getQuizReports(pageInput: PageInput, filterInput: QuizReportFilterInput): QuizReportsList!
        getFeedbackReports(pageInput: PageInput, filterInput: FeedbackReportFilterInput): FeedbackReportsList!
        getTrainingMatrixReports(pageInput: PageInput, filterInput: TrainingMatrixReportFilterInput): TrainingMatrixReportsList!

        getMainLearnersReport(input :learnerMainReportInput ):learnerMainReportResponse
        getSingleLearnerReport(input: singleLearnerReportInput):singleLearnersReportOutput
        getSingleCourseReport(input: singleCourseReportInput):singleCourseReportOutput
        getMainCoursesReport(input: MainCoursesReportInput): mainCourseReportOutput
        getVesselMainReport(input: mainVesselReportInput): mainVesselReportOutput
        generateCustomReport(input: customReportInput!): customReportGenerated
        getCustomReportLogs(pageInput : PageInput):[customReportLogOutput]
    `,
};
