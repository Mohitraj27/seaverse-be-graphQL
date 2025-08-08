const { Schema, Model, ObjectId, AggregatePaginate } = require("../../../tools");
const { StringNormalize } = require("../../../util");

const employeeSchema = new Schema(
    {
        UID: String,
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
            index: true,
        },
        empDesignation: {
            type: ObjectId,
            ref: "Designation",
        },
        user: {
            type: ObjectId,
            ref: "User",
            required: true,
        },
        branch: {
            type: ObjectId,
            ref: "Branch",
        },
        organization: {
            type: ObjectId,
            ref: "Organization",
            index: true,
        },
        bloodGroup: {
            type: String,
            trim: true,
        },
        nationality: {
            type: String,
            trim: true,
        },
        department: {
            type: String,
            trim: true,
        },
        designation: {
            type: String,
            trim: true,
            required: true,
        },
        managerObjectId: {
            type: ObjectId,
            ref: "User",
            required: false,
            default: null
        },
        employeeNo: String,
        rigNumber: String,
        dob: Date,
        gender: {
            type: String,
            uppercase: true,
        },
        signature: String,
        externalLinks: {
            linkedin: { type: String, set: StringNormalize },
            twitter: { type: String, set: StringNormalize },
            facebook: { type: String, set: StringNormalize },
            instagram: { type: String, set: StringNormalize },
            coursera: { type: String, set: StringNormalize },
        },
        skills: [String],
        experiences: [
            {
                companyName: String,
                startDate: Date,
                endDateDate: Date,
                isCurrentJob: Boolean,
            },
        ],
        bulkId: {
            type: String,
            default: null
        },
        regType: {
            type: Number,
            default: 1,
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
        customField: [
            {
                type: {
                    type: String,
                    required: true,
                },
                field_name: {
                    type: String,
                    required: true,
                },
                value: {
                    type: String,
                    required: true,
                },

            }
        ]
    },
    { timestamps: true }
);

employeeSchema.virtual("trainingCertificates", {
    ref: "TrainingCertificate",
    localField: "_id",
    foreignField: "employee",
});

employeeSchema.index({ _id: 1, user: 1, empDesignation: 1 });
employeeSchema.index({ createdAt: -1 });
employeeSchema.index({ subscriber: 1 });
employeeSchema.plugin(AggregatePaginate);

// For app signup
const appEmployeeSchema = employeeSchema.clone();

const Employee = Model("Employee", employeeSchema);
const AppEmployee = Model("AppEmployee", appEmployeeSchema);

module.exports = {
    Employee,
    AppEmployee,
}
// module.exports.Employee = Model("Employee", employeeSchema);
