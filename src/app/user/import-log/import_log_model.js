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
        },
        fileName: {
            type: String,
            required: true
        },
        importStatus: {
            type: String,
            required: true,
            enum: ["SUCCESS", "FAILED"]
        },
        usersCount: {
            type: Number,
            default: 0
        },
        description: {
            type: String
        },
        filePath: {
            url: {
                type: String,
                required: true,
            }
        }
    },
    { timestamps: true }
);

module.exports.ImportLog = Model("ImportLog", ImportLog);
