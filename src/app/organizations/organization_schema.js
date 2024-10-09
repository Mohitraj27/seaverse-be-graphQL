module.exports = {
    types: `
        type Organization {
            _id: ID
            UID: String
            name: [LocalisedData]
            logo: String
            description: [LocalisedData]
            email: String,
            phone: String,
            contactName: String
            isActive: Boolean
            totalEmployees: Int
            trainingValidities: [TrainingValidity]
        }
        type OrganizationList {
            organizations: [Organization]
            totalCount: Int
        }
        input OrganizationInput {
            _id: ID
            name: [LocalisedDataInput]
            logo: Upload
            description: [LocalisedDataInput]
            email: String,
            phone: String,
            contactName: String
            isActive: Boolean
        }
        input OrganizationFilterInput {
            search: String
        }
    `,
    queries: `
        getOrganizations(pageInput: PageInput, filterInput: OrganizationFilterInput): OrganizationList!
    `,
    mutations: `
        createOrUpdateOrganization(input: OrganizationInput!): Organization!
        deleteOrganization(id: ID!): Organization!
    `,
};
