const { Schema, Model, ObjectId, AggregatePaginate } = require("../../../tools");
const { LocalisedDataSchema } = require("../../../util/localised_data_schema");

const userTrainingEnrolmentSchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
            index: true,
        },
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
        }
    },
    { timestamps: true }
);

module.exports.UserTrainingEnrolment = Model("UserTrainingEnrolment", userTrainingEnrolmentSchema);