const { Schema, Model, ObjectId, Moment, AggregatePaginate } = require("../../tools");
const { LocalisedDataSchema } = require("../../util/localised_data_schema");

const logSchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
        },
        title: [LocalisedDataSchema],
        message: [LocalisedDataSchema],
        logType: {
            type: String,
            uppercase: true,
        },
        operation: {
            type: String,
            uppercase: true,
        },
        ipInfo: JSON,
        affected: [
            {
                targetRef: String, // model name in pascal case
                target: {
                    type: ObjectId,
                    refPath: "affected.targetRef",
                },
                // notes: String,
                // miscellaneous: [String],
            },
        ],
        additionalInfo: [
            {
                infoType: {
                    type: String,
                    uppercase: true,
                },
                infoData: JSON,
            },
        ],
        createdBy: {
            type: ObjectId,
            ref: "User",
        },
        updatedBy: {
            type: ObjectId,
            ref: "User",
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
        autoDeleteAt: {
            type: Date,
            default: function () {
                return Moment.utc().add({ months: 12 });
            },
            /* Remove doc 60 seconds after specified date */
            expires: 60,
        },
        count: {
            type: Number,
            default: 0
        }
    },
    { timestamps: true }
);

logSchema.index({ subscriber: 1, logType: "text" });

logSchema.index({ createdAt: -1 });

logSchema.plugin(AggregatePaginate);

module.exports.Log = Model("Log", logSchema);
