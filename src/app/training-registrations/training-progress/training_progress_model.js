const { Schema, Model, ObjectId, AggregatePaginate } = require("../../../tools");
const {
    TrainingModuleContentSpecificSchema,
} = require("../../trainings/training_modules/training_module_contents/training_module_content_model");
const { QuizAttemptSpecificSchema } = require("../../quizzes/quiz-attempts/quiz_attempt_model");
const Types  = require('mongoose');

const trainingProgressSchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
        },
        trainingRegistration: {
            type: ObjectId,
            ref: "TrainingRegistration",
            required: true,
            index: true,
        },
        trainingModuleContent: {
            type: ObjectId,
            ref: "TrainingModuleContent",
            required: true,
        },
        trainingModuleContentData: {
            trainingId: ObjectId,
            trainingModuleId: ObjectId,
            trainingModuleContentId: ObjectId,
            ...TrainingModuleContentSpecificSchema,
        },
        playerSettings: [{
            key: { type: String, required: true },
            value: { type: Types.Mixed, required: true }
        }],
        retryCount: Number,
        status: {
            type: String,
            uppercase: true,
        },
        lastAccessedItem: String,
        lastAccessedAt: Date,
        lastAccessedDuration: Number,
        completedModules:Number,
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
