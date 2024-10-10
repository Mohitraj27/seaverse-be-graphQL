const { Schema, Model, ObjectId, AggregatePaginate } = require("../../../tools");

const vesselTypeSchema = new Schema(
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
vesselTypeSchema.index({ _id: 1, subscriber: 1 });
vesselTypeSchema.index({ subscriber: 1, isDeleted: 1 });
vesselTypeSchema.plugin(AggregatePaginate);

module.exports.VesselType = Model("VesselType", vesselTypeSchema);