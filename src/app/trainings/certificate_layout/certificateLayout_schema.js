module.exports = {
    types: `
    input certificateLayoutInput {
        id: ID, 
        layout: String,
        training: ID!,
        authorName: String!,
        title: LocalisedDataInput!,
        authoringTitle: String,
        certificateReference:String,
        logo: String,
        additionalData: [genericObjectInput],
    }

    type certificateLayoutOutput {
        success : Boolean,
        message : String
    }

`,
    mutations: `
    createOrUpdateCertificateLayout(input:certificateLayoutInput, logoImage : Upload):certificateLayoutOutput
`,
};
