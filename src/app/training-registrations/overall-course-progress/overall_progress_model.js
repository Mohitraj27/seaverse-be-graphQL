const { Schema, ObjectId, Model } = require("../../../tools");
const overallProgressSchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber"
        },
        learningPlan: {
            type: ObjectId,
            ref: "LearninPlan"
        },
        training: {
            type: ObjectId,
            ref: "Training"
        },
        user: {
            type: ObjectId,
            ref: "User"
        },
        trainingRegistration: {
            type: ObjectId,
            ref: "TrainingRegistration",
        },
        trainingModuleContentIds: [ObjectId],
        trainingModuleIds: [ObjectId],
        mandatoryModules: Number,
        completedModules: Number,
        isComplete: {
            type: Boolean,
            default: false,
        },
        status: {
            type: String,
            enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"],
        },
        retryCount: Number,
        progressPercentage: String,
        isEnrolled: Boolean,
    },
    { timestamps: true }
)
module.exports.OverallTrainingProgress = Model("OverallTrainingProgress", overallProgressSchema);