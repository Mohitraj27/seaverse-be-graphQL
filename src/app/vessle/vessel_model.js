const { Schema, Model, ObjectId, AggregatePaginate } = require("../../tools");

const StringNormalize = require("../../util/string_helper").stringNormalize;

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
            trim: true,
            set: StringNormalize,
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

vesselSchema.index({ _id: 1, subscriber: 1 });
vesselSchema.index({ subscriber: 1, isDeleted: 1 });

vesselSchema.plugin(AggregatePaginate);

module.exports.Vessel = Model("Vessel", vesselSchema);