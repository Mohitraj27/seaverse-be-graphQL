module.exports = {
    types: `
        type Branch {
            _id: ID
            name: [LocalisedData]
            isActive: Boolean
        }
        type BranchList {
            branches: [Branch]
            totalCount: Int
        }
        input BranchInput {
            _id: ID
            name: [LocalisedDataInput]
            isActive: Boolean
        }
        input BranchFilterInput {
            search: String
        }
    `,
    queries: `
        getBranches(pageInput: PageInput, filterInput: BranchFilterInput): BranchList!
    `,
    mutations: `
        createOrUpdateBranch(input: BranchInput!): Branch!
        deleteBranch(id: ID!): Branch!
    `,
};
