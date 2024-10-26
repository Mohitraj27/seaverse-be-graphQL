const { ObjectId, Validator } = require("../../tools");
const { AuthUser, Role, CustomError, ErrorName, SendEmail } = require("../../util");

const { TrainingRegistration } = require("./training_registration_model");
const { Employee } = require("../user/employee/employee_model");
const { User } = require("../user/user_model");

const NotificationHelper = require("../notifications/notification_helper");

const NotificationType = require("../notifications/notification_type.json");
const { UserTrainingEnrolment } = require("./training-enrolment/training_enrolment_model");

const { groupType } = require("../../util");
const { Designation } = require("../designations/designation_model");
const { UserVessel } = require("../user/user-vessel-bridge/userVessel_model");
const { Vessel } = require("../vessle/vessel_model");
const { GroupMember } = require("../user/group-user/group_member_model");

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
    enrolUserVerificationHelper: async (inputUsers) => {

        let objectIds = [];
        let emails = [];
        let invalidEmails = [];
        let unRegEmails = [];
        let alreadyEnrolledEmails = [];

        for (let user of inputUsers) {
            if (ObjectId.isValid(user)) {
                objectIds.push(user);
            } else {
                if (!Validator.isEmail(user)) {
                    invalidEmails.push(user)
                } else {
                    emails.push(user);
                }
            }
        }

        let users = [];

        if (objectIds.length > 0 && emails.length > 0) {
            users = await User.find({
                $or: [
                    { _id: { $in: objectIds } },
                    { email: { $in: emails } }
                ]
            });
        } else if (objectIds.length > 0) {
            users = await User.find({ _id: { $in: objectIds } });
        } else if (emails.length > 0) {
            users = await User.find({ email: { $in: emails } });
        }

        for (let user of users) {
            if (!user.isRegistered) {
                unRegEmails.push(user.email)
            }
        }

        const userObjectIds = users.map(user => user._id);

        const alreadyEnrolled = await UserTrainingEnrolment.find({ user: { $in: userObjectIds } }).populate("user");

        if (alreadyEnrolled.length > 0) {
            alreadyEnrolledEmails = alreadyEnrolled.map(user => user.user.email);
        }

        return { objectIds, emails, invalidEmails, unRegEmails, alreadyEnrolledEmails, users };

    },
    getAutoSyncUsers: async (groups) => {

        // Group structure: [
        //  { groupType: 'designation', groupId: '5f5f5f5f5f5f5f5f5f5f5f5f' },
        //  { groupType: 'role', groupId: 'LEARNER' }
        // ]

        const users = [];

        for (let group of groups) {
            const groupTypes = group.groupType;
            const groupId = group.groupId;

            switch (groupTypes) {
                case groupType.designation:
                    const designationUsers = await User.find({ designation: groupId });
                    if (designationUsers) {
                        users.push(...designationUsers);
                    }
                    break;
                case groupType.role:
                    const roleUsers = await User.find({ role: groupId });
                    if (roleUsers) {
                        users.push(...roleUsers);
                    }
                    break;
                case groupType.subRole:
                    const subRoleUsers = await User.find({ subRole: { $in: [groupId] } });
                    if (subRoleUsers) {
                        users.push(...subRoleUsers);
                    }
                    break;
                case groupType.regStatus:
                    const regStatusUsers = await User.find({ regStatus: groupId });
                    if (regStatusUsers) {
                        users.push(...regStatusUsers);
                    }
                    break;
                case groupType.vessel:
                    const vesselUsers = await User.find({ vessel: groupId });
                    if (vesselUsers) {
                        users.push(...vesselUsers);
                    }
                    break;
                case groupType.vesselStatus:
                    const groupUsers = await Employee.find({ vesselStatus: groupId });
                    if (groupUsers) {
                        users.push(...groupUsers);
                    }
                    break;
                case groupType.vesselStatus:
                    const vesselTypes = await UserVessel.find({ vesselType: groupId }).populate("user");
                    if (vesselTypes.length > 0) {
                        users.push(...vesselTypes.map(x => x.user));
                    }
                    break;
                case group.vesselType:
                    const vessels = await Vessel.find({ typeOfVessel: groupId });
                    if (vessels.length > 0) {
                        const userVessel = await UserVessel.find({ vessel: { $in: vessels.map(x => x._id) } }).populate("user");
                        if (userVessel.length > 0) {
                            users.push(...userVessel.map(x => x.user));
                        }
                    }
                    break;
                default:
                    break;
            }
        }
    }
};
