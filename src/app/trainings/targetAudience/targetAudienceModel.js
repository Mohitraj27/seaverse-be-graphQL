const { Schema, Model, ObjectId, AggregatePaginate } = require("../../../tools");

const targetAudienceSchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
            index: true,
        },
        userObjectId: [
            {
                type: ObjectId,
                ref: "User",
            },
        ],
        groupUserObjectId: [
            {
                type: ObjectId,
                ref: "Group",
            },
        ],
        courseId: {
            type: ObjectId,
            ref: "Training", 
            required: true,
        },
        createdBy: {
            type: ObjectId,
            ref: "User",
            required: true,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

targetAudienceSchema.index({ _id: 1, subscriber: 1 });
targetAudienceSchema.plugin(AggregatePaginate);

module.exports.TargetAudience = Model("TargetAudience", targetAudienceSchema);

