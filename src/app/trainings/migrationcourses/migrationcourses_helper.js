const { MigrationCourses, UserCourses } = require("./migrationcourses_model");
const {
    TrainingRegistration,
} = require("../../training-registrations/training_registration_model");
const { Training } = require("../training_model");
const {
    OverallTrainingProgress,
} = require("../../training-registrations/overall-course-progress/overall_progress_model");
const { CustomError, ErrorName, AuthUser } = require("../../../util");
const { ConsoleLog, ObjectId } = require("../../../tools");

async function createOrUpdateTrainingMigrationCourses({ input }, context) {
    const { subscriberId } = AuthUser(context);
    try {
        const { trainingId, migrationcourseId } = input;
        const migrationCourse = await MigrationCourses.findById({ _id: migrationcourseId });
        const trainings = await Training.findById({ _id: trainingId });
        if (!trainings || trainings.length === 0) {
            throw CustomError(ErrorName.TRAINING_ID_ALREADY_EXISTS);
        }
        const trainingObject = {
            migrationcoursesId: migrationCourse._id,
            isFromMigration: migrationCourse.isFromMigration,
        };
        trainings.isDeleted = false;
        trainings.subscriber = subscriberId;
        trainings.migrationcoursesId = trainingObject.migrationcoursesId;
        trainings.isFromMigration = trainingObject.isFromMigration;

        const savedTraining = await trainings.save();
        const userCourse = await UserCourses.find({ course: migrationcourseId });
        const userIds = userCourse?.map(user => user.user);
        const userDetails = userCourse?.map(data => ({
            user: data.user,
            pdfUrl: data.pdfUrl,
            certificateNumber: data.certificateNumber,
            createdAt: data.createdAt
        }));
        const newTrainingRegistration = new TrainingRegistration({
            subscriber: subscriberId,
            isActive: true,
            isDeleted: false,
            isFromMigration: true,
            training: savedTraining._id,
            users: userIds,
        });
        const savedTrainingRegistration = await newTrainingRegistration.save();
        const userCourseArray = userDetails.map(item => ({
            user: item.user,
            training: savedTraining._id,
            trainingRegistration: savedTrainingRegistration._id,
            subscriber: subscriberId,
            isComplete: false,
            isCertificateGenerated: false,
            status: "NOT_STARTED",
            isEnrolled: true,
            pdfUrl: item.pdfUrl,
            certificateNumber: item.certificateNumber,
            isFromMigration: true,
            createdAt: item.createdAt
        }));
        const result = await OverallTrainingProgress.insertMany(userCourseArray);

        return {
            migrationCourse,
            savedTraining,
            savedTrainingRegistration,
            result,
        };
    } catch (error) {
        throw CustomError(ErrorName.OVERALLTRAININGPROGRESSES_NOT_REGISTERED, error.message);
    }
}

module.exports = { createOrUpdateTrainingMigrationCourses };
