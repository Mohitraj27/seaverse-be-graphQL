module.exports = {
    types: `

    enum certificateLayoutOperation {
        TOGGLE,
        CREATE_OR_UPDATE,
        SWITCH_LAYOUTS,
    }



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
        courseProvidedBy : String
        certificateExpiry : Int
        apiMode : certificateLayoutOperation
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
        layout : CertificateLayout
        logos : [MultiMediaInfo]
        signature : MultiMediaInfo
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
        signature: MultiMediaInfo
        additionalData: [genericObjectOutput]
        createdAt: String
        updatedAt: String
        certificateNumber:String
        pdfUrl:String
        user:ID
        isFromMigration:Boolean
        disabled: Boolean
        certificateExpiry : Int
        courseProvidedBy : String
        listOfLayouts:[layoutAndIds]
    }
        type CertificateLayoutData {
        success:Boolean
        message:String
    }

    type layoutAndIds {
        layout:String
        _id:ID
    }
`,
    queries:`
    getCertificateLayoutByTrainingId(trainingId:ID!,layout:String):CertificateLayout
    getMigrationcoursesToCertificateLayout:CertificateLayoutData
`,
    mutations: `
    createOrUpdateCertificateLayout(input:certificateLayoutInput, logoImage1 : Upload, logoImage2 : Upload,logoImage3 : Upload, signatureImage : Upload):certificateLayoutOutput
    deleteLogosFromCertificateLayout(layoutId : ID! , logoIndexes:[Int]!):certificateLayoutOutputForDelete
`,
};
