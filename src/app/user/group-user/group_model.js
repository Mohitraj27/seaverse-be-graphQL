const { Schema, Model, AggregatePaginate, ObjectId } = require("../../../tools");

const groupSchema = new Schema({
    subscriber: {
        type: ObjectId,
        ref: "Subscriber",
        required: true,
        index: true,
    },
    groupName: {
        type: String,
        required: true,
        trim: true
    },
    description: String,
    isManagerDefault: {
        type: Boolean,
        default: false,
    },
    memberCount : {
        type: Number,
        default: false,
    },
    members: [{
        type: ObjectId,
        ref: "User"         
    }],
    groupType: {
        type: String,
        required: true,
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
groupSchema.index({ _id: 1, subscriber: 1 });
groupSchema.plugin(AggregatePaginate);

const Group = Model("Group", groupSchema);
const DeletedGroup = Model("DeletedGroup", groupSchema);

module.exports = {
    Group,
    DeletedGroup
};
