const { Schema, Model, ObjectId } = require("../../../tools");

const ImportLog = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
        },
        uploadedBy: {
            type: ObjectId,
            ref: "User",
            required: true,
        },
        fileName: {
            type: String,
            required: true
        },
        filePath: {
            type: String,
            required: true
        }
    },
    { timestamps: true }
);

module.exports.ImportLog = Model("ImportLog", ImportLog);
