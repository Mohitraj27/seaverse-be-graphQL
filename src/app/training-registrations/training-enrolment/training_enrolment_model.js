const { Schema, Model, ObjectId, AggregatePaginate } = require("../../../tools");
const { LocalisedDataSchema } = require("../../../util/localised_data_schema");

const userTrainingEnrolmentSchema = new Schema(
    {
        training: {
            type: ObjectId,
            ref: "Training",
            required: true,
        },
        user: {
            type: ObjectId,
            ref: "User",
            required: true,
        },
        enroledStatus: {
            type: Boolean,
            default: true
        },
        courseStatus: {
            type: String,
            enum: ["notStarted", "inProgress", "completed"]
        },
        progress: {
            type: Number,
            default: 0
        },
    },
    { timestamps: true }
);

module.exports.UserTrainingEnrolment = Model("UserTrainingEnrolment", userTrainingEnrolmentSchema);