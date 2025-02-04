const { Schema, Model, ObjectId, AggregatePaginate } = require("../../../tools");
const { LocalisedDataSchema } = require("../../../util/localised_data_schema");
const Types  = require('mongoose');

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
        migrationTraining: {
            type: ObjectId,
            ref: "MigrationCourse",
        },
        organization: {
            type: ObjectId,
            ref: "Organization",
        },
        branch: {
            type: ObjectId,
            ref: "Branch",
        },
        user: {
            type: ObjectId,
            ref: "User",
            index: true,
        },
        subscriberLogo: String,
        userName: {
            type: String,
            trim: true,
        },
        userUID: {
            type: String,
            trim: true,
        },
        userDesignation: {
            type: String,
            trim: true,
        },
        userCivilIdOrPassport: {
            type: String,
            trim: true,
        },
        userNo: {
            type: String,
            trim: true,
        },
        userRigNumber: {
            type: String,
            trim: true,
        },
        userEmail: {
            type: String,
            trim: true,
        },
        organizationName: [LocalisedDataSchema],
        issuedBy: {
            type: String,
            trim: true,
        },
        authoringTitle:{
            type: String,
            trim: true,
        },
        trainerName: {
            type: String,
            trim: true,
        },
        title: {
            type: [LocalisedDataSchema],
            required: true,
        },
        certificateReference:[LocalisedDataSchema],
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
        pdfUrl: String,
        isFromMigration:Boolean,
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
        certificateLayout:{
            type : ObjectId,
            ref : "certificateLayout"
        },
        additionalData: [{
            key: { type: String, required: true },
            value: { type: Types.Mixed, required: true }
        }]
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
