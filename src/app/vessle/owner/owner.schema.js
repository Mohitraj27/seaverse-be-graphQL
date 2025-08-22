module.exports = {
    types: `
        type Owner {
            _id: ID
            name: String!
            firstName: String
            lastName: String
            address: String
            isActive: Boolean
            createdAt: String
            updatedAt: String
        }
        input OwnerInput {
            _id: ID
            name: String!
            firstName: String
            lastName: String
            address: String
            isActive: Boolean
        }

        type CreateOrUpdateOwnerResponse {
            success: Boolean!
            message: String
            owner: Owner
        }

        type OwnerList {
            owners: [Owner]
            totalCount: Int
        }
    `,
    queries: `
        getOwners(search: String): OwnerList
    `,
    mutations: `
        createOwner(input: OwnerInput): CreateOrUpdateOwnerResponse
    `
};