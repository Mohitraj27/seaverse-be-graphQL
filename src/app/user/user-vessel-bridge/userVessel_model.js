const { Schema, Model, ObjectId, AggregatePaginate } = require("../../../tools");

const userVesselSchema = new Schema(
    {
        UID: String,
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
        deletedTime: {
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