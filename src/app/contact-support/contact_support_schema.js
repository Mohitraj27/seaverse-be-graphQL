module.exports = {
    types: `
         input contactSupportInput {
            email: String!
            subject: String!
            message: String!
        }
        type contactSupportResponse {
            success: Boolean
            message: String
        }
    `,
   
    mutations: `
        contactSupport(input: contactSupportInput!): contactSupportResponse!
    `,
};