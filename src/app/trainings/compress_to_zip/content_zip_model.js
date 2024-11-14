const { Schema, Model, ObjectId, AggregatePaginate } = require("../../tools");

const contentZipSchema = new Schema(
    {
        UID: String,
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
            index: true,
        },
        user: {
            type: ObjectId,
            ref: "User",
            required: true,
        },
        training: {
            type: ObjectId,
            ref: "Training",
            required: true,
        },
        trainingModule: {
            type: ObjectId,
            ref: "TrainingModule",
            required: true,
        },
        zipFilePath: {
            type: String,
            required: true
        },
    },
    { timestamps: true }
);

module.exports.ContentZip = Model("ContentZip", contentZipSchema);
