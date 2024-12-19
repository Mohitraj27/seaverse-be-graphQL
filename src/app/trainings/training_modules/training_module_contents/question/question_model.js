const { Schema, Model, ObjectId, AggregatePaginate } = require("../../../../../tools");
const { LocalisedDataSchema } = require("../../../../../util/localised_data_schema");

const questionSchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
        },
        question: [LocalisedDataSchema],
        questionType: {
            type: String,
            enum: ["MULTIPLE_CHOICE_QUESTION", "TRUE_OR_FALSE", "FILL_IN_THE_BLANK"],
        },
        choices: [{
            type: ObjectId,
            ref: "AnswerChoice",
        }],
        answerKey: [{
            type: String,
            required: true,
        }],
        allowMultipleAnswers: {
            type: Boolean,
            default: false,
        },
        displayPosition: {
            type: Number,
            default: 0,
        },
        points: {
            type: Number,
            required: true,
        },
        negativePoints: {
            type: Number,
            required: true,
        },
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

    },
    { timestamps: true }
);

questionSchema.index({ _id: 1, subscriber: 1 });

module.exports.Question = Model("Question", questionSchema);