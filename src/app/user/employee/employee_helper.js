const {
    SendEmail,
    AuthUser,
    CustomError,
    ErrorName,
    DbTransactionHelper,
    Role,
    EmailTemplate,
    VesselStatus,
    dummyPassword,
} = require("../../../util");
const { CryptoHelper, PubSubHelper, Validator, CronHelper, ConsoleLog, ObjectId } = require("../../../tools");

const { Training } = require("../../trainings/training_model");
const { Employee } = require("../../user/employee/employee_model");
const { User, DeletedUser } = require("../../user/user_model");
const { Designation } = require("../../designations/designation_model")
const {
    TrainingRegistration,
} = require("../../training-registrations/training_registration_model");
const { SubscriberProfile } = require("../subscriber-profile/subscriber_profile_model");
const { Batch } = require("../../batches/batch_model");
const { Organization } = require("../../organizations/organization_model");

const NotificationHelper = require("../../notifications/notification_helper");
const SubRoleHelper = require("../sub-roles/sub_role_helper");
const CounterHelper = require("../../counters/counter_helper");
const LogHelper = require("../../logs/log_helper");
const { BatchHelper } = require("../../batches/batch_helper");

const { Group, DeletedGroup } = require("../group-user/group_model");
const { GroupMember } = require("../group-user/group_member_model");

const NotificationType = require("../../notifications/notification_type.json");
const Permission = require("../sub-roles/permission.json");
const LogType = require("../../logs/log_type.json");
const { v4: uuidv4 } = require('uuid')
const UserHelper = require("../user_helper");
const { Vessel } = require("../../vessle/vessel_model");
const { Subscriber } = require("../../saas/subscriber/subscriber_model");
const { parse } = require("json2csv");
const { parse: csvParse } = require("csv-parse");
const { ImportLog } = require("../import-log/import_log_model");
const { UserVessel } = require("../user-vessel-bridge/userVessel_model");
const { Notification } = require("../../notifications/notification_model");
const NotificationEvent = require("../../notifications/notification_event.json");
const { generateRandomString } = require("../user-profile/user_profile_helper");
const { LearningPlan } = require("../../learning-plan/learning_plan_model");
const notificationiconEnum = require("../../notifications/notification_icon.json");
const { sendNotifications } = require("../../../util/firebase_helper");
const { VesselStatus: vesselStatusEnum } = require("../../../util");
const { OverallTrainingProgress } = require("../../training-registrations/overall-course-progress/overall_progress_model");
const { sendDeleteEmailToLearner } = require("../../email-template/sendDeleteEmailToLearner")
const targetAudience = require('../../learning-plan/enumFields/targetAudienceEnum.json');
const audienceSelection = require('../../learning-plan/enumFields/audienceSelectionEnum.json');
const { TrainingModuleContent } = require("../../trainings/training_modules/training_module_contents/training_module_content_model");
const { TrainingModule } = require('../../trainings/training_modules/training_module_model');
const mongoose = require('mongoose');
const LearningPlanAssignment = require("../../learning-plan/assignedLearner/assignedLearnerModel");
const { clear } = require("geoip-lite");
const { TrainingProgress } = require('../../training-registrations/training-progress/training_progress_model');
const { fetchDeletionBatch,deleteDeletionBatch,insertDeletionRequests } = require("../../../util/sqlite_email_helper");


const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const sendCredentialMail = async ({ userData }) => {
    let subscriberLogo = null;
    let subscriberDetails = {};
    const subscriberName = process.env.SUBSCRIBER_NAME_LONG;

    if (userData?.subscriber?._id) {
        let subscriberData = await SubscriberProfile.findOne({
            subscriber: userData.subscriber._id,
        })
            .lean()
            .populate("user");
        subscriberLogo = subscriberData?.user?.avatar;
        subscriberDetails.name = `${subscriberData?.user?.firstName ?? ""} ${subscriberData?.user?.lastName ?? ""
            }`;
    }

    let html =
        `<img src='https://i.imgur.com/akEHRhI.png' style='height: 230px'>
    <div style='font-weight: 700;font-size: 20px;font-family: sans-serif;color: #281166;'>Welcome ${userData.firstName} !</div>
    <hr style=" border-top: 2px solid #bbb;width: 45px;margin-top: 20px"> 
    <div style="font-weight: 400;font-size: 12px;font-family: sans-serif;color: #281166;margin: 20px;">Welcome to ${subscriberName}.
        Get ready for a great career journey with our Learning Management System</div>
        <a href="` +
        process.env.EMPLOYEE_DOMAIN_URL + `">Click here to login</a>
        <p>Email : `+ userData.email + `</p>
        <p>Password : `+ process.env.USER_DUMMY_PASSWORD + `</p>
    `;
    return await SendEmail({
        receiverEmail: userData.email,
        subject: "Registration Invitation",
        htmlContent: EmailTemplate.emailTemplate(subscriberLogo, subscriberDetails, html),
    });
};



const evaluateConditionalCustomFields = (conditionType, conditionalCustomFields, conditions) => {
    const { designationID, vesselID, vesselTypeID, currentStatus, email } = conditions;
    const matches = conditionalCustomFields.map((field) => {
        const { type_of_Field, valueOfField, isOrIsNot, groupIDs } = field;

        switch (type_of_Field) {
            case "DESIGNATION":
                if (designationID === null || designationID === undefined) {
                    return true;
                }
                return isOrIsNot === "IS"
                    ? valueOfField.includes(designationID)
                    : !valueOfField.includes(designationID);

            case "VESSEL":
                if (vesselID === null || vesselID === undefined) {
                    return true;
                }
                return isOrIsNot === "IS"
                    ? valueOfField.includes(vesselID)
                    : !valueOfField.includes(vesselID);

            case "VESSEL_TYPE":
                if (vesselTypeID === null || vesselTypeID === undefined) {
                    return true;
                }
                return isOrIsNot === "IS"
                    ? valueOfField.includes(vesselTypeID)
                    : !valueOfField.includes(vesselTypeID);

            case "CURRENT_STATUS":
                if (currentStatus === null || currentStatus === undefined) {
                    return true;
                }
                return isOrIsNot === "IS"
                    ? valueOfField.includes(currentStatus)
                    : !valueOfField.includes(currentStatus);

            case "EMAIL":
                return isOrIsNot === "IS"
                    ? valueOfField.includes(email)
                    : !valueOfField.includes(email);

            case "GROUP":
                return groupIDs?.some((group) => {
                    switch (group.groupType) {
                        case "designation":
                            return String(group.groupIDs?.[0]) === String(designationID);
                        case "vessel":
                            return String(group.groupIDs?.[0]) === String(vesselID);
                        case "vesselType":
                            return String(group.groupIDs?.[0]) === String(vesselTypeID);
                        case "vesselStatus":
                            return String(group.groupIDs?.[0]) === String(currentStatus);
                        default:
                            return false;
                    }
                });
            default:
                return false;
        }
    });

    if (conditionType === "MATCH_ANY_CONDITION") {
        const res = matches.some((match) => match === true);
        return res;
    }

    if (conditionType === "MATCH_ALL_CONDITION") {
        const resp = matches.every((match) => match === true);
        return resp;
    }

    return false;
};

const createEnrollmentObject = (userId, trainingId, enrollData, trainingRegistrationIds, trainingModuleCounts, isCertificatePresent, currentCertificateLayout) => ({
    isComplete: false,
    isCertificateGenerated: false,
    learningPlan: enrollData.learningPlan ? [enrollData.learningPlan] : [],
    training: trainingId,
    user: userId,
    trainingRegistration: trainingRegistrationIds[0],
    status: "NOT_STARTED",
    isEnrolled: true,
    progressPercentage: 0,
    completedModules: 0,
    totalTrainingModules: trainingModuleCounts || 0,
    isCertificatePresent: isCertificatePresent ?? false,
    currentCertificateLayout: currentCertificateLayout ?? null
});

