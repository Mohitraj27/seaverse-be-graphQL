const { ObjectId, Validator } = require("../../tools");
const { AuthUser, Role, CustomError, ErrorName, SendEmail, DbTransactionHelper } = require("../../util");

const { TrainingRegistration } = require("./training_registration_model");
const { Employee } = require("../user/employee/employee_model");
const { User } = require("../user/user_model");

const NotificationHelper = require("../notifications/notification_helper");

const NotificationType = require("../notifications/notification_type.json");

const { groupTypes } = require("../../util");
const { Designation } = require("../designations/designation_model");
const { UserVessel } = require("../user/user-vessel-bridge/userVessel_model");
const { Vessel } = require("../vessle/vessel_model");
const { GroupMember } = require("../user/group-user/group_member_model");
const { Group } = require("../user/group-user/group_model");
const { TrainingProgress } = require("./training-progress/training_progress_model");

const TrainingRegistrationHelper = require("../training-registrations/training_registration_helper");
const EmployeeHelper = require("./../user/employee/employee_helper");
const LogHelper = require("../logs/log_helper");
const SubRoleHelper = require("../user/sub-roles/sub_role_helper");
const { BatchHelper } = require("../batches/batch_helper");
const { sendEmail } = require("../../util/aws_helper");
const Permission = require("../user/sub-roles/permission.json");
const LogType = require("../logs/log_type.json");
const { OverallTrainingProgress } = require("./overall-course-progress/overall_progress_model");
const { TrainingModuleContent } = require("../trainings/training_modules/training_module_contents/training_module_content_model")
const { TrainingModule } = require("../trainings/training_modules/training_module_model")
const { TrainingContentBridge } = require("../trainings/training_content_bridge/training_content_model")
const notificationiconEnum = require("../notifications/notification_icon.json");

