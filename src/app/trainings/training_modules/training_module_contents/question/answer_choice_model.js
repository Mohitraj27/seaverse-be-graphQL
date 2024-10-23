const { Schema, Model, ObjectId, AggregatePaginate } = require("../../../../../tools");
const { LocalisedDataSchema } = require("../../../../../util/localised_data_schema");

const answerChoiceSchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
        },
        question: {
            type: ObjectId,
            ref: "Question",
        },
        choice: {
            type: [LocalisedDataSchema]
        },
        correctAnswer: {
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
    },
    { timestamps: true }
);

answerChoiceSchema.index({ _id: 1, subscriber: 1 });

module.exports.AnswerChoice = Model("AnswerChoice", answerChoiceSchema);