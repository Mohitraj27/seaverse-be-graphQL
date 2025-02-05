const { MigrationCourse } = require("./migration_courses_model");
const { UserCourseMap } = require("./userCourseMap/user_course_map_model");
const { TrainingRegistration } = require("../../training-registrations/training_registration_model");
const { Training } = require("../training_model");
const { OverallTrainingProgress } = require("../../training-registrations/overall-course-progress/overall_progress_model");
const { CustomError, ErrorName, AuthUser } = require("../../../util");
const NotificationHelper = require("../../notifications/notification_helper");
const NotificationType = require("../../notifications/notification_type.json");
const notificationiconEnum = require("../../notifications/notification_icon.json");
const { ObjectId } = require("../../../tools");
const { TrainingCertificate } = require("../../training-registrations/training-certificates/training_certificate_model");

async function createOrUpdateTrainingMigrationCourses({ input }, session, context, errors) {
    const { subscriberId, userInfo } = AuthUser(context);
    try {
        const { migrationcoursesId } = input
        const migrationcoursesObjectId = new ObjectId(migrationcoursesId);
        const trainingId = input._id;
        const migrationCourse = await MigrationCourse.findById(migrationcoursesObjectId);
        if (!migrationCourse) {
            errors.push("Migration course not found!");
            return;
        }
        const training = await Training.findById({ _id: trainingId }).session(session);

        training.isDeleted = false;
        training.subscriber = subscriberId;
        training.migrationcoursesId = migrationCourse._id;
        training.isFromMigration = migrationCourse.isFromMigration;
        const savedTrainingData = await training.save({ session });
        
        const userCourse = await UserCourseMap.findOne({ course: migrationcoursesObjectId }).session(session);
        
        const userIds = userCourse?.user;

        const createOrUpdateCertificate = await TrainingCertificate.updateMany(
            {
                user: { $in: userIds },
                migrationTraining: migrationCourse._id,
                training: savedTrainingData._id,
                isFromMigration: { $ne: false },
            },
            {
                $set: {
                    isFromMigration: true,
                    migrationTraining: migrationCourse._id,
                    pdfUrl: userCourse.certificatePdf,
                    certificateNumber: userCourse.certificateId,
                    issuedAt: userCourse.issuedAt
                }
            },
            { upsert: true }
        ).session(session);

        // const newTrainingRegistration = new TrainingRegistration({
        //     subscriber: subscriberId,
        //     isActive: true,
        //     isDeleted: false,
        //     isFromMigration: true,
        //     training: savedTrainingData._id,
        //     users: userIds,
        // });
        // const savedTrainingRegistration = await newTrainingRegistration.save({ session });
        // const userCourseArray = userDetails.map(item => ({
        //     user: item.user,
        //     training: savedTrainingData._id,
        //     trainingRegistration: savedTrainingRegistration._id,
        //     subscriber: subscriberId,
        //     isComplete: false,
        //     isCertificateGenerated: false,
        //     status: "NOT_STARTED",
        //     isEnrolled: true,
        //     pdfUrl: item.pdfUrl,
        //     certificateNumber: item.certificateNumber,
        //     isFromMigration: true,
        //     createdAt: item.createdAt
        // }));
        // const result = await OverallTrainingProgress.insertMany(userCourseArray, { session });
        // await NotificationHelper.createNotificationhelper({
        //     subscriber: subscriberId,
        //     titleValue: `New Course has been enrolled to you`,
        //     messageValue: `You have been assigned to a new Course by ${userInfo.firstName} ${userInfo.lastName}.`,
        //     notificationType: NotificationType.NEW_MIGRATION_COURSE_ENROLLMENT,
        //     notifyAdmin: false,
        //     notifiers: [userIds],
        //     employeeNotifiers: [userIds],
        //     affected: [],
        //     status: 'SENT',
        //     icon: notificationiconEnum.SUCCESS,
        //     createdBy: userInfo,
        //     additionalInfo: [
        //         {
        //             infoType: "VIEW_COURSE",
        //             infoData: {
        //                 filePath: savedTrainingData._id
        //             }
        //         }
        //     ]
        // }, session);
        // await NotificationHelper.createNotificationhelper({
        //     subscriber: subscriberId,
        //     titleValue: `New Course Enrollment`,
        //     messageValue: `A new Course Enrollment has been successfully done by ${userInfo.firstName} ${userInfo.lastName}.`,
        //     notificationType: NotificationType.NEW_MIGRATION_COURSE_ENROLLMENT,
        //     notifyAdmin: true,
        //     notifiers: [],
        //     employeeNotifiers: [],
        //     affected: [],
        //     status: 'SENT',
        //     icon: notificationiconEnum.SUCCESS,
        //     createdBy: userInfo,
        // }, session);
        return {
            migrationCourse,
            savedTrainingData,
            // savedTrainingRegistration,
            // result,
        };
    } catch (error) {
        console.log(error);
        throw CustomError(ErrorName.OVERALLTRAININGPROGRESSES_NOT_REGISTERED, error.message);
    }
}

module.exports = { createOrUpdateTrainingMigrationCourses };
