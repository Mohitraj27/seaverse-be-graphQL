module.exports = {
    types: `
        input AssignVesselToUserInput {
            vesselId: String
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