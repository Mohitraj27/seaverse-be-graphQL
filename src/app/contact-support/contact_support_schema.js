module.exports = {
    types: `
       input TermsAndConditionsInputforContactSupport {
            message: String
            title: String
            status: Boolean
        }
        input contactSupportInput {
            email: String!
            subject: String!
            message: String!
            consents: [TermsAndConditionsInputforContactSupport]
        }
        type contactSupportResponse {
            success: Boolean
            message: String
            consents: [TermsAndConditionsforContactSupport]
        }
        type TermsAndConditionsforContactSupport {
            message: String
            title: String
            status:Boolean
            timestamp: String
        }
    `,
   
    mutations: `
        contactSupport(input: contactSupportInput!): contactSupportResponse!
        sendTestMail(input: contactSupportInput!): contactSupportResponse!
    `,
};