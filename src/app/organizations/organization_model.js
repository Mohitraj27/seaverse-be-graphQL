const { Schema, Model, AggregatePaginate, ObjectId } = require("../../tools");
const { LocalisedDataSchema } = require("../../util/localised_data_schema");

const organizationSchema = new Schema(
    {
        UID: String,
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
            index: true,
        },
        name: [LocalisedDataSchema],
        logo: String,
        description: [LocalisedDataSchema],
        email: {
            type: String,
            trim: true,
            index: { unique: true, sparse: true },
        },
        phone: {
            type: String,
            trim: true,
        },
        contactName: {
            type: String,
            trim: true,
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

organizationSchema.virtual("trainingValidities", {
    ref: "TrainingValidity",
    localField: "_id",
    foreignField: "organization",
});

organizationSchema.index({ _id: 1, subscriber: 1 });

organizationSchema.index({ createdAt: -1 });

organizationSchema.plugin(AggregatePaginate);

module.exports.Organization = Model("Organization", organizationSchema);
