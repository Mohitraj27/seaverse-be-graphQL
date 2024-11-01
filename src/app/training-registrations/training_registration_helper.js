const { ObjectId, Validator } = require("../../tools");
const { AuthUser, Role, CustomError, ErrorName, SendEmail } = require("../../util");

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


const fetchUserFromAutoSyncedGroups = (async (groups) => {

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
                    roleIds.push(groupId);
                    break;
                case groupTypes.subRole:
                    subRoleIds.push(groupId);
                    break;
                case groupTypes.regStatus:
                    regStatusIds.push(groupId);
                    break;
                case groupTypes.vessel:
                    vesselIds.push(groupId);
                    break;
                case groupTypes.vesselStatus:
                    vesselStatusIds.push(groupId);
                    break;
                case groupTypes.vesselType:
                    vesselTypeIds.push(groupId);
                    break;
                default:
                    break;
            }
        }

        const designationQuery = designationIds.length ? User.find({ designation: { $in: designationIds } }) : Promise.resolve([]);
        const roleQuery = roleIds.length ? User.find({ role: { $in: roleIds } }) : Promise.resolve([]);
        const subRoleQuery = subRoleIds.length ? User.find({ subRoles: { $in: subRoleIds } }) : Promise.resolve([]);
        const regStatusQuery = regStatusIds.length ? User.find({ isRegistered: { $in: regStatusIds } }) : Promise.resolve([]);
        const vesselQuery = vesselIds.length ? User.find({ vessel: { $in: vesselIds } }) : Promise.resolve([]);
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
            designationUsers,
            roleUsers,
            subRoleUsers,
            regStatusUsers,
            vesselUsers,
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
        console.log(error);
    }

})

module.exports = {
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
    enrolUserVerificationHelper: async (inputUsers, existingTrainings) => {

        let remainingUsers = [];
        let invalidEmails = [];
        let unRegEmails = [];
        let alreadyEnrolledEmails = [];
        let notEnrolledEmails = [];

        for (let user of inputUsers) {

            if (!Validator.isEmail(user.email)) {
                invalidEmails.push(user.email)
            } else if (!user.isRegistered) {
                unRegEmails.push(user.email)
            } else {
                remainingUsers.push(user);
            }

        }

        const userObjectIds = remainingUsers.map(user => user._id);
        const userObjectIdStrings = userObjectIds.map(id => id.toString());

        let alreadyEnrolledUserIds = [];
        let notEnrolledUserIds = [];

        existingTrainings.forEach(training => {
            alreadyEnrolledUserIds.push(...training.users.filter(user => userObjectIdStrings.includes(user.toString())));
            notEnrolledUserIds.push(...training.users.filter(user => !userObjectIdStrings.includes(user.toString())));
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

        return { invalidEmails, unRegEmails, alreadyEnrolledEmails, notEnrolledEmails };

    },
    createTrainingProgressHelper: async (users, trainings) => {

        
        let trainingProgressData;
        const existingProgressRecords = await TrainingProgress.find({
            training: { $in: trainings },
            user: { $in: users.map(user => user._id) }
        });
        
        const existingProgressSet = new Set(
            existingProgressRecords.map(record => `${record.training.toString()}-${record.user.toString()}`)
        );
        
        const newProgressEntries = trainings.flatMap(trainingId =>
            users.map(user => ({
                training: trainingId,
                user: user._id,
                status: 'notStarted',
                enroledStatus: true
            }))
        ).filter(entry =>
            !existingProgressSet.has(`${entry.training}-${entry.user}`)
        );
        
        if (newProgressEntries.length > 0) {
            trainingProgressData = await TrainingProgress.insertMany(newProgressEntries);
        }

        return trainingProgressData;

    },
    getAutoSyncUsers: async (groups) => {

        if (groups.length <= 0) {
            return [];
        }

        const autoSyncedUsers = await fetchUserFromAutoSyncedGroups(groups);
        if (autoSyncedUsers && autoSyncedUsers.length > 0) {
            return autoSyncedUsers;
        } else {
            return [];
        }
    },
    getCustomGroupUsers: async (groups) => {

        if (groups.length <= 0) {
            return [];
        }

        const users = [];
        const groupIds = groups.map(group => group.groupId);

        const getGroups = await GroupMember.find({ group: { $in: groupIds } });

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
            } else {
                return [];
            }
        }

    }
};
