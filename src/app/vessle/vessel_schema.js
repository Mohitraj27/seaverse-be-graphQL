module.exports = {
    types: `
        type Vessel {
            _id: ID
            name: String!
            typeOfVessel: ID!
            imoNumber: String!
            isActive: Boolean!
            createdAt: String!
            updatedAt: String!
        }
        input VesselInput {
            _id: ID
            name: String!
            typeOfVessel: ID!
            imoNumber: String!
        }
        input VesselFilterInput {
            search: String
            vesselType: ID
            isActive: Boolean
        }

        type VesselList {
            vessels: [Vessel]
            totalCount: Int
        }

        type DeleteVesselResponse {
            success: Boolean!
            message: String
        }

        type ActivateDeactivateVesselResponse {
            success: Boolean!
            message: String
        }
    `,
    queries: `
        getVessels(pageInput: PageInput, filterInput: VesselFilterInput): VesselList!
        getVesselById(id: ID!): Vessel!
    `,
    mutations: `
        createVessel(input: VesselInput!): Vessel!
        updateVessel(id: ID!, input: VesselInput!): Vessel!
        deleteVessel(id: ID!): DeleteVesselResponse!
        activateDeactivateVessel(id: ID!): ActivateDeactivateVesselResponse!
        `,
};
