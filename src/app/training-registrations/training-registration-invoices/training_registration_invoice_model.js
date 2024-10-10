const { Schema, Model, ObjectId, AggregatePaginate } = require("../../../tools");
const { LocalisedDataSchema } = require("../../../util/localised_data_schema");

const { Organization } = require("../../organizations/organization_model");
const { TrainingRegistration } = require("../training_registration_model");
const { Training } = require("../../trainings/training_model");
const { Employee } = require("../../user/employee/employee_model");

const trainingRegistrationInvoiceSchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
        },
        subscriberInfo: {
            name: String,
            logo: String,
            vat: String,
            address: [LocalisedDataSchema],
            phone: String,
            alternatePhone: String,
            email: String,
            website: String,
        },
        organizationDetails: {
            organization: {
                type: ObjectId,
                ref: Organization.modelName,
            },
            organizationName: [LocalisedDataSchema],
            email: String,
            phone: String,
            contactName: String,
        },
        orderItems: [
            {
                training: {
                    type: ObjectId,
                    ref: Training.modelName,
                },
                trainingRegistrationDetailsList: [
                    {
                        trainingRegistration: {
                            type: ObjectId,
                            ref: TrainingRegistration.modelName,
                        },
                        employee: {
                            type: ObjectId,
                            ref: Employee.modelName,
                        },
                    },
                ],
                registeredCount: Number,
                startedCount: Number,
                completedCount: Number,
                isRegisteredCountSelected: Boolean,
                isStartedCountSelected: Boolean,
                isCompletedCountSelected: Boolean,
                trainingTitle: [LocalisedDataSchema],
                trainingPrice: Number,
                unitPrice: Number,
                discount: Number,
                quantity: Number,
            },
        ],

        invoiceNo: String, 
        invoiceDate: Date, 
        buyerOrderNo: String,
        buyerOrderDate: Date,

        deliveryNote: String,
        paymentMode: String, 
        termsOfDelivery: String, 

        currency: {
            type: String,
            uppercase: true,
        },
        invoiceAmount: Number,
        invoiceTaxRate: Number,
        invoiceTaxAmount: Number,
        invoiceTotalAmount: Number,
        invoiceQuantity: Number,
        invoiceReference: String,

        bankDetails: {
            accountName: String,
            bankName: String,
            accountNumber: String,
            branch: String,
            ifsc: String,
        },

        remarks: String,
        status: String,
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

trainingRegistrationInvoiceSchema.index({ _id: 1, subscriber: 1 });

trainingRegistrationInvoiceSchema.index({ createdAt: -1 });

trainingRegistrationInvoiceSchema.plugin(AggregatePaginate);

module.exports.TrainingRegistrationInvoice = Model(
    "TrainingRegistrationInvoice",
    trainingRegistrationInvoiceSchema
);
