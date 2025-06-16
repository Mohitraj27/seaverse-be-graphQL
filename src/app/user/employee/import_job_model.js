const { Schema, Model, ObjectId } = require("../../../tools");

const importJobSchema = new Schema(
    {
        jobId: {
            type: String,
        },
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
        },
        fileName: {
            type: String,
        },
        filePath: {
            url: { type: String }
        },
        importStatus: {
            type: String,
        },
        totalRecords: {
            type: Number,
        },
        description: {
            type: String
        }
    },
    { timestamps: true }
);

const ImportJob = Model("ImportJob", importJobSchema);
module.exports = { ImportJob };
