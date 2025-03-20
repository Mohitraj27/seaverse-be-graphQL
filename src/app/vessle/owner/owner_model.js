const { Schema, Model, ObjectId, AggregatePaginate } = require("../../../tools");

const ownerSchema = new Schema(
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
        address: {
            type: String
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

ownerSchema.index({ _id: 1, subscriber: 1 });
ownerSchema.index({ subscriber: 1, isDeleted: 1 });

ownerSchema.plugin(AggregatePaginate);

module.exports.Owner = Model("Owner", ownerSchema);