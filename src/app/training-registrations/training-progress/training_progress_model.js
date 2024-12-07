const { Schema, Model, ObjectId, AggregatePaginate } = require("../../../tools");
const {
    TrainingModuleContentSpecificSchema,
} = require("../../trainings/training_modules/training_module_contents/training_module_content_model");
const { QuizAttemptSpecificSchema } = require("../../quizzes/quiz-attempts/quiz_attempt_model");
const Types = require("mongoose");
const { contentTypes } = require("../../../util");

const trainingProgressSchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
        },
        training: {
            type: ObjectId,
            ref: "Training",
        },
        user: {
            type: ObjectId,
            ref: "User",
        },
        overallTrainingProgress : {
            type : ObjectId,
            ref : "OverallTrainingProgress"
        },
        trainingRegistration: {
            type: ObjectId,
            ref: "TrainingRegistration",
        },
        trainingModuleContent: {
            type: ObjectId,
            ref: "TrainingModuleContent",
        },
        playerSettings: {
            type: Schema.Types.Mixed,
        },
        trainingModule: {
            type: ObjectId,
            ref: "TrainingModule",
        },
        contentType: {
            type: String,
            enum: contentTypes,
        },
        trainingModuleContentData: {
            trainingId: ObjectId,
            trainingModuleId: ObjectId,
            trainingModuleContentId: ObjectId,
            ...TrainingModuleContentSpecificSchema,
        },
        playerSettings: [
            {
                key: { type: String, required: true },
                value: { type: Types.Mixed, required: true },
            },
        ],
        retryCount: Number,
        status: {
            type: String,
            default: "NOT_STARTED",
            enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"],
        },
        progressPercentage: {
            type: Number,
            default: 0,
        },
        enroledStatus: {
            type: Boolean,
            default: true,
        },
        lastAccessedItem: String,
        lastAccessedAt: Date,
        lastAccessedDuration: {
            type: Number,
            default: 0,
        },
        quizAttempts: [QuizAttemptSpecificSchema],
        startedAt: Date,
        completedAt: Date,
        createdBy: {
            type: ObjectId,
            ref: "User",
        },
        updatedBy: {
            type: ObjectId,
            ref: "User",
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
        attemptCount: {
            type: Number,
            default: 1
        },
        quizAttemptDetails: {
            type: Schema.Types.Mixed,
            default: {}
        }
    },
    { timestamps: true }
);

trainingProgressSchema.index({
    _id: 1,
    subscriber: 1,
    trainingRegistration: 1,
    trainingModuleContent: 1,
});

trainingProgressSchema.plugin(AggregatePaginate);

module.exports.TrainingProgress = Model("TrainingProgress", trainingProgressSchema);
