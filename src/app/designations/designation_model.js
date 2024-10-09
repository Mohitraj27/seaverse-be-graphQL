const { Schema, Model, AggregatePaginate, ObjectId } = require("../../tools");
const { LocalisedDataSchema } = require("../../util/localised_data_schema");

const designationSchema = new Schema({
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
    isManager: {
        type: Boolean,
        required: true,
        default: false
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
    }
}, {
    timestamps: true
});

designationSchema.index({ _id: 1, subscriber: 1 });
designationSchema.plugin(AggregatePaginate);
module.exports.Designation = Model("Designation", designationSchema);