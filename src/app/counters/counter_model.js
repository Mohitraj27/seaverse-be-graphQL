const { ObjectId, Schema, Model } = require("../../tools");

const counterSchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
        },
        modelName: {
            type: String,
            required: true,
        },
        year: String,
        count: {
            type: Number,
            default: 1,
            required: true,
        },
    },
    { timestamps: true }
);

counterSchema.index({ subscriber: 1, modelName: 1, year: 1 });

module.exports.Counter = Model("Counter", counterSchema);
