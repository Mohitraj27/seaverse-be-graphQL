const { Schema, Model, ObjectId } = require("../../../tools");
const { StringNormalize } = require("../../../util");
const { LocalisedDataSchema } = require("../../../util/localised_data_schema");

const subscriberProfileSchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
        },
        user: {
            type: ObjectId,
            ref: "User",
            required: true,
        },
        certificateSettings: {
            backgroundImage: String,
            sealImage: String,
            managingDirectorSignature: String,
            onlineTrainerSignature: String,
            managingDirectorName: String,
        },
        profileCardSettings: {
            backgroundImage: String,
        },
        basicInfo: {
            alternatePhone: { type: String, set: StringNormalize },
            address: [LocalisedDataSchema],
            fax: { type: String, set: StringNormalize },
            website: { type: String, set: StringNormalize },
            currency: String,
        },
        invoicePriority: {
            type: String,
            default: "UNIT_PRICE",
        },
        bankDetails: {
            accountName: { type: String, set: StringNormalize },
            bankName: { type: String, set: StringNormalize },
            accountNumber: { type: String, set: StringNormalize },
            branch: { type: String, set: StringNormalize },
            ifsc: { type: String, set: StringNormalize },
        },
        //TODO: vatDetails
        vatDetails: {
            vat: String,
            vatPercentage: Number,
        },
        termsAndConditions: [LocalisedDataSchema],
        privacyPolicy: [LocalisedDataSchema],
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
        attendanceRevisionDate: String,
        employeeMasterPassword: String,

        signature: String, //deprecated, use certificateSettings.onlineTrainerSignature
    },
    { timestamps: true }
);

module.exports.SubscriberProfile = Model("SubscriberProfile", subscriberProfileSchema);
