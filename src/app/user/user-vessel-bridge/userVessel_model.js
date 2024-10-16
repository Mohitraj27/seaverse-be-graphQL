const { Schema, Model, ObjectId, AggregatePaginate } = require("../../../tools");

const userVesselSchema = new Schema(
    {
        user: {
            type: ObjectId,
            ref: "User",
        },
        vessel: {
            type: ObjectId,
            ref: "Vessel",
        },
        vesselType: {
            type: String,
            enum: ["ONBOARDED", "ONSHORE", "ASSIGNED"]
        },
        deletedAt: {
            type: Date,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

const UserVessel = Model("UserVessel", userVesselSchema);

module.exports = {
    UserVessel
};