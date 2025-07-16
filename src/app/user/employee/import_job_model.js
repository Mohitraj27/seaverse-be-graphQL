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
        },
        expectedBatches: {
            type: Number,
            default: 0,
        },
        processedBatches: {
            insertedCount: { type: Number, default: 0 },
            updatedCount: { type: Number, default: 0 }
        },
    },
    { timestamps: true }
);

const ImportJob = Model("ImportJob", importJobSchema);
module.exports = { ImportJob };
