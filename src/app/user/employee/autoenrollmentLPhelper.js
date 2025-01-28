const {
    AuthUser,
    CustomError,
    ErrorName,
} = require("../../../util");
const { ObjectId } = require("../../../tools");

const { Training } = require("../../trainings/training_model");
const {
    TrainingRegistration,
} = require("../../training-registrations/training_registration_model");

const NotificationHelper = require("../../notifications/notification_helper");
const LogHelper = require("../../logs/log_helper");

const NotificationType = require("../../notifications/notification_type.json");
const LogType = require("../../logs/log_type.json");

const { LearningPlan } = require("../../learning-plan/learning_plan_model");
const notificationiconEnum = require("../../notifications/notification_icon.json");
const { OverallTrainingProgress } = require("../../training-registrations/overall-course-progress/overall_progress_model");
require("../../email-template/sendDeleteEmailToLearner")
const {getCustomGroupUsers , getAutoSyncUsers} =require('../../training-registrations/training_registration_helper')
const { SubRole } = require("../../user/sub-roles/sub_role_model");
const Roles = require("../../../util/role.json");
const createTrainingProgressHelperforAutoenrolltoLP = async (users, trainings, subscriberId, latestRegistrationId, learningPlanId,session) => {

    let trainingProgressData;
    try {
        console.log('Lunch done');
        const existingProgressRecords = await OverallTrainingProgress.find({
            training: { $in: trainings.map(training => training._id) },
            user: { $in: users.map(user => user._id) }
        });

        const existingProgressSet = new Set(
            existingProgressRecords.map(record => `${record.training.toString()}-${record.user.toString()}`)
        );

        const newProgressEntries = latestRegistrationId.flatMap(({ _id: registrationId, training }) =>
            users.map(user => {
                const progressKey = `${training.toString()}-${user._id.toString()}`;

                if (existingProgressSet.has(progressKey)) {
                    if (learningPlanId) {
                        return {
                            updateOne: {
                                filter: { training, user: user._id },
                                update: {
                                    $addToSet: { learningPlan: learningPlanId },
                                    $set: { isEnrolled: true },
                                },
                            },
                        };
                    }

                    if (!learningPlanId) {
                        return {
                            updateOne: {
                                filter: { training, user: user._id },
                                update: {
                                    $set: { directEnrollment: true },
                                },
                            },
                        };
                    }

                    return null;
                }

                return {
                    insertOne: {
                        document: {
                            learningPlan: learningPlanId ? [learningPlanId] : [],
                            directEnrollment: learningPlanId ? false : true,
                            training: training,
                            user: user._id,
                            trainingRegistration: registrationId,
                            subscriberId: subscriberId.toString(),
                            status: 'NOT_STARTED',
                            isEnrolled: true,
                            progressPercentage: 0.0,
                            completedModules: 0,
                            contentData: [],
                            totalTrainingModules: 0,
                            startDate: null,
                            endDate: null,
                        },
                    },
                };
            })
        ).filter(entry => entry !== null);

        if (newProgressEntries.length > 0) {
            trainingProgressData = await OverallTrainingProgress.bulkWrite(newProgressEntries, { session });
        }
    } catch (error) {
        console.log(error);
        throw Error(error.message);
    }

    return trainingProgressData;
};



