const mongoose = require("mongoose");
const { Schema } = mongoose;

const reportsEmailOutboxSchema = new Schema(
    {
        from: {
            type: String,
            required: true,
        },
        to: {
            type: [String],
            required: true,
        },
        cc: {
            type: [String],
            default: []
        },
        subject: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: ["IN_PROGRESS", "COMPLETED", "ERROR"],
            default: "IN_PROGRESS",
        },
        filePath: {
            type: String,
        },
        error: {
            type: String,
        },
    },
    { timestamps: true }
);

module.exports.ReportsEmailOutbox = mongoose.model("ReportsEmailOutbox", reportsEmailOutboxSchema);
