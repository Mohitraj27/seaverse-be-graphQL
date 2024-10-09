module.exports = {
    types: `
        type TrainingCategory {
            _id: ID
            name: [LocalisedData]
            subCategories: [TrainingSubCategory]
            isActive: Boolean
        }
        type TrainingCategoryList {
            trainingCategories: [TrainingCategory]
            totalCount: Int
        }
        input TrainingCategoryInput {
            _id: ID
            name: [LocalisedDataInput]
            subCategories: [TrainingSubCategoryInput]
            isActive: Boolean
            deletedSubCategories: [ID]
        }
    `,
    queries: `
        getTrainingCategories(pageInput: PageInput): TrainingCategoryList!
    `,
    mutations: `
        createOrUpdateTrainingCategory(input: TrainingCategoryInput!): TrainingCategory!
        deleteTrainingCategory(id: ID!): TrainingCategory!
    `,
};
