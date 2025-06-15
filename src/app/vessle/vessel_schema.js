module.exports = {
    types: `
        type Vessel {
            _id: ID
            name: String!
            typeOfVessel: VesselTypeNew!
            imoNumber: String!
            companyName: String
            ownerName: String
            address: String
            isActive: Boolean!
            createdAt: String!
            updatedAt: String!
            owner: Owner
        }
        type VesselTypeNew {
            _id: ID
            name: String
            isActive: Boolean
            createdAt: String
            updatedAt: String
        }
        input VesselInput {
            _id: ID
            name: String!
            typeOfVessel: ID!
            imoNumber: String!
            isActive: Boolean!
            companyName: String!
            ownerId: ID
            address: String
        }
            
        input VesselFilterInput {
            search: String
            vesselType: [String]
            vesselName: [String]
            vesselNameAndImoNumber: [String]
            companyName: [String]
            ownerName: [String]
            isActive: Boolean
        }

        type CreateOrUpdateVesselResponse {
            success: Boolean!
            message: String
            vessel: Vessel
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
        type valdateImoNumberResponse {
            status: Boolean
            message: String
        }
        input SortVesselInput {
            sortField: String!
            sortOrder: Int!
        }

    `,
    queries: `
        getVessels(pageInput: PageInput, filterInput: VesselFilterInput, sortInput: SortVesselInput): VesselList!
        getVesselById(id: ID!): Vessel!
        validateImoNumber(imoNumber: String!): valdateImoNumberResponse!
    `,
    mutations: `
        createVessel(input: VesselInput!): CreateOrUpdateVesselResponse
        updateVessel(id: ID!, input: VesselInput!): CreateOrUpdateVesselResponse
        deleteVessel(ids: [ID!]): DeleteVesselResponse!
        activateDeactivateVessel(ids: [ID!]): ActivateDeactivateVesselResponse!
        `,
};
