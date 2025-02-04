const { Schema, Model, mongoose, ObjectId } = require("../../../../tools");

const userCourseMap = new Schema(
    {
        user: {
            type: ObjectId,
            ref: "User",
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
    },
    { timestamps: true }
);

module.exports.UserCourseMap = Model("UserCourseMap", userCourseMap);