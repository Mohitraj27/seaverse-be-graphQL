const { Schema, Model } = require("../../../../tools");

const migrationUserSchema = new Schema(
    {
        civilIdOrPassport: {
            type: String,
            required: true,
            unique: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
        },
        firstName: {
            type: String,
            required: true,
        },
        lastName: {
            type: String,
            required: true,
        },
    },
    { timestamps: true }
);

module.exports.MigrationUser = Model("MigrationUser", migrationUserSchema);