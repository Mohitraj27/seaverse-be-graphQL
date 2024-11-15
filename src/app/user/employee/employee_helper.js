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
const { JwtHelper, CryptoHelper, ObjectId, PubSubHelper } = require("../../../tools");

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
        console.log("employee_helper.sendNotificationOnBULK:exception:", error?.message);
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
        console.log("employee_helper.sendNotificationOnCRUD:exception:", e?.message);
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

                const updateGroupMember = await GroupMember.deleteMany({ member: { $in: users } });

                if (updateGroupMember) {
                    return deleteUsers
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

        console.error(error);

    }

}

const validateUserRow = async (row, { empIds, emails, designationNames, imoNumbers, vesselStatus }, rowIndex) => {

    const errors = [];

    if (!row["FirstName"]) errors.push(`First Name is missing in row ${rowIndex + 1}`);

    if (!row["Email"]) errors.push(`Email is missing in row ${rowIndex + 1}`);
    else if (emails.has(row["Email"])) {
        errors.push(`Duplicate Email found in row ${rowIndex + 1} as ${row["Email"]}`);
    } else {
        emails.add(row["Email"]);
    }

    if (!row["EmployeeID"]) errors.push(`Employee ID is missing in row ${rowIndex + 1}`);
    else if (empIds.has(row["EmployeeID"])) {
        errors.push(`Duplicate Email found in row ${rowIndex + 1} as ${row["EmployeeID"]}`);
    } else {
        empIds.add(row["EmployeeID"]);
    }
    if (!row["Designation"]) errors.push(`Designation is missing in row ${rowIndex + 1}`);
    else {
        const designation = row["Designation"].toLowerCase();
        if (!designationNames.some(name => name.toLowerCase() === designation)) {
            errors.push(`Invalid Designation in row ${rowIndex + 1} as ${row["Designation"]}`);
        }
    }
    if (!row["VesselIMONumber"]) errors.push(`IMO Number is missing in row ${rowIndex + 1}`);
    else if (!imoNumbers.includes(row["VesselIMONumber"])) errors.push(`Invalid IMO Number in row ${rowIndex + 1} as ${row["VesselIMONumber"]}`);

    if (!row["Status"]) errors.push(`Status is missing in row ${rowIndex + 1}`);
    else {
        const status = row["Status"].toLowerCase();
        if (!vesselStatus.some(statusOption => statusOption.toLowerCase() === status)) {
            errors.push(`Invalid Status in row ${rowIndex + 1} as ${row["Status"]}`);
        }
    }
    return errors;
}

function mapCSVRowToUser(row) {
    const mandatoryFields = [
        "FirstName",
        "Email",
        "Designation",
        "EmployeeID",
        "VesselIMONumber",
        "Status"
    ];

    Object.keys(row).forEach(key => {
        if (!mandatoryFields.includes(key)) {
            const fieldName = key;
            let fieldValue = row[key];
        }
    });

    const result = {
        firstName: row["FirstName"],
        lastName: row["LastName"] ?? "",
        email: row["Email"],
        designation: row["Designation"],
        civilIdOrPassport: row["EmployeeID"],
        imoNumber: row["VesselIMONumber"],
        vesselStatus: row["Status"],
        imoNumber: row["VesselIMONumber"],
    };

    return result;
}

