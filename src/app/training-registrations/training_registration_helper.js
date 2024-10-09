const { ObjectId } = require("../../tools");
const { AuthUser, Role, CustomError, ErrorName, SendEmail } = require("../../util");

const { TrainingRegistration } = require("./training_registration_model");
const { Employee } = require("../user/employee/employee_model");
const { User } = require("../user/user_model");

const NotificationHelper = require("../notifications/notification_helper");

const NotificationType = require("../notifications/notification_type.json");

module.exports = {
    // findAndSendInvitationLink: async ({ employeesAndTrainers, trainer }) => {
    //     const employeeIds = [];
    //     const managerIds = [];
    //     const trainers = new Set();
    //     employeesAndTrainers.forEach(employeeAndTrainer => {
    //         trainers.add(employeeAndTrainer.trainer);
    //         if (employeeAndTrainer.forWhom === "MANAGER") {
    //             managerIds.push(ObjectId(employeeAndTrainer.employeeOrManger));
    //         } else {
    //             employeeIds.push(ObjectId(employeeAndTrainer.employeeOrManger));
    //         }
    //     });
    //     for (const trainer of trainers) {
    //         //find the trainer from manager collection and manager email from user collection and send email
    //     }
    //     if (employeeIds.length) {
    //         const employeesUserIds = await Employee.find({ _id: { $in: employeeIds } }).distinct(
    //             "user"
    //         );
    //         const employeesMailIds = await User.find({ _id: { $in: employeesUserIds } }).distinct(
    //             "email"
    //         );
    //
    //         for (const email of employeesMailIds) {
    //             const response = await SendEmail({
    //                 receiverEmail: email,
    //                 subject: "Training Registration",
    //                 htmlContent:
    //                     "<h1>Welcome " +
    //                     +'</h1><br><a href="http://localhost:8083/trainingRegistration.html?token=' +
    //                     token +
    //                     '">Click here to confirm</a>',
    //             });
    //             //find the employee select mail and send mail
    //             // const response = await send mail
    //         }
    //     }
    //     if (managerIds.length) {
    //         const managersUserIds = await Manager.find({ _id: { $in: managerIds } }).distinct(
    //             "user"
    //         );
    //         const managersMailIds = await User.find({ _id: { $in: managersUserIds } }).distinct(
    //             "email"
    //         );
    //
    //         for (const email of managersMailIds) {
    //             const response = await SendEmail({
    //                 receiverEmail: email,
    //                 subject: "Training Registration",
    //                 htmlContent:
    //                     "<h1>Welcome " +
    //                     +'</h1><br><a href="http://localhost:8083/trainingRegistration.html?token=' +
    //                     token +
    //                     '">Click here to confirm</a>',
    //             });
    //             //find the manager take select the mailId and sent mail
    //         }
    //     }
    // },
    // sendNotificationOnUpdatingCourseCompletionStatus: async ({ notificationData }) => {
    //     try {
    //         const actor = await User.findOne({ _id: notificationData.createdBy })
    //             .select("firstName lastName")
    //             .lean();
    //
    //         const employeeUser = await Employee.findOne({
    //             _id: notificationData.TrainingRegistration.employee,
    //         })
    //             .select("user")
    //             .populate({
    //                 path: "user",
    //                 select: "firstName lastName",
    //             });
    //
    //         const notification = {
    //             subscriber: notificationData.subscriber,
    //             title: [{ lang: "en", value: `Course status changed` }],
    //             createdBy: notificationData.createdBy,
    //             notifyAdmin: true,
    //             notifiers: [],
    //             employeeNotifiers: [],
    //             affected: [
    //                 {
    //                     targetRef: "TrainingRegistration",
    //                     target: notificationData.TrainingRegistration._id,
    //                 },
    //             ],
    //             additionalInfo: [
    //                 {
    //                     infoType: "ACTOR_NAME",
    //                     infoData: {
    //                         firstName: actor?.firstName,
    //                         lastName: actor?.lastName,
    //                     },
    //                 },
    //                 {
    //                     infoType: "EMPLOYEE_NAME",
    //                     infoData: employeeUser.user.firstName,
    //                 },
    //             ],
    //         };
    //
    //         notificationData.notificationType = NotificationType.TRAINING_COMPLETED;
    //
    //         notification.message = [
    //             {
    //                 lang: "en",
    //                 value: `Admin User "${actor.firstName}" Changed the course status (to completed) for employee ${employeeUser.user.firstName}}`,
    //             },
    //         ];
    //
    //         await NotificationHelper.createNotification(notification);
    //     } catch (e) {
    //         console.log(
    //             "training_registration_helper.sendNotificationOnUpdatingCourseCompletionStatus:exception:",
    //             e?.message
    //         );
    //     }
    // },
    sendNotificationOnCRUD: async notificationData => {
        try {
            const employeeName = notificationData.trainingRegistration.employee?.user?.firstName;

            const notification = {
                subscriber: notificationData.subscriber,
                title: [{ lang: "en", value: `Training registration ${notificationData.action}` }],
                message: [
                    {
                        lang: "en",
                        value: `Admin User "${notificationData.createdBy.firstName}" ${notificationData.action} training registration for "${employeeName}"`,
                    },
                ],
                notificationType:
                    NotificationType["TRAINING_REGISTRATION_" + notificationData.action],
                notifyAdmin: true,
                notifiers: [],
                employeeNotifiers: [],
                affected: [
                    {
                        targetRef: "TrainingRegistration",
                        target: notificationData.trainingRegistration._id,
                    },
                ],
                additionalInfo: [
                    {
                        infoType: "UPDATER_INFO",
                        infoData: {
                            _id: notificationData.createdBy._id,
                            firstName: notificationData.createdBy.firstName,
                            lastName: notificationData.createdBy.lastName,
                        },
                    },
                    {
                        infoType: "EMPLOYEE_INFO",
                        infoData: {
                            _id: notificationData.trainingRegistration.employee?._id,
                            user: {
                                _id: notificationData.trainingRegistration.employee?.user?._id,
                                firstName:
                                    notificationData.trainingRegistration.employee?.user?.firstName,
                                lastName:
                                    notificationData.trainingRegistration.employee?.user?.lastName,
                            },
                        },
                    },
                ],
                createdBy: notificationData.createdBy,
            };

            await NotificationHelper.createNotification(notification);
        } catch (e) {
            console.log(
                "training_registration_helper.sendNotificationOnCRUD:exception:",
                e?.message
            );
        }
    },
};
