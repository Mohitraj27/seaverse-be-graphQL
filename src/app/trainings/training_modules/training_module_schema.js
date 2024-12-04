module.exports = {
    types: `
        type TrainingModule {
            _id: ID
            training: Training
            title: [LocalisedData]
            description: [LocalisedData]
            displayPosition: Int
            isActive: Boolean
            progressPercentage: String
            status: String
            trainingModuleContents: [TrainingModuleContent]
        }
        input TrainingModuleInput {
            _id: ID
            """
            Use this input only with createOrUpdateTrainingModule mutation 
            """
            training: ID
            title: [LocalisedDataInput]
            description: [LocalisedDataInput]
            displayPosition: Int
            isActive: Boolean
            """
            Use this input only with createOrUpdateTraining mutation 
            """
            trainingModuleContents: [ID]
        }
    `,
    mutations: `
        #createOrUpdateTrainingModule(input: TrainingModuleInput!): TrainingModule!
        #deleteTrainingModule(id: ID!): TrainingModule!
        #updateTrainingModuleStatus(id: ID!, isActive: Boolean!): TrainingModule!
    `,
};
