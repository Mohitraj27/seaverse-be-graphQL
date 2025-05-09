const { Schema, Model, mongoose, ObjectId } = require("../../../../tools");

const userCourseMap = new Schema(
    {
        user: {
            type: ObjectId,
            ref: "MigrationUser",
            required: true
        },
        course: {
            type: ObjectId,
            ref: "MigrationCourse",
            required: true
        },
        certificateId: {
            type: String
        },
        certificatePdf: {
            type: String
        },
        issuedAt: {
            type: Date
        }
    },
    { timestamps: true }
);

userCourseMap.index({ user: 1 });
userCourseMap.index({ course: 1 });

module.exports.UserCourseMap = Model("UserCourseMap", userCourseMap);