const {
    SendEmail,
    AuthUser,
    CustomError,
    ErrorName,
    DbTransactionHelper,
    Role,
    EmailTemplate,
    CurrentDateTime,
    VesselStatus,
    UploadHelper,
} = require("../../../util");
const { JwtHelper, CryptoHelper, ObjectId, PubSubHelper, Validator } = require("../../../tools");

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

const BatchStatus = require("../../batches/batch_status.json");
const NotificationType = require("../../notifications/notification_type.json");
const Permission = require("../sub-roles/permission.json");
const TrainingRegistrationStatus = require("../../training-registrations/training_registration_status.json");
const LogType = require("../../logs/log_type.json");
const { v4: uuidv4 } = require('uuid')
const UserHelper = require("../user_helper");
const { Vessel } = require("../../vessle/vessel_model");
const { parse } = require("json2csv");
const { parse: csvParse } = require("csv-parse");
const { ImportLog } = require("../import-log/import_log_model");
const { UserVessel } = require("../user-vessel-bridge/userVessel_model");
const { Notification } = require("../../notifications/notification_model");
const NotificationEvent = require("../../notifications/notification_event.json");
const { sendNodeEmail, generateRandomString } = require("../user-profile/user_profile_helper");
const { LearningPlan } = require("../../learning-plan/learning_plan_model");
const notificationiconEnum = require("../../notifications/notification_icon.json");
const { sendNotifications } = require("../../../util/firebase_helper");
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
const filterLearningPlans = async (learningPlans, conditions) => {
    const { designationID, vesselID, vesselTypeID, currentStatus, email } = conditions;

    return learningPlans?.filter(plan => {
        const { conditionType, conditionalCustomFields } = plan;

        let matches = conditionalCustomFields.map(field => {
            const { type_of_Field, valueOfField, isOrIsNot, groupIDs } = field;

            switch (type_of_Field) {
                case "DESIGNATION":
                    return isOrIsNot === "IS"
                        ? valueOfField.includes(designationID)
                        : !valueOfField.includes(designationID);

                case "VESSEL":
                    return isOrIsNot === "IS"
                        ? valueOfField.includes(vesselID)
                        : !valueOfField.includes(vesselID);

                case "VESSEL_TYPE":
                    return isOrIsNot === "IS"
                        ? valueOfField.includes(vesselTypeID)
                        : !valueOfField.includes(vesselTypeID);

                case "CURRENT_STATUS":
                    return isOrIsNot === "IS"
                        ? valueOfField.includes(currentStatus)
                        : !valueOfField.includes(currentStatus);
                case "EMAIL":
                    return isOrIsNot === "IS"
                        ? valueOfField.includes(email)
                        : !valueOfField.includes(email);
                case "GROUP":
                    return groupIDs?.some(group => {
                        switch (group.groupType) {
                            case "designation":
                                return group.groupIDs.includes(designationID);
                            case "vessel":
                                return group.groupIDs.includes(vesselID);
                            case "vesselType":
                                return group.groupIDs.includes(vesselTypeID);
                            case "vesselStatus":
                                return group.groupIDs.includes(currentStatus);
                            default:
                                return false;
                        }
                    });
                default:
                    return false;
            }
        });

        if (conditionType === "MATCH_ANY_CONDITION") {
            return matches.some(match => match === true);
        }

        if (conditionType === "MATCH_ALL_CONDITION") {
            return matches.every(match => match === true);
        }

        return false;
    });
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
            const employeeName = `${notificationData.employee?.user?.firstName} ${notificationData.employee?.user?.lastName}`;
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
            status: notificationData.status
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

        const deletedUsers = getUsers.map(user => {
            const userObject = user.toObject();
            userObject.isDeleted = true;
            return new DeletedUser(userObject);
        });

        const updateDeletedList = await DeletedUser.insertMany(deletedUsers);

        if (updateDeletedList) {

            let deleteUsers = await User.deleteMany({ _id: { $in: users } });

            await Employee.updateMany(
                { user: { $in: users } },
                { $set: { isDeleted: true } }
            );

            if (deleteUsers) {

                const getAdminGroups = await Group.find({ groupAdmin: { $in: users }, isManagerDefault: true });

                if (getAdminGroups.length > 0) {

                    const deletedGroups = getAdminGroups.map(group => {
                        const groupObject = group.toObject();
                        groupObject.isDeleted = true;
                        return new DeletedGroup(groupObject);
                    });

                    await DeletedGroup.insertMany(deletedGroups);

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
                    ]
                );

                const updateGroupMember = await GroupMember.updateMany(
                    { member: { $in: users } },
                    { $set: { isDeleted: true } }
                );

                if (updateGroupMember) {
                    return deleteUsers;
                }

            } else {
                errors.push("Error while deleting users");
                return;
            }

        } else {
            errors.push("Error while deleting users");
            return;
        }

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
                throw new Error("No deleted users found");
            }


            const restoredUsers = getDeletedUsers.map(deletedUser => {
                const userObject = deletedUser.toObject();
                userObject.isDeleted = false;
                return new User(userObject);
            });

            const insertRestoredUsers = await User.insertMany(restoredUsers, { session });

            if (!insertRestoredUsers) {
                throw new Error("Error while restoring users");
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


            const userGroupMembers = await GroupMember.find(
                { member: { $in: users }, isDeleted: false }
            ).select('group member').session(session);


            const groupUpdates = userGroupMembers.reduce((acc, groupMember) => {
                if (!acc[groupMember.group]) {
                    acc[groupMember.group] = new Set();
                }
                acc[groupMember.group].add(groupMember.member.toString());
                return acc;
            }, {});


            const bulkOperations = Object.entries(groupUpdates).map(([groupId, members]) => ({
                updateOne: {
                    filter: { _id: groupId },
                    update: {
                        $addToSet: { members: { $each: [...members] } },
                        $inc: { memberCount: members.size }
                    }
                }
            }));


            if (bulkOperations.length > 0) {
                const updateResult = await Group.bulkWrite(bulkOperations, { session });
            }


            const deleteResult = await DeletedUser.deleteMany({ _id: { $in: users } }).session(session);

            return insertRestoredUsers;
        });

        return savedUsers;

    } catch (error) {
        errors.push(error.message);
        throw new Error(error.message);
    }
};


