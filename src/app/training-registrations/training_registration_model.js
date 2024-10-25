const { Schema, Model, ObjectId, AggregatePaginate } = require("../../tools");
const { LocalisedDataSchema } = require("../../util/localised_data_schema");
const { FeedbackAttemptSchema } = require("../feedbacks/feedback_content_model");

const trainingRegistrationSchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
            index: true,
        },
        batchUID: {
            type: String,
        },
        training: {
            type: ObjectId,
            ref: "Training",
            required: true,
        },
        trainingDuration: Number,
        certificateValidity: Number,
        groups: [
            {
                groupType: {
                    type: String,
                },
                groupId: {
                    type: String,
                }
            }
        ],
        users: [
            {
                type: ObjectId,
                ref: "Employee",
                index: true,
            }
        ],
        status: {
            type: String,
            uppercase: true,
            required: true,
        },
        startDate: Date,
        endDate: Date,
        scorm: {
            courseId: String,
            launchUrl: String,
            registrationId: String,
            learnerId: String
        },
        feedback: FeedbackAttemptSchema,
        isRegistered: {
            type: Boolean,
            default: false,
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
        isDeleted: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

trainingRegistrationSchema.virtual("trainingProgresses", {
    ref: "TrainingProgress",
    localField: "_id",
    foreignField: "trainingRegistration",
});

trainingRegistrationSchema.virtual("trainingAttendance", {
    ref: "TrainingAttendance",
    localField: "_id",
    foreignField: "trainingRegistration",
    justOne: true,
});

trainingRegistrationSchema.virtual("trainingCertificate", {
    ref: "TrainingCertificate",
    localField: "_id",
    foreignField: "trainingRegistration",
    justOne: true,
});

trainingRegistrationSchema.index({ subscriber: 1, training: 1 });

trainingRegistrationSchema.index({ subscriber: 1, batch: 1 });

trainingRegistrationSchema.index({ subscriber: 1, organization: 1 });

trainingRegistrationSchema.index({ subscriber: 1, trainer: 1 });

trainingRegistrationSchema.index({ subscriber: 1, employee: 1 });

trainingRegistrationSchema.index({ createdAt: -1 });

trainingRegistrationSchema.plugin(AggregatePaginate);

module.exports.TrainingRegistration = Model("TrainingRegistration", trainingRegistrationSchema);
