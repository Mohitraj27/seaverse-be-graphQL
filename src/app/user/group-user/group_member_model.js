const { Schema, Model, AggregatePaginate, ObjectId } = require("../../../tools");

const groupMemberSchema = new Schema({
    subscriber: {
        type: ObjectId,
        ref: "Subscriber",
        required: true,
        index: true,
    },
    group: {
        type: ObjectId,
        ref: "Group",
    },
    member: {
        type: ObjectId,
        ref: "User",
    },
    groupType: {
        type: String,
        enum: ["GROUP", "MEMBER"],
    },
    groups: [
        {
            typeOfGroup: String,
            groupName: String,
            groupId: ObjectId,
        }
    ],
    isExclude: {
        type: Boolean,
        default: false,
    },
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
    }
}, {
    timestamps: true
});
groupMemberSchema.index({ _id: 1, subscriber: 1 });
groupMemberSchema.plugin(AggregatePaginate);

module.exports.GroupMember = Model("GroupMember", groupMemberSchema);