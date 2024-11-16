module.exports = {
    types: `
        type Company {
            _id: ID
            name: String
            isActive: Boolean
            createdAt: String
            updatedAt: String
        }
        input CompanyInput {
            _id: ID
            name: String!
            isActive: Boolean
        }

        type CreateOrUpdateCompanyResponse {
            success: Boolean!
            message: String
            company: Company
        }

        type CompanyList {
            companies: [Company]
            totalCount: Int
        }
    `,
    queries: `
        getCompanies(search: String): CompanyList
    `,
    mutations: `
        createCompany(input: CompanyInput!): CreateOrUpdateCompanyResponse
    `
};