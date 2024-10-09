const { Model, Schema, AggregatePaginate, ObjectId } = require("../../../tools");
const { LocalisedDataSchema } = require("../../../util/localised_data_schema");

const subscriptionPlanSchema = new Schema(
    {
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
                duration: Number,
                price: {
                    type: Number,
                    required: true,
                },
            },
        ],
        isActive: {
            type: Boolean,
            default: true,
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

subscriptionPlanSchema.plugin(AggregatePaginate);

module.exports.SubscriptionPlan = Model("SubscriptionPlan", subscriptionPlanSchema);