const sendBulkEmails = async (passwordEmailList) => {

    for (const data of passwordEmailList) {

        try {

            const htmlContent = `
        <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to SeaVerse</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                margin: 0;
                padding: 0;
                background-color: #F4F4F4;
            }
            .email-container {
                max-width: 600px;
                margin: 20px auto;
                background: #FFFFFF;
                border: 1px solid #ddd;
                border-radius: 8px;
                overflow: hidden;
            }
            .header {
                background-color: #0056B3;
                color: #FFFFFF;
                text-align: center;
                padding: 20px;
            }
            .header h1 {
                margin: 0;
                font-size: 24px;
            }
            .content {
                padding: 20px;
            }
            .content p {
                margin: 0 0 15px;
            }
            .cta-button {
                display: inline-block;
                background-color: #0056B3;
                color: #FFFFFF;
                text-decoration: none;
                padding: 10px 20px;
                border-radius: 5px;
                font-size: 16px;
                margin: 20px 0;
                display: block;
                text-align: center;
            }
            .footer {
                text-align: center;
                padding: 10px;
                background: #F4F4F4;
                font-size: 12px;
                color: #555;
            }
            ul {
                padding-left: 20px;
            }
            ul li {
                margin-bottom: 10px;
            }
        </style>
    </head>
    <body>
        <div class="email-container">
            <div class="header">
                <h1>Welcome to SeaVerse!</h1>
            </div>
            <div class="content">
                <p>Dear <strong>${data.userName}</strong>,</p>
                <p>Welcome aboard <strong>SeaVerse</strong>! We’re thrilled to have you join us on this journey of learning and growth.</p>
                <p>To get started, log in with these details:</p>
                <p><strong>Email:</strong> ${data.email}</p>
                <p><strong>Temporary Password:</strong> ${data.password}</p>
                <p><em>Please set a new password upon your first login for security.</em></p>
                <a href="https://web.squadramedia.site/login" target="_blank" class="cta-button">Web Access</a>
                <p>Or, if you prefer learning on the go, download the SeaVerse app:</p>
                <ul>
                    <li>
                        // <a href="https://play.google.com/store/games?hl=en&pli=1" target="_blank">
                        //     <img src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg" alt="Google Play Store" class="store-icon">
                        // </a>
                        <a href="https://play.google.com/store/games?hl=en&pli=1">
                            <img src="cid:playstore" alt="Google Play Store" style="width: 120px; height: auto;">
                        </a>
                    </li>
                    <li>
                        // <a href="https://www.apple.com/in/app-store/" target="_blank">
                        //     <img src="https://upload.wikimedia.org/wikipedia/commons/0/0d/Download_on_the_App_Store_Badge.svg" alt="App Store" class="store-icon">
                        // </a>
                        <a href="https://www.apple.com/in/app-store/">
                            <img src="cid:appstore" alt="App Store" style="width: 120px; height: auto;">
                        </a>
                    </li>
                </ul>
                <p>Explore courses, track your progress, and unlock new skills today! For any assistance, feel free to reach out to our support team at <strong>[support email/phone]</strong>.</p>
            </div>
            <div class="footer">
                <p>Happy sailing and learning,</p>
                <p>The SeaVerse Team</p>
            </div>
        </div>
    </body>
    </html>
    `;

            // const sentEmail = await sendNodeEmail({
            //     email: data.email,
            //     subject: 'Welcome to SeaVerse!',
            //     htmlContent
            // });

            if (!sentEmail) {
                console.error(`Failed to send email to ${data.email}`);
            }

        } catch (error) {
            console.error(`Error sending email to ${data.email}:`, error);
        }

    }

};

