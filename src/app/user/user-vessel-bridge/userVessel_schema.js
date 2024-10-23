module.exports = {
    types: `
        input AssignVesselToUserInput {
            vesselId: ID
            userId: ID
            vesselStatus: String
        }
        type assignVesselRes {
            status: String
            message: String
        }
    `,
    queries: `

    `,
    mutations: `
        assignVesselToUser(input: AssignVesselToUserInput!): assignVesselRes!
    `,
}