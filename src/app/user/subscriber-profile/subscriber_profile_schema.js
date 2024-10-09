module.exports = {
    types: `
        enum invoicePriorityType {
            UNIT_PRICE
            INDIVIDUAL_PRICE
        }
        type CertificateSettings {
            backgroundImage: String
            sealImage: String
            managingDirectorSignature: String
            onlineTrainerSignature: String
            managingDirectorName: String
        }
        type ProfileCardSettings {
            backgroundImage: String
        }
        type BasicInfo {
            alternatePhone: String
            address: [LocalisedData]
            fax: String
            website: String
            currency: String
        }
        type BankDetails {
            accountName: String
            bankName: String
            accountNumber: String
            branch: String
            ifsc: String
        }
        type VatDetails {
            vat: String
            vatPercentage: Float
        }
        type SubscriberProfile {
            _id:  ID
            user: User
            certificateSettings: CertificateSettings
            profileCardSettings: ProfileCardSettings
            basicInfo: BasicInfo
            invoicePriority: String
            bankDetails: BankDetails
            vatDetails: VatDetails
            termsAndConditions: [LocalisedData]
            privacyPolicy: [LocalisedData]
            introVideos: [MultiMediaInfo]
            attendanceRevisionDate: String
            employeeMasterPassword: String
            
            signature: String @deprecated
        }
        input CertificateSettingsInput {
            backgroundImage: Upload
            sealImage: Upload
            managingDirectorSignature: Upload
            onlineTrainerSignature: Upload
            managingDirectorName: String
        }
        input ProfileCardSettingsInput {
            backgroundImage: Upload
        }
        input BasicInfoInput {
            alternatePhone: String
            address: [LocalisedDataInput]
            fax: String
            website: String
            currency: String       
        }
        input BankDetailsInput {
            accountName: String
            bankName: String
            accountNumber: String
            branch: String
            ifsc: String
        }
        input VatDetailsInput {
            vat: String
            vatPercentage: Float
        }
        input SubscriberProfileInput {
            _id: ID
            user: UserInput
            certificateSettings: CertificateSettingsInput
            profileCardSettings: ProfileCardSettingsInput
            basicInfo: BasicInfoInput
            invoicePriority: invoicePriorityType
            bankDetails: BankDetailsInput
            vatDetails: VatDetailsInput
            termsAndConditions: [LocalisedDataInput]
            privacyPolicy: [LocalisedDataInput]
            introVideos: [MultiMediaInfoInput]
            attendanceRevisionDate: String
            employeeMasterPassword: String
            
            signature: Upload @deprecated
        }
    `,
    queries: `
        getSubscriberProfile: SubscriberProfile!
    `,
    mutations: `
        createOrUpdateSubscriberProfile(input: SubscriberProfileInput!): SubscriberProfile!
    `,
};
