const { Schema, Model } = require("../../tools");

const SystemStatsEmailConfigSchema = new Schema({
    subscriber: {
        type: Schema.Types.ObjectId,
        ref: "SaasSubscriber",
        required: true
    },
    to: [{
        type: String,
        trim: true,
        lowercase: true
    }],
    cc: [{
        type: String,
        trim: true,
        lowercase: true
    }],
    type: {
        type: String,
        required: true,
        default: "SYSTEM_STATS",
        trim: true
    },
    updatedBy: {
        type: Schema.Types.ObjectId,
        ref: "User"
    }
}, { timestamps: true });

SystemStatsEmailConfigSchema.index({ subscriber: 1, type: 1 }, { unique: true });

const SystemStatsEmailConfig = Model("SystemStatsEmailConfig", SystemStatsEmailConfigSchema);

module.exports = { SystemStatsEmailConfig };
