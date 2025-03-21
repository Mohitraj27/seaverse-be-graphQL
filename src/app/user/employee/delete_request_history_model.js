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
        },
        email: {
            type: String,
            trim: true,
        },
        lastLoginAt: {
            type: Date,
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
        },
        isRegistered:{
            type: Boolean,
        }
    },
    { timestamps: true }
);

const DeleteRequestHistory = Model("DeleteRequestHistory", deleteRequestHistorySchema);
module.exports = { DeleteRequestHistory };
