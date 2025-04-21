module.exports = {
    types: `
        enum TrainingProgressStatus {
            NOT_STARTED
            IN_PROGRESS
            COMPLETED
        }
        extend type TrainingModuleContent {
            trainingId: ID
            trainingModuleId: ID
            trainingModuleContentId: ID
        }
        type TrainingProgress {
            _id: ID
            trainingRegistration: TrainingRegistration
            trainingModuleContent: TrainingModuleContent
            trainingModuleContentData: TrainingModuleContent
            retryCount: Int
            """
            Refer TrainingProgressStatus
            """
            status: String
            lastAccessedItem: String
            lastAccessedAt: String
            lastAccessedDuration: Float
            
            quizAttempts: [QuizAttemptAttempt]
            
            startedAt: String
            completedAt: String
        }
        input genericObjectInput {
            key: String!
            value: JSON
        }
        input TrainingProgressInput {
            trainingRegistrationId: ID
            trainingRegistrationSortedTrainingModules: [TrainingRegistrationSortedTrainingModuleInput]
            trainingRegistrationStatus: TrainingRegistrationStatus
            trainingRegistrationProgressPercentage: Int
            currentTrainingModuleContentId: ID
            currentTrainingModuleContentStatus: TrainingProgressStatus
            currentTrainingModuleContentLastAccessedItem: String
            currentTrainingModuleContentLastAccessedDuration: Float
            currentTrainingModuleContentQuestionAnswers: [QuizAttemptQuestionAnswerInput]
            nextTrainingModuleId: ID
            currentTrainingModuleId: ID
            nextTrainingModuleContentId: ID
            additionalData : genericObjectInput
            settings: genericObjectInput
            training : ID
            completedModules: Int
        }
        type initialTrainingProgress {
            message: String
        }
        type overallTrainingProgress {
           status : Int
           message : String 
        }
    `,
    mutations: `
        initiateTrainingProgress(input: TrainingProgressInput!): initialTrainingProgress!
        updateTrainingProgress(input: TrainingProgressInput!): overallTrainingProgress!
        updateScormTrainingProgress(input: TrainingProgressInput!): TrainingRegistration!
    `,
};
