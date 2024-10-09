
module.exports = {
    types: `
    type GroupTrainingModule {
        _id: ID
        subscriber: Subscriber
        name: [LocalisedData]
        trainingModules: [TrainingModule]
        createdBy: User
        updatedBy: User
        isDeleted: Boolean
        createdAt: String
        updatedAt: String
    }
    input GroupTrainingModuleInput {
        _id: ID
        subscriber: ID
        name: [LocalisedDataInput]
        trainingModules: [TrainingModuleInput!] 
        createdBy: ID
        updatedBy: ID
        isDeleted: Boolean
    }
`,
    mutations:`
    createOrUpdateGroupTrainingModule(input: GroupTrainingModuleInput!): GroupTrainingModule
    deleteGroupTrainingModule(id: ID!): Boolean
`,
};


