const { Schema, Model, ObjectId, AggregatePaginate } = require("../../../tools");

const subscriberSchema = new Schema(
    {
        user: {
            type: ObjectId,
            ref: "User",
            required: true,
        },
        name: String,
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

subscriberSchema.index({ _id: 1, user: 1 });

subscriberSchema.plugin(AggregatePaginate);

module.exports.Subscriber = Model("Subscriber", subscriberSchema);
