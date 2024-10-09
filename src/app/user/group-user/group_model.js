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
    groupAdmin: {
        type: ObjectId,
        ref: "User",
        default: null,
    },
    isManagerDefault: {
        type: Boolean,
        default: false,
    },
    memberCount : {
        type: Number,
        default: false,
    },
    isCustomGroup: {
        type: Boolean,
        default: false, 
    },
    isAutoSynced: {
        type: Boolean,
        default: false,  
    },
    members: [{
        type: ObjectId,
        ref: "User"         
    }],
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

module.exports.Group = Model("Group", groupSchema);
