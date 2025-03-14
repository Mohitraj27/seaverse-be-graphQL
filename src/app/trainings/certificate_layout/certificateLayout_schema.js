module.exports = {
    types: `
    input certificateLayoutInput {
        id: ID, 
        layout: String,
        training: ID!,
        authorName: String,
        title: LocalisedDataInput,
        authoringTitle: String,
        certificateReference:String,
        logos: [logoUrl],
        additionalData: [genericObjectInput],
        disabled: Boolean
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
    type certificateLayoutOutputForDelete {
        success : Boolean,
        message : String
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
        certificateNumber:String
        pdfUrl:String
        user:ID
        isFromMigration:Boolean
        disabled: Boolean
        listOfLayouts:[String]
    }
        type CertificateLayoutData {
        success:Boolean
        message:String
    }
`,
    queries:`
    getCertificateLayoutByTrainingId(trainingId:ID!,layout:String):CertificateLayout
    getMigrationcoursesToCertificateLayout:CertificateLayoutData
`,
    mutations: `
    createOrUpdateCertificateLayout(input:certificateLayoutInput, logoImage1 : Upload, logoImage2 : Upload,logoImage3 : Upload):certificateLayoutOutput
    deleteLogosFromCertificateLayout(layoutId : ID! , logoIndexes:[Int]!):certificateLayoutOutputForDelete
`,
};
