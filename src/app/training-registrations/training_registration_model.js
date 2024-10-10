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
        training: {
            type: ObjectId,
            ref: "Training",
            required: true,
        },
        batch: {
            type: ObjectId,
            ref: "Batch",
        },
        batchNumber: String,
        trainingDuration: Number, 
        certificateValidity: Number, 
        sortedTrainingModules: [
            {
                trainingModule: {
                    type: ObjectId,
                    ref: "TrainingModule",
                },
                title: [LocalisedDataSchema],
                description: [LocalisedDataSchema],
                trainingModuleContents: [
                    {
                        type: ObjectId,
                        ref: "TrainingModuleContent",
                    },
                ],
            },
        ],
        organization: {
            type: ObjectId,
            ref: "Organization",
        },
        branch: {
            type: ObjectId,
            ref: "Branch",
        },
        employee: {
            type: ObjectId,
            ref: "Employee",
            index: true,
        },
        trainer: {
            type: ObjectId,
            ref: "Employee",
        },
        supervisor: {
            type: ObjectId,
            ref: "Employee",
        },
        status: {
            type: String,
            uppercase: true,
            required: true,
        },
        trainingProgressPercentage: Number,
        startDate: Date,
        endDate: Date,
        scorm: {
            courseId: String,
            launchUrl: String,
            registrationId: String,
            learnerId: String
        },
        unitPrice: Number,
        customPrice: Number,
        remarks: String,
        invoice: {
            type: ObjectId,
            ref: "TrainingRegistrationInvoice",
        },
        startedAt: Date,
        completedAt: Date,

        feedback: FeedbackAttemptSchema,

        trainingMode: {
            type: String,
            uppercase: true,
        },
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
