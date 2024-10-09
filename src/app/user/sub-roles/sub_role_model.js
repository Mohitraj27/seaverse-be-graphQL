const { Schema, Model, ObjectId, AggregatePaginate } = require("../../../tools");
const { StringNormalize } = require("../../../util");

const subRoleSchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
            index: true,
        },
        name: {
            type: String,
            uppercase: true,
            set: StringNormalize,
        },
        permissions: [
            {
                type: String,
                uppercase: true,
                set: StringNormalize,
            },
        ],
        isActive: {
            type: Boolean,
            default: true,
        },
        isPredefined: { // Added a predefined field to specify whether the role is predefined
            type: Boolean,
            default: false,
        },
        description: { // Added description field
            type: String,
            default: null,
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

subRoleSchema.index({ _id: 1, subscriber: 1 });

subRoleSchema.plugin(AggregatePaginate);

module.exports.SubRole = Model("SubRole", subRoleSchema);
