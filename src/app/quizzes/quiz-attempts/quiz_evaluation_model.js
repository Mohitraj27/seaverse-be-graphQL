const { Schema, Model, ObjectId, AggregatePaginate } = require("../../../tools");
const { LocalisedDataSchema } = require("../../../util/localised_data_schema");
const { QuizSchema } = require("../quiz_content_model");

const questionResultSchema = {
    questionId: ObjectId,
    question: [LocalisedDataSchema],
    givenAnswer: [String],
    correctAnswer: [String],
    isCorrectAnswer: Boolean,
    points: Number,
    negativePoints: Number,
    isSkipped: Boolean,
};

const quizEvaluationSchema = new Schema(
    {
        contentId: {
            type: ObjectId,
            ref: "TrainingModuleContent",
            required: true,
        },
        userId: {
            type: ObjectId,
            ref: "User",
            required: true,
        },
        trainingModuleId: {
         type: ObjectId,
         ref: "TrainingModule",
         required: true,
        },
        trainingId: {
            type: ObjectId,
            ref: "Training",
            required: true,
        },
        totalQuestions: {
            type: Number,
            required: true,
        },
        totalPoints: {
            type: Number,
            required: true,
        },
        acquiredMarks: {
            type: Number,
            required: true,
        },
        percentage: {
            type: Number,
            required: true,
        },
        attended: {
            type: Number,
            required: true,
        },
        attendedQuestions: [questionResultSchema],
        skippedQuestions: {
            type: Number,
            required: true,
        },
        isPassed: {
            type: Boolean,
            required: true,
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

quizEvaluationSchema.plugin(AggregatePaginate);

module.exports.QuizEvaluation = Model("QuizEvaluation", quizEvaluationSchema);
