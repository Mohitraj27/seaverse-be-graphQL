const { Schema, Model, ObjectId } = require("../../tools");

const learningPlanUsersSchema = new Schema(
    {
        learningPlan: {
            type: ObjectId,
            ref: "LearningPlan",
            required: true,
        },
        user: {
            type: ObjectId,
            ref: "User",
            required: true,
        }
    },
    { timestamps: true }
);

module.exports.LearningPlanUser = Model("LearningPlanUser", learningPlanUsersSchema);