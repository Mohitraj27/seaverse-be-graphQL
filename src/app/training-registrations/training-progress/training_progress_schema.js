module.exports = {
    types: `
        enum TrainingProgressStatus {
            PENDING
            ON_GOING
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
            lastAccessedDuration: Int
            
            quizAttempts: [QuizAttemptAttempt]
            
            startedAt: String
            completedAt: String
        }
        type genericObjectInput :{
            key: String!
            value: JSON
        }
        input TrainingProgressInput {
            trainingRegistrationId: ID!
            trainingRegistrationSortedTrainingModules: [TrainingRegistrationSortedTrainingModuleInput]
            trainingRegistrationStatus: TrainingRegistrationStatus
            trainingRegistrationProgressPercentage: Float
            currentTrainingModuleContentId: ID
            currentTrainingModuleContentStatus: TrainingProgressStatus
            currentTrainingModuleContentLastAccessedItem: String
            currentTrainingModuleContentLastAccessedDuration: Float
            currentTrainingModuleContentQuestionAnswers: [QuizAttemptQuestionAnswerInput]
            nextTrainingModuleId: ID
            nextTrainingModuleContentId: ID
            additionalData : genericObjectInput
            settings: genericObjectInput
            training : ID
        }
    `,
    mutations: `
        updateTrainingProgress(input: TrainingProgressInput!): TrainingRegistration!
        updateScormTrainingProgress(input: TrainingProgressInput!): TrainingRegistration!
    `,
};
