const { Schema, ObjectId, Model } = require("../../../tools");
const { certificateLayout } = require("../../trainings/certificate_layout/certificateLayout_model");

const overallProgressSchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber"
        },
        learningPlan: [
            {
                type: ObjectId,
                ref: "LearninPlan"
            }
        ],
        directEnrollment: {
            type: Boolean,
            default: false
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
        contentData: [
            {
                moduleId: ObjectId,
                contentIds: [ObjectId]
            },
        ],
        lastConsumedContent: {
            moduleId: ObjectId,
            contentId: ObjectId
        },
        startDate: Date,
        endDate: Date,
        unenrollmentDate: Date,
        mandatoryModules: Number,
        completedModules: Number,
        totalTrainingModules: Number,
        isComplete: {
            type: Boolean,
            default: false,
        },
        status: {
            type: String,
            enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"],
        },
        attemptCount: {
            type: Number,
            default: 1
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
        isFromMigration: {
            type: Boolean
        },
        pdfUrl: {
            type: String
        },
        certificateNumber: {
            type: String
        },
        isDeleted: {
            type: Boolean,
            default: false
        },
        isAdminResetModule: {
            type: Number,
            default: 0
        },
        adminMarkedAsCompleted: {
            type: Boolean,
            default: false
        },
        isEnrolled: Boolean,
        isCertificatePresent: Boolean,
        assignedCertificateLayout: String,
        assignedCertificateLayoutId: ObjectId,
        certificateExpiry: Number,
        totalDuration: Number,
        timeSpend: Number,
        finishedCourseFirstTime: {
            type: Boolean,
            default: false
        },
        version: {
            type: Number,
            default: 1
        },
        completionNotificationSent: {
            type: Boolean,
            default: false
        },
        contentFromDownload: [
            {
                courseDetails: [
                    {
                        moduleId: {
                            type: ObjectId,
                            required: true
                        },
                        contentIds: [ObjectId]
                    }
                ],
                version: {
                    type: Number,
                    required: true
                }
            }
        ]
    },
    { timestamps: true }
)


overallProgressSchema.index({ user: 1, training: 1 }, { unique: true });
overallProgressSchema.index({ status: 1 });

module.exports.OverallTrainingProgress = Model("OverallTrainingProgress", overallProgressSchema);