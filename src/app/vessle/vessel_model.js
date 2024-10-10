const { Schema, Model, ObjectId, AggregatePaginate } = require("../../tools");

const StringNormalize = require("../../util/string_helper").stringNormalize;

const vesselSchema = new Schema(
    {
        Name: {
            type: String,
            trim: true,
            set: StringNormalize,
        },
        typeOfVessel: {
            type: String,
            trim: true,
            set: StringNormalize,
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

vesselSchema.index({ email: "text" });

vesselSchema.plugin(AggregatePaginate);

module.exports.Vessel = Model("Vessel", vesselSchema);