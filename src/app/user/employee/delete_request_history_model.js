const { Schema, Model } = require("../../../tools");

const deleteRequestHistorySchema = new Schema(
    {
        firstName: {
            type: String,
            trim: true,
        },
        lastName: {
            type: String,
            trim: true,
        },
        civilIdOrPassport: {
            type: String,
            trim: true,
            index: { unique: true, sparse: true },
        },
        email: {
            type: String,
            trim: true,
            index: { unique: true, sparse: true },
        },
        lastLoginAt: {
            type: Date,
            default: Date.now,
        },
        isDeleted: {
            type: Boolean,
        },
        reasonForDelete: {
            type: String
        },
        directSignup: {
            type: Boolean,
            default: false
        },
        deleteRequestDate: {
            type: Date
        },
        decisionDate: {
            type: Date
        }
    },
    { timestamps: true }
);

const DeleteRequestHistory = Model("DeleteRequestHistory", deleteRequestHistorySchema);
module.exports = { DeleteRequestHistory };
