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
        logos: [logoUrl],
        additionalData: [genericObjectInput],
    }
    input logoUrl {
        url : String
    }
    type logoUrlOutput {
        url : String
    }

    type genericObjectOutput {
        key: String!
        value: JSON
    }

    type certificateLayoutOutput {
        success : Boolean,
        message : String
        logos : [MultiMediaInfo]
    }
    type CertificateLayout {
        id: ID
        layout: String
        training: Training
        authorName: String
        title: [LocalisedData]
        authoringTitle: String
        certificateReference: String
        logos: [MultiMediaInfo]
        additionalData: [genericObjectOutput]
        createdAt: String
        updatedAt: String
    }

`,
    queries:`
    getCertificateLayoutByTrainingId(trainingId:ID):CertificateLayout
`,
    mutations: `
    createOrUpdateCertificateLayout(input:certificateLayoutInput, logoImage1 : Upload, logoImage2 : Upload,logoImage3 : Upload):certificateLayoutOutput
`,
};
