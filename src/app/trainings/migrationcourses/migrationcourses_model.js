const { Schema, Model, mongoose, ObjectId } = require("../../../tools");
const migrationCourseSchema = new Schema(
    {
        _id: {
            type: ObjectId,
            ref: "migrationcourses",
            required: true,
        },
        courseId: {
            type: String,
            ref: "migrationcourses",
            required: true,
        },
        courseName: {
            type: String,
            required: true,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
        isFromMigration:{
            type:Boolean
        }
    },
    { timestamps: true }
);
const usercourseSchema = new Schema({
    _id: {
        type: ObjectId,
        ref: "usercourses",
        required: true,
    },
    user: {
        type: ObjectId,
        ref: "usercourses",
        required: true,
    },
    civilIdOrPassport: {
        type: String,
        required: true,
    },
    pdfUrl: {
        type: ObjectId,
        ref: "usercourses",
        required: true,
    },
    course: {
        type: ObjectId,
        ref: "usercourses",
        required: true,
    },
    certificateNumber: {
        type: String,
        required: true,
    },
    isFromMigration: {
        type: Boolean,
        required: true,
    },
    createdAt:{
        type:String
    }
});

module.exports.UserCourses = Model("UserCourses", usercourseSchema, "usercourses");
module.exports.MigrationCourses = Model(
    "MigrationCourses",
    migrationCourseSchema,
    "migrationcourses"
);
