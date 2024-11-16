const { Schema, Model, ObjectId, AggregatePaginate } = require("../../../tools");

const companySchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: true
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

companySchema.index({ _id: 1, subscriber: 1 });
companySchema.index({ subscriber: 1, isDeleted: 1 });

companySchema.plugin(AggregatePaginate);

module.exports.Company = Model("Company", companySchema);