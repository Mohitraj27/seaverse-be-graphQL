const { Schema, Model, ObjectId, AggregatePaginate } = require("../../../tools");
const { LocalisedDataSchema } = require("../../../util/localised_data_schema");
const { QuizSchema } = require("../quiz_content_model");

const quizAttemptSpecificSchema = {
    questionAnswers: [
        {
            questionId: ObjectId,
            question: [LocalisedDataSchema],
            choices: QuizSchema.questionAnswers[0].choices,
            givenAnswer: [LocalisedDataSchema],
            correctAnswer: [LocalisedDataSchema],
            givenAnswerKey: String,
            correctAnswerKey: String,
            isCorrectAnswer: Boolean,
        },
    ],
    totalMark: Number,
    acquiredMark: Number,
    status: {
        type: String,
        uppercase: true,
    },
    attemptedAt: Date,
};

const quizAttemptSchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
        },
        organization: {
            type: ObjectId,
            ref: "Organization",
        },
        employee: {
            type: ObjectId,
            ref: "Employee",
        },
        quizContent: {
            type: ObjectId,
            ref: "QuizContent",
            required: true,
        },
        attempt: quizAttemptSpecificSchema,
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

quizAttemptSchema.plugin(AggregatePaginate);

module.exports.QuizAttempt = Model("QuizAttempt", quizAttemptSchema);
module.exports.QuizAttemptSpecificSchema = quizAttemptSpecificSchema;
