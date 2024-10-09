const { Schema, Model, ObjectId, AggregatePaginate } = require("../../tools");
const { LocalisedDataSchema } = require("../../util/localised_data_schema");

const branchSchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
            index: true,
        },
        name: [LocalisedDataSchema],
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

branchSchema.index({ _id: 1, subscriber: 1 });

branchSchema.index({ "name.value": "text" });

branchSchema.plugin(AggregatePaginate);

module.exports.Branch = Model("Branch", branchSchema);
