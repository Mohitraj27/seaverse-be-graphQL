const { Schema, Model, ObjectId } = require("../../../tools");

const trainingAttendanceSchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
        },
        trainingRegistration: {
            type: ObjectId,
            ref: "TrainingRegistration",
            required: true,
        },
        employee: {
            type: ObjectId,
            ref: "Employee",
        },
        attendances: [
            {
                date: Date,
                status: {
                    type: String,
                    uppercase: true,
                },
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
    },
    { timestamps: true }
);

trainingAttendanceSchema.index({ _id: 1, subscriber: 1, trainingRegistration: 1, employee: 1 });

module.exports.TrainingAttendance = Model("TrainingAttendance", trainingAttendanceSchema);
