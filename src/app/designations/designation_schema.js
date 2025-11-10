module.exports = {
    types: `
        type Designation {
            _id: ID
            name: String
            createdAt: String!
            updatedAt: String!
            isManager: Boolean!
        }
        input DesignationInput {
            _id: ID
            name: String!
            isManager: Boolean!
        }
        type DesignationList {
            designations: [Designation]
            totalCount: Int
        }

        input DesignationFilterInput {
            search: String
        }

        type DeleteDesignationResponse {
            success: Boolean!
            message: String
        }
    `,
    queries: `
        getDesignations(pageInput: PageInput, filterInput: OrganizationFilterInput): DesignationList!
        getDesignation(id: ID!): Designation
    `,
    mutations: `
        createOrUpdateDesignation(input: DesignationInput!): Designation!
        deleteDesignation(id: ID!): DeleteDesignationResponse!
        `,
};
