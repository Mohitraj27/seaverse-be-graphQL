const { MigrationCourses, UserCourses } = require("./migrationcourses_model");
const {
    TrainingRegistration,
} = require("../../training-registrations/training_registration_model");
const { Training } = require("../training_model");
const {
    OverallTrainingProgress,
} = require("../../training-registrations/overall-course-progress/overall_progress_model");
const { CustomError, ErrorName, AuthUser } = require("../../../util");
const NotificationHelper = require("../../notifications/notification_helper");
const NotificationType = require("../../notifications/notification_type.json");
const notificationiconEnum = require("../../notifications/notification_icon.json");

async function createOrUpdateTrainingMigrationCourses({ input }, context) {
    const { subscriberId, userInfo } = AuthUser(context);
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
        await NotificationHelper.createNotificationhelper({
            subscriber: subscriberId,
            titleValue: `New Course has been enrolled to you`,
            messageValue: `You have been assigned to a new Course by ${userInfo.firstName} ${userInfo.lastName}.`,
            notificationType: NotificationType.NEW_MIGRATION_COURSE_ENROLLMENT,
            notifyAdmin: false,
            notifiers: [userIds],
            employeeNotifiers: [userIds],
            affected: [],
            status: 'SENT',
            icon: notificationiconEnum.SUCCESS,
            createdBy: userInfo,
            additionalInfo: [
                {
                    infoType: "VIEW_COURSE",
                    infoData: {
                        filePath: savedTraining._id
                    }
                }
            ]
        });
        await NotificationHelper.createNotificationhelper({
            subscriber: subscriberId,
            titleValue: `New Course Enrollment`,
            messageValue: `A new Course Enrollment has been successfully done by ${userInfo.firstName} ${userInfo.lastName}.`,
            notificationType: NotificationType.NEW_MIGRATION_COURSE_ENROLLMENT,
            notifyAdmin: true,
            notifiers: [],
            employeeNotifiers: [],
            affected: [],
            status: 'SENT',
            icon: notificationiconEnum.SUCCESS,
            createdBy: userInfo,
        });
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
