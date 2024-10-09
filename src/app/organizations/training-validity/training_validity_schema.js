module.exports = {
    types: `
        type TrainingValidity {
            _id: ID
            organization: Organization
            training: Training
            """in days"""
            certificateValidity: Int
        }
        input TrainingValidityInput {
            organization: ID
            training: ID
            """in days"""
            certificateValidity: Int
        }
    `,
    mutations: `
        createOrUpdateTrainingValidities(inputs: [TrainingValidityInput!]!): [TrainingValidity]!
        deleteTrainingValidity(id: ID!): TrainingValidity!
    `,
};
