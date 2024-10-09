const { Schema, Model, ObjectId, AggregatePaginate } = require("../../tools");
const { LocalisedDataSchema } = require("../../util/localised_data_schema");

const batchSchema = new Schema(
    {
        UID: {
            type: String,
            required: true,
        },
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
            index: true,
        },
        organization: {
            type: ObjectId,
            ref: "Organization",
            required: true,
        },
        organizationName: [LocalisedDataSchema],
        training: {
            type: ObjectId,
            ref: "Training",
            required: true,
        },
        trainingTitle: [LocalisedDataSchema],
        trainingDuration: Number, // days
        trainer: {
            type: ObjectId,
            ref: "Employee",
        },
        trainerName: {
            type: String,
            trim: true,
        },
        employees: [
            {
                trainingRegistration: {
                    type: ObjectId,
                    ref: "TrainingRegistration",
                },
                employee: {
                    type: ObjectId,
                    ref: "Employee",
                },
                employeeName: {
                    type: String,
                    trim: true,
                },
                employeeEmail: {
                    type: String,
                    trim: true,
                },
                employeeCivilIdOrPassport: {
                    type: String,
                    trim: true,
                },
                employeeRigNumber: {
                    type: String,
                    trim: true,
                },
                employeeDesignation: {
                    type: String,
                    trim: true,
                },
            },
        ],
        startDate: Date,
        endDate: Date,
        trainingMode: {
            type: String, //ONLINE, OFFLINE
            uppercase: true,
        },
        ///////
        status: {
            type: String, //PENDING, COMPLETED
            default: "PENDING",
            uppercase: true,
        },
        purchaseInfo: {
            status: {
                type: String, //PENDING, COMPLETED
                default: "PENDING",
                uppercase: true,
            },
            markedAt: Date,
        },
        certificateInfo: {
            status: {
                type: String, //PENDING, COMPLETED
                default: "PENDING",
                uppercase: true,
            },
            markedAt: Date,
        },
        invoiceInfo: {
            status: {
                type: String, //PENDING, COMPLETED
                default: "PENDING",
                uppercase: true,
            },
            markedAt: Date,
        },
        paymentInfo: {
            status: {
                type: String, //PENDING, COMPLETED
                default: "PENDING",
                uppercase: true,
            },
            markedAt: Date,
        },
        ///////
        createdBy: {
            type: ObjectId,
            ref: "User",
        },
        updatedBy: {
            type: ObjectId,
            ref: "User",
        },
    },
    { timestamps: true }
);

batchSchema.index({
    subscriber: 1,
    organization: 1,
    training: 1,
    trainer: 1,
    "employees.employee": 1,
});

batchSchema.index({
    subscriber: 1,
    "purchaseInfo.status": 1,
    "certificateInfo.status": 1,
    "invoiceInfo.status": 1,
    "paymentInfo.status": 1,
});

batchSchema.index({ createdAt: -1 });

batchSchema.plugin(AggregatePaginate);

module.exports.Batch = Model("Batch", batchSchema);
