module.exports = {
    types: `
    
  type MigrationCourses {
        _id: ID!
        courseId: String
        courseName: String
        isFromMigration: Boolean
      }  
  type MigrationCoursePage {
        MigrationCourses: [MigrationCourses]
        totalCount: Int
       }
  input MigrationCoursesFilter{
        search:String
       } 
     `,
    queries: `
    getMigrationCourses(pageInput: pageInput, filterInput: MigrationCoursesFilter): MigrationCoursePage!   
`
};
