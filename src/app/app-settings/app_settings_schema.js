module.exports = {
    types: `
        enum PaymentConfigType {
            COD
            MY_FATOORAH
            TAP_PAYMENT
        }
        type CurrencyInfo {
            symbol: String
            isActive: Boolean
        }
        type CurrencyItem {
            symbol: String
            rate: Float
        }
        type CurrencyTable {
            baseCurrency: String
            date: String
            items: [CurrencyItem]
        }
        type ContactInfo {
            email: String
            phone: String
            whatsapp: String
            instagram: String
            twitter: String
            facebook: String
            snapchat: String
            mapUrl: String
            address: String
        }
        type PaymentConfig {
            deliveryCharge: Float
            paymentConfigType: PaymentConfigType
            paymentUrl: String
            paymentTestUrl: String
            paymentKey: String
            paymentTestKey: String
            liveMode: Boolean
            cod: Boolean
        }
        type UpdateConfig {
            iosLink: String
            androidLink: String
            minimumRequiredVersion: String
            latestVersion: String
        }
        type AppSettings {
            supportedCurrencies: [CurrencyInfo]
            currencyTable: CurrencyTable
            contactInfo: ContactInfo
            paymentConfig: PaymentConfig
            termsAndConditions: [LocalisedData]
            privacyPolicy: [LocalisedData]
            updateConfig: UpdateConfig
            introVideos: [MultiMediaInfo]
        }
        input CurrencyInfoInput {
            symbol: String
            isActive: Boolean
        }
        input ContactInfoInput {
            email: String
            phone: String
            whatsapp: String
            instagram: String
            twitter: String
            facebook: String
            snapchat: String
            mapUrl: String
            address: String
        }
        input PaymentConfigInput {
            deliveryCharge: Float
            paymentConfigType: PaymentConfigType
            paymentUrl: String
            paymentTestUrl: String
            paymentKey: String
            paymentTestKey: String
            liveMode: Boolean
            cod: Boolean
        }
        input UpdateConfigInput {
            iosLink: String
            androidLink: String
            minimumRequiredVersion: String
            latestVersion: String
        }
        input AppSettingsInput {
            supportedCurrencies: [CurrencyInfoInput]
            contactInfo: ContactInfoInput
            paymentConfig: PaymentConfigInput
            termsAndConditions: [LocalisedDataInput]
            privacyPolicy: [LocalisedDataInput]
            updateConfig: UpdateConfigInput
            introVideos: [MultiMediaInfoInput]
        }
    `,
    queries: `
        getAppSettings: AppSettings!
    `,
    mutations: `
        createOrUpdateAppSettings(input: AppSettingsInput!): AppSettings!
    `,
};
