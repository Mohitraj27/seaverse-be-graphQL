module.exports = {
    types: `
  type migrationCourses {
        _id: ID!
        title: [LocalisedData]!
        isFromMigration: Boolean
        UID: Int
      }  
  type MigrationCoursePage {
        migrationCourses: [migrationCourses]
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
