const { Schema, Model, ObjectId, AggregatePaginate } = require("../../tools");

const vesselSchema = new Schema(
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
        typeOfVessel: {
            type: ObjectId,
            ref: "VesselType",
        },
        imoNumber: {
            type: String,
            trim: true,
            index: { unique: true, sparse: true },
        },
        companyName: {
            type: String,
        },
        ownerName: {
            type: String,
        },
        address: {
            type: String,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        naVessel: {
            type: Boolean,
            default: false,
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

vesselSchema.index({ _id: 1, subscriber: 1 });
vesselSchema.index({ subscriber: 1, isDeleted: 1 });
vesselSchema.index({ typeOfVessel: 1, isDeleted: 1 });
vesselSchema.index({ _id: 1, name: 1, typeOfVessel: 1 });


vesselSchema.plugin(AggregatePaginate);

module.exports.Vessel = Model("Vessel", vesselSchema);