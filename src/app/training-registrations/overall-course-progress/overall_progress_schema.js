module.exports = {
    types: `
    input learnerCourseReportInput {
        learnerId : ID
        pageInput: PageInput
        filter : learnerCourseReportFilter
        export : Boolean
    }
    input learnerCourseReportFilter{
        courseStatus:String
        dateRange : filterDateRange
    }
    input filterDateRange {
        startDate: String
        endDate : String
    }
    type learnerCoursesReport {
        courseName : [String]
        duration : [Int]
        createdAt : String
        completionDate : String
        status : String
        updatedAt : String
    }
    type learnerCoursesReportOutput {
        filePath : String
        fileName : String
        learnerData : [learnerCoursesReport]
    }
    `,
    queries: `
    getLearnerCoursesReport(input: learnerCourseReportInput):learnerCoursesReportOutput
    `,
}