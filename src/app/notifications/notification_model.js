const { Schema, Model, ObjectId, AggregatePaginate, Moment } = require("../../tools");
const { LocalisedDataSchema } = require("../../util/localised_data_schema");
const notificationiconEnum = require("./notification_icon.json");
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
        userMessage: [LocalisedDataSchema],
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
        excludedUsers: [
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
                targetRef: String,
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
        isError: Boolean,
        status: {
            type: String,
            default: null
        },
        autoDeleteAt: {
            type: Date,
            default: function () {
                return Moment.utc().add({ months: 6 });
            },
            expires: 60,
        },
        icon: {
            type: String,
            default: "STABLE",
            enum: Object.values(notificationiconEnum),
        }
    },
    { timestamps: true }
);
notificationSchema.index({ subscriber: 1, notificationType: "text" });
notificationSchema.index({ createdAt: -1 });
notificationSchema.plugin(AggregatePaginate);
module.exports.Notification = Model("Notification", notificationSchema);