module.exports = {
    types: `
        type TrainingSubCategory {
            _id: ID
            category: TrainingCategory
            name: [LocalisedData]
            isActive: Boolean
        }
        input TrainingSubCategoryInput {
            _id: ID
            category: ID
            name: [LocalisedDataInput]
            isActive: Boolean
        }
    `,
};
