const { Schema, Model, ObjectId, AggregatePaginate } = require("../../../tools");

const learningPlanSchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
        },
        name: {
            type: String,
            required: true,
        },
        assignedTo: {
            type: String,
            required: true,
        },
        allEmployeesInThisOrganization: {
            type: Boolean,
            default: false,
        },
        automaticAssignmentBasedOnCondition: {
            type: Boolean,
            default: false,
        },
        manualSelection: {
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
        },
    },
    { timestamps: true }
);