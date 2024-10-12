module.exports = {
    types: `
        type Vessel {
            _id: ID
            name: String!
            typeOfVessel: String!
            imoNumber: String!
            isActive: Boolean!
            createdAt: String!
            updatedAt: String!
        }
        input VesselInput {
            _id: ID
            name: String!
            typeOfVessel: String!
            imoNumber: String!
            isActive: Boolean!
        }
        input VesselFilterInput {
            search: String
        }

        type VesselList {
            vessels: [Vessel]
            totalCount: Int
        }

        type DeleteVesselResponse {
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
        `,
};
