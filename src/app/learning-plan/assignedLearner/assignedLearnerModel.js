
const { Model, ObjectId } = require("../../../tools");
const mongoose = require('mongoose');
const { Schema } = mongoose;
const learningPlanAssignmentSchema = new Schema(
    {
        learningPlanId: { type: ObjectId, ref: "LearningPlan", required: true },
        assignedLearnerId: { type: ObjectId, ref: "User", required: true },
        isManuallyAdded: { type: Boolean, default: false },
        isDeleted: { type: Boolean, default: false },
        createdBy: {
            type: ObjectId,
            ref: "User",
            required: true,
        },
        updatedBy: {
            type: ObjectId,
            ref: "User",
            required: true,
        },
    },
    { timestamps: true }
);
learningPlanAssignmentSchema.index({ learningPlanId: 1, assignedLearnerId: 1 });

const LearningPlanAssignment = mongoose.model('LearningPlanAssignment', learningPlanAssignmentSchema);

module.exports = LearningPlanAssignment;