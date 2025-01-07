const { Schema, Model, ObjectId, AggregatePaginate } = require("../../../tools");

const trainingContentBridge = new Schema(
    {
        training: {
            type: ObjectId,
            ref: "Training",
            required: true
        },
        trainingModule: {
            type: ObjectId,
            ref: "TrainingModule",
            required: true
        },
        trainingContent: {
            type: ObjectId,
            ref: "TrainingModuleContent",
            required: true
        },
        isDeleted: {
            type: Boolean,
            default: false
        },
        order: {
            type: Number,
            default: 1
        },
    },
    { timestamps: true }
);

module.exports.TrainingContentBridge = Model("TrainingContentBridge", trainingContentBridge);