module.exports = {
    deleteUsers,
    sendInvitationMail,
    sendCourseInvitationMail,
    sendEnrollmentNotification,
    sendNotificationOnCRUD,
    generateUserUID,
    generateEmployeeUID,
    sendCredentialMail,
    generateDefaultGroup,
    insertGroupMember,
    removeGroupMember,
    updateEmployees: async ({ id, input, userId, subscriberId, role }, context) => {

        const employeeFilterConditions = { subscriber: subscriberId };
        employeeFilterConditions.user = id;
        const existingEmployee = await Employee.findOne({ user: employeeFilterConditions.user })
            .lean();
        if (!existingEmployee) throw CustomError(ErrorName.NOT_FOUND);

        await UserHelper.updateUser(
            {
                id: id,
                input: {
                    ...input.user
                },
            },
            { currentRole: role }
        );

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
                        { group: group._id, member: manager._id },
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

        const existingUsers = await User.find({
            $or: [
                { civilIdOrPassport: { $in: empIdsArray } },
                { email: { $in: emailsArray } }
            ]
        }).lean();

        const existingEmailsInDB = existingUsers.map(user => user.email);

        const existingEmpIdsInDB = existingUsers.map(user => ({
            [user.civilIdOrPassport]: user.email
        }));

        const getAllDBUsers = await User.find().select('email');
        const getAllDBEmails = getAllDBUsers.map(user => user.email);

        const updates = [];
        const inserts = [];

        let userIndex = 0;

        const existingVessels = await Vessel.find({ isDeleted: false, isActive: true }).lean();

        const vesselMap = new Map(
            existingVessels.map(vessel => [
                vessel.imoNumber,
                { id: vessel._id }
            ])
        );

        let errors = [];
        let updatedEmpIds = [];
        const vesselAssociations = [];
        let passwordEmailList = [];

        for (const user of users) {

            const existingEmpIdsMap = existingEmpIdsInDB.find(empObj => empObj[user.civilIdOrPassport]);

            if (existingEmpIdsMap) {

                const email = existingEmpIdsMap[user.civilIdOrPassport];

                if (email !== user.email && existingEmailsInDB.includes(user.email)) {

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
                                    email: user.email,
                                },
                            },
                        },
                    });

                    updatedEmpIds.push(user.civilIdOrPassport);

                    vesselAssociations.push({
                        civilIdOrPassport: user.civilIdOrPassport,
                        imoNumber: user.imoNumber,
                        vesselStatus: user.vesselStatus,
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
                        email: user.email,
                        password: await CryptoHelper.hash(password, 10)
                    });

                    vesselAssociations.push({
                        civilIdOrPassport: user.civilIdOrPassport,
                        imoNumber: user.imoNumber,
                        vesselStatus: user.vesselStatus,
                    });

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

            sendNotificationOnBULK({
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
                    designation.name,
                    { id: designation._id }
                ])
            );

            const bulkId = uuidv4();
            const allUpdatedUsers = [...insertedUsers, ...updatedUsers];

            if (allUpdatedUsers.length > 0) {

                const userVesselsInsert = [];
                for (const vesselData of vesselAssociations) {

                    const originalUserData = await User.find({ civilIdOrPassport: vesselData.civilIdOrPassport });

                    if (originalUserData.length > 0) {
                        originalUserData.forEach(user => {
                            userVesselsInsert.push({
                                updateOne: {
                                    filter: { user: user._id },
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
                                    empDesignation: designationMap.get(originalUserData.designation.toUpperCase()).id,
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

                sendNotificationOnBULK({
                    subscriber: subscriberId,
                    action: "BULK IMPORT",
                    createdBy: adminUser?._id,
                    uploadedBy: adminUser?._id,
                    isError: true,
                    description: `${errors[0]}`,
                    notificationType: 'BULK_IMPORT',
                    status: 'FAILED'
                })

                throw CustomError(
                    ErrorName.VALIDATION_ERROR,
                    `No new data created/updated`
                );
            }


            if (passwordEmailList.length > 0) {

                await sendBulkEmails(passwordEmailList);

            }

        });

        const createImportLog = await ImportLog.create({
            subscriber: subscriberId,
            uploadedBy: userId,
            fileName: newFileName,
            filePath: { url: saveCSV },
            importStatus: "SUCCESS",
            description: `New data(s) created/updated`
        })

        if (!createImportLog) throw CustomError(ErrorName.FAILED, 'Failed to create import log');

        await sendNotificationOnBULK({
            subscriber: subscriberId,
            action: "BULK IMPORT",
            createdBy: adminUser?._id,
            uploadedBy: adminUser?._id,
            description: `New data(s) created/updated`,
            notificationType: 'BULK_IMPORT',
            status: 'SUCCESS'
        });


    },
    bulkValidationHelper: async (createReadStream, empIds, emails, designationNames, imoNumbers, vesselStatus, users, userId, subscriberId, newFileName, saveCSV) => {

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

                    validationErrors.push(await validateUserRow(row, { empIds, emails, designationNames, imoNumbers, vesselStatus }, rowIndex));

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
