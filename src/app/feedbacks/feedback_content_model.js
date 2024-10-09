const { Schema, Model, ObjectId } = require("../../tools");

const { LocalisedDataSchema } = require("../../util/localised_data_schema");

const feedbackSchema = {
    questionAnswers: [
        {
            question: [LocalisedDataSchema],
            choices: [
                {
                    key: {
                        type: String,
                        lowercase: true,
                    },
                    value: [LocalisedDataSchema],
                    ratingValue: Number,
                },
            ],
            isDescriptive: {
                type: Boolean,
                default: false,
            },
            displayPosition: {
                type: Number,
                default: 0,
            },
        },
    ],
};

const feedbackAttemptSchema = new Schema({
    questionAnswers: [
        {
            questionId: ObjectId,
            question: [LocalisedDataSchema],
            choices: feedbackSchema.questionAnswers[0].choices,
            givenAnswer: [LocalisedDataSchema],
            givenRating: Number,
            givenDescriptiveAnswer: String,
            givenAnswerKey: String,
            isDescriptive: {
                type: Boolean,
                default: false,
            },
        },
    ],
    attemptedAt: Date,
});

const feedbackContentSchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
            index: true,
        },

        feedback: feedbackSchema,

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

module.exports.FeedbackContent = Model("FeedbackContent", feedbackContentSchema);
module.exports.FeedbackSchema = feedbackSchema;
module.exports.FeedbackAttemptSchema = feedbackAttemptSchema;
