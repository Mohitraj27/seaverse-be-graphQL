const { ObjectId, Schema, Model, AggregatePaginate } = require("../../../tools");
const { StringNormalize } = require("../../../util");

const SaasPaymentSchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
        },
        subscription: {
            type: ObjectId,
            ref: "Subscription",
        },
        paymentConfigType: String,
        paymentType: String,
        invoiceId: String,
        invoiceAmount: Number,
        invoiceReference: String,
        currency: String,
        status: {
            type: String,
            uppercase: true,
        },
        firstName: {
            type: String,
            required: true,
            set: StringNormalize,
        },
        lastName: {
            type: String,
            set: StringNormalize,
        },
        phone: {
            type: {
                countryCode: {
                    type: String,
                    required: true,
                },
                number: {
                    type: String,
                    required: true,
                },
            },
        },
        email: {
            type: String,
            set: StringNormalize,
        },
        metadata: JSON,
        transaction: JSON,
        reference: JSON,
        customer: JSON,
        createdBy: {
            type: ObjectId,
            ref: "User",
        },
        updatedBy: {
            type: ObjectId,
            ref: "User",
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

SaasPaymentSchema.plugin(AggregatePaginate);

module.exports.SaasPayment = Model("SaasPayment", SaasPaymentSchema);