const fetchUserFromAutoSyncedGroups = (async (groups, fromGetGroups) => {

    try {
        const users = [];

        const designationIds = [];
        const roleIds = [];
        const subRoleIds = [];
        const regStatusIds = [];
        const vesselIds = [];
        const vesselStatusIds = [];
        const vesselTypeIds = [];

        for (let group of groups) {
            const { groupType, groupId } = group;

            switch (groupType) {
                case groupTypes.designation:
                    designationIds.push(groupId);
                    break;
                case groupTypes.role:
                    roleIds.push(...groupId);
                    break;
                case groupTypes.subRole:
                    subRoleIds.push(groupId);
                    break;
                case groupTypes.vessel:
                    vesselIds.push(groupId);
                    break;
                case groupTypes.vesselStatus:
                    vesselStatusIds.push(...groupId);
                    break;
                case groupTypes.vesselType:
                    vesselTypeIds.push(groupId);
                    break;
                default:
                    break;
            }
        }

        const designationQuery = designationIds.length ? Employee.find({ empDesignation: { $in: designationIds } })
            .select({ user: 1 })
            .lean()
            .then(results => results.map(doc => ({ _id: doc.user }))) : Promise.resolve([]);

        const roleQuery = roleIds.length
            ? User.find({
                $or: roleIds.includes("ADMIN")
                    ? [
                        { role: "ADMIN" },
                        { "subRoles.name": "ADMIN" }
                    ]
                    : [
                        { role: "LEARNER", "subRoles.name": { $ne: "ADMIN" } }
                    ]
            }).populate("subRoles", "name")
            : Promise.resolve([]);


        const subRoleQuery = subRoleIds.length ? User.find({ subRoles: { $in: subRoleIds } }) : Promise.resolve([]);
        const regStatusQuery = regStatusIds.length ? User.find({ isRegistered: { $in: regStatusIds } }) : Promise.resolve([]);

        const vesselQuery = vesselIds.length ? UserVessel.find({ vessel: { $in: vesselIds }, isActive: true })
            .select({ user: 1 })
            .lean()
            .then(results => results.map(doc => ({ _id: doc.user }))) : Promise.resolve([]);

        const vesselStatusQuery = vesselStatusIds.length ? UserVessel.find({ vesselStatus: { $in: vesselStatusIds } })
            .select({ user: 1 })
            .lean()
            .then(results => results.map(doc => ({ _id: doc.user })))
            : Promise.resolve([]);

        let vesselTypeQuery;
        if (vesselTypeIds.length) {
            const vessels = await Vessel.find({ typeOfVessel: { $in: vesselTypeIds } });
            const vesselIdsFromType = vessels.map(x => x._id);
            vesselTypeQuery = vesselIdsFromType.length ? UserVessel.find({ vessel: { $in: vesselIdsFromType } })
                .select({ user: 1 })
                .lean()
                .then(results => results.map(doc => ({ _id: doc.user }))) : Promise.resolve([]);
        } else {
            vesselTypeQuery = Promise.resolve([]);
        }

        const [
            designationUsersIds,
            roleUsers,
            subRoleUsers,
            regStatusUsers,
            vesselUsersIds,
            vesselStatusUserIds,
            vesselTypeUserIds
        ] = await Promise.all([
            designationQuery,
            roleQuery,
            subRoleQuery,
            regStatusQuery,
            vesselQuery,
            vesselStatusQuery,
            vesselTypeQuery
        ]);

        let vesselStatusUsers = [];
        if (vesselStatusUserIds.length) {
            vesselStatusUsers = await User.find({ _id: { $in: vesselStatusUserIds } });
        }

        let vesselTypeUsers = [];
        if (vesselTypeUserIds.length) {
            vesselTypeUsers = await User.find({ _id: { $in: vesselTypeUserIds } });
        }

        let vesselUsers = [];
        if (vesselUsersIds.length) {
            vesselUsers = await User.find({ _id: { $in: vesselUsersIds } });
        }

        let designationUsers = [];
        if (designationUsersIds.length) {
            designationUsers = await User.find({ _id: { $in: designationUsersIds } });
        }


        if (fromGetGroups) {

            let result = [];

            for (let group of groups) {
                const { groupType, groupId } = group;

                switch (groupType) {
                    case groupTypes.designation:
                        result.push({ groupId, groupType, member: designationUsers });
                        break;
                    case groupTypes.role:
                        result.push({ groupId, groupType, member: roleUsers });
                        break;
                    case groupTypes.subRole:
                        result.push({ groupId, groupType, member: subRoleUsers });
                        break;
                    case groupTypes.regStatus:
                        result.push({ groupId, groupType, member: regStatusUsers });
                        break;
                    case groupTypes.vessel:
                        result.push({ groupId, groupType, member: vesselUsers });
                        break;
                    case groupTypes.vesselStatus:
                        result.push({ groupId, groupType, member: vesselStatusUsers });
                        break;
                    case groupTypes.vesselType:
                        result.push({ groupId, groupType, member: vesselTypeUsers });
                        break;
                    default:
                        break;
                }
            }

            return result;

        }

        return [
            ...designationUsers,
            ...roleUsers,
            ...subRoleUsers,
            ...regStatusUsers,
            ...vesselUsers,
            ...vesselStatusUsers,
            ...vesselTypeUsers
        ];

    } catch (error) {
        throw Error(error.message);
    }

})

const enrolUserVerificationHelper = (async (inputUsers, existingTrainings) => {

    try {

        let remainingUsers = [];
        let invalidEmails = [];
        let unRegEmails = [];
        let alreadyEnrolledEmails = [];
        let notEnrolledEmails = [];

        for (let user of inputUsers) {
            const existEmail = await User.findOne({ email: user.email });
            if (!Validator.isEmail(user.email)) {
                if (!invalidEmails.includes(user.email)) {
                    invalidEmails.push(user.email)
                }
            } else if (!user.isRegistered) {
                unRegEmails.push(user.email)
            } else if (!existEmail) {
                if (!invalidEmails.includes(user.email)) {
                    invalidEmails.push(user.email)
                }
            } else {
                remainingUsers.push(user);
            }
        }

        const userObjectIds = remainingUsers.map(user => user._id);
        const userObjectIdStrings = userObjectIds.map(id => id.toString());

        let alreadyEnrolledUserIds = [];
        let notEnrolledUserIds = [];

        if (existingTrainings) {
            existingTrainings.forEach(training => {
                if (userObjectIdStrings.includes(training.user.toString())) {
                    alreadyEnrolledUserIds.push(training.user.toString());
                } else {
                    notEnrolledUserIds.push(training.user.toString());
                }
            });
        }

        alreadyEnrolledUserIds = [...new Set(alreadyEnrolledUserIds)];
        notEnrolledUserIds = [...new Set(notEnrolledUserIds)];

        if (alreadyEnrolledUserIds.length > 0) {
            const enrolledUsers = await User.find({ _id: { $in: alreadyEnrolledUserIds } });
            alreadyEnrolledEmails.push(...enrolledUsers.map(user => user.email));
        }

        if (notEnrolledUserIds.length > 0) {
            const nonEnrolledUsers = await User.find({ _id: { $in: notEnrolledUserIds } });
            notEnrolledEmails.push(...nonEnrolledUsers.map(user => user.email));
        }

        return { invalidEmails, unRegEmails, alreadyEnrolledEmails, notEnrolledEmails };
    } catch (error) {
        throw Error(error.message);
    }

});

