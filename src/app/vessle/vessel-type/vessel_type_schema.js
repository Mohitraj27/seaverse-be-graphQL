module.exports = {
    types: `
        type VesselType {
            _id: ID
            name: String!
            isActive: Boolean!
            createdAt: String!
            updatedAt: String!
        }
        input VesselTypeInput {
            _id: ID
            name: String!
            isActive: Boolean!
        }
        input VesselTypeFilterInput {
            search: String,
            isActive: Boolean
        }

        type VesselTypeList {
            vesseltypes: [VesselType]
            totalCount: Int
        }

        type DeleteVesselTypeResponse {
            success: Boolean!
            message: String
        }

        type ActivateDeactivateVesselTypeResponse {
            success: Boolean!
            message: String
        }
    `,
    queries: `
        getVesselTypes(pageInput: PageInput, filterInput: VesselTypeFilterInput): VesselTypeList!
        getVesselTypeById(id: ID!): VesselType!
    `,
    mutations: `
        createVesselType(input: VesselTypeInput!): VesselType!
        updateVesselType(id: ID!, input: VesselTypeInput!): VesselType!
        deleteVesselType(id: ID!): DeleteVesselTypeResponse!
        activateDeactivateVesselType(id: ID!): ActivateDeactivateVesselTypeResponse!
        `,
};
