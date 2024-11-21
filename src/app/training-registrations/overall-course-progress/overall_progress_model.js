const { Schema, ObjectId, Model } = require("../../../tools");
const { certificateLayout } = require("../../trainings/certificate_layout/certificateLayout_model");

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
        certificateLayout: {
            type: ObjectId,
            ref: "certificateLayout"
        },
        user: {
            type: ObjectId,
            ref: "User"
        },
        trainingRegistration: {
            type: ObjectId,
            ref: "TrainingRegistration",
        },
        contentData : [
            {
                moduleId : ObjectId,
                contentIds : [ObjectId]
            },
        ],
        startDate: Date,
        endDate : Date,
        mandatoryModules: Number,
        completedModules: Number,
        totalTrainingModules : Number,
        isComplete: {
            type: Boolean,
            default: false,
        },
        status: {
            type: String,
            enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"],
        },
        isCertificateGenerated: {
            type: Boolean,
            default: false,
        },
        completionDate: Date,
        retryCount: Number,
        progressPercentage: {
            type: Number,
            default: 0
        },
        isEnrolled: Boolean,
    },
    { timestamps: true }
)

module.exports.OverallTrainingProgress = Model("OverallTrainingProgress", overallProgressSchema);