const createTrainingRegistrationhelperforAutoenrolltoLP = async (input, context, session) => {
    const { userInfo, subscriberId } =
        AuthUser(context);

    // if (
    //     !SubRoleHelper.hasPermission({
    //         currentRole: role,
    //         currentPermissions: userPermissions,
    //         requiredPermission: [Permission.CREATE_TRAINING_REGISTRATION],
    //         requiredAll: false,
    //         restrictOrganizationManager: isOrganizationManager,
    //     })
    // ) {
    //     throw CustomError(ErrorName.FORBIDDEN);
    // }

    if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
    try {

        if (!input.groups && !input.users) {
            throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Pass all the required fields!");
        }

        let existingTrainingRegs = [];
        if (input.trainings && input.trainings.length > 0) {
            existingTrainingRegs = await TrainingRegistration.find({ training: { $in: input.trainings } });
        }

        const userIds = [];
        const emails = [];
        let allUsersFetched = [];
        let autoSyncUsers;
        let customGroups;
        let customGroupUsers = [];

        if (input.users && input.users.length > 0) {
            for (const user of input.users) {
                if (ObjectId.isValid(user)) {
                    userIds.push(user);
                } else {
                    emails.push(user);
                }
            }

            const criteria = [];
            if (userIds.length) criteria.push({ _id: { $in: userIds } });
            if (emails.length) criteria.push({ email: { $in: emails } });

            const inputUsers = await User.find({ $or: criteria });

            allUsersFetched = [...allUsersFetched, ...inputUsers];
        }

        if (input.groups && input.groups.length > 0) {

            autoSyncUsers = await getAutoSyncUsers(input.groups);

            customGroups = input.groups.filter(group => group.groupType === 'custom');

            if (customGroups && customGroups.length > 0) {
                customGroupUsers = await getCustomGroupUsers(customGroups);
            }

            allUsersFetched = [...autoSyncUsers, ...customGroupUsers];
        }



        if (input.type === "ENROLL") {

            let users = [];

            users = Array.from(
                new Map(allUsersFetched.map(user => [user._id.toString(), user])).values()
            );

            let userObjectIds = [];
            if (users.length > 0) {
                userObjectIds = users.map(user => user._id);
            }

            if (!input.learningPlan) {

                const alreadyExistInCourse = await OverallTrainingProgress.find({ user: { $in: userObjectIds }, training: { $in: input.trainings }, isEnrolled: false });
                if (alreadyExistInCourse.length > 0) {
                    await OverallTrainingProgress.updateMany(
                        { user: { $in: userObjectIds }, training: { $in: input.trainings }, isEnrolled: false },
                        { $set: { isEnrolled: true, directEnrollment: true } }
                    );
                }
            }


                    const existingTrainingIds = existingTrainingRegs.map(t => t.training.toString());
                    const existingTrainingRegIds = existingTrainingRegs.map(t => t._id);

                    const newTrainingIds = input.trainings.filter(id => !existingTrainingIds.includes(id.toString()));

                    const updateFields = { subscriber: subscriberId, $addToSet: {} };
                    if (userObjectIds && userObjectIds.length > 0) {
                        updateFields.$addToSet.users = { $each: userObjectIds };
                    }

                    if (input.groups && input.groups.length > 0) {
                        updateFields.$addToSet.groups = { $each: input.groups };
                    }

                    let savedTrainingRegistration;
                    let trainingRegistrationIds = [];

                    if (existingTrainingRegs.length > 0) {

                        savedTrainingRegistration = await TrainingRegistration.updateMany(
                            { _id: { $in: existingTrainingRegIds } },
                            updateFields,
                            { session }
                        );

                        const updatedRegistrations = await TrainingRegistration.find({
                            training: { $in: existingTrainingIds }
                        }).session(session);
                        trainingRegistrationIds = updatedRegistrations && updatedRegistrations.map(({ _id, training }) => ({ _id, training }));
                    }

                    const newRegistrations = newTrainingIds.map(trainingId => ({
                        ...updateFields,
                        training: trainingId,
                        users: userObjectIds || [],
                        groups: input.groups || []
                    }));

                    if (newRegistrations.length > 0) {

                        savedTrainingRegistration = await TrainingRegistration.insertMany(newRegistrations, { session });

                        trainingRegistrationIds = savedTrainingRegistration && savedTrainingRegistration.map(({ _id, training }) => ({ _id, training }));
                    }

                    if (savedTrainingRegistration) {

                        let trainingProgressData;

                        let learningPlanId = input.learningPlan ? input.learningPlan._id : null;

                        trainingProgressData = await createTrainingProgressHelperforAutoenrolltoLP(users, input.trainings, subscriberId, trainingRegistrationIds, learningPlanId);

                    }

                    const learningPlan = await LearningPlan.findById(input.learningPlan).select('emailNotification -_id');
                    if (input.learningPlan && learningPlan?.emailNotification === false) {
                        return savedTrainingRegistration;
                    }
                    const trainingsData = await Training.find({ _id: { $in: input.trainings } });
                    const subRoleAdminId = await SubRole.findOne({ name: Roles.ADMIN, primaryRole: Roles.ADMIN }).select("_id");
                    users.forEach(async user => {
                        const isAdmin = user?.subRoles?.includes(subRoleAdminId?._id);
                        const coursesData = await Promise.all(
                            trainingsData.map(async (training) => {
                                const courseImage = await AWS_HELPER.fetchFile(training?.bannerImage?.url) ||
                                    'https://squadra-media-assets.s3.amazonaws.com/public/course-image.png';
                                return {
                                    trainingTitle: training?.title?.[0]?.value || ' ',
                                    durationHours: ((training?.durationHours || 0) / 60).toFixed(1),
                                    courseImage,
                                };
                            })
                        );
                        const emailContent = courseEnrollment({
                            firstName: user.firstName,
                            courses: coursesData,
                            isAdmin: isAdmin
                        });
                        sendEmail({
                            receiverEmail: user.email,
                            subject: "Course Enrollment",
                            htmlContent: emailContent,
                        });
                    });

                    return savedTrainingRegistration;
                }
            const learningPlan = await LearningPlan.findById(input.learningPlan).select('pushNotification -_id');
            if (input.learningPlan && learningPlan?.pushNotification === false) {
                return {
                    message: "Course enrollment successful!",
                };
            }
            for (const userId of userObjectIds) {
                await Promise.all(
                    input.trainings.map(async (trainingId) => {
                        try {
                            await NotificationHelper.createNotificationhelper({
                                subscriber: subscriberId,
                                titleValue: `New Course has been enrolled to you`,
                                messageValue: `You have been assigned to a new Course by ${userInfo.firstName} ${userInfo.lastName}.`,
                                notificationType: NotificationType.NEW_COURSE_ENROLLMENT,
                                notifyAdmin: false,
                                notifiers: [userId],
                                employeeNotifiers: [userId],
                                affected: [],
                                status: 'SENT',
                                icon: notificationiconEnum.SUCCESS,
                                createdBy: userInfo,
                                additionalInfo: [
                                    {
                                        infoType: "VIEW_COURSE",
                                        infoData: {
                                            filePath: trainingId
                                        }
                                    }
                                ]
                            });
                        } catch (error) {
                            throw Error(error.message);
                        }
                    })
                );
            }
            await NotificationHelper.createNotificationhelper({
                subscriber: subscriberId,
                titleValue: `New Course Enrollment`,
                messageValue: `A new Course Enrollment has been successfully done by ${userInfo.firstName} ${userInfo.lastName}.`,
                notificationType: NotificationType.NEW_COURSE_ENROLLMENT,
                notifyAdmin: true,
                notifiers: [],
                employeeNotifiers: [],
                affected: [],
                status: 'SENT',
                icon: notificationiconEnum.SUCCESS,
                createdBy: userInfo,
            });

            LogHelper.logActivity({
                subscriber: subscriberId,
                logType: LogType.TRAINING_REGISTRATION_LOG,
                operation: "CREATE",
                ipInfo: context.ipInfo,
                affected: [
                    {
                        targetRef: "TrainingRegistration",
                        target: savedTrainingRegistration._id,
                    },
                ],
                additionalInfo: [
                    {
                        infoType: "TRAINING_REGISTRATION_INFO",
                        infoData: JSON.stringify(input),
                    },
                ],
                createdBy: userInfo,
            });
            return {
                message: "Course enrollment successful!",
            };

    } catch (error) {
        console.log(error);
        throw CustomError(ErrorName.FAILED, error.message);
    }

}


module.exports = { createTrainingProgressHelperforAutoenrolltoLP,createTrainingRegistrationhelperforAutoenrolltoLP };