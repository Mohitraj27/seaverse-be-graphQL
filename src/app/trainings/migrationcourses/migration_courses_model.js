const { Schema, Model, mongoose, ObjectId } = require("../../../tools");
const { LocalisedDataSchema } = require("../../../util/localised_data_schema");

const migrationCourse = new Schema(
    {
        UID: String,
        subscriber: {
            type:  ObjectId,
            ref: "Subscriber",
            required: true,
            index: true,
        },
        title: [LocalisedDataSchema],
        isCertificate: {
            type: Boolean,
            default: false,
        },
        isFromMigration: {
            type: Boolean,
            default: true
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
        deletedDate: Date,
    },
    { timestamps: true }
);

module.exports.MigrationCourse = Model("MigrationCourse", migrationCourse);
