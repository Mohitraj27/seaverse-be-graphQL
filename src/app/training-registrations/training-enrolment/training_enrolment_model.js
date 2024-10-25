const { Schema, Model, ObjectId, AggregatePaginate } = require("../../tools");
const { LocalisedDataSchema } = require("../../util/localised_data_schema");
const { FeedbackAttemptSchema } = require("../feedbacks/feedback_content_model");

const trainingRegistrationSchema = new Schema(
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
        group: [
            {
                groupType: {
                    type: String,
                },
                groupId: {
                    type: String,
                }
            }
        ],
        employee: [
            {
                type: ObjectId,
                ref: "User",
                index: true,
            }
        ],
    },
    { timestamps: true }
);

module.exports.TrainingRegistration = Model("TrainingRegistration", trainingRegistrationSchema);