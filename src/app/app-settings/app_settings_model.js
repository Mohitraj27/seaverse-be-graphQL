const { Schema, Model } = require("../../tools");
const { StringNormalize } = require("../../util");
const { LocalisedDataSchema } = require("../../util/localised_data_schema");

const appSettingsSchema = new Schema(
    {
        supportedCurrencies: [
            {
                symbol: {
                    type: String,
                    uppercase: true,
                    required: true,
                },
                isActive: {
                    type: Boolean,
                    default: true,
                },
            },
        ],
        currencyTable: {
            baseCurrency: {
                type: String,
                uppercase: true,
            },
            date: Date,
            items: [
                {
                    symbol: {
                        type: String,
                        uppercase: true,
                        required: true,
                    },
                    rate: {
                        type: Number,
                        required: true,
                    },
                },
            ],
        },
        contactInfo: {
            email: { type: String, set: StringNormalize },
            phone: { type: String, set: StringNormalize },
            whatsapp: { type: String, set: StringNormalize },
            instagram: { type: String, set: StringNormalize },
            twitter: { type: String, set: StringNormalize },
            facebook: { type: String, set: StringNormalize },
            snapchat: { type: String, set: StringNormalize },
            mapUrl: { type: String, set: StringNormalize },
            address: { type: String, set: StringNormalize },
        },
        paymentConfig: {
            deliveryCharge: Number,
            paymentConfigType: String,
            paymentUrl: String,
            paymentTestUrl: String,
            paymentKey: String,
            paymentTestKey: String,
            liveMode: Boolean,
            cod: Boolean,
        },
        termsAndConditions: [LocalisedDataSchema],
        privacyPolicy: [LocalisedDataSchema],
        updateConfig: {
            iosLink: String,
            androidLink: String,
            minimumRequiredVersion: String,
            latestVersion: String,
        },
        introVideos: [
            {
                lang: {
                    type: String,
                    lowercase: true,
                },
                url: {
                    type: String,
                    required: true,
                },
            },
        ],
    },
    { timestamps: true }
);

module.exports.AppSettings = Model("AppSettings", appSettingsSchema);
