const { Model, ObjectId, Schema, AggregatePaginate } = require("../../../../tools");
const { LocalisedDataSchema } = require("../../../../util/localised_data_schema");

const subscriptionSchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
        },
        subscriptionPlan: {
            type: ObjectId,
            ref: "SubscriptionPlan",
        },
        startDate: Date,
        endDate: Date,
        planDetails: {
            name: [LocalisedDataSchema],
            description: [LocalisedDataSchema],
            features: {
                inclusive: [
                    {
                        type: String,
                        uppercase: true,
                    },
                ],
                exclusive: [
                    {
                        type: String,
                        uppercase: true,
                    },
                ],
            },
            pricing: [
                {
                    title: String,
                    duration: Number, // days
                    price: {
                        type: Number,
                        required: true,
                    },
                },
            ],
            price: Number,
            duration: Number, // days
        },
        payment: {
            type: ObjectId,
            ref: "SaasPayment",
        },
        isActivated: {
            type: Boolean,
            default: false,
        },
        isTrial: {
            type: Boolean,
            default: false,
        },
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

subscriptionSchema.index({ _id: 1, subscriber: 1 });

subscriptionSchema.plugin(AggregatePaginate);

module.exports.Subscription = Model("Subscription", subscriptionSchema);

module.exports.PendingSubscription = Model("PendingSubscription", subscriptionSchema);