async function enrollUsers(enrollDataArray) {
    try {
        const allUserIds = [];
        const allTrainingIds = [];

        for (const enrollData of enrollDataArray) {
            const userIds = Array.isArray(enrollData.users) ? enrollData.users : [enrollData.users];
            const trainingIds = Array.isArray(enrollData.trainings) ? enrollData.trainings : [enrollData.trainings];

            allUserIds.push(...userIds);
            allTrainingIds.push(...trainingIds);
        }

        const userObjectIds = [...new Set(allUserIds)].map(id => new mongoose.Types.ObjectId(id));
        const trainingObjectIds = [...new Set(allTrainingIds)].map(id => new mongoose.Types.ObjectId(id));

        const trainingRegistrations = await TrainingRegistration.find({ training: { $in: trainingObjectIds } });

        if (!trainingRegistrations || trainingRegistrations.length === 0) {
            throw new Error("No training registration found for the provided training IDs.");
        }

        const trainingRegistrationIds = trainingRegistrations.map(tr => tr._id);
        const trainingModuleCounts = await TrainingModule.find({ training: { $in: trainingObjectIds } }).countDocuments();

        const existingEnrollments = await OverallTrainingProgress.find({
            user: { $in: userObjectIds },
            training: { $in: trainingObjectIds }
        });

        const existingEnrollmentMap = new Map(
            existingEnrollments.map(enrollment =>
                [`${enrollment.user}-${enrollment.training}`, enrollment]
            )
        );

        const bulkOps = [];
        const insertedEnrollments = [];

        const trainings = [...new Set(enrollDataArray.flatMap(el => el.trainings))];

        const trainingData = await Training.find({ _id: { $in: trainings.map(training => training._id) } }).select('_id isCertificate currentCertificateLayout').lean();

        const trainingDataById = trainingData.reduce((acc, training) => {
            acc[training._id.toString()] = training;
            return acc;
        }, {});

        for (const enrollData of enrollDataArray) {
            const userIds = Array.isArray(enrollData.users) ? enrollData.users : [enrollData.users];
            const trainingIds = Array.isArray(enrollData.trainings) ? enrollData.trainings : [enrollData.trainings];

            for (const userId of userIds) {
                for (const trainingId of trainingIds) {
                    const key = `${userId}-${trainingId}`;
                    const existingEnrollment = existingEnrollmentMap.get(key);

                    if (existingEnrollment) {
                        bulkOps.push({
                            updateOne: {
                                filter: { _id: existingEnrollment._id },
                                update: {
                                    $addToSet: { learningPlan: enrollData.learningPlan }
                                }
                            }
                        });
                    } else {
                        const newEnrollment = createEnrollmentObject(
                            userId,
                            trainingId,
                            enrollData,
                            trainingRegistrationIds,
                            trainingModuleCounts,
                            trainingDataById[trainingId?.toString()]?.isCertificate ?? false,
                            trainingDataById[trainingId?.toString()]?.currentCertificateLayout,
                        );
                        insertedEnrollments.push(newEnrollment);
                    }
                }
            }
        }

        let allEnrollments = [];
        if (insertedEnrollments.length > 0) {
            const insertedDocs = await OverallTrainingProgress.insertMany(
                insertedEnrollments,
                { ordered: false }
            );
            allEnrollments.push(...insertedDocs);
        }

        if (bulkOps.length > 0) {
            await OverallTrainingProgress.bulkWrite(bulkOps);
        }

        const duplicates = await OverallTrainingProgress.aggregate([
            {
                $match: {
                    user: { $in: userObjectIds },
                    training: { $in: trainingObjectIds }
                }
            },
            {
                $group: {
                    _id: {
                        user: "$user",
                        training: "$training"
                    },
                    entries: {
                        $push: {
                            _id: "$_id",
                            learningPlan: "$learningPlan",
                            createdAt: "$createdAt"
                        }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $match: {
                    count: { $gt: 1 }
                }
            }
        ]);

        if (duplicates.length > 0) {
            const mergeBulkOps = [];

            for (const dup of duplicates) {

                const sortedEntries = dup.entries.sort((a, b) => a.createdAt - b.createdAt);
                const oldestEntry = sortedEntries[0];

                const combinedLearningPlans = [...new Set(
                    sortedEntries.flatMap(entry => entry.learningPlan)
                        .map(id => id.toString())
                )].map(id => new mongoose.Types.ObjectId(id));

                mergeBulkOps.push({
                    updateOne: {
                        filter: { _id: oldestEntry._id },
                        update: {
                            $set: { learningPlan: combinedLearningPlans }
                        }
                    }
                });

                const idsToDelete = sortedEntries.slice(1).map(entry => entry._id);
                if (idsToDelete.length > 0) {
                    mergeBulkOps.push({
                        deleteMany: {
                            filter: { _id: { $in: idsToDelete } }
                        }
                    });
                }
            }

            if (mergeBulkOps.length > 0) {
                await OverallTrainingProgress.bulkWrite(mergeBulkOps);
                console.log(`Merged ${duplicates.length} sets of duplicate entries after enrollment`);
            }
        }

        const finalEnrollments = await OverallTrainingProgress.find({
            user: { $in: userObjectIds },
            training: { $in: trainingObjectIds }
        });

        return finalEnrollments;
    } catch (error) {
        throw CustomError(ErrorName.FAILED, error.message);
    }
}


const filterLearningPlans = async (learningPlans, userConditions, context, session) => {

    if (!Array.isArray(learningPlans)) {
        throw new Error("learningPlans should be an array");
    }
    if (!Array.isArray(userConditions)) {
        throw new Error("userConditions should be an array");
    }

    const filteredPlans = await Promise.allSettled(
        learningPlans.map(async (plan) => {
            const usersToEnroll = [];

            if (plan?.targetAudience === targetAudience.EVERYONE_IN_ORGANIZATION && plan?.audienceSelection === audienceSelection.ALL_EMPLOYEES) {
                const userIds = userConditions.map(user => user._id);
                // await LearningPlan.updateMany(
                //     { _id: plan._id },
                //     [
                //         { $set: { assignedLearnerIDs: { $ifNull: ["$assignedLearnerIDs", []] } } },
                //         { $set: { assignedLearnerIDs: { $concatArrays: ["$assignedLearnerIDs", userIds] } } }
                //     ]
                // );
                const assignments = userIds.map(userId => ({
                    learningPlanId: plan._id,
                    assignedLearnerId: userId,
                    isMannuallyAdded: false,
                    createdBy: context.user.userId,
                    updatedBy: context.user.userId
                }));

                if (assignments?.length) {
                    const dataenrolled = await LearningPlanAssignment.insertMany(assignments, { ordered: false });
                }

                usersToEnroll.push(...userIds);
            } else if (plan?.targetAudience === targetAudience.EVERYONE_IN_ORGANIZATION && plan?.audienceSelection === audienceSelection.AUTOMATIC) {
                const validUsers = userConditions.filter(user =>
                    evaluateConditionalCustomFields(plan.conditionType, plan.conditionalCustomFields, user)
                );
                const validUserIds = new Set(validUsers.map(user => user._id));

                const usersToRemove = userConditions
                    .filter(user => !validUserIds.has(user._id))
                    .map(user => user._id);

                const userIds = validUsers.map(user => user._id);

                if (validUsers?.length > 0) {

                    const existingAssignments = await LearningPlanAssignment.find({
                        learningPlanId: plan._id,
                        assignedLearnerId: { $in: userIds },
                        isDeleted: { $ne: true }
                    }, { assignedLearnerId: 1 });

                    const alreadyAssignedUserIds = new Set(existingAssignments.map(assignment => assignment.assignedLearnerId.toString()));

                    const newAssignments = userIds
                        .filter(userId => !alreadyAssignedUserIds.has(userId.toString()))
                        .map(userId => ({
                            learningPlanId: plan._id,
                            assignedLearnerId: userId,
                            isMannuallyAdded: false,
                            createdBy: context.user.userId,
                            updatedBy: context.user.userId,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        }));

                    if (newAssignments.length > 0) {
                        const dataEnrolled = await LearningPlanAssignment.insertMany(newAssignments, { ordered: false });
                    }

                    // const assignments = userIds.map(userId => ({
                    //     learningPlanId: plan._id,
                    //     assignedLearnerId: userId,
                    //     isMannuallyAdded: false,
                    //     createdBy: context.user.userId,
                    //     updatedBy: context.user.userId
                    // }));

                    // if (assignments?.length) {
                    //     const dataenrolled = await LearningPlanAssignment.insertMany(assignments, { ordered: false });
                    // }
                    usersToEnroll.push(...userIds);
                }

                if (usersToRemove.length > 0) {

                    await OverallTrainingProgress.updateMany(
                        {
                            learningPlan: plan._id,
                            user: { $in: usersToRemove }
                        },
                        {
                            $pull: { learningPlan: plan._id }
                        }
                    );
                    const deleteResult = await LearningPlanAssignment.deleteMany({
                        learningPlanId: plan._id,
                        assignedLearnerId: { $in: usersToRemove }
                    });

                }
            }
            if (usersToEnroll.length > 0) {
                const enrollData = {
                    trainings: plan.selectCourses,
                    users: usersToEnroll,
                    type: "ENROLL",
                    learningPlan: plan._id,
                    session
                };
                await enrollUsers([enrollData]);
                return true;
            }
            return false;
        })
    );
    return filteredPlans.filter(Boolean);
}
const sendInvitationMail = async ({ userData, token, emailOrCivilIdOrPassport }) => {
    let subscriberLogo = null;
    let subscriberDetails = {};
    const subscriberName = process.env.SUBSCRIBER_NAME_LONG;

    if (userData?.subscriber?._id) {
        let subscriberData = await SubscriberProfile.findOne({
            subscriber: userData.subscriber._id,
        })
            .lean()
            .populate("user");
        subscriberLogo = subscriberData?.user?.avatar;
        subscriberDetails.name = `${subscriberData?.user?.firstName ?? ""} ${subscriberData?.user?.lastName ?? ""
            }`;
    }

    let html =
        `<img src='https://i.imgur.com/akEHRhI.png' style='height: 230px'>
    <div style='font-weight: 700;font-size: 20px;font-family: sans-serif;color: #281166;'>Welcome ${userData.firstName} !</div>
    <hr style=" border-top: 2px solid #bbb;width: 45px;margin-top: 20px"> 
    <div style="font-weight: 400;font-size: 12px;font-family: sans-serif;color: #281166;margin: 20px;">Welcome to ${subscriberName}.
        Get ready for a great career journey with our Learning Management System</div>
        <a href="` +
        process.env.EMPLOYEE_DOMAIN_URL +
        `en/sign-up/` +
        emailOrCivilIdOrPassport +
        "/" +
        token +
        `"><button type="button" style="border: none;border-radius: 5px;background-color: #5928E5;color: white;width: 140px;padding: 8px;margin-bottom: 60px;">Click to continue</button></a>
    `;
    return await SendEmail({
        receiverEmail: userData.email ? userData.email : userData.companyEmail,
        subject: "Registration Invitation",
        htmlContent: EmailTemplate.emailTemplate(subscriberLogo, subscriberDetails, html),
    });
};

const sendCourseInvitationMail = async ({ userData, trainingRegistrationId }) => {
    let subscriberLogo = null;
    let subscriberDetails = {};
    const subscriberName = process.env.SUBSCRIBER_NAME_LONG;

    if (userData?.subscriber?._id) {
        let subscriberData = await SubscriberProfile.findOne({
            subscriber: userData.subscriber._id,
        })
            .lean()
            .populate("user");
        subscriberLogo = subscriberData?.user?.avatar;
        subscriberDetails.name = `${subscriberData?.user?.firstName ?? ""} ${subscriberData?.user?.lastName ?? ""
            }`;
    }

    let html =
        `<img src='https://i.imgur.com/akEHRhI.png' style='height: 230px'>
        <div style='font-weight: 700;font-size: 20px;font-family: sans-serif;color: #281166;'>Hello ${userData.firstName} !</div>
        <hr style=" border-top: 2px solid #bbb;width: 45px;margin-top: 20px"> 
        <div style="font-weight: 400;font-size: 12px;font-family: sans-serif;color: #281166;margin: 20px;">Welcome to ${subscriberName}.
            A new course is ready for you.</div>
            <a href="` +
        process.env.EMPLOYEE_DOMAIN_URL +
        `en/course-details/` +
        trainingRegistrationId +
        `"><button type="button" style="border: none;border-radius: 5px;background-color: #5928E5;color: white;width: 140px;padding: 8px;margin-bottom: 60px;">Click to continue</button></a>
        `;
    return await SendEmail({
        receiverEmail: userData.email,
        subject: "Course Invitation",
        htmlContent: EmailTemplate.emailTemplate(subscriberLogo, subscriberDetails, html),
    });
};
const sendDeleteNotification = async (notificationsData) => {
    if (notificationsData?.length) {
        const notifications = [];

        for (const notificationData of notificationsData) {
            const employeeName = `${notificationData.deletedEmployee?.user?.firstName} ${notificationData.deletedEmployee?.user?.lastName}`;
            const employeeEmail = notificationData.deletedEmployee?.user?.email;

            const notification = {
                subscriber: notificationData.subscriber,
                title: [{ lang: "en", value: `Employee Deleted` }],
                message: [
                    {
                        lang: "en",
                        value: `Employee "${employeeName}" (${employeeEmail}) has been deleted by ${notificationData.createdBy.firstName}.`,
                    },
                ],
                notificationType: NotificationType.EMPLOYEE_DELETED,
                notifyAdmin: true,
                notifiers: [],
                employeeNotifiers: [],
                affected: [
                    {
                        targetRef: "Employee",
                        target: notificationData.deletedEmployee._id,
                    },
                ],
                additionalInfo: [
                    {
                        infoType: "DELETED_EMPLOYEE_INFO",
                        infoData: {
                            _id: notificationData.deletedEmployee._id,
                            name: employeeName,
                            email: employeeEmail,
                        },
                    },
                    {
                        infoType: "DELETER_INFO",
                        infoData: {
                            _id: notificationData.createdBy._id,
                            firstName: notificationData.createdBy.firstName,
                            lastName: notificationData.createdBy.lastName,
                        },
                    },
                ],
                icon: notificationiconEnum.STABLE,
                createdBy: notificationData.createdBy,
            };
            notifications.push(notification);
        }
        await NotificationHelper.createNotification(notifications);
    }
};
const notifyEmployeeStatusChange = async (notificationsData) => {
    if (notificationsData?.length) {
        const notifications = [];
        for (const notificationData of notificationsData) {
            const employeeName = `${notificationData.employee?.user?.firstName} ${notificationData.employee?.user?.lastName ?? ""}`.trim();
            const employeeEmail = notificationData.employee?.user?.email;

            const notification = {
                subscriber: notificationData.subscriber,
                title: [{ lang: "en", value: `Employee Status Updated` }],
                message: [
                    {
                        lang: "en",
                        value: `Employee "${employeeName}" (${employeeEmail}) has been successfully marked as ${notificationData.type} by ${notificationData.updatedBy.firstName}.`,
                    },
                ],
                notificationType: NotificationType.EMPLOYEE_STATUS_UPDATED,
                notifyAdmin: true,
                notifiers: [],
                employeeNotifiers: [],
                affected: [
                    {
                        targetRef: "Employee",
                        target: notificationData.employee._id,
                    },
                ],
                status: "SENT",
                icon: notificationiconEnum.SUCCESS,
                createdBy: notificationData.updatedBy,
            };
            notifications.push(notification);
        }
        await NotificationHelper.createNotification(notifications);
    }
};


const sendEnrollmentNotification = async notificationsData => {
    if (notificationsData?.length) {
        const notifications = [];

        const training = await Training.findById(notificationsData[0].trainingRegistration.training)
            .select("title")
            .lean();

        const trainingTitle = training?.title.find(x => x.lang === "en" || x.lang === "ar")?.value;

        for (const notificationData of notificationsData) {
            const notification = {
                subscriber: notificationData.subscriber,
                title: [{ lang: "en", value: `Learner ${notificationData.action}` }],
                message: [
                    {
                        lang: "en",
                        value: `${notificationData.userIds.length} users are ${notificationData.action} to the course "${trainingTitle}" by ${notificationData.createdBy.firstName}`,
                    },
                ],
                userMessage: [
                    {
                        lang: "en",
                        value: `You have been ${notificationData.action} to the course "${trainingTitle}" by ${notificationData.createdBy.firstName}`,
                    },
                ],
                notificationType: `TRAINING_NEW_${notificationData.action}`,
                notifyAdmin: true,
                notifiers: notificationData.userIds ? notificationData.userIds : [],
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
                    {
                        infoType: "TRAINING_INFO",
                        infoData: {
                            _id: training?._id,
                            title: training?.title,
                        },
                    },
                ],
                icon: notificationiconEnum.STABLE,
                createdBy: notificationData.createdBy,
            };

            notifications.push(notification);
        }

        await NotificationHelper.createNotification(notifications);
    }
};
const sendNotificationOnBULK = async notificationData => {

    try {

        const notification = {
            subscriber: notificationData.subscriber,
            title: [{ lang: "en", value: `${notificationData.action}` }],
            notifyAdmin: true,
            notifiers: [],
            employeeNotifiers: [],
            createdBy: notificationData.adminUser?._id,
            employee: notificationData.adminUser?._id,
            description: notificationData.description,
            isError: notificationData.isError,
            notificationType: notificationData.notificationType,
            status: notificationData.status,
            icon: notificationData.icon
        };

        notification.message = {
            lang: "en",
            value: notificationData.description,
        };

        const createdNotification = await Notification.create(notification);

        process.send({
            type: 'NOTIFICATION',
            event: NotificationEvent.ON_NOTIFICATION,
            data: { onNotification: createdNotification }
        });

    } catch (error) {
        throw Error(error.message);
    }

}
const sendNotificationOnBULKOutsideChildProcess = async notificationData => {
    try {

        const notification = {
            subscriber: notificationData.subscriber,
            title: [{ lang: "en", value: `${notificationData.action}` }],
            notifyAdmin: true,
            notifiers: [],
            employeeNotifiers: [],
            createdBy: notificationData.createdBy,
            employee: notificationData.createdBy,
            description: notificationData.description,
            isError: notificationData.isError,
            notificationType: notificationData.notificationType,
            status: notificationData.status
        };

        notification.message = {
            lang: "en",
            value: notificationData.description,
        };

        const createdNotification = await Notification.create(notification);

        if (createdNotification) await PubSubHelper.publish(NotificationEvent.ON_NOTIFICATION, createdNotification);

    } catch (error) {
        throw Error(error.message);
    }
}
const sendNotificationOnCRUD = async notificationData => {
    try {
        const employeeName = notificationData.employee.user?.firstName;

        const notification = {
            subscriber: notificationData.subscriber,
            title: [{ lang: "en", value: `Employee ${notificationData.action}` }],
            notifyAdmin: true,
            notifiers: [],
            employeeNotifiers: [],
            affected: [
                {
                    targetRef: "Employee",
                    target: notificationData.employee._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "EMPLOYEE_INFO",
                    infoData: {
                        _id: notificationData.employee._id,
                        user: {
                            _id: notificationData.employee.user._id,
                            firstName: notificationData.employee.user.firstName,
                            lastName: notificationData.employee.user.lastName,
                        },
                    },
                },
            ],
            createdBy: notificationData.createdBy,
        };

        notification.notificationType = NotificationType["EMPLOYEE_" + notificationData.action];

        if (
            notificationData.employee.user._id.toString() ===
            notificationData.createdBy._id.toString()
        ) {
            notification.message = {
                lang: "en",
                value: `Employee "${employeeName}" has updated his profile`,
            };
        } else {
            notification.additionalInfo.push({
                infoType: "UPDATER_INFO",
                infoData: {
                    _id: notificationData.createdBy._id,
                    firstName: notificationData.createdBy.firstName,
                    lastName: notificationData.createdBy.lastName,
                },
            });

            notification.message = [
                {
                    lang: "en",
                    value: `Admin User "${notificationData.createdBy.firstName}" ${notificationData.action} employee "${employeeName}"`,
                },
            ];
        }

        await NotificationHelper.createNotification(notification);
    } catch (e) {
        throw Error(e?.message);
    }
};

const generateEmployeeUID = async ({ subscriberId, session }) => {
    const savedCounter = await CounterHelper.updateCounter({
        subscriberId,
        modelName: Employee.modelName,
        session,
    });

    if (!savedCounter) throw CustomError(ErrorName.FAILED);
    return `EMP-${savedCounter.count}`;
};

const generateUserUID = async ({ session }) => {
    const savedCounter = await CounterHelper.updateCounter({
        modelName: User.modelName,
        session,
    });

    if (!savedCounter) throw CustomError(ErrorName.FAILED);

    return `USER-${savedCounter.count}`;
};

const generateDefaultGroup = async ({ user, subscriberId }) => {
    try {
        const groupFilterConditions = { subscriber: subscriberId, isDeleted: false, isManagerDefault: true, groupAdmin: user._id };
        const groupUpdateData = { groupName: user.firstName + "'s Group" }

        let savedGroupName = await Group.findOne(groupFilterConditions).lean();

        if (savedGroupName) {

            return savedGroupName._id;
        } else {

            const newGroup = await new Group({
                ...groupFilterConditions,
                ...groupUpdateData,
                createdBy: user._id,
                updatedBy: user._id,
            }).save();

            return newGroup;
        }
    } catch (error) {

        return false;
    }
};

const insertGroupMember = async ({ group, subscriberId, memberIDs }) => {
    try {

        const existingMembers = await GroupMember.find({
            group: group,
            member: { $in: memberIDs },
            isDeleted: { $ne: true },
        }).select('member');

        const existingMemberIds = existingMembers.map((member) => member.member.toString());
        const existingMemberIdsSet = new Set(existingMemberIds);

        const newMembers = memberIDs.filter(userID => !existingMemberIdsSet.has(userID.toString()));


        const groupMembers = newMembers.map((userID) => ({
            group: group,
            member: userID,
            subscriber: subscriberId
        }));


        const result = await GroupMember.insertMany(groupMembers);
        await Group.findByIdAndUpdate(group, { $inc: { memberCount: result.length } });

        return true;
    } catch (error) {
        return false;
    }
}

const bulkInsertGroupMembers = async (subscriberId, groupId, users) => {
    try {
        const groupMembers = users.map(user => ({
            subscriber: subscriberId,
            group: groupId,
            member: user._id,
        }));

        const result = await GroupMember.insertMany(groupMembers, { ordered: false });
        return true;
    } catch (error) {
        return false;
    }
};

const removeGroupMember = async ({ group, subscriberId, memberIDs }) => {
    try {

        const existingMembers = await GroupMember.findOneAndDelete({
            group: group,
            member: memberIDs,
            isDeleted: { $ne: true },
        }).select('member');

        return true;
    } catch (error) {
        return false;
    }
}

const deleteUsers = async (users, errors) => {

    try {

        const getUsers = await User.find({ _id: { $in: users } });

        if (!getUsers || getUsers.length <= 0) {
            errors.push("User not found");
            return;
        }

        const deleteUsers = await DbTransactionHelper.performDbTransaction(async (session) => {


            const deletedUsers = getUsers.map(user => {
                return {
                    ...user.toObject(),
                    isDeleted: true
                };
            });

            const updateDeletedList = await DeletedUser.insertMany(deletedUsers, { session });

            if (updateDeletedList) {


                let deleteUsers = await User.deleteMany({ _id: { $in: users } }, { session });

                await Employee.updateMany(
                    { user: { $in: users } },
                    { $set: { isDeleted: true } },
                    { session }
                );

                await LearningPlanAssignment.deleteMany({ assignedLearnerId: { $in: users } }, { session });

                const getOverallDocs = await OverallTrainingProgress.find({ user: { $in: users } }).session(session);

                if (getOverallDocs.length > 0) {

                    const getOverallDocIds = getOverallDocs.map(doc => doc._id);
                    await TrainingProgress.deleteMany({ OverallTrainingProgress: { $in: getOverallDocIds } }, { session });

                }

                await OverallTrainingProgress.updateMany(
                    { user: { $in: users } },
                    { $set: { isDeleted: true } },
                    { session }
                );

                if (deleteUsers) {

                    const getAdminGroups = await Group.find({ groupAdmin: { $in: users } }).session(session);

                    if (getAdminGroups.length > 0) {
                        const deletedGroups = getAdminGroups.map(group => ({
                            ...group.toObject(),
                            isDeleted: true
                        }));

                        await DeletedGroup.insertMany(deletedGroups, { session });
                    }

                    let updateGroup;

                    updateGroup = await Group.updateMany(
                        { members: { $in: users } },
                        [
                            {
                                $set: {
                                    members: {
                                        $filter: {
                                            input: "$members",
                                            as: "member",
                                            cond: { $not: { $in: ["$$member", users] } }
                                        }
                                    }
                                }
                            },
                            {
                                $set: {
                                    memberCount: { $size: "$members" }
                                }
                            }
                        ],
                        { session }
                    );

                    const updateGroupMember = await GroupMember.updateMany(
                        { member: { $in: users } },
                        { $set: { isDeleted: true } },
                        { session }
                    );

                    if (updateGroupMember) {

                        const usersToDelete = getUsers; 
                        insertDeletionRequests(usersToDelete);

                        const result = await sendDeletionEmailBulk();

                        return deleteUsers;
                    }

                    return deleteUsers;

                } else {
                    errors.push("Error while deleting users");
                    return;
                }

            } else {
                errors.push("Error while deleting users");
                return;
            }

        });

        return deleteUsers;

    } catch (error) {
        throw Error(error.message);

    }

}

const softDeleteUsers = async (users, errors) => {

    try {

        const getUsers = await User.find({ _id: { $in: users } });

        if (!getUsers || getUsers.length <= 0) {
            errors.push("User not found");
            return;
        }

        const deleteUsers = await DbTransactionHelper.performDbTransaction(async (session) => {


            const deletedUsers = getUsers.map(user => {
                return {
                    ...user.toObject(),
                    isDeleted: true
                };
            });
            const updateDeletedList = await DeletedUser.insertMany(deletedUsers, { session });

            if (updateDeletedList) {

                let deleteUsers = await User.deleteMany(
                    { _id: { $in: users } },
                    { session }
                );

                await Employee.updateMany(
                    { user: { $in: users } },
                    { $set: { isDeleted: true } },
                    { session }
                );

                await LearningPlanAssignment.updateMany(
                    { assignedLearnerId: { $in: users } },
                    { $set: { isDeleted: true } },
                    { session }
                );

                await OverallTrainingProgress.updateMany(
                    { user: { $in: users } },
                    { $set: { isDeleted: true } },
                    { session }
                );

                if (deleteUsers) {

                    const getAdminGroups = await Group.find({ groupAdmin: { $in: users } }).session(session);

                    if (getAdminGroups.length > 0) {
                        const deletedGroups = getAdminGroups.map(group => ({
                            ...group.toObject(),
                            isDeleted: true
                        }));

                        await DeletedGroup.insertMany(deletedGroups, { session });
                    }

                    let updateGroup;

                    updateGroup = await Group.updateMany(
                        { members: { $in: users } },
                        [
                            {
                                $set: {
                                    members: {
                                        $filter: {
                                            input: "$members",
                                            as: "member",
                                            cond: { $not: { $in: ["$$member", users] } }
                                        }
                                    }
                                }
                            },
                            {
                                $set: {
                                    memberCount: { $size: "$members" }
                                }
                            }
                        ],
                        { session }
                    );

                    const updateGroupMember = await GroupMember.updateMany(
                        { member: { $in: users } },
                        { $set: { isDeleted: true } },
                        { session }
                    );

                    if (updateGroupMember) {
                        for (const user of getUsers) {
                            const htmlContent = sendDeleteEmailToLearner(user.firstName);
                            await SendEmail({
                                receiverEmail: user.email,
                                subject: "Your account has been deleted",
                                htmlContent: htmlContent,
                            });
                        }
                        return deleteUsers;
                    }

                    return deleteUsers;

                } else {
                    errors.push("Error while deleting users");
                    return;
                }

            } else {
                errors.push("Error while deleting users");
                return;
            }

        });

        return deleteUsers;

    } catch (error) {
        throw Error(error.message);

    }

}

const restoreUsers = async (users, errors) => {
    try {
        const savedUsers = await DbTransactionHelper.performDbTransaction(async (session) => {

            const getDeletedUsers = await DeletedUser.find({ _id: { $in: users } }).session(session);

            if (!getDeletedUsers || getDeletedUsers.length <= 0) {
                errors.push("No deleted users found");
                return;
            }


            const restoredUsers = getDeletedUsers.map(deletedUser => {
                const userObject = deletedUser.toObject();
                userObject.isDeleted = false;
                return new User(userObject);
            });

            const insertRestoredUsers = await User.insertMany(restoredUsers, { session });

            if (!insertRestoredUsers) {
                errors.push("Error while restoring users");
                return;
            }


            await Employee.updateMany(
                { user: { $in: users } },
                { $set: { isDeleted: false } },
                { session }
            );


            const getDeletedGroups = await DeletedGroup.find({ groupAdmin: { $in: users }, isManagerDefault: true }).session(session);

            if (getDeletedGroups.length > 0) {
                const restoredGroups = getDeletedGroups.map(group => {
                    const groupObject = group.toObject();
                    groupObject.isDeleted = false;
                    return new Group(groupObject);
                });

                await Group.insertMany(restoredGroups, { session });
            }


            const restoreGroupMembers = await GroupMember.updateMany(
                { member: { $in: users }, isDeleted: true },
                { $set: { isDeleted: false } },
                { session }
            );

            const restoreOverallTrainingProgress = await OverallTrainingProgress.updateMany(
                { user: { $in: users }, isDeleted: true },
                { $set: { isDeleted: false } },
                { session }
            );

            const restoreLearningPlanAssignment = await LearningPlanAssignment.updateMany(
                { assignedLearnerId: { $in: users }, isDeleted: true },
                { $set: { isDeleted: false } },
                { session }
            );

            // const userGroupMembers = await GroupMember.find(
            //     { member: { $in: users }, isDeleted: false }
            // ).select('group member').session(session);
            // const groupUpdates = userGroupMembers.reduce((acc, groupMember) => {
            //     if (!acc[groupMember.group]) {
            //         acc[groupMember.group] = new Set();
            //     }
            //     acc[groupMember.group].add(groupMember.member.toString());
            //     return acc;
            // }, {});
            // const bulkOperations = Object.entries(groupUpdates).map(([groupId, members]) => ({
            //     updateOne: {
            //         filter: { _id: groupId },
            //         update: {
            //             $addToSet: { members: { $each: [...members] } },
            //             $inc: { memberCount: members.size }
            //         }
            //     }
            // }));
            // if (bulkOperations.length > 0) {
            //     const updateResult = await Group.bulkWrite(bulkOperations, { session });
            // }


            const deleteResult = await DeletedUser.deleteMany({ _id: { $in: users } }).session(session);

            return insertRestoredUsers;
        });

        return savedUsers;

    } catch (error) {
        errors.push(error.message);
        throw new Error(error.message);
    }
};

const validateUserRow = async (row, { empIds, emails, dbemployeeIds, dbEmails, designationNames, imoNumbers, vesselStatus, fetchAdmin, fetchAdminDesignation }, rowIndex) => {

    const errors = [];

    if (Object.values(row).every(value => value === '' || value === null || value === undefined)) {
        return errors;
    }

    if (!row["First Name*"]) {
        errors.push(`First Name is missing in row ${rowIndex + 1}.`);
    } else if (!validateName(row["First Name*"])) {
        errors.push(`First Name is invalid. Name should only contain letters in row ${rowIndex + 1}.`);
        return errors;
    }

    if (row["Last Name"]) {
        if (!validateName(row["Last Name"])) {
            errors.push(`Last Name is invalid. Name should only contain letters in row ${rowIndex + 1}.`);
            return errors;
        }
    }

    if (!row["User ID*"]) {
        errors.push(`User ID is missing in row ${rowIndex + 1}`);
        return errors;
    }

    let normalizedId = row["User ID*"].toUpperCase();
    if (empIds.has(normalizedId)) {
        errors.push(`Duplicate User ID found in row ${rowIndex + 1} as ${row["User ID*"]}`);
        return errors;
    } else {
        empIds.add(normalizedId);
    }

    if (!row["Email*"]) {
        errors.push(`Email is missing in row ${rowIndex + 1}`);
        return errors;
    } else {
        const normalizedEmail = row["Email*"].toLowerCase();
        if (!Validator.isEmail(normalizedEmail)) {
            errors.push(`Invalid Email in row ${rowIndex + 1} as ${normalizedEmail}.`);
            return errors;
        } else if (emails.has(normalizedEmail)) {
            errors.push(`Duplicate Email found in row ${rowIndex + 1} as ${normalizedEmail}.`);
            return errors;
        } else {
            emails.add(normalizedEmail);
        }
    }

    if (!row["Employee Designation*"]) {
        errors.push(`Designation is missing in row ${rowIndex + 1}`);
        return errors;
    } else {
        const designation = row["Employee Designation*"]?.toLowerCase();
        if (!designationNames.some(name => name?.toLowerCase() === designation)) {
            errors.push(`Invalid Designation in row ${rowIndex + 1} as ${row["Employee Designation*"]}`);
            return errors;
        }
    }

    if (row["Vessel Status"]) {
        const status = row["Vessel Status"].toLowerCase();
        if (!vesselStatus.some(statusOption => statusOption.toLowerCase() === status)) {
            errors.push(`Invalid Status in row ${rowIndex + 1} as ${row["Vessel Status"]}`);
            return errors;
        }
    }

    if (!row["Vessel Status"]) {
        row["Vessel Status"] = '';
    }

    if (row["Vessel IMO Number"]) {
        if (!imoNumbers.includes(row["Vessel IMO Number"])) {
            errors.push(`Invalid IMO Number in row ${rowIndex + 1} as ${row["Vessel IMO Number"]}`);
            return errors;
        }
    }

    if (!row["Vessel IMO Number"]) {
        row["Vessel IMO Number"] = '';
    }

    return errors;
}

function mapCSVRowToUser(row) {
    const mandatoryFields = [
        "First Name*",
        "Email*",
        "Designation*",
        "User ID*"
    ];

    Object.keys(row).forEach(key => {
        if (!mandatoryFields.includes(key)) {
            const fieldName = key;
            let fieldValue = row[key];
        }
    });

    const result = {
        firstName: row["First Name*"],
        lastName: row["Last Name"] ?? "",
        civilIdOrPassport: row["User ID*"]?.toUpperCase(),
        email: row["Email*"]?.toLowerCase(),
        designation: row["Employee Designation*"]?.toLowerCase(),
        imoNumber: row["Vessel IMO Number"],
        vesselStatus: row["Vessel Status"],
    };

    return result;
}

const sendBulkEmails = async (passwordEmailList) => {

    try {
        process.send({
            type: 'EMAIL',
            data: { email: passwordEmailList, subject: 'Welcome To Seaverse!' }
        });

    } catch (error) {
        console.error(`Error sending emails`, error);
    }

};
const validateName = (name) => {
    const nameRegex = /^[A-Za-z]+(\s[A-Za-z]+)*$/;
    const trimmedName = name.trim();
    return nameRegex.test(trimmedName);
};

const moveExpiredDeletedUsers = async () => {
    CronHelper.schedule("0 0 * * *", async () => {
        try {

            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setMinutes(thirtyDaysAgo.getMinutes() - 1);

            const result = await DbTransactionHelper.performDbTransaction(async session => {

                const expiredUsers = await User.find({
                    deleteRequestDate: { $lte: thirtyDaysAgo },
                    isDeleted: true,
                    isActive: false
                }).session(session);

                if (expiredUsers.length > 0) {
                    const expiredUserIds = expiredUsers.map(user => user.id);

                    const errors = [];
                    const deletedUsers = await deleteUsers(expiredUserIds, errors);

                    if (deletedUsers.length < 0) {
                        console.error("Errors occurred while deleting users");
                    }
                }

                return `${expiredUsers.length} users processed`;
            });

        } catch (error) {
            console.error("Error occurred while processing expired users:", error);
        }
    });
};


const sendDeletionEmailBulk = async () => {
    try {
        let results = [];
        while (true) {

            const deletionBatch = await fetchDeletionBatch();
            if (deletionBatch.length === 0) {
                break;
            }

            const batchResults = await sendDeletionWithRetry(deletionBatch);

            results = results.concat(batchResults);
            await delay(200);

            const deletionIds = deletionBatch.map(email => email.id);
            
            // Filter successful emails to delete
            const successfulIds = [];
            batchResults.forEach((result, index) => {
                if (result.status === "fulfilled") {
                    successfulIds.push(deletionIds[index]);
                }
            });

            if (successfulIds.length > 0) {
                await deleteDeletionBatch(successfulIds);
            }
        }

        const success = results.filter(res => res.status === "fulfilled");
        const errors = results.filter(res => res.status === "rejected");

        return {
            status: "success",
            successCount: success.length,
            errorCount: errors.length,
            errors: errors.map(err => err.reason.message),
            message: `${success.length} deletion emails sent successfully, ${errors.length} failed.`,
        };
    } catch (error) {
        return {
            status: "error",
            message: error.message,
        };
    }
};

const sendDeletionWithRetry = async (deletionBatch, retryCount = 0) => {
    try {
        const emailPromises = deletionBatch.map(async (user) => {
            if (user.email?.trim()?.length) {
                return await SendEmail({
                    receiverEmail: user.email,
                    subject: "Your account has been deleted",
                    htmlContent: sendDeleteEmailToLearner(user.firstName)
                });
            } else {
                return Promise.reject(new Error("Invalid email address"));
            }
        });

        return await Promise.allSettled(emailPromises);
    } catch (error) {
        if (error.message.includes("Maximum sending rate exceeded") && retryCount < 5) {
            await delay(2 ** retryCount * 1000);
            return sendDeletionWithRetry(deletionBatch, retryCount + 1);
        }
        throw error;
    }
};

module.exports = {
    deleteUsers,
    softDeleteUsers,
    restoreUsers,
    sendInvitationMail,
    sendCourseInvitationMail,
    sendEnrollmentNotification,
    sendDeleteNotification,
    notifyEmployeeStatusChange,
    sendNotificationOnCRUD,
    sendNotificationOnBULK,
    generateUserUID,
    generateEmployeeUID,
    sendCredentialMail,
    generateDefaultGroup,
    insertGroupMember,
    removeGroupMember,
    sendNotificationOnBULKOutsideChildProcess,
    filterLearningPlans,
    moveExpiredDeletedUsers,
    updateEmployees: async ({ id, input, userId, subscriberId, role, userInfo }, context, session) => {

        const employeeFilterConditions = { subscriber: subscriberId };
        employeeFilterConditions.user = id;

        const existingEmployee = await Employee.findOne({ user: employeeFilterConditions.user }).populate({ path: "user", select: "currentVessel firstName lastName vesselStatus", populate: ({ path: "currentVessel", select: "name isActive" }) })
            .lean();

        if (!existingEmployee) throw CustomError(ErrorName.NOT_FOUND);

        let newVessel;
        if (input?.user?.currentVessel === '') {
            await UserVessel.updateMany(
                { user: existingEmployee?.user?._id, isActive: true },
                { isActive: false, vesselStatus: input.user.vesselStatus === '' ? null : input.user.vesselStatus, deletedAt: new Date() }
            );
        }

        if (input?.user?.currentVessel) {

            newVessel = await Vessel.findById(input?.user?.currentVessel, { name: 1 }).lean();
            if (!newVessel) throw new CustomError(ErrorName.INVALID_VESSEL);

            if (input?.user?.currentVessel.toString() !== existingEmployee?.user?.currentVessel?._id.toString()) {

                await UserVessel.updateMany(
                    { user: existingEmployee?.user?._id, isActive: true },
                    { isActive: false, deletedAt: new Date() }
                );

                if (input?.user?.currentVessel !== '') {

                    await UserVessel.create({
                        user: existingEmployee?.user?._id,
                        vessel: ObjectId(input?.user?.currentVessel),
                        vesselStatus: input?.user?.vesselStatus === '' ? null : input?.user?.vesselStatus,
                    });

                    await NotificationHelper.createNotificationhelper({
                        subscriber: subscriberId,
                        titleValue: `User Vessel Updated Successfully`,
                        messageValue: `User  ${existingEmployee?.user?.firstName} ${existingEmployee?.user?.lastName}" has been assigned to vessel ${newVessel?.name} by ${userInfo?.firstName} ${userInfo?.lastName}`,
                        notificationType: NotificationType.USER_VESSEL_UPDATE,
                        notifyAdmin: true,
                        affected: [
                            {
                                targetRef: "User",
                                target: existingEmployee?.user?._id,
                            },
                        ],
                        icon: notificationiconEnum.SUCCESS,
                        createdBy: userInfo,
                    });

                    await NotificationHelper.createNotificationhelper({
                        subscriber: subscriberId,
                        titleValue: `Your Vessel has been Updated`,
                        messageValue: `Your have been assigned to vessel  ${newVessel?.name} by ${userInfo?.firstName} ${userInfo?.lastName}`,
                        notificationType: NotificationType.USER_VESSEL_UPDATE,
                        notifyAdmin: false,
                        affected: [
                            {
                                targetRef: "User",
                                target: existingEmployee?.user?._id,
                            },
                        ],
                        notifiers: [existingEmployee?.user?._id],
                        employeeNotifiers: [existingEmployee?.user?._id],
                        icon: notificationiconEnum.SUCCESS,
                        createdBy: userInfo,
                    });

                }

            }

        }

        if (input?.user?.vesselStatus || input?.user?.vesselStatus === '') {

            await UserVessel.findOneAndUpdate(
                { user: existingEmployee?.user?._id, isActive: true },
                { vesselStatus: input?.user?.vesselStatus === '' ? null : input?.user?.vesselStatus }
            )

            await NotificationHelper.createNotificationhelper({
                subscriber: subscriberId,
                titleValue: `User status Updated Successfully`,
                messageValue: `User  ${existingEmployee?.user?.firstName} ${existingEmployee?.user?.lastName}'s status updated.`,

                notificationType: NotificationType.USER_VESSEL_UPDATE,
                notifyAdmin: true,
                affected: [
                    {
                        targetRef: "User",
                        target: existingEmployee?.user?._id,
                    },
                ],
                icon: notificationiconEnum.SUCCESS,
                createdBy: userInfo,
            });

            await NotificationHelper.createNotificationhelper({
                subscriber: subscriberId,
                titleValue: `Your vessel status has been Updated`,
                messageValue: input?.user?.vesselStatus === '' ? 'Your vessel status has been removed' : `Your vessel status has been updated to ${input?.user?.vesselStatus}`,
                notificationType: NotificationType.USER_VESSEL_UPDATE,
                notifyAdmin: false,
                affected: [
                    {
                        targetRef: "User",
                        target: existingEmployee?.user?._id,
                    },
                ],
                notifiers: [existingEmployee?.user?._id],
                employeeNotifiers: [existingEmployee?.user?._id],
                icon: notificationiconEnum.SUCCESS,
                createdBy: userInfo,
            });

        }

        const updatedUser = await UserHelper.updateUser(
            {
                id: id,
                input: {
                    ...input.user
                },
            },
            { currentRole: role }
        );

        let savedEmployee;

        if (updatedUser) {
            savedEmployee = await Employee.findOne({ user: updatedUser._id }).populate('user');
        }

        if (input.empDesignation) {
            const existingDesignation = await Designation.findById(input.empDesignation);

            if (!existingDesignation) throw new CustomError(ErrorName.INVALID_DESIGNATION);

            if (savedEmployee?.empDesignation.toString() != input.empDesignation.toString()) {
                savedEmployee.empDesignation = existingDesignation._id;
                savedEmployee.designation = existingDesignation.name;
                await savedEmployee.save();
            }
        }



        const learningPlans = await LearningPlan.find({ isDeleted: false, status: 'ACTIVE' });
        const existingVesselType = await Vessel.findOne({ _id: existingEmployee?.user?.currentVessel?._id }).select('typeOfVessel -_id').lean();
        const conditions = [{
            designationID: input?.empDesignation || existingEmployee.empDesignation,
            vesselID: ((input?.user?.currentVessel !== '') ? input?.user?.currentVessel : existingEmployee.currentVessel?._id) || "",
            vesselTypeID: existingVesselType ? existingVesselType.typeOfVessel._id : "",
            currentStatus: ((input?.user?.vesselStatus !== '') ? input?.user?.vesselStatus : existingEmployee.vesselStatus) || "",
            email: input?.user?.email,
            _id: existingEmployee?.user?._id
        }];

        const result = await filterLearningPlans(learningPlans, conditions, context, session);
        return savedEmployee;

    },
    createBulkEmployee: async ({ userList, emailsLists, civilIds }, context) => {
        const { role, userId, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [
                    Permission.CREATE_EMPLOYEE,
                    Permission.CREATE_TRAINING_REGISTRATION,
                ],
                requiredAll: false,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

        const designationNames = [...new Set(userList.map(user => user.designation))];

        const designationNamesRegex = designationNames.map(name => new RegExp(`^${name}$`, 'i'));

        const password = await CryptoHelper.hash(process.env.USER_DUMMY_PASSWORD, 10)

        const invitationList = [];


        try {

            const savedEmployees = await DbTransactionHelper.performDbTransaction(async session => {

                const [existingUsers, existingDesignations] = await Promise.all([
                    User.find({ $or: [{ email: { $in: emailsLists } }, { civilIdOrPassport: { $in: civilIds } }] }).select('email civilIdOrPassport'),
                    Designation.find({ name: { $in: designationNamesRegex } }).select('name _id isManager')
                ]);

                const designationMap = new Map(
                    existingDesignations.map(designation => [
                        designation.name,
                        { id: designation._id, isManager: designation.isManager }
                    ])
                );

                const newDesignations = designationNames.filter(name => !designationMap.has(name)).map(name => ({ name: name, subscriber: subscriberId, createdBy: userId }));
                if (newDesignations.length > 0) {
                    const insertedDesignations = await Designation.insertMany(newDesignations);
                    insertedDesignations.forEach(designation => {
                        designationMap.set(designation.name, designation._id);
                    });
                }

                const newUsersData = userList.filter(user =>
                    !existingUsers.some(existingUser =>
                        existingUser.email === user.email ||
                        existingUser.civilIdOrPassport === user.civilIdOrPassport
                    )
                ).map(user => ({
                    email: user.email,
                    civilIdOrPassport: user.civilIdOrPassport,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    role: user.role,
                    password: password,
                    isRegistered: true,
                    subscriber: subscriberId,
                }));

                if (newUsersData.length == 0) {
                    throw CustomError(ErrorName.ALREADY_EXIST);
                }

                const bulkId = uuidv4();
                const usersToInsert = newUsersData.map(user => ({
                    updateOne: {
                        filter: { email: user.email },
                        update: {
                            $setOnInsert: {
                                email: user.email,
                                civilIdOrPassport: user.civilIdOrPassport,
                                firstName: user.firstName,
                                lastName: user.lastName,
                                role: user.role,
                                password: password,
                                isRegistered: true,
                                subscriber: subscriberId,
                            }
                        },
                        upsert: true
                    }
                }));

                await User.bulkWrite(usersToInsert, { session });

                const insertedUsers = await User.find({ email: { $in: userList.map(u => u.email) } }).session(session);

                const allManagers = [
                    ...insertedUsers.filter(user => {
                        const originalUser = userList.find(u => u.email === user.email);
                        if (!originalUser) return false;

                        const designation = designationMap.get(originalUser.designation);
                        return designation && designation.isManager;
                    }),
                    ...additionalManagers
                ];

                const managerMap = new Map(
                    allManagers.map(manager => [manager.email, manager._id])
                );

                const employeesToInsert = insertedUsers.map(user => {
                    const originalUserData = userList.find(u => u.email === user.email);
                    invitationList.push({
                        userData: user
                    });
                    return {
                        updateOne: {
                            filter: { user: user._id },
                            update: {
                                $setOnInsert: {
                                    user: user._id,
                                    subscriber: subscriberId,
                                    empDesignation: designationMap.get(originalUserData.designation).id,
                                    managerObjectId: managerMap.get(originalUserData.managerEmail),
                                    customField: originalUserData.customField,
                                    bulkId: bulkId,
                                    regType: 2
                                }
                            },
                            upsert: true
                        }
                    };
                });

                await Employee.bulkWrite(employeesToInsert, { session });

                const newEmployees = await Employee.find({ UID: { $exists: false } }).session(session).lean();

                const uidUpdates = await Promise.all(newEmployees.map(async (employee) => {
                    const UID = await generateEmployeeUID({ subscriberId, session });
                    return {
                        updateOne: {
                            filter: { _id: employee._id },
                            update: { UID },
                            upsert: false
                        }
                    };
                }));

                await Employee.bulkWrite(uidUpdates, { session });

                const groupOperations = allManagers.map(async manager => {
                    const groupName = `${manager.firstName} ${manager.lastName}`;
                    const groupData = {
                        groupName: groupName,
                        groupAdmin: manager._id,
                        subscriber: subscriberId,
                        createdBy: manager._id,
                        updatedBy: manager._id
                    };

                    const group = await Group.findOneAndUpdate(
                        { groupAdmin: manager._id, subscriber: subscriberId, isManagerDefault: true },
                        { $setOnInsert: groupData },
                        { upsert: true, new: true, lean: true, session }
                    );

                    const groupMemberData = {
                        group: group._id,
                        member: manager._id,
                        subscriber: subscriberId
                    };

                    await GroupMember.findOneAndUpdate(
                        { group: group._id, member: manager._id, isDeleted: { $ne: true } },
                        { $setOnInsert: groupMemberData },
                        { upsert: true, new: true, lean: true, session }
                    );

                    const employeesToAdd = userList.filter(user => user.managerEmail === manager.email);

                    const employeeGroupMembers = employeesToAdd.map(user => ({
                        group: group._id,
                        member: insertedUsers.find(u => u.email === user.email)._id,
                        subscriber: subscriberId
                    }));

                    if (employeeGroupMembers.length > 0) {
                        await GroupMember.insertMany(employeeGroupMembers, { session });
                    }

                    return group;
                });

                await Promise.all(groupOperations);
                return insertedUsers;
            });
            if (savedEmployees.length == 0) throw CustomError(ErrorName.FAILED);
            try {

                invitationList.forEach(obj => {
                    sendCredentialMail(obj);
                });

            } catch (error) {
                console.error(`Failed to send email to ${obj.email}:`, error);
            }

            return savedEmployees.length;
        } catch (error) {
            throw CustomError(ErrorName.FAILED);
        }
    },
    createEmployees: async ({ input }, context) => {
        const { role, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [
                    Permission.CREATE_EMPLOYEE,
                    Permission.CREATE_TRAINING_REGISTRATION,
                ],
                requiredAll: false,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

        if (!input.users?.length) throw CustomError(ErrorName.ARGUMENTS_REQUIRED);

        const notificationList = [];
        const courseInvitationList = [];
        const invitationList = [];
        let savedBatch;

        const savedEmployees = await DbTransactionHelper.performDbTransaction(async session => {
            const savedEmployees = [];

            for (const user of input.users) {

                user.password = user.password ? await CryptoHelper.hash(user.password, 10) : await CryptoHelper.hash(process.env.USER_DUMMY_PASSWORD, 10);

                if (input.empDesignation) {
                    const existingDesignation = await Designation.findById(input.empDesignation);

                    if (!existingDesignation) throw new CustomError(ErrorName.INVALID_DESIGNATION);

                }

                let userRole = Role.LEARNER;

                const savedUserRaw = await User.findOneAndUpdate(
                    { email: { $regex: new RegExp(`^${user.email}$`, "i") } },
                    {
                        $setOnInsert: {
                            subscriber: subscriberId,
                            ...user,
                            role: userRole,
                            isRegistered: true,
                        },
                    },
                    {
                        upsert: true,
                        new: true,
                        setDefaultsOnInsert: true,
                        runValidators: true,
                        lean: true,
                        rawResult: true,
                        session,
                    }
                );

                if (!savedUserRaw || !savedUserRaw.value) throw CustomError(ErrorName.FAILED);
                let savedUser = savedUserRaw.value;


                if (!savedUserRaw.lastErrorObject.updatedExisting) {
                    savedUser = await User.findByIdAndUpdate(
                        savedUser._id,
                        { UID: await generateUserUID({ session }) },
                        {
                            upsert: false,
                            new: true,
                            lean: true,
                            session,
                        }
                    );
                }

                let employeeUpdate = {
                    $setOnInsert: {
                        subscriber: subscriberId,
                        user: savedUser,
                        branch: input.branch,
                        organization: input.organization,
                        empDesignation: input.empDesignation,
                    },
                };

                if (input.customField || user.customField) {
                    if (input.customField) employeeUpdate.customField = input.customField;
                    else if (user.customField) employeeUpdate.customField = user.customField;
                }

                const savedEmployeeRaw = await Employee.findOneAndUpdate(
                    { user: savedUser._id },
                    employeeUpdate,
                    {
                        upsert: true,
                        new: true,
                        setDefaultsOnInsert: true,
                        runValidators: true,
                        lean: true,
                        rawResult: true,
                        session,
                    }
                );

                if (!savedEmployeeRaw || !savedEmployeeRaw.value)
                    throw CustomError(ErrorName.FAILED);
                let savedEmployee = savedEmployeeRaw.value;

                if (!savedEmployeeRaw.lastErrorObject.updatedExisting) {
                    savedEmployee = await Employee.findByIdAndUpdate(
                        savedEmployee._id,
                        { UID: await generateEmployeeUID({ subscriberId, session }) },
                        {
                            upsert: false,
                            new: true,
                            lean: true,
                            session,
                        }
                    );
                }

                invitationList.push({
                    userData: savedUser
                });

                savedEmployees.push({ ...savedEmployee, user: savedUser });
            }

            return savedEmployees;
        });

        if (!savedEmployees) throw CustomError(ErrorName.FAILED);

        sendEnrollmentNotification(notificationList);

        if (input.training) {
            LogHelper.logActivity({
                subscriber: subscriberId,
                logType: LogType.TRAINING_REGISTRATION_LOG,
                operation: "CREATE",
                ipInfo: context.ipInfo,
                affected:
                    notificationList?.map(x => ({
                        targetRef: "TrainingRegistration",
                        target: x?.trainingRegistration?._id,
                    })) ?? [],
                additionalInfo: [
                    {
                        infoType: "TRAINING_REGISTRATION_INFO",
                        infoData: JSON.stringify(input),
                    },
                ],
                createdBy: userInfo,
            });
        } else {
            LogHelper.logActivity({
                subscriber: subscriberId,
                logType: LogType.EMPLOYEE_LOG,
                operation: "CREATE",
                ipInfo: context.ipInfo,
                affected:
                    savedEmployees?.map(x => ({
                        targetRef: "Employee",
                        target: x?._id,
                    })) ?? [],
                additionalInfo: [
                    {
                        infoType: "EMPLOYEE_INFO",
                        infoData: JSON.stringify(input),
                    },
                ],
                createdBy: userInfo,
            });
        }

        courseInvitationList.forEach(obj => {
            sendCourseInvitationMail(obj);
        });

        invitationList.forEach(obj => {
            sendCredentialMail(obj);
        });

        return {
            batch: savedBatch,
            employees: savedEmployees,
            totalCount: savedEmployees.length,
        };
    },

    createEmployeesBackgroundTask: async (users, emailsArray, empIdsArray, subscriberId, userId, newFileName, saveCSV) => {

        const existingDesignations = await Designation.find({ isDeleted: false }).lean();
        const adminUser = await User.findById(userId);
        let userCount = 0;

        const caseInsensitiveEmpIdArray = empIdsArray.map((id) => new RegExp(`^${id}$`, 'i'));

        const existingUsers = await User.find({
            $or: [
                { civilIdOrPassport: { $in: caseInsensitiveEmpIdArray } },
                { email: { $in: emailsArray } }
            ]
        }).lean();

        let existingEmailsInDB = new Map();
        let existingEmpIdsInDB = new Map();

        existingUsers.forEach(user => {
            if (user.civilIdOrPassport && user.email) {
                const employeeId = user.civilIdOrPassport?.toUpperCase();
                const email = user.email.toLowerCase();

                existingEmailsInDB.set(employeeId, email);
                existingEmpIdsInDB.set(email, employeeId);
            }
        })

        const existingEmpIdEmailMap = existingUsers.map(user => ({
            [user.civilIdOrPassport.toLowerCase()]: user.email?.toLowerCase()
        }));


        const existingEmailEmpIdMap = existingUsers.map(user => ({
            [user.email?.toLowerCase()]: user.civilIdOrPassport.toLowerCase()
        }))



        const getAllDBUsers = await User.find().select('email civilIdOrPassport');
        const getAllDBEmails = getAllDBUsers.map(user => user.email?.toLowerCase());
        const getAllDBEmpIds = getAllDBUsers.map(user => user.civilIdOrPassport?.toUpperCase());
        let errors = [];
        const updates = [];
        const inserts = [];

        let userIndex = 0;


        const existingVessels = await Vessel.find({ isDeleted: false, isActive: true });

        const vesselMap = new Map(
            existingVessels.map(vessel => [
                vessel.imoNumber,
                { id: vessel._id, typeOfVessel: vessel.typeOfVessel }
            ])
        );



        let updatedEmpIds = [];
        let updatedEmailIds = [];
        const vesselAssociations = [];
        let passwordEmailList = [];

        const subscriber = await Subscriber.findOne();
        let subscriber_Id;
        if (subscriber) subscriber_Id = subscriber._id;

        for (const user of users) {

            const existingEmpIdsMap = existingEmpIdEmailMap.find(empObj => empObj[user.civilIdOrPassport?.toLowerCase()]);
            const existingEmailIdsMap = existingEmailEmpIdMap.find(emailObj => emailObj[user.email?.toLowerCase()]);


            if (existingEmpIdsMap) {

                const email = existingEmpIdsMap[user.civilIdOrPassport.toLowerCase()];

                if (existingEmailIdsMap) {

                    const empId = existingEmailIdsMap[user.email?.toLowerCase()];

                    if (empId !== user.civilIdOrPassport?.toUpperCase() && existingEmailsInDB.has(user.civilIdOrPassport?.toUpperCase())) {


                        // errors.push(errors.push(`Conflict in Row ${userIndex + 1}: User ID ${user.civilIdOrPassport} already exists with Email ID ${existingEmailsInDB.get(user.civilIdOrPassport.toLowerCase())}`));
                        errors.push(errors.push(`Conflict in Row ${userIndex + 1}: The provided User ID or Email ID is already associated with another user.`));
                        break;

                    } else {

                        updates.push({
                            updateMany: {
                                filter: { email: user.email },
                                update: {
                                    $set: {
                                        firstName: user.firstName,
                                        lastName: user.lastName,
                                        civilIdOrPassport: user.civilIdOrPassport?.toUpperCase(),
                                        vesselStatus: user?.vesselStatus && user?.vesselStatus.trim() !== '' ? user.vesselStatus?.toUpperCase() : null,
                                        currentVessel: user?.imoNumber && user?.imoNumber.trim() !== '' ? vesselMap.get(user.imoNumber)?.id || null : null,
                                    },
                                },
                            },
                        });

                        updatedEmailIds.push(user.email);

                        vesselAssociations.push({
                            email: user.email,
                            imoNumber: user.imoNumber && user.imoNumber.trim() !== '' ? user.imoNumber || null : null,
                            vesselStatus: user?.vesselStatus && user?.vesselStatus.trim() !== '' ? user.vesselStatus?.toUpperCase() : null,
                            typeOfVessel: vesselMap.get(user.imoNumber)?.typeOfVessel,
                        });

                    }

                } else if (email !== user.email?.toLowerCase() && existingEmpIdsInDB.has(user.email?.toLowerCase())) {


                    // errors.push(errors.push(`Conflict in Row ${userIndex + 1}: email ID ${user.email} already exists with employee ID ${existingEmpIdsInDB.get(user.email?.toLowerCase())}`));
                    errors.push(errors.push(`Conflict in Row ${userIndex + 1}: The provided User ID or Email ID is already associated with another user`));
                    break;


                } else {

                    updates.push({
                        updateMany: {
                            filter: { civilIdOrPassport: { $regex: `^${user.civilIdOrPassport}$`, $options: 'i' } },
                            update: {
                                $set: {
                                    firstName: user.firstName,
                                    lastName: user.lastName,
                                    email: user.email?.toLowerCase(),
                                    vesselStatus: user?.vesselStatus && user?.vesselStatus.trim() !== '' ? user.vesselStatus?.toUpperCase() : null,
                                    currentVessel: user?.imoNumber && user?.imoNumber.trim() !== '' ? vesselMap.get(user.imoNumber)?.id || null : null,
                                },
                            },
                        },
                    });


                    updatedEmpIds.push(user.civilIdOrPassport.toUpperCase());

                    vesselAssociations.push({
                        civilIdOrPassport: user.civilIdOrPassport,
                        imoNumber: user.imoNumber && user.imoNumber.trim() !== '' ? user.imoNumber || null : null,
                        vesselStatus: user?.vesselStatus && user?.vesselStatus.trim() !== '' ? user.vesselStatus?.toUpperCase() : null,
                        typeOfVessel: vesselMap.get(user.imoNumber)?.typeOfVessel,
                    });

                }


            } else if (existingEmailIdsMap) {

                const empId = existingEmailIdsMap[user.email].toLowerCase();

                if (existingEmpIdsMap) {

                    const email = existingEmpIdsMap[user.civilIdOrPassport?.toUpperCase()];

                    if (email !== user.email.toLowerCase() && existingEmpIdsInDB.has(user.email.toLowerCase())) {


                        // errors.push(errors.push(`Conflict in Row ${userIndex + 1}: Email ID ${user.email} already exists with User ID ${existingEmpIdsInDB.get(user.email.toLowerCase())}`));
                        errors.push(errors.push(`Conflict in Row ${userIndex + 1}: The provided User ID or Email ID is already associated with another user`));
                        break;

                    } else {

                        updates.push({
                            updateMany: {
                                // filter: { email: user.civilIdOrPassport },
                                filter: { civilIdOrPassport: { $regex: `^${user.civilIdOrPassport}$`, $options: 'i' } },
                                update: {
                                    $set: {
                                        firstName: user.firstName,
                                        lastName: user.lastName,
                                        email: user.email?.toLowerCase(),
                                        vesselStatus: user?.vesselStatus && user?.vesselStatus.trim() !== '' ? user.vesselStatus?.toUpperCase() : null,
                                        currentVessel: user?.imoNumber && user?.imoNumber.trim() !== '' ? vesselMap.get(user.imoNumber)?.id || null : null,
                                    },
                                },
                            },
                        });


                        updatedEmpIds.push(user.civilIdOrPassport.toUpperCase());

                        vesselAssociations.push({
                            civilIdOrPassport: user.civilIdOrPassport,
                            imoNumber: user.imoNumber && user.imoNumber.trim() !== '' ? user.imoNumber || null : null,
                            vesselStatus: user?.vesselStatus && user?.vesselStatus.trim() !== '' ? user.vesselStatus?.toUpperCase() : null,
                            typeOfVessel: vesselMap.get(user.imoNumber)?.typeOfVessel,
                        });

                    }

                } else if (empId !== user.civilIdOrPassport?.toUpperCase() && existingEmailsInDB.has(user.civilIdOrPassport?.toUpperCase())) {

                    // errors.push(errors.push(`Conflict in Row ${userIndex + 1}: User ID ${user.civilIdOrPassport} already exists with Email ID ${existingEmailsInDB.get(user.civilIdOrPassport?.toLowerCase())}`));
                    errors.push(errors.push(`Conflict in Row ${userIndex + 1}: The provided User ID or Email ID is already associated with another user`));
                    break;

                } else {

                    updates.push({
                        updateMany: {
                            filter: { email: user.email },
                            update: {
                                $set: {
                                    firstName: user.firstName,
                                    lastName: user.lastName,
                                    civilIdOrPassport: user.civilIdOrPassport?.toUpperCase(),
                                    vesselStatus: user?.vesselStatus && user?.vesselStatus.trim() !== '' ? user.vesselStatus?.toUpperCase() : null,
                                    currentVessel: user?.imoNumber && user?.imoNumber.trim() !== '' ? vesselMap.get(user.imoNumber)?.id || null : null,
                                },
                            },
                        },
                    });


                    updatedEmailIds.push(user.email);

                    vesselAssociations.push({
                        email: user.email,
                        imoNumber: user.imoNumber && user.imoNumber.trim() !== '' ? user.imoNumber || null : null,
                        vesselStatus: user?.vesselStatus && user?.vesselStatus.trim() !== '' ? user.vesselStatus?.toUpperCase() : null,
                        typeOfVessel: vesselMap.get(user.imoNumber)?.typeOfVessel,
                    });

                }


            } else {

                if (getAllDBEmails.includes(user.email)) {


                    // errors.push(errors.push(`Conflict in Row ${userIndex + 1}: email ID ${user.email} already exists with employee ID ${existingEmpIdsInDB.get(user.email?.toLowerCase())}`));
                    errors.push(errors.push(`Conflict in Row ${userIndex + 1}: The provided User ID or Email ID is already associated with another user`));
                    break;


                } else if (getAllDBEmpIds.includes(user.civilIdOrPassport.toLowerCase())) {

                    // errors.push(errors.push(`Conflict in Row ${userIndex + 1}: User ID ${user.civilIdOrPassport} already exists with Email ID ${existingEmailsInDB.get(user.civilIdOrPassport.toLowerCase())}`));
                    errors.push(errors.push(`Conflict in Row ${userIndex + 1}: The provided User ID or Email ID is already associated with another user`));
                    break;

                } else {


                    let password = dummyPassword.dummy_pwd;

                    inserts.push({
                        civilIdOrPassport: user.civilIdOrPassport?.toUpperCase(),
                        firstName: user.firstName,
                        lastName: user.lastName,
                        email: user.email?.toLowerCase(),
                        vesselStatus: user?.vesselStatus && user?.vesselStatus.trim() !== '' ? user.vesselStatus?.toUpperCase() : null,
                        currentVessel: user.imoNumber && user.imoNumber.trim() !== '' ? vesselMap.get(user.imoNumber)?.id || null : null,
                        password: await CryptoHelper.hash(password, 10),
                        subscriber: subscriber_Id ?? null,
                        isSignupAdminAprroved: true
                    });

                    if (user.imoNumber && user.vesselStatus.toUpperCase() !== VesselStatus.ONSHORE) {
                        vesselAssociations.push({
                            civilIdOrPassport: user.civilIdOrPassport,
                            imoNumber: user.imoNumber && user.imoNumber.trim() !== '' ? user.imoNumber || null : null,
                            vesselStatus: user?.vesselStatus && user?.vesselStatus.trim() !== '' ? user.vesselStatus?.toUpperCase() : null,
                            typeOfVessel: vesselMap.get(user.imoNumber)?.typeOfVessel,
                        });
                    }

                    passwordEmailList.push({ email: user.email, temp_password: password, firstName: user.firstName, buttonLink: `${process.env.APP_URL}/login?isResetPasswordDialog=false` });

                }
            }
            userIndex++;
        };


        if (errors.length > 0) {


            const createImportLog = await ImportLog.create({
                subscriber: subscriberId,
                uploadedBy: userId,
                fileName: newFileName,
                filePath: { url: saveCSV },
                importStatus: "FAILED",
                description: `${errors[0]}`,
            })


            if (!createImportLog) throw CustomError(ErrorName.FAILED, 'Failed to create import log');


            await sendNotificationOnBULK({
                subscriber: subscriberId,
                action: "Bulk Import Failed",
                createdBy: adminUser?._id,
                uploadedBy: adminUser?._id,
                isError: true,
                description: `${errors[0]}`,
                notificationType: 'BULK_IMPORT_FAILED',
                status: "FAILED",
                icon: notificationiconEnum.ERROR,
            });

            throw CustomError(
                ErrorName.VALIDATION_ERROR,
                `${errors[0]}`
            );


        }


        let bulkInsertUsers;
        let bulkUpdateUsers;


        let insertedUsers = [];
        let updatedUsersById = [];
        let updatedUsersByEmail = [];


        let endUsers = [];

        const saveEmployees = await DbTransactionHelper.performDbTransaction(async session => {

            bulkInsertUsers = await User.insertMany(inserts, { session: session });


            insertedUsers = await User.find({ email: { $in: inserts.map(u => u.email) } }).session(session);


            const bulkUpdateUsers = await User.bulkWrite(updates, { session });


            if (updatedEmpIds.length > 0) {

                updatedUsersById = await User.find({
                    $or: updatedEmpIds.map(id => ({
                        civilIdOrPassport: { $regex: `^${id}$`, $options: 'i' }
                    }))
                }).session(session);

            }
            updatedUsersByEmail = await User.find({ email: { $in: updatedEmailIds } }).session(session);


            const designationMap = new Map(
                existingDesignations.map(designation => [
                    designation.name?.toLowerCase(),
                    { id: designation._id }
                ])
            );


            const bulkId = uuidv4();
            const allUpdatedUsers = [...insertedUsers, ...updatedUsersByEmail, ...updatedUsersById];
            userCount = allUpdatedUsers?.length || 0;

            const automateLearningPlanIds = [];

            if (allUpdatedUsers.length > 0) {

                const userVesselsInsert = [];
                for (const vesselData of vesselAssociations) {
                    const originalUserData = allUpdatedUsers.filter(
                        user => user.civilIdOrPassport?.toLowerCase() === vesselData.civilIdOrPassport?.toLowerCase() || user.email?.toLowerCase() === vesselData.email?.toLowerCase()
                    );

                    if (originalUserData.length > 0) {

                        originalUserData.forEach(user => {

                            if (vesselData.imoNumber || vesselData.imoNumber === '') {

                                if (vesselData.imoNumber !== '') {

                                    userVesselsInsert.push({
                                        updateMany: {
                                            filter: { user: user._id, vessel: { $ne: vesselMap.get(vesselData?.imoNumber).id } },
                                            update: {
                                                $set: { isActive: false }
                                            }
                                        }
                                    });

                                } else {

                                    userVesselsInsert.push({
                                        updateMany: {
                                            filter: { user: user._id },
                                            update: {
                                                $set: { isActive: false }
                                            }
                                        }
                                    });

                                }

                                if (vesselData.vesselStatus !== '') {

                                    userVesselsInsert.push({
                                        updateOne: {
                                            filter: { user: user._id, vessel: vesselMap.get(vesselData.imoNumber).id },
                                            update: {
                                                $set: {
                                                    user: user._id,
                                                    vessel: vesselMap.get(vesselData.imoNumber).id,
                                                    vesselStatus: vesselData?.vesselStatus && vesselData?.vesselStatus.trim() !== '' ? vesselData?.vesselStatus.toUpperCase() || null : null,
                                                    isActive: true,
                                                }
                                            },
                                            upsert: true
                                        }
                                    });
                                }

                            } else {

                                userVesselsInsert.push({
                                    updateMany: {
                                        filter: { user: user._id },
                                        update: {
                                            $set: { isActive: false, vesselStatus: vesselData?.vesselStatus && vesselData?.vesselStatus.trim() !== '' ? vesselData?.vesselStatus.toUpperCase() || null : null }
                                        }
                                    }
                                });

                            }

                        });
                    }
                }

                if (userVesselsInsert.length > 0) {
                    await UserVessel.bulkWrite(userVesselsInsert, { session });
                }

                const employeesToInsert = allUpdatedUsers.map(user => {
                    const originalUserData = users.find(u => u.civilIdOrPassport.toLowerCase() === user.civilIdOrPassport.toLowerCase());


                    return {
                        updateOne: {
                            filter: { user: user },
                            update: {
                                $set: {
                                    user: user,
                                    subscriber: subscriberId,
                                    empDesignation: designationMap.get(originalUserData.designation.toLowerCase())?.id,
                                    bulkId: bulkId,
                                    isDeleted: false,
                                    regType: 2
                                }
                            },
                            upsert: true
                        }
                    };
                });


                await Employee.bulkWrite(employeesToInsert, { session });


                const newEmployees = await Employee.find({ UID: { $exists: false } }).session(session).lean();


                const uidUpdates = await Promise.all(newEmployees.map(async (employee) => {
                    const UID = await generateEmployeeUID({ subscriberId, session });
                    return {
                        updateOne: {
                            filter: { _id: employee._id },
                            update: { UID },
                            upsert: false
                        }
                    };
                }));


                await Employee.bulkWrite(uidUpdates, { session });


            } else {

                const createImportLog = await ImportLog.create({
                    subscriber: subscriberId,
                    uploadedBy: userId,
                    fileName: newFileName,
                    filePath: { url: saveCSV },
                    importStatus: "FAILED",
                    description: `No new data created/updated`
                })


                if (!createImportLog) throw CustomError(ErrorName.FAILED, 'Failed to create import log');

                throw CustomError(
                    ErrorName.VALIDATION_ERROR,
                    `No new data created/updated`
                );
            }

            // const userIDs = allUpdatedUsers.map(user => user._id);
            // const employees = await Employee.find(
            //     { user: { $in: userIDs } },
            //     { user: 1, empDesignation: 1, _id: 0 }
            // );

            // const empDesignationMap = {};
            // employees.forEach(employee => {
            //     empDesignationMap[employee.user] = employee.empDesignation;
            // });
            // const vesselIDs = allUpdatedUsers.map(user => user.currentVessel);
            // const vessels = await Vessel.find({ _id: { $in: vesselIDs } });
            // const vesselTypeMap = {};
            // vessels.forEach(vessel => {
            //     vesselTypeMap[vessel._id] = vessel.typeOfVessel;
            // });


            // const learningPlans = await LearningPlan.find({ isDeleted: false, status: 'ACTIVE' });
            // let conditionsList = []
            // try {
            //     allUpdatedUsers.forEach(user => {
            //         const originalUserData = users.find(u => u.civilIdOrPassport === user.civilIdOrPassport);

            //         const empDesignation = designationMap.get(originalUserData.designation.toLowerCase())?.id;
            //         const typeOfVesselIds = vesselTypeMap[user.currentVessel];

            //         const conditions = {
            //             designationID: empDesignation,
            //             vesselID: user.currentVessel ?? null,
            //             vesselTypeID: typeOfVesselIds ?? null,
            //             currentStatus: user.vesselStatus ?? VesselStatus.ONSHORE,
            //             email: user.email,
            //             _id: user._id

            //         };

            //         conditionsList.push(conditions);

            //     });

            //     const filteredPlans = await filterLearningPlans(learningPlans, conditionsList, session);


            //     if (filteredPlans.length > 0) {
            //         console.log("filteredPlans: ", filteredPlans);
            //     }
            // } catch (error) {
            //     console.error(`Error in Autoenrollment Learning Plans ${error.message}`);
            // }



            if (passwordEmailList.length > 0) {


                // await sendBulkEmails(passwordEmailList);


            }


        });
        if (insertedUsers.length > 0 || updatedUsersByEmail.length > 0 || updatedUsersById.length > 0) {
            await sendNotificationOnBULK({
                subscriber: subscriberId,
                action: "Bulk Import Success",
                createdBy: adminUser?._id,
                uploadedBy: adminUser?._id,
                isError: false,
                description: `Successfully created ${insertedUsers.length} user(s) and updated ${updatedUsersByEmail.length + updatedUsersById.length} user(s)`,
                notificationType: 'BULK_IMPORT_SUCCESS',
                status: "SUCCESS",
                icon: notificationiconEnum.SUCCESS,
            })

            const createImportLog = await ImportLog.create({
                subscriber: subscriberId,
                usersCount: userCount,
                uploadedBy: userId,
                fileName: newFileName,
                filePath: { url: saveCSV },
                importStatus: "SUCCESS",
                description: `Successfully created ${insertedUsers.length} user(s) and updated ${updatedUsersByEmail.length + updatedUsersById.length} user(s)`
            })
            if (!createImportLog) throw CustomError(ErrorName.FAILED, 'Failed to create import log');
        }

    },

    bulkValidationHelper: async (createReadStream, empIds, emails, dbemployeeIds, dbEmails, designationNames, imoNumbers, vesselStatus, users, userId, subscriberId, newFileName, saveCSV) => {

        let validationErrors = [];

        try {

            const fetchAdmin = await User.findOne({ superAdmin: { $ne: false } }).populate("currentVessel");
            const fetchAdminEmployee = await Employee.findOne({ user: fetchAdmin._id }).populate("empDesignation");
            const fetchAdminDesignation = fetchAdminEmployee?.empDesignation?.name;
            await new Promise((resolve, reject) => {
                const stream = createReadStream();
                const parser = csvParse({ columns: true, trim: true });
                stream.pipe(parser);

                let rowIndex = 0;
                let isEmptyFile = true;

                parser.on("data", async (row) => {

                    rowIndex++;

                    isEmptyFile = false;

                    validationErrors.push(await validateUserRow(row, { empIds, emails, dbemployeeIds, dbEmails, designationNames, imoNumbers, vesselStatus, fetchAdmin, fetchAdminDesignation }, rowIndex));

                    const hasNonEmptyArray = validationErrors.some(innerArray => innerArray.length > 0);
                    if (hasNonEmptyArray) {

                        return validationErrors;

                    } else {
                        let formatedData;
                        if (row["User ID*"] !== fetchAdmin.civilIdOrPassport && row["Email*"] !== fetchAdmin.email) {

                            if (Object.values(row).every(value => value === '' || value === null || value === undefined)) {
                                return;
                            }

                            formatedData = mapCSVRowToUser(row);
                            users.push(formatedData);

                        }
                    }

                });

                parser.on("end", async () => {

                    if (rowIndex === 0) {
                        validationErrors.push("The CSV file is empty.");
                    }
                    resolve()
                });
                parser.on("error", reject);

            });

            return validationErrors;

        } catch (error) {
            throw Error(error.message);
        }

    }
};
