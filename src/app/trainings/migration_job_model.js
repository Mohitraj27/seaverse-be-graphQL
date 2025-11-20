const { Schema, Model, ObjectId } = require("../../tools");

const migrationJobSchema = new Schema(
    {
        jobId: {
            type: String,
        },
        migrationStatus: {
            type: String,
        },
        batchSize: {
            type: Number,
        },
        totalRecords: {
            type: Number,
        },
        processedCount: {
            type: Number
        },
        processCompleted: {
            type: Boolean,
            default: false,
        },
        training: {
            type: ObjectId,
            ref: "Training"
        }
    },
    { timestamps: true }
);

const MigrationJob = Model("MigrationJob", migrationJobSchema);
module.exports = { MigrationJob };
