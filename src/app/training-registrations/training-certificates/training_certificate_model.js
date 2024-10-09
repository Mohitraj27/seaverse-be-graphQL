const { Schema, Model, ObjectId, AggregatePaginate } = require("../../../tools");
const { LocalisedDataSchema } = require("../../../util/localised_data_schema");

const trainingCertificateSchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
            index: true,
        },
        trainingRegistration: {
            type: ObjectId,
            ref: "TrainingRegistration",
            required: true,
            index: true,
        },
        training: {
            type: ObjectId,
            ref: "Training",
            required: true,
        },
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
        subscriberLogo: String,
        employeeName: {
            type: String,
            trim: true,
        },
        employeeUID: {
            type: String,
            trim: true,
        },
        employeeDesignation: {
            type: String,
            trim: true,
        },
        employeeCivilIdOrPassport: {
            type: String,
            trim: true,
        },
        employeeNo: {
            type: String,
            trim: true,
        },
        employeeRigNumber: {
            type: String,
            trim: true,
        },
        employeeEmail: {
            type: String,
            trim: true,
        },
        employeeAvatar: String,
        organizationName: [LocalisedDataSchema],
        trainerName: {
            type: String,
            trim: true,
        },
        trainerSignature: String,
        trainingTitle: [LocalisedDataSchema],
        trainingDescription: [LocalisedDataSchema],
        trainingImages: [{ url: String }],
        trainingCategories: [ObjectId],
        trainingSubCategories: [ObjectId],
        trainingDuration: Number, 
        trainingCertificateValidity: Number, 
        status: String,
        gradeMark: String,
        badge: String,
        certificateNumber: String,
        startDate: Date,
        endDate: Date,
        startedAt: Date,
        completedAt: Date,
        generatedAt: Date,
        expiresAt: Date,
        trainingMode: {
            type: String, 
            uppercase: true,
        },
        mdName: String,
        mdSignature: String,
        approvalInfo: String,
        contactInfo: String,
        isActive: {
            type: Boolean,
            default: true,
        },
        isRenewed: {
            type: Boolean,
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
        version: {
            type: String,
            default: "1.0",
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

trainingCertificateSchema.index({ subscriber: 1, trainingRegistration: 1 });

trainingCertificateSchema.index({ subscriber: 1, training: 1 });

trainingCertificateSchema.index({ subscriber: 1, organization: 1 });

trainingCertificateSchema.index({ subscriber: 1, employee: 1 });

trainingCertificateSchema.index({ createdAt: -1 });

trainingCertificateSchema.plugin(AggregatePaginate);

module.exports.TrainingCertificate = Model("TrainingCertificate", trainingCertificateSchema);
