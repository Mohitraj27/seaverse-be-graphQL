const { ObjectId, Validator } = require("../../tools");
const { AuthUser, Role, CustomError, ErrorName, SendEmail, DbTransactionHelper } = require("../../util");

const { TrainingRegistration } = require("./training_registration_model");
const { Employee } = require("../user/employee/employee_model");
const { User } = require("../user/user_model");
const { SubRole } = require("../user/sub-roles/sub_role_model");
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
const courseEnrollment = require("../email-template/courseEnrollment");
const courseUnenrollmentEmail = require("../email-template/courseUnenrollment");
const { Training } = require("../trainings/training_model");
const { sendNotifications } = require("../../util/firebase_helper");
const { LearningPlan } = require("../learning-plan/learning_plan_model");
const Roles = require("../../util/role.json");
const AWS_HELPER = require("../../util/aws_helper");
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
                    if (Array.isArray(groupId)) {
                        roleIds.push(...groupId);
                    } else {
                        roleIds.push(groupId);
                    }
                    break;
                case groupTypes.subRole:
                    subRoleIds.push(groupId);
                    break;
                case groupTypes.vessel:
                    vesselIds.push(groupId);
                    break;
                case groupTypes.vesselStatus:
                    if (Array.isArray(groupId)) {
                        vesselStatusIds.push(...groupId);
                    } else {
                        vesselStatusIds.push(groupId);
                    }
                    break;
                case groupTypes.vesselType:
                    vesselTypeIds.push(groupId);
                    break;
                default:
                    break;
            }
        }

        const designationQuery = designationIds.length > 0 ? Employee.find({ empDesignation: { $in: designationIds } })
            .select({ user: 1 })
            .lean()
            .then(results => results.map(doc => ({ _id: doc.user }))) : Promise.resolve([]);

        const adminUsers = [];
        const learnerUsers = [];

        const roleUsersQuery = await User.find({ role: "LEARNER" }).populate("subRoles", "name");
        roleUsersQuery.forEach(user => {
            if (user.subRoles.length > 0) {
                user.subRoles.forEach(subRole => {
                    if (roleIds.includes(subRole.name)) {
                        if (subRole.name === "ADMIN" && roleIds.includes("ADMIN")) {
                            adminUsers.push(user);
                        }
                        if (subRole.name !== "ADMIN" && roleIds.includes("LEARNER")) {
                            learnerUsers.push(user);
                        }
                    }
                });
            } else if (roleIds.includes("LEARNER")) {
                learnerUsers.push(user);
            }
        });

        let roleQuery = [];
        if (roleIds.includes("ADMIN")) {
            roleQuery = adminUsers;
        } else if (roleIds.includes("LEARNER")) {
            roleQuery = learnerUsers;
        } else {
            roleQuery = Promise.resolve([]);
        }

        const subRoleQuery = subRoleIds.length > 0 ? User.find({ subRoles: { $in: subRoleIds }, isDeleted: { $ne: false } }) : Promise.resolve([]);
        const regStatusQuery = regStatusIds.length > 0 ? User.find({ isRegistered: { $in: regStatusIds }, isDeleted: { $ne: false } }) : Promise.resolve([]);

        const vesselQuery = vesselIds.length > 0 ? User.find({ currentVessel: { $in: vesselIds }, isDeleted: { $ne: true } }) : Promise.resolve([]);

        const vesselStatusQuery = vesselStatusIds.length > 0 ? User.find({ vesselStatus: { $in: vesselStatusIds }, isDeleted: { $ne: true } }) : Promise.resolve([]);

        let vesselTypeQuery;
        if (vesselTypeIds.length > 0) {
            const vessels = await Vessel.find({ typeOfVessel: { $in: vesselTypeIds } });
            const vesselIdsFromType = vessels.map(x => x._id);
            vesselTypeQuery = vesselIdsFromType.length > 0 ? UserVessel.find({ vessel: { $in: vesselIdsFromType }, isActive: { $ne: false } })
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
            vesselStatusUsers = await User.find({ _id: { $in: vesselStatusUserIds }, isDeleted: { $ne: true } });
        }

        let vesselTypeUsers = [];
        if (vesselTypeUserIds.length) {
            vesselTypeUsers = await User.find({ _id: { $in: vesselTypeUserIds }, isDeleted: { $ne: true } });
        }

        let vesselUsers = [];
        if (vesselUsersIds.length) {
            vesselUsers = await User.find({ _id: { $in: vesselUsersIds }, isDeleted: { $ne: true } });
        }

        let designationUsers = [];
        if (designationUsersIds.length) {
            designationUsers = await User.find({ _id: { $in: designationUsersIds }, isDeleted: { $ne: true } });
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

const enrolUserVerificationHelper = (async (inputUsers, existingTrainings, fromUnenroll) => {

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
                if (fromUnenroll) {
                    remainingUsers.push(user);
                }
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
                if (userObjectIdStrings.includes(training.user.toString()) && training.isEnrolled === true) {
                    alreadyEnrolledUserIds.push(training.user.toString());
                } else {
                    notEnrolledUserIds.push(training.user.toString());
                }
            });
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
        }


        return { invalidEmails, unRegEmails, alreadyEnrolledEmails, notEnrolledEmails };
    } catch (error) {
        throw Error(error.message);
    }

});

