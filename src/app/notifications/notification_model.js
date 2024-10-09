const { Schema, Model, ObjectId, AggregatePaginate, Moment } = require("../../tools");
const { LocalisedDataSchema } = require("../../util/localised_data_schema");

const notificationSchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            index: true,
        },
        organization: {
            type: ObjectId,
            ref: "Organization",
        },
        title: [LocalisedDataSchema],
        message: [LocalisedDataSchema],
        notificationType: {
            type: String,
            uppercase: true,
        },
        notifyAdmin: {
            type: Boolean,
            default: true,
        },
        notifiers: [
            {
                type: ObjectId,
                ref: "User",
            },
        ],
        employeeNotifiers: [
            {
                type: ObjectId,
                ref: "Employee",
            },
        ],
        affected: [
            {
                targetRef: String, // model name in pascal case
                target: {
                    type: ObjectId,
                    refPath: "affected.targetRef",
                },
                notes: String,
                miscellaneous: [String],
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
                return Moment.utc().add({ months: 6 });
            },
            /* Remove doc 60 seconds after specified date */
            expires: 60,
        },
    },
    { timestamps: true }
);

notificationSchema.index({ subscriber: 1, notificationType: "text" });

notificationSchema.index({ createdAt: -1 });

notificationSchema.plugin(AggregatePaginate);

module.exports.Notification = Model("Notification", notificationSchema);