const extractTrainingContentData = async (trainings) => {

    const trainingContentBridges = await TrainingContentBridge.find({
        training: { $in: trainings.map(training => training._id) }
    });


    const trainingModulesMap = trainingContentBridges.reduce((result, bridge) => {
        const moduleId = bridge.trainingModule.toString();
        const contentId = bridge.trainingContent.toString();


        const existingModule = result.find(module => module.moduleId === moduleId);

        if (existingModule) {

            existingModule.contentIds.push(mongoose.Types.ObjectId(contentId));
        } else {

            result.push({
                moduleId: ObjectId(moduleId),
                contentIds: [ObjectId(contentId)]
            });
        }

        return result;
    }, []);
    const trainingTotalModules = trainingModulesMap.length
    return { trainingModulesMap, trainingTotalModules };
};

const createTrainingProgressHelper = async (users, trainings, subscriberId, latestRegistrationId, learningPlanId) => {

    let trainingProgressData;
    try {
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
                    return null;
                }

                return {
                    learningPlan: learningPlanId ? learningPlanId : null,
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
                };
            })
        ).filter(entry => entry !== null);

        if (newProgressEntries.length > 0) {
            trainingProgressData = await OverallTrainingProgress.insertMany(newProgressEntries);
        }
    } catch (error) {
        throw Error(error.message);
    }

    return trainingProgressData;
};

const getAutoSyncUsers = (async (groups) => {

    if (groups.length <= 0) {
        return [];
    }

    const autoSyncedUsers = await fetchUserFromAutoSyncedGroups(groups);
    if (autoSyncedUsers && autoSyncedUsers.length > 0) {
        return autoSyncedUsers;
    } else {
        return [];
    }
});
const getAutoSyncUsersOfSingleGroup = async (group) => {
    const groupArray = [{ groupType: group.groupType, groupId: group.groupId }];
    const autoSyncedUsers = await fetchUserFromAutoSyncedGroups(groupArray);
    if (autoSyncedUsers && autoSyncedUsers.length > 0) {
        return autoSyncedUsers;
    } else {
        return [];
    }
}

const getCustomGroupUsers = (async (groups) => {

    if (groups.length <= 0) {
        return [];
    }

    const users = [];
    const groupIds = groups.map(group => group.groupId);

    const getGroups = await GroupMember.find({ group: { $in: groupIds }, isDeleted: false });

    if (getGroups.length > 0) {

        users.push(...getGroups.map(group => group.member).filter(member => member != null));

        const groupOfGroups = getGroups.filter(group => group.groupType != null && group.groupData != null);

        if (groupOfGroups && groupOfGroups.length > 0) {

            const formattedGroups = groupOfGroups.map(group => ({
                groupType: group.groupType,
                groupId: group.groupData
            }));

            const membersInGroupGroups = await fetchUserFromAutoSyncedGroups(formattedGroups);

            users.push(...membersInGroupGroups);
            return [...users];
        }

        return users;
    }
    return [];

});

const combineTrainingModules = (data) => {

    const firstData = data[0];

    data.forEach(item => {

        if (firstData.trainingModules.length > 1) {
            if (firstData._id == item._id) {
                firstData.trainingModules = [...firstData.trainingModules, ...item.trainingModules];
            }
        }

    });

    return [firstData];
}

