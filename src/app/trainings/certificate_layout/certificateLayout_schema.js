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
        logos: [String],
        additionalData: [genericObjectInput],
    }

    type certificateLayoutOutput {
        success : Boolean,
        message : String
    }

`,
    mutations: `
    createOrUpdateCertificateLayout(input:certificateLayoutInput, logoImage1 : Upload, logoImage2 : Upload,logoImage3 : Upload):certificateLayoutOutput
`,
};
