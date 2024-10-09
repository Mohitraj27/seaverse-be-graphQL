const { Schema, Model, ObjectId } = require("../../../tools");
const { StringNormalize } = require("../../../util");

const userAddressSchema = new Schema(
    {
        user: {
            type: ObjectId,
            ref: "User",
            required: true,
        },
        houseNameOrNumber: {
            type: String,
            set: StringNormalize,
            required: true,
        },
        street: {
            type: String,
            set: StringNormalize,
            required: true,
        },
        country: {
            type: String,
            required: true,
        },
        place: String,
        postalCode: String,
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

module.exports.UserAddress = Model("UserAddress", userAddressSchema);
