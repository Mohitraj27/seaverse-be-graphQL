const { Schema, Model, AggregatePaginate, ObjectId } = require("../../../tools");

const trainingValiditySchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
            index: true,
        },
        organization: {
            type: ObjectId,
            ref: "Organization",
            required: true,
        },
        training: {
            type: ObjectId,
            ref: "Training",
            required: true,
        },
        certificateValidity: {
            type: Number,
            required: true,
        },
        createdBy: {
            type: ObjectId,
            ref: "User",
        },
        updatedBy: {
            type: ObjectId,
            ref: "User",
        },
    },
    { timestamps: true }
);

trainingValiditySchema.index({ _id: 1, subscriber: 1, organization: 1 });

trainingValiditySchema.index({ createdAt: -1 });

trainingValiditySchema.plugin(AggregatePaginate);

module.exports.TrainingValidity = Model("TrainingValidity", trainingValiditySchema);