module.exports = {
    enrolUserVerificationHelper,
    createTrainingProgressHelper,
    getAutoSyncUsers,
    getCustomGroupUsers,
    fetchUserFromAutoSyncedGroups,
    getAutoSyncUsersOfSingleGroup,
    combineTrainingModules,
    extractTrainingContentData,
    createTrainingRegistration: async (input, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [Permission.CREATE_TRAINING_REGISTRATION],
                requiredAll: false,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

        try {

            if (!input.groups && !input.users) {
                throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Pass all the required fields!");
            }

            let existingTrainings = [];
            if (input.trainings && input.trainings.length > 0) {
                existingTrainings = await OverallTrainingProgress.find({ training: { $in: input.trainings } });
            }

            if (input.type === "ENROLL") {

                let autoSyncUsers, customGroups;
                let customGroupUsers = [];
                let allUsersFetched = [];

                if (input.groups) {

                    autoSyncUsers = await getAutoSyncUsers(input.groups);

                    customGroups = input.groups.filter(group => group.groupType === 'custom');

                    if (customGroups && customGroups.length > 0) {
                        customGroupUsers = await getCustomGroupUsers(customGroups);
                    }

                    allUsersFetched = [...autoSyncUsers, ...customGroupUsers];
                }

                const userIds = [];
                const emails = [];
                let users = [];

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

                users = Array.from(
                    new Map(allUsersFetched.map(user => [user._id.toString(), user])).values()
                );

                if (input.learningPlan) {

                    if (users.length > 0) {

                        const verifiedUsers = await enrolUserVerificationHelper(users, existingTrainings);

                        if (verifiedUsers.unRegEmails.length > 0) {
                            throw CustomError(ErrorName.EMPLOYEE_NOT_REGISTERED);
                        }

                        if (verifiedUsers.invalidEmails.length > 0) {
                            throw CustomError(ErrorName.INVALID_EMAIL);
                        }

                        if (verifiedUsers.alreadyEnrolledEmails.length > 0 && !input.learningPlan) {
                            throw CustomError(ErrorName.ALREADY_EXIST);
                        }

                    }

                }

                let userObjectIds = [];
                if (users.length > 0) {
                    userObjectIds = users.map(user => user._id);
                }

                const alreadyExistInCourse = await OverallTrainingProgress.find({ user: { $in: userObjectIds }, training: { $in: input.trainings }, isEnrolled: false });
                if (alreadyExistInCourse.length > 0) {
                    await OverallTrainingProgress.updateMany(
                        { user: { $in: userObjectIds }, training: { $in: input.trainings } },
                        { $set: { isEnrolled: true } }
                    );
                }


                const savedTrainingRegistration = await DbTransactionHelper.performDbTransaction(
                    async session => {

                        const batchUID = await BatchHelper.generateBatchUID({ subscriberId, session });

                        const existingTrainingIds = existingTrainings.map(t => t.training.toString());

                        const newTrainingIds = input.trainings.filter(id => !existingTrainingIds.includes(id.toString()));

                        const updateFields = { subscriber: subscriberId };
                        if (userObjectIds && userObjectIds.length > 0) {
                            updateFields.$addToSet = { ...updateFields.$addToSet, users: { $each: userObjectIds } };
                        }
                        if (input.groups && input.groups.length > 0) {
                            updateFields.$addToSet = { ...updateFields.$addToSet, groups: { $each: input.groups } };
                        }

                        let savedTrainingRegistration;
                        let trainingRegistrationIds;

                        if (existingTrainingIds.length > 0) {
                            savedTrainingRegistration = await TrainingRegistration.updateMany(
                                { training: { $in: existingTrainingIds } },
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

                            learningPlanId = input.learningPlan ? input.learningPlan._id : null;
                            trainingProgressData = await createTrainingProgressHelper(users, input.trainings, subscriberId, trainingRegistrationIds, learningPlanId);

                        }


                        if (!savedTrainingRegistration) throw CustomError(ErrorName.FAILED);

                        users.forEach(user => {
                            sendEmail({
                                receiverEmail: user.email,
                                subject: "Course Enrollment",
                                htmlContent:
                                    `<div div style="width: 600px; margin: 0 auto; text-align: center" >
                                        <p>Hello ${user.firstName}</p>
                                        <div style="font-weight: 400;font-size: 12px;font-family: sans-serif;color: #281166;margin: 20px;">You are assigned to a new course</div>
                                    </div > `
                            })
                        })

                        return savedTrainingRegistration;
                    }
                );
                await NotificationHelper.createNotificationhelper({
                    subscriber: subscriberId,
                    titleValue: `New Course has been enrolled to you`,
                    messageValue: `You have been assigned to a new Course by ${userInfo.firstName} ${userInfo.lastName}.`,
                    notificationType: NotificationType.NEW_COURSE_ENROLLMENT,
                    notifyAdmin: false,
                    notifiers:[
                        userId
                    ],
                    employeeNotifiers:[userId],
                    affected: [],
                    status: 'SENT',
                    icon: notificationiconEnum.SUCCESS,
                    createdBy: userInfo,
                });
        
                await NotificationHelper.createNotificationhelper({
                    subscriber: subscriberId,
                    titleValue: `New Course Enrollment`,
                    messageValue: `A new Course Enrollment has been successfully done by ${userInfo.firstName} ${userInfo.lastName}.`,
                    notificationType: NotificationType.NEW_COURSE_ENROLLMENT,
                    notifyAdmin: true,
                    notifiers:[],
                    employeeNotifiers:[],
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

            }

            if (input.type === "UNENROLL") {

                if (!input.users) {
                    throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Pass all the required fields!");
                }

                const userIds = [];
                const emails = [];

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

                let userObjectIds = [];
                if (inputUsers.length > 0) {
                    userObjectIds = inputUsers.map(user => user._id);

                    const verifiedUsers = await enrolUserVerificationHelper(inputUsers, existingTrainings);

                    if (verifiedUsers.unRegEmails.length > 0) {
                        throw CustomError(ErrorName.EMPLOYEE_NOT_REGISTERED);
                    }

                    if (verifiedUsers.invalidEmails.length > 0) {
                        throw CustomError(ErrorName.INVALID_EMAIL);
                    }

                    if (verifiedUsers.alreadyEnrolledEmails.length != userObjectIds.length) {
                        throw CustomError(ErrorName.EMPLOYEE_NOT_ENROLLED, "Selected employee is not enrolled before!");
                    }
                }

                const unenrollTrainingRegistration = await DbTransactionHelper.performDbTransaction(
                    async session => {

                        if (!existingTrainings) {
                            throw CustomError(ErrorName.NOT_FOUND, "Pass the training ID");
                        }

                        const userObjectIdStrings = userObjectIds.map(id => id.toString());

                        const existTrainingReg = await TrainingRegistration.find({ training: { $in: input.trainings } });
                        const updatedUsersInTraining = existTrainingReg[0].users.filter(
                            userId => !userObjectIdStrings.includes(userId.toString())
                        );

                        existTrainingReg[0].users = updatedUsersInTraining;
                        const updateTrainingRegistration = await existTrainingReg[0].save({ session });

                        if (!updateTrainingRegistration) throw CustomError(ErrorName.FAILED);

                        const unenrolledUsers = await OverallTrainingProgress.updateMany(
                            { user: { $in: userObjectIds }, training: { $in: existingTrainings.map(t => t.training) } },
                            { $set: { isEnrolled: false } },
                            { session }
                        );

                        return updateTrainingRegistration;
                    }
                );

                await NotificationHelper.createNotificationhelper({
                    subscriber: subscriberId,
                    titleValue: `A Course has been unenrolled to you`,
                    messageValue: `You have been unassigned from a  Course by ${userInfo.firstName} ${userInfo.lastName}.`,
                    notificationType: NotificationType.COURSE_UNENROLLMENT,
                    notifyAdmin: false,
                    notifiers:[
                        userId
                    ],
                    employeeNotifiers:[userId],
                    affected: [],
                    status: 'SENT',
                    icon: notificationiconEnum.SUCCESS,
                    createdBy: userInfo,
                });
        
                await NotificationHelper.createNotificationhelper({
                    subscriber: subscriberId,
                    titleValue: `Course Unenrollment`,
                    messageValue: `A  Course Unenrollment has been successfully done by ${userInfo.firstName} ${userInfo.lastName}.`,
                    notificationType: NotificationType.COURSE_UNENROLLMENT,
                    notifyAdmin: true,
                    notifiers:[],
                    employeeNotifiers:[],
                    affected: [],
                    status: 'SENT',
                    icon: notificationiconEnum.SUCCESS,
                    createdBy: userInfo,
                });

                return {
                    message: "Course unenrollment successful!",
                }

            }

        } catch (error) {
            throw CustomError(ErrorName.FAILED, error.message);
        }

    },
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
    }
};
