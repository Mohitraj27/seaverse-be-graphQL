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
        input genericObjectInput {
            key: String!
            value: JSON
        }
        input TrainingProgressInput {
            trainingRegistrationId: ID
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
        type initialTrainingProgress {
            message: String
        }
    `,
    mutations: `
        initiateTrainingProgress(input: TrainingProgressInput!): initialTrainingProgress!
        updateTrainingProgress(input: TrainingProgressInput!): TrainingRegistration!
        updateScormTrainingProgress(input: TrainingProgressInput!): TrainingRegistration!
    `,
};
