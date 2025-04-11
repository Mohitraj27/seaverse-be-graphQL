
module.exports = {
    types: `
       input TrainingModuleContentLanguageInput{
            title: String!
            contentLanguageCode: String!

       }

        input updateTrainingModuleContentLanguageInput{
            _id: ID!
            title: String   
            contentLanguageCode: String
       }
        input ContentLanguageFilterInput {
            search: String
            id: ID
        }
        type TrainingModuleContentLanguage {
            _id: ID!
            title: String!
            contentLanguageCode: String!
            createdAt: String
            updatedAt: String
            createdBy: userInfo
            updatedBy: userInfo
        }
        type TrainingModuleContentLanguageList {
            contentLanguages: [TrainingModuleContentLanguage]
            totalCount: Int
        }
    `,
    queries: `
     getAllContentLanguages(filterInput: ContentLanguageFilterInput): TrainingModuleContentLanguageList
   
`,

    mutations: `
      createContentLanguage(input:TrainingModuleContentLanguageInput ): TrainingModuleContentLanguage
      updateContentLanguage(input: updateTrainingModuleContentLanguageInput): TrainingModuleContentLanguage
    `,
};