const extractTrainingContentData = async (trainings) => {

    const trainingContentBridges = await TrainingContentBridge.find({
        training: { $in: trainings.map(training => training._id) }, isDeleted: false
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

        let trainingIds, trainingModuleCounts, trainingIdToModuleCount;
        
        if (trainings.length > 0) {

            trainingIds = trainings.map(training => training._id);
            trainingModuleCounts = await TrainingModule.aggregate([
                {
                    $match: { training: { $in: trainingIds } }
                },
                {
                    $group: {
                        _id: "$training",
                        count: { $sum: 1 }
                    }
                }
            ]);

            trainingIdToModuleCount = trainingModuleCounts.reduce((acc, { _id, count }) => {
                acc[_id] = count;
                return acc;
            }, {});

        }

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
                            totalTrainingModules: trainingIdToModuleCount[training] || 0,
                            startDate: null,
                            endDate: null,
                        },
                    },
                };
            })
        ).filter(entry => entry !== null);

        if (newProgressEntries.length > 0) {
            trainingProgressData = await OverallTrainingProgress.bulkWrite(newProgressEntries);
        }
    } catch (error) {
        console.log(error);
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

    const mergedData = {};

    data.forEach(item => {
        const { _id, trainingModules, ...rest } = item;

        if (!mergedData[_id]) {
            mergedData[_id] = { _id, ...rest, trainingModules: [] };
        }

        Object.keys(rest).forEach(key => {
            if (!mergedData[_id][key] && rest[key] !== undefined) {
                mergedData[_id][key] = rest[key];
            }
        });

        mergedData[_id].trainingModules.push(...trainingModules);
    });
    Object.keys(mergedData).forEach(id => {
        mergedData[id].trainingModules = Array.from(
            new Set(mergedData[id].trainingModules.map(JSON.stringify))
        ).map(JSON.parse);
    });

    return Object.values(mergedData);

}
const mergeContentDetails = (combineTrainingDetails, contentData) => {

    const contentDataMap = contentData.reduce((map, item) => {
        map[item._id] = item.contentData.reduce((contentMap, content) => {
            contentMap[content.contentId] = content;
            return contentMap;
        }, {});
        return map;
    }, {});

    combineTrainingDetails.forEach(entry => {
        entry.trainingModules.forEach(module => {
            module.trainingModuleContents.forEach(content => {
                content.trainingModuleContentDetails.forEach(detail => {
                    const moduleContentMap = contentDataMap[module._id];
                    if (moduleContentMap && moduleContentMap[detail._id]) {
                        const matchedContent = moduleContentMap[detail._id];
                        detail.progressPercentage = matchedContent.progressPercentage;
                        detail.status = matchedContent.status;
                        detail.lastAccessedDuration = matchedContent.lastAccessedDuration;
                        detail.quizAttemptDetails = matchedContent.quizAttemptDetails || {};
                    }
                });
            });
        });
    });

    return combineTrainingDetails;

}

