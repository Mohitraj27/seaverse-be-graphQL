module.exports = {
    types: `
    
  type MigrationCourses {
        _id: ID!
        courseId: String
        courseName: String
        isFromMigration: Boolean
      }
  input PaginationInput {
       skip: Int
       limit: Int
      }
  
  type migrationtrainingcoursesPage {
        TrainingId: [Training]!
        MigrationCourseId: [MigrationCourses]    
        } 
  input MigrationCoursesinput{
        trainingId: ID!
        migrationcourseId: ID!
        }
   
  type OverallTrainingProgressData {
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
          retryCount: Int
          progressPercentage: String
          isEnrolled: Boolean
          moduleCount: Int
          totalDuration: Int
          status: String
          timeSpend: Float
          lastConsumedContent: lastConsumedContent
          trainingModules: [TrainingModule]
          isFromMigration:Boolean
          pdfUrl:String
          certificateNumber:String
          createdAt:String
 
        }
  type MigrationaTrainininginput{
        MigrationCourses:[MigrationCourses]
        Training: [Training]
        TrainingRegistration: [TrainingRegistration]
        OverallTrainingProgressdata: [OverallTrainingProgressData]
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