const validateUserRow = async (row, { empIds, emails, employeeNumbers, designationNames, imoNumbers, vesselStatus }, rowIndex) => {

    const errors = [];

    if (!row["First Name"]) {
        errors.push(`First Name is missing in row ${rowIndex + 1}.`);
    } else if (!validateName(row["First Name"])) {
        errors.push(`First Name is invalid. Name should only contain letters in row ${rowIndex + 1}.`);
        return errors;
    }

    if (row["Last Name"]) {
        if (!validateName(row["Last Name"])) {
            errors.push(`Last Name is invalid. Name should only contain letters in row ${rowIndex + 1}.`);
            return errors;
        }
    }

    if (!row["User ID"]) {
        errors.push(`User ID is missing in row ${rowIndex + 1}`);
        return errors;
    }

    let normalizedId = row["User ID"].toLowerCase();
    if (empIds.has(normalizedId)) {
        errors.push(`Duplicate User ID found in row ${rowIndex + 1} as ${row["User ID"]}`);
        return errors;
    } else {
        empIds.add(normalizedId);
    }

    if (!row["Email"]) {
        errors.push(`Email is missing in row ${rowIndex + 1}`);
        return errors;
    } else {
        const normalizedEmail = row["Email"].toLowerCase();
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

    if (!row["Employee Designation"]) {
        errors.push(`Designation is missing in row ${rowIndex + 1}`);
        return errors;
    } else {
        const designation = row["Employee Designation"]?.toLowerCase();
        if (!designationNames.some(name => name?.toLowerCase() === designation)) {
            errors.push(`Invalid Designation in row ${rowIndex + 1} as ${row["Employee Designation"]}`);
            return errors;
        }
    }

    if (!row["Vessel Status"]) {
        errors.push(`Status is missing in row ${rowIndex + 1}`);
        return errors;
    } else {
        const status = row["Vessel Status"].toLowerCase();
        if (!vesselStatus.some(statusOption => statusOption.toLowerCase() === status)) {
            errors.push(`Invalid Status in row ${rowIndex + 1} as ${row["Vessel Status"]}`);
            return errors;
        }

        if (!status == 'onshore') {
            if (!row["Vessel IMO Number"]) {
                errors.push(`IMO Number is missing in row ${rowIndex + 1}`);
                return errors;
            }
            else if (!imoNumbers.includes(row["Vessel IMO Number"])) {
                errors.push(`Invalid IMO Number in row ${rowIndex + 1} as ${row["Vessel IMO Number"]}`);
                return errors;
            }
        }
    }

    return errors;
}

function mapCSVRowToUser(row) {
    const mandatoryFields = [
        "First Name",
        "Email",
        "Designation",
        "User ID",
        "Vessel IMO Number",
        "Vessel Status"
    ];

    Object.keys(row).forEach(key => {
        if (!mandatoryFields.includes(key)) {
            const fieldName = key;
            let fieldValue = row[key];
        }
    });

    const result = {
        firstName: row["First Name"],
        lastName: row["Last Name"] ?? "",
        civilIdOrPassport: row["User ID"]?.toLowerCase(),
        email: row["Email"]?.toLowerCase(),
        designation: row["Employee Designation"]?.toLowerCase(),
        imoNumber: row["Vessel IMO Number"],
        vesselStatus: row["Vessel Status"],
    };

    return result;
}

const sendBulkEmails = async (passwordEmailList) => {

    try {
        process.send({
            type: 'EMAIL',
            data: { email: passwordEmailList, subject: 'Welcome to SeaVerse!' }
        });

    } catch (error) {
        console.error(`Error sending emails`, error);
    }

};
const validateName = (name) => {
    console.log(name);

    const nameRegex = /^[A-Za-z]+$/;
    const trimmedName = name.trim();
    if (!nameRegex.test(trimmedName)) {
        return false;
    }
    return true;
};


module.exports = {
    deleteUsers,
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
    updateEmployees: async ({ id, input, userId, subscriberId, role, userInfo }, context) => {

        const employeeFilterConditions = { subscriber: subscriberId };
        employeeFilterConditions.user = id;

        const existingEmployee = await Employee.findOne({ user: employeeFilterConditions.user }).populate({ path: "user", select: "currentVessel firstName lastName", populate: ({ path: "currentVessel", select: "name isActive" }) })
            .lean();

        if (!existingEmployee) throw CustomError(ErrorName.NOT_FOUND);

        let newVessel;
        if (input?.user?.currentVessel && !input?.user?.currentVessel === '') {

            newVessel = await Vessel.findById(input?.user?.currentVessel, { name: 1 }).lean();
            if (!newVessel) throw new CustomError(ErrorName.INVALID_VESSEL);

            if (String(input.user.currentVessel) !== String(existingEmployee?.user?.currentVessel?._id)) {

                await UserVessel.updateMany(
                    { user: existingEmployee?.user?._id, vessel: existingEmployee?.user?.currentVessel, isActive: true },
                    { isActive: false }
                );
                await UserVessel.create({
                    user: existingEmployee?.user?._id,
                    vessel: input?.user?.currentVessel,
                    vesselStatus: input?.user?.vesselStatus || "ASSIGNED",
                })
                await NotificationHelper.createNotificationhelper({
                    subscriber: subscriberId,
                    titleValue: `User Vessel Updated Successfully`,
                    messageValue: `User  ${existingEmployee?.user?.firstName} ${existingEmployee?.user?.lastName}" has been assigned to vessel ${newVessel?.name}`,
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
                    messageValue: `You have been assigned to vessel  ${newVessel?.name} by ${userInfo?.firstName} ${userInfo?.lastName}`,
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
                await sendNotifications({
                    userIds: [existingEmployee?.user?._id],
                    title: 'Vessel Updated',
                    body: `You have been assigned to vessel ${newVessel?.name} by ${userInfo?.firstName} ${userInfo?.lastName}`,
                    content: 'Vessel updated successfully',
                    webLink: ""
                });
            }
            else {
                await UserVessel.findOneAndUpdate(
                    { user: existingEmployee?.user?._id, vessel: existingEmployee?.user?.currentVessel?._id, isActive: true },
                    { vesselStatus: input?.user?.vesselStatus }
                );

                await NotificationHelper.createNotificationhelper({
                    subscriber: subscriberId,
                    titleValue: `User Vessel Updated Successfully`,
                    messageValue: `User  ${existingEmployee?.user?.firstName} ${existingEmployee?.user?.lastName}" has been assigned to vessel ${newVessel?.name}`,

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
                await sendNotifications({
                    userIds: [existingEmployee?.user?._id],
                    title: 'Vessel Updated',
                    body: `You have been assigned to vessel ${newVessel?.name} by ${userInfo?.firstName} ${userInfo?.lastName}`,
                    content: 'Vessel updated successfully',
                    webLink: ""
                });
            }
        }

        await UserHelper.updateUser(
            {
                id: id,
                input: {
                    ...input.user
                },
            },
            { currentRole: role }
        );
        const existingLearningPlans = await LearningPlan.find({
            assignedLearnerIDs: existingEmployee.user._id
        });
        await LearningPlan.updateMany(
            { _id: { $in: existingLearningPlans.map(lp => lp._id) } },
            { $pull: { assignedLearnerIDs: existingEmployee.user._id } }
        );
        const conditions = {
            designationID: input.empDesignation || existingEmployee.empDesignation,
            vesselID: input?.user?.currentVessel || existingEmployee?.user?.currentVessel?._id,
            vesselTypeID: newVessel?.typeOfVessel?._id || existingEmployee?.user?.currentVessel?.typeOfVessel?._id,
            currentStatus: input?.user?.vesselStatus || existingEmployee?.user?.vesselStatus,
            email: existingEmployee?.user?.email
        };
        const learningPlans = await LearningPlan.find();
        const filteredPlans = await filterLearningPlans(learningPlans, conditions);

        if (filteredPlans?.length > 0) {
            await LearningPlan.updateMany(
                { _id: { $in: filteredPlans.map(lp => lp._id) } },
                { $addToSet: { assignedLearnerIDs: existingEmployee.user._id } }
            );
        }
        let employeeUpdateData = {};
        if (input.empDesignation) {
            const existingDesignation = await Designation.findById(input.empDesignation);
            if (!existingDesignation) throw new CustomError(ErrorName.INVALID_DESIGNATION);
            employeeUpdateData.empDesignation = existingDesignation._id
            employeeUpdateData.designation = existingDesignation.name
        }

        if (input.nationality) employeeUpdateData.nationality = input.nationality;
        if (input.department) employeeUpdateData.department = input.department;
        if (input.managerName) employeeUpdateData.managerName = input.managerName;
        if (input.customField) employeeUpdateData.customField = input.customField;
        if (input.employeeNo) employeeUpdateData.employeeNo = input.employeeNo;
        if (input.rigNumber) employeeUpdateData.rigNumber = input.rigNumber;
        if (input.dob) employeeUpdateData.dob = input.dob;
        if (input.gender) employeeUpdateData.gender = input.gender;

        if (input.managerObjectId) employeeUpdateData.managerObjectId = input.managerObjectId;

        if (input.managerObjectId) {
            if (existingEmployee.managerObjectId != input.managerObjectId) {
                const oldgroupID = await generateDefaultGroup({ user: existingEmployee.managerObjectId, subscriberId: subscriberId })
                await removeGroupMember({ group: oldgroupID, subscriberId: subscriberId, memberIDs: id })
            }

            const existingMember = await User.findOne({
                _id: input.managerObjectId,
            }).lean();

            if (existingMember) {
                const groupID = await generateDefaultGroup({ user: existingMember, subscriberId: subscriberId })
                inserted = insertGroupMember({ group: groupID, subscriberId: subscriberId, memberIDs: [id] })
            }
        }

        const savedEmployee = await Employee.findOneAndUpdate(
            employeeFilterConditions,
            {
                ...employeeUpdateData,
                updatedBy: userId,
            },
            { new: true, lean: true }
        ).populate("user empDesignation managerObjectId");

        return savedEmployee;
    },
    createBulkEmployee: async ({ userList, emailsLists, civilIds, existingUsers, existingDesignations, designationMap, newDesignations }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
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
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
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


        const existingEmailsInDB = existingUsers.map(user => user.email?.toLowerCase());


        const existingEmpIdsInDB = existingUsers.map(user => ({
            [user.civilIdOrPassport]: user.email?.toLowerCase()
        }));


        const getAllDBUsers = await User.find().select('email');
        const getAllDBEmails = getAllDBUsers.map(user => user.email?.toLowerCase());
        let errors = [];
        const updates = [];
        const inserts = [];


        let userIndex = 0;


        const existingVessels = await Vessel.find({ isDeleted: false, isActive: true })

        const vesselMap = new Map(
            existingVessels.map(vessel => [
                vessel.imoNumber,
                { id: vessel._id, typeOfVessel: vessel.typeOfVessel }
            ])
        );




        let updatedEmpIds = [];
        const vesselAssociations = [];
        let passwordEmailList = [];

        for (const user of users) {


            const existingEmpIdsMap = existingEmpIdsInDB.find(empObj => empObj[user.civilIdOrPassport]);


            if (existingEmpIdsMap) {


                const email = existingEmpIdsMap[user.civilIdOrPassport];


                if (email !== user.email?.toLowerCase() && existingEmailsInDB.includes(user.email?.toLowerCase())) {


                    errors.push(errors.push(`Email: ${user.email} in row ${userIndex + 1} is already present!`));
                    break;


                } else {


                    updates.push({
                        updateMany: {
                            filter: { civilIdOrPassport: user.civilIdOrPassport },
                            update: {
                                $set: {
                                    firstName: user.firstName,
                                    lastName: user.lastName,
                                    email: user.email?.toLowerCase(),
                                    vesselStatus: user.vesselStatus?.toUpperCase(),
                                    currentVessel: vesselMap.get(user.imoNumber)?.id,
                                },
                            },
                        },
                    });


                    updatedEmpIds.push(user.civilIdOrPassport);

                    vesselAssociations.push({
                        civilIdOrPassport: user.civilIdOrPassport,
                        imoNumber: user?.imoNumber,
                        vesselStatus: user.vesselStatus?.toUpperCase(),
                        typeOfVessel: vesselMap.get(user.imoNumber)?.typeOfVessel,
                    });

                }


            } else {


                if (getAllDBEmails.includes(user.email)) {

                    errors.push(errors.push(`Email: ${user.email} in row ${userIndex + 1} is already present!`));
                    break;


                } else {


                    let password = generateRandomString(16);

                    inserts.push({
                        civilIdOrPassport: user.civilIdOrPassport,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        email: user.email?.toLowerCase(),
                        currentVessel: vesselMap.get(user.imoNumber)?.id,
                        vesselStatus: user.vesselStatus?.toUpperCase() || VesselStatus.ONSHORE,
                        password: await CryptoHelper.hash(password, 10)
                    });

                    if (user.imoNumber) {
                        vesselAssociations.push({
                            civilIdOrPassport: user.civilIdOrPassport,
                            imoNumber: user.imoNumber,
                            vesselStatus: user.vesselStatus?.toUpperCase() || VesselStatus.ONSHORE,
                            typeOfVessel: vesselMap.get(user.imoNumber)?.typeOfVessel,
                        });
                    }

                    passwordEmailList.push({ email: user.email, password, userName: user.firstName + " " + user.lastName });

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
                action: "BULK IMPORT",
                createdBy: adminUser?._id,
                uploadedBy: adminUser?._id,
                isError: true,
                description: `${errors[0]}`,
                notificationType: 'BULK_IMPORT',
                status: "FAILED"
            })


            throw CustomError(
                ErrorName.VALIDATION_ERROR,
                `${errors[0]}`
            );


        }


        let bulkInsertUsers;
        let bulkUpdateUsers;


        let insertedUsers;
        let updatedUsers;


        let endUsers = [];


        const saveEmployees = await DbTransactionHelper.performDbTransaction(async session => {


            bulkInsertUsers = await User.insertMany(inserts, { session: session });


            insertedUsers = await User.find({ email: { $in: inserts.map(u => u.email) } }).session(session);


            const bulkUpdateUsers = await User.bulkWrite(updates, { session });
            updatedUsers = await User.find({ civilIdOrPassport: { $in: updatedEmpIds } }).session(session);


            const designationMap = new Map(
                existingDesignations.map(designation => [
                    designation.name?.toLowerCase(),
                    { id: designation._id }
                ])
            );


            const bulkId = uuidv4();
            const allUpdatedUsers = [...insertedUsers, ...updatedUsers];
            userCount = allUpdatedUsers?.length || 0;

            const automateLearningPlanIds = [];

            if (allUpdatedUsers.length > 0) {

                const userVesselsInsert = [];
                for (const vesselData of vesselAssociations) {
                    const originalUserData = allUpdatedUsers.filter(
                        user => user.civilIdOrPassport === vesselData.civilIdOrPassport
                    );

                    if (originalUserData.length > 0) {
                        originalUserData.forEach(user => {

                            if (vesselData.imoNumber) {

                                userVesselsInsert.push({
                                    updateMany: {
                                        filter: { user: user._id, vessel: { $ne: vesselMap.get(vesselData?.imoNumber).id } },
                                        update: {
                                            $set: { isActive: false }
                                        }
                                    }
                                });

                                userVesselsInsert.push({
                                    updateOne: {
                                        filter: { user: user._id, vessel: vesselMap.get(vesselData.imoNumber).id },
                                        update: {
                                            $set: {
                                                user: user._id,
                                                vessel: vesselMap.get(vesselData.imoNumber).id,
                                                vesselStatus: vesselData.vesselStatus.toUpperCase(),
                                                isActive: true,
                                            }
                                        },
                                        upsert: true
                                    }
                                });

                            } else {
                                userVesselsInsert.push({
                                    updateMany: {
                                        filter: { user: user._id },
                                        update: {
                                            $set: { isActive: false, vesselStatus: VesselStatus.ONSHORE }
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
                    const originalUserData = users.find(u => u.civilIdOrPassport === user.civilIdOrPassport);


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

            const userIDs = allUpdatedUsers.map(user => user._id);
            const employees = await Employee.find(
                { user: { $in: userIDs } },
                { user: 1, empDesignation: 1, _id: 0 }
            );

            const empDesignationMap = {};
            employees.forEach(employee => {
                empDesignationMap[employee.user] = employee.empDesignation;
            });

            const vesselIDs = allUpdatedUsers.map(user => user.currentVessel);
            const vessels = await Vessel.find({ _id: { $in: vesselIDs } });
            const vesselTypeMap = {};
            vessels.forEach(vessel => {
                vesselTypeMap[vessel._id] = vessel.typeOfVessel;
            });


            const learningPlans = await LearningPlan.find();
            async function processAutoEnrollmentLearningPlans() {
                try {

                    let filteredPlans = [];
                    allUpdatedUsers.forEach(user => {
                        const empDesignation = empDesignationMap[user._id];

                        const typeOfVesselIds = vesselTypeMap[user.currentVessel];

                        const conditions = {
                            designationID: empDesignation,
                            vesselID: user.currentVessel,
                            vesselTypeID: typeOfVesselIds,
                            currentStatus: user.vesselStatus,
                            email: user.email,
                        };
                        function filterLearningPlans(learningPlans, conditions) {
                            const { designationID, vesselID, vesselTypeID, currentStatus, email } = conditions;

                            return learningPlans?.filter(plan => {
                                const { conditionType, conditionalCustomFields } = plan;

                                let matches = conditionalCustomFields.map(field => {
                                    const { type_of_Field, valueOfField, isOrIsNot, groupIDs } = field;

                                    switch (type_of_Field) {
                                        case "DESIGNATION":
                                            return isOrIsNot === "IS"
                                                ? valueOfField.includes(designationID)
                                                : !valueOfField.includes(designationID);

                                        case "VESSEL":
                                            return isOrIsNot === "IS"
                                                ? valueOfField.includes(vesselID)
                                                : !valueOfField.includes(vesselID);

                                        case "VESSEL_TYPE":
                                            return isOrIsNot === "IS"
                                                ? valueOfField.includes(vesselTypeID)
                                                : !valueOfField.includes(vesselTypeID);

                                        case "CURRENT_STATUS":
                                            return isOrIsNot === "IS"
                                                ? valueOfField.includes(currentStatus)
                                                : !valueOfField.includes(currentStatus);
                                        case "EMAIL":
                                            return isOrIsNot === "IS"
                                                ? valueOfField.includes(email)
                                                : !valueOfField.includes(email);
                                        case "GROUP":
                                            return groupIDs?.some(group => {
                                                switch (group.groupType) {
                                                    case "designation":
                                                        return group.groupIDs.includes(designationID);
                                                    case "vessel":
                                                        return group.groupIDs.includes(vesselID);
                                                    case "vesselType":
                                                        return group.groupIDs.includes(vesselTypeID);
                                                    case "vesselStatus":
                                                        return group.groupIDs.includes(currentStatus);
                                                    default:
                                                        return false;
                                                }
                                            });
                                        default:
                                            return false;
                                    }
                                });

                                if (conditionType === "MATCH_ANY_CONDITION") {
                                    return matches.some(match => match === true);
                                }

                                if (conditionType === "MATCH_ALL_CONDITION") {
                                    return matches.every(match => match === true);
                                }

                                return false;
                            });
                        }

                        const plans = filterLearningPlans(learningPlans, conditions);
                        if (plans?.length > 0) {
                            filteredPlans.push(...plans);
                        }
                    });

                    if (filteredPlans.length > 0) {
                        const allUserIds = allUpdatedUsers.map(user => user._id);
                        await LearningPlan.updateMany(
                            { _id: { $in: filteredPlans?.map((lp) => lp._id) } },
                            {
                                $addToSet: {
                                    assignedLearnerIDs: { $each: allUserIds }
                                }
                            }
                        );

                    }
                } catch (error) {
                    console.error(`Error in Autoenrollment Learning Plans ${error.message}`);
                }
            }
            processAutoEnrollmentLearningPlans();


            if (passwordEmailList.length > 0) {


                await sendBulkEmails(passwordEmailList);


            }


        });
        if (insertedUsers.length > 0) {
            await sendNotificationOnBULK({
                subscriber: subscriberId,
                action: "BULK IMPORT",
                createdBy: adminUser?._id,
                uploadedBy: adminUser?._id,
                isError: false,
                description: `${insertedUsers.length} User data created`,
                notificationType: 'BULK_IMPORT',
                status: "SUCCESS"
            })
            const createImportLog = await ImportLog.create({
                subscriber: subscriberId,
                usersCount: userCount,
                uploadedBy: userId,
                fileName: newFileName,
                filePath: { url: saveCSV },
                importStatus: "SUCCESS",
                description: `${insertedUsers.length} User data created`
            })
            if (!createImportLog) throw CustomError(ErrorName.FAILED, 'Failed to create import log');
        }
        if (updatedUsers.length > 0) {
            await sendNotificationOnBULK({
                subscriber: subscriberId,
                action: "BULK IMPORT",
                createdBy: adminUser?._id,
                uploadedBy: adminUser?._id,
                isError: false,
                description: `${updatedUsers.length} User data updated`,
                notificationType: 'BULK_IMPORT',
                status: "SUCCESS"
            })
            const createImportLog = await ImportLog.create({
                subscriber: subscriberId,
                usersCount: userCount,
                uploadedBy: userId,
                fileName: newFileName,
                filePath: { url: saveCSV },
                importStatus: "SUCCESS",
                description: `${updatedUsers.length} User data  updated`
            })
            if (!createImportLog) throw CustomError(ErrorName.FAILED, 'Failed to create import log');

        }

    },

    bulkValidationHelper: async (createReadStream, empIds, emails, employeeNumbers, designationNames, imoNumbers, vesselStatus, users, userId, subscriberId, newFileName, saveCSV) => {

        let validationErrors = [];

        try {

            await new Promise((resolve, reject) => {
                const stream = createReadStream();
                const parser = csvParse({ columns: true, trim: true });
                stream.pipe(parser);

                let rowIndex = 0;
                let isEmptyFile = true;

                parser.on("data", async (row) => {

                    rowIndex++;

                    isEmptyFile = false;

                    validationErrors.push(await validateUserRow(row, { empIds, emails, employeeNumbers, designationNames, imoNumbers, vesselStatus }, rowIndex));

                    const hasNonEmptyArray = validationErrors.some(innerArray => innerArray.length > 0);
                    if (hasNonEmptyArray) {

                        const createImportLog = await ImportLog.create({
                            subscriber: subscriberId,
                            uploadedBy: userId,
                            fileName: newFileName,
                            filePath: { url: saveCSV },
                            importStatus: "FAILED",
                            description: `${validationErrors[0]}`
                        })

                        if (!createImportLog) throw CustomError(ErrorName.FAILED);
                        return validationErrors;

                    } else {
                        const formatedData = mapCSVRowToUser(row);
                        users.push(formatedData);
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