module.exports = {
    enrolUserVerificationHelper,
    createTrainingProgressHelper,
    getAutoSyncUsers,
    getCustomGroupUsers,
    fetchUserFromAutoSyncedGroups,
    getAutoSyncUsersOfSingleGroup,
    combineTrainingModules,
    mergeContentDetails,
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

            const fetchedUserIds = allUsersFetched.map(user => user._id);

            let existingOverallProgresses = await OverallTrainingProgress.find({ training: { $in: input.trainings }, user: { $in: fetchedUserIds } });

            if (input.type === "ENROLL") {

                let users = [];

                users = Array.from(
                    new Map(allUsersFetched.map(user => [user._id.toString(), user])).values()
                );

                if (input.learningPlan) {
                    if (users.length > 0) {

                        const verifiedUsers = await enrolUserVerificationHelper(users);

                        if (verifiedUsers.unRegEmails.length > 0) {
                            throw CustomError(ErrorName.EMPLOYEE_NOT_REGISTERED);
                        }

                        if (verifiedUsers.invalidEmails.length > 0) {
                            throw CustomError(ErrorName.INVALID_EMAIL);
                        }

                    }
                }

                // During re-enrollment
                const verifyRegistrationForReEnrollment = await enrolUserVerificationHelper(users, existingOverallProgresses, false);
                if (verifyRegistrationForReEnrollment.unRegEmails.length > 0) {
                    throw CustomError(ErrorName.EMPLOYEE_NOT_REGISTERED, "Selected user is not registered!");
                };

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

                const savedTrainingRegistration = await DbTransactionHelper.performDbTransaction(
                    async session => {

                        const batchUID = await BatchHelper.generateBatchUID({ subscriberId, session });

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

                            trainingProgressData = await createTrainingProgressHelper(users, input.trainings, subscriberId, trainingRegistrationIds, learningPlanId);

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
                );
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
                await sendNotifications({
                    userIds: userObjectIds,
                    title: "Course Enrollment",
                    body: `You have been enrolled in a new course by ${userInfo.firstName} ${userInfo.lastName}.`,
                    content: { type: "COURSE_ENROLLMENT", courseIds: input.trainings },
                    webUrl: ""
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

                    const verifiedUsers = await enrolUserVerificationHelper(inputUsers, existingOverallProgresses, true);

                    if (verifiedUsers.invalidEmails.length > 0) {
                        throw CustomError(ErrorName.INVALID_EMAIL);
                    }

                    if (verifiedUsers.alreadyEnrolledEmails.length != userObjectIds.length) {
                        throw CustomError(ErrorName.EMPLOYEE_NOT_ENROLLED, "Selected employee is not enrolled before!");
                    }
                }

                const unenrollTrainingRegistration = await DbTransactionHelper.performDbTransaction(
                    async session => {

                        if (!existingOverallProgresses) {
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

                        const unenrollUsers = await OverallTrainingProgress.updateMany(
                            { user: { $in: userObjectIds }, training: { $in: existingOverallProgresses.map(t => t.training) } },
                            {
                                $set: {
                                    isEnrolled: false,
                                    contentData: [],
                                    progressPercentage: 0.00,
                                    lastConsumedContent: {},
                                    startDate: null,
                                    endDate: null,
                                    status: 'NOT_STARTED',
                                    attemptCount: 1,
                                    timeSpend: 0,
                                    learningPlan: [],
                                }
                            },
                            { session }
                        );

                        const unenrolledUsers = await OverallTrainingProgress.find({
                            user: { $in: userObjectIds },
                            training: { $in: existingOverallProgresses.map(t => t.training) }
                        }).session(session);

                        const unenrolledUserIds = unenrolledUsers.map(user => user._id);

                        const deleteTrainingProgresses = await TrainingProgress.deleteMany({
                            overallTrainingProgress: { $in: unenrolledUserIds }
                        });

                        const trainings = await Training.aggregate([
                            { $match: { _id: { $in: input.trainings } } },
                            { $project: { title: 1 } }
                        ]);
                        inputUsers.forEach(user => {
                            trainings.forEach(training => {
                                const trainingTitle = training.title && training.title.length > 0 ? training.title[0].value : ' ';
                                const emailContent = courseUnenrollmentEmail({
                                    firstName: user.firstName,
                                    email: user.email,
                                    courseTitle: trainingTitle,
                                });
                                sendEmail({
                                    receiverEmail: user.email,
                                    subject: `Unenrolled from ${trainingTitle}`,
                                    htmlContent: emailContent,
                                });
                            });
                        });
                        return updateTrainingRegistration;
                    }
                );
                for (const userId of userObjectIds) {
                    await Promise.all(
                        input.trainings.map(async (trainingId) => {
                            try {
                                await NotificationHelper.createNotificationhelper({
                                    subscriber: subscriberId,
                                    titleValue: `A Course has been unenrolled to you`,
                                    messageValue: `You have been unassigned from a  Course by ${userInfo.firstName} ${userInfo.lastName}.`,
                                    notificationType: NotificationType.COURSE_UNENROLLMENT,
                                    notifyAdmin: false,
                                    notifiers: [
                                        userId
                                    ],
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
                    titleValue: `Course Unenrollment`,
                    messageValue: `A  Course Unenrollment has been successfully done by ${userInfo.firstName} ${userInfo.lastName}.`,
                    notificationType: NotificationType.COURSE_UNENROLLMENT,
                    notifyAdmin: true,
                    notifiers: [],
                    employeeNotifiers: [],
                    affected: [],
                    status: 'SENT',
                    icon: notificationiconEnum.SUCCESS,
                    createdBy: userInfo,
                });
                await sendNotifications({
                    userIds: userObjectIds,
                    title: "Course Unenrollment",
                    body: `You have been unenrolled from a course by ${userInfo.firstName} ${userInfo.lastName}.`,
                    content: { type: "COURSE_UNENROLLMENT", courseIds: input.trainings },
                    webUrl: "",
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
            throw CustomError(ErrorName.FAILED, e.message);
        }
    }
};
