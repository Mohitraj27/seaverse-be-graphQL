const { CryptoHelper, MomentTimezone, ObjectId, CronHelper } = require("../../../tools");
const { CustomError, ErrorName, AuthUser, Role, SendEmail } = require("../../../util");

const { User } = require("../user_model");
const { Employee } = require("../employee/employee_model");
const {
    TrainingCertificate,
} = require("../../training-registrations/training-certificates/training_certificate_model");
const {
    TrainingRegistration,
} = require("../../training-registrations/training_registration_model");
const { SubscriberProfile } = require("../subscriber-profile/subscriber_profile_model");

const UserHelper = require("../user_helper");
const UserAddressHelper = require("../user-addresses/user_address_helper");

const TrainingRegistrationStatus = require("../../training-registrations/training_registration_status.json");
const AwsHelper = require("../../../util/aws_helper");
const user = require("..");

const { isAlphanumeric } = require('../../../util/password_helper');

const { mailSenderHelper, sendNotificationOnDELETEREQUEST, generateRandomString } = require("./user_profile_helper");
const LogHelper = require("../../logs/log_helper");
const LogType = require("../../logs/log_type.json");

const { resetPasswordRequest, resetPasswordRequestforAdmin } = require("../../email-template/passwordResetRequest");
const { forgetPassword } = require('../../email-template/forgetPassword');
const EmployeeHelper = require("../employee/employee_helper");
const { OverallTrainingProgress } = require("../../training-registrations/overall-course-progress/overall_progress_model");
const { Subscriber } = require("../../saas/subscriber/subscriber_model");
const NotificationType = require("../../notifications/notification_type.json");
const notificationiconEnum = require("../../notifications/notification_icon.json");
const notificationHelper = require("../../notifications/notification_helper");
const mongoose = require('mongoose');
const { encrypt, decrypt } = require("../../../util/encryption_helper");
const { updateByQueryToElasticSearch } = require("../../../util/elastic_helper");


module.exports.queries = {
    getUserProfile: async ({ }, context) => {
        const { isAuthenticated, role, userId, userInfo } = AuthUser(context);

        const fetchResult = async (userId, population) => {
            const existingUser = await User.findById(userId)
                .lean()
                .select("-consents")
                .populate({
                    path: "subRoles",
                    match: { isActive: true, isDeleted: { $ne: true } },
                })
                .populate(population);
            if (!existingUser) throw CustomError(ErrorName.NOT_FOUND);

            if (existingUser.avatar) {
                existingUser.avatar = await AwsHelper.fetchFile(existingUser.avatar);
            }
            let employeeData = {};
            employeeData = await Employee.findOne({ user: userId }).lean().populate({
                path: "empDesignation",
                select: "_id name",
            });
            if (employeeData && employeeData.empDesignation) {
                employeeData.designation = employeeData.empDesignation.name;
            } else if (role === Role.ADMIN) {
                employeeData = {};
                employeeData.designation = 'MANAGER';
            }

            existingUser.employee = employeeData || null;

            for(let key in existingUser) {
                if(key==="firstName" || key==="lastName" || key==="email" || key==="civilIdOrPassport") {
                    existingUser[key]=decrypt(existingUser[key]);
                }
            }
            return existingUser;
        };
        const fetchMenuItems = (userInfo) => {

            if (role === 'ADMIN') {
                return [
                    {
                        role_name: 'ADMIN',
                        platform: 'ADMIN',
                    },
                    {
                        role_name: 'LEARNER',
                        platform: 'LEARNER',
                    },
                ];
            } else {
                return [
                    ...userInfo.subRoles.map(subRole => ({
                        role_name: subRole.name,
                        platform: subRole.primaryRole,
                    })),
                    {
                        role_name: 'LEARNER',
                        platform: 'LEARNER',
                    },
                ];

            }
        };

        if (isAuthenticated) {
            return { "user": fetchResult(userId), "menuItem": fetchMenuItems(userInfo) };
        }

        throw CustomError(ErrorName.FORBIDDEN);
    },
    getProfile: async ({ id }, context) => {
        const { isAuthenticated, role, userId } = AuthUser(context, false);

        const fetchResult = async (id, population) => {
            const existingUser = await User.findById(id)
                .lean()
                .populate({
                    path: "subRoles",
                    match: { isActive: true, isDeleted: { $ne: true } },
                })
                .populate(population);
            if (!existingUser) throw CustomError(ErrorName.NOT_FOUND);

            if (existingUser.employee?.trainingCertificates?.length) {
                existingUser.employee.trainingCertificates =
                    existingUser.employee.trainingCertificates.filter(
                        x => x.trainingRegistration != null
                    );
            }

            return existingUser;
        };

        const trainingCertificatesPopulation = {
            path: "trainingCertificates",
            match: { isDeleted: { $ne: true } },
            populate: { path: "trainingRegistration", select: "_id" },
            options: { sort: { expiresAt: -1 } },
        };

        const employeePopulation = {
            path: "employee",
            populate: [{ path: "organization" }, trainingCertificatesPopulation],
        };

        if (id) {
            return fetchResult(id, employeePopulation);
        } else if (role === Role.EMPLOYEE) {
            return fetchResult(userId, employeePopulation);
        } else if (isAuthenticated) {
            return fetchResult(userId);
        }

        throw CustomError(ErrorName.FORBIDDEN);
    },
    getPublicProfile: async ({ id }, context) => {
        const existingUser = await User.findById(id).lean();
        if (!existingUser) throw CustomError(ErrorName.NOT_FOUND);

        const existingEmployee = await Employee.findOne({ user: id })
            .populate("organization")
            .lean();
        if (!existingEmployee) throw CustomError(ErrorName.NOT_FOUND);
        const existingTrainingCertificates = await TrainingCertificate.aggregate([
            {
                $match: { employee: existingEmployee._id, isDeleted: { $ne: true } },
            },
            {
                $lookup: {
                    from: "trainingregistrations",
                    localField: "trainingRegistration",
                    foreignField: "_id",
                    as: "trainingRegistration",
                },
            },
            {
                $unwind: { path: "$trainingRegistration" },
            },
        ]);

        let statistics;
        try {
            statistics = (
                await TrainingRegistration.aggregate([
                    { $match: { employee: existingEmployee._id } },
                    {
                        $facet: {
                            assignedCourses: [
                                {
                                    $match: {
                                        status: TrainingRegistrationStatus.REGISTERED,
                                    },
                                },
                                {
                                    $group: {
                                        _id: "assignedCourses",
                                        count: { $sum: 1 },
                                    },
                                },
                            ],
                            ongoingCourses: [
                                {
                                    $match: { status: TrainingRegistrationStatus.STARTED },
                                },
                                {
                                    $group: {
                                        _id: "ongoingCourses",
                                        count: { $sum: 1 },
                                    },
                                },
                            ],
                            completedCourses: [
                                {
                                    $match: { status: TrainingRegistrationStatus.COMPLETED },
                                },
                                {
                                    $group: {
                                        _id: "completedCourses",
                                        count: { $sum: 1 },
                                    },
                                },
                            ],
                            aboutDueCourses: [
                                {
                                    $match: {
                                        status: { $ne: TrainingRegistrationStatus.COMPLETED },
                                    },
                                },
                                {
                                    $project: {
                                        dueWarningDate: {
                                            $dateSubtract: {
                                                startDate: "$endDate",
                                                unit: "day",
                                                amount: 5,
                                            },
                                        },
                                    },
                                },
                                {
                                    $match: {
                                        dueWarningDate: {
                                            $lte: MomentTimezone.tz(context.timezone).toDate(),
                                        },
                                    },
                                },
                                {
                                    $group: {
                                        _id: "aboutDueCourses",
                                        count: { $sum: 1 },
                                    },
                                },
                            ],
                        },
                    },
                ])
            )[0];

            statistics = {
                assignedCourses: statistics?.assignedCourses[0]?.count,
                ongoingCourses: statistics?.ongoingCourses[0]?.count,
                completedCourses: statistics?.completedCourses[0]?.count,
                aboutDueCourses: statistics?.aboutDueCourses[0]?.count,
            };
        } catch (_) { }

        return {
            user: existingUser,
            employee: existingEmployee,
            trainingCertificates: existingTrainingCertificates ?? [],
            trainingStatistics: {
                assignedCourses: statistics?.assignedCourses,
                ongoingCourses: statistics?.ongoingCourses,
                completedCourses: statistics?.completedCourses,
                aboutDueCourses: statistics?.aboutDueCourses,
            },
            subscriberProfile: await SubscriberProfile.findOne({
                subscriber: existingEmployee.subscriber,
            })
                .lean()
                .select("user")
                .populate({ path: "user", select: "firstName lastName avatar" }),
        };
    },
    resetPassword: async (_, context) => {

        const { userId, userInfo } = AuthUser(context);

        const user = await User.findById(userId);

        if (!user) {
            throw new CustomError(ErrorName.NOT_FOUND);
        }

        const token = generateRandomString(10);

        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + (7 * 3600000);
        await user.save();

        let errors = [];
        const resetPasswordHtml = resetPasswordRequest(user, token);
        // const resetPasswordHtmlforAdmin = resetPasswordRequestforAdmin(user, token);
        const result = await AwsHelper.sendEmail({
            receiverEmail: user.email,
            subject: "Reset Password Request",
            htmlContent: resetPasswordHtml,

        });
        // await AwsHelper.sendEmail({
        //     receiverEmail: userInfo.email,
        //     subject: "Reset Password Request",
        //     htmlContent: resetPasswordHtmlforAdmin,
        // })
        if (errors.length > 0) {
            throw new CustomError(ErrorName.FAILED);
        }

        if (result) {
            return "Email sent. Please check your email for reset link."
        }

    },
    checkLastAdmin: async ({ }, context) => {

        try {
            const userData = await User.aggregate([
                {
                    $lookup: {
                        from: "subroles",
                        localField: "subRoles",
                        foreignField: "_id",
                        as: "subRoles",
                    },
                },
                {
                    $unwind: "$subRoles",
                },
                {
                    $match: {
                        $or: [

                            { "subRoles.name": "ADMIN" }
                        ],
                    },
                },
            ]);

            if (userData.length === 1) {
                return {
                    isLastAdmin: true,
                    message: "You are the last admin in the system.",
                };
            }
            else {
                return {
                    isLastAdmin: false,
                    message: "You are not the last admin in the system.",
                };
            }
        } catch (error) {
            throw CustomError(ErrorName.FAILED, error.message);
        }
    }
};

module.exports.mutations = {
    updateProfile: async ({ input }, context) => {
        const { role, userId, subscriberId, userInfo } = AuthUser(context);
        try {
            if (role === "LEARNER") {
                const isUpdatingNonAvatarFields = Object.keys(input).some(
                    field => field !== "avatar"
                );
                if (isUpdatingNonAvatarFields) {
                    throw CustomError("Learner can only update their profile picture");
                }
            }
            const savedUser = await UserHelper.updateUser(
                { id: userId, input },
                { currentRole: role }
            );

            if (savedUser) {
                if (input.address) {
                    savedUser.address = await UserAddressHelper.createOrUpdateAddress(
                        { input: input.address },
                        { userId }
                    );
                }

                if (savedUser.avatar) {
                    savedUser.avatar = await AwsHelper.fetchFile(savedUser.avatar);
                }
                LogHelper.logActivity({
                    subscriber: subscriberId,
                    logType: LogType.UPDATE_PROFILE_LOG,
                    operation: "UPDATE_PROFILE_LOG",
                    ipInfo: context.ipInfo,
                    affected: [{ targetRef: "User", target: userId }],
                    createdBy: userInfo,
                });
                return savedUser;
            }
        } catch (error) {
            throw CustomError(ErrorName.FAILED, error.message);
        }
    },
    changePassword: async ({ input }, context) => {
        const { role, userPermissions, subscriberId, isOrganizationManager, userInfo } =
            AuthUser(context);

        try {
            const { userId } = AuthUser(context);
            const { currentPassword, newPassword, confirmPassword } = input;

            const existingUser = await User.findById(userId);
            if (!existingUser) {
                throw CustomError(ErrorName.NOT_FOUND);
            }

            if (newPassword !== confirmPassword) {
                throw CustomError(ErrorName.PASSWORD_MISMATCH, "Passwords do not match");
            }

            const sameOldPassword = await CryptoHelper.compare(
                input.newPassword,
                existingUser.password
            );
            if (sameOldPassword) {
                throw CustomError(ErrorName.PASSWORD_MISMATCH, "Please enter a new password");
            }

            const isResetPasswordDialog = existingUser.isResetPasswordDialog;
            if (isResetPasswordDialog) {
                if (!currentPassword || !newPassword || !confirmPassword) {
                    throw CustomError(
                        ErrorName.PROVIDE_PASSWORDS,
                        "Provide all the required fields"
                    );
                }
            } else {
                if (!newPassword || !confirmPassword) {
                    throw CustomError(
                        ErrorName.PROVIDE_PASSWORDS,
                        "Provide all the required fields"
                    );
                }
            }
            if (!isAlphanumeric(newPassword)) {
                throw CustomError(
                    ErrorName.INVALID_PASSWORD,
                    "Password must have 8 characters and should be alphanumeric with a special character"
                );
            }
            if (isResetPasswordDialog) {
                const isPasswordValid = await CryptoHelper.compare(
                    currentPassword,
                    existingUser.password
                );
                if (!isPasswordValid) {
                    throw CustomError(ErrorName.INVALID_PASSWORD, "Old password is incorrect");
                }
            }
            existingUser.password = await CryptoHelper.hash(newPassword, 10);

            existingUser.isResetPasswordDialog = true;

            await existingUser.save();

            try {
                await updateByQueryToElasticSearch(
                "users", 
                `
                    ctx._source.password = params.password;
                    ctx._source.isResetPasswordDialog = params.isResetPasswordDialog;
                `,
                {
                    term: {
                    userId: existingUser._id.toString() 
                    }
                },
                {
                    password: existingUser.password,
                    isResetPasswordDialog: true
                }
            );
            } catch (error) {
                throw CustomError(ErrorName.SERVER_ERROR, error.message);
            }

            LogHelper.logActivity({
                subscriber: subscriberId,
                logType: LogType.PASSWORD_MANAGEMENT_LOG,
                operation: "CHANGE_PASSWORD",
                ipInfo: context.ipInfo,
                affected: [{ targetRef: "User", target: existingUser._id }],
                createdBy: userInfo,
            });
            return "Password updated successfully!";
        } catch (error) {
            throw CustomError(ErrorName.SERVER_ERROR, error.message);
        }
    },

    forgetPassword: async ({ email, consentsInput }, context) => {
        try {
            const existingUser = await User.findOne({ email:encrypt(email) });
            if (!existingUser) {
                throw CustomError(ErrorName.EMAIL_NOT_FOUND);
            }
            if (consentsInput?.length > 0) {
                const existingConsentsMap = new Map(
                    (existingUser.consents || []).map(consent => [consent._id.toString(), consent])
                );

                consentsInput.forEach(consent => {
                    const consentId = consent._id ? consent._id.toString() : null;

                    if (consentId && existingConsentsMap.has(consentId)) {

                        const existingConsent = existingConsentsMap.get(consentId);
                        existingConsent.title = consent.title;
                        existingConsent.message = consent.message;
                        existingConsent.status = consent.status;
                    } else {
                        existingUser.consents.push({
                            _id: new mongoose.Types.ObjectId(),
                            title: consent.title,
                            message: consent.message,
                            status: consent.status,
                        });
                    }
                });
            }
            const token = generateRandomString(10);

            existingUser.resetPasswordToken = token;
            existingUser.resetPasswordExpires = Date.now() + 7 * 3600000;
            const updatedUser = await existingUser.save();

            if (!updatedUser) {
                throw CustomError(ErrorName.FAILED);
            }
            const forgetPasswordEmailContent = forgetPassword(token);
            const result = await AwsHelper.sendEmail({
                receiverEmail: email,
                subject: "Reset Password",
                htmlContent: forgetPasswordEmailContent,
            });
            if (result) {
                return {
                    success: true,
                    message: "Email sent. Please check your email for reset link.",
                    consents: updatedUser.consents || [],
                };
            } else {
                throw CustomError(ErrorName.FAILED, "Failed to send reset link. Please try again.");
            }
        } catch (error) {
            throw new Error(error.message);
        }
    },

    verifyResetPassword: async ({ token }) => {
        try {
            const user = await User.findOne({ resetPasswordToken: token });

            if (!user) {
                throw CustomError(ErrorName.NOT_FOUND);
            }

            if (user.resetPasswordExpires < Date.now()) {
                throw CustomError(ErrorName.EXPIRED_TOKEN);
            }
            return "Success";
        } catch (error) {
            console.error(error);
        }
    },
    newPasswordAfterReset: async ({ input }, context) => {
        try {
            let userId = null;

            if (!input.token) {
                userId = AuthUser(context).userId;
            }

            if (input.newPassword !== input.confirmPassword) {
                throw CustomError(ErrorName.PASSWORD_MISMATCH, "Passwords do not match");
            }

            const user = await User.findOne({
                $or: [
                    ObjectId.isValid(userId)
                        ? { _id: userId }
                        : { resetPasswordToken: input.token },
                ],
            });

            if (!user) {
                throw CustomError(ErrorName.NOT_FOUND);
            }

            let checkAlphaNumeric = isAlphanumeric(input.newPassword);

            if (!checkAlphaNumeric) {
                throw CustomError(
                    ErrorName.INVALID_PASSWORD,
                    "Password must be 6-15 characters long."
                );
            }

            user.password = await CryptoHelper.hash(input.newPassword, 10);

            user.resetPasswordToken = null;
            user.resetPasswordExpires = null;
            user.isResetPasswordDialog = true;

            const updateUser = await user.save();

            try {
                 await updateByQueryToElasticSearch(
                "users", 
                `
                    ctx._source.isResetPasswordDialog = true;
                `,
                {
                    match: {
                    userId: user._id.toString(), 
                    }
                },
                {
                    password: user.password
                }
            );
            } catch (error) {
                throw CustomError(ErrorName.FAILED);
            }

            if (updateUser) {
                return "Password updated successfully!";
            } else {
                throw CustomError(ErrorName.FAILED);
            }
        } catch (error) {
            throw CustomError(ErrorName.FAILED, `${error.message}`);
        }
    },
    selfDeleteRequest: async ({ input }, context) => {
        const { userId, userInfo } = AuthUser(context);

        try {
            if (!userId) {
                throw new CustomError(ErrorName.UNAUTHORIZED, "Unauthorized");
            }
            const userData = await User.aggregate([
                {
                    $lookup: {
                        from: "subroles",
                        let: { subRoleIds: "$subRoles" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $in: ["$_id", "$$subRoleIds"] },
                                            { $eq: ["$name", "ADMIN"] }
                                        ]
                                    }
                                }
                            }
                        ],
                        as: "matchedSubRoles"
                    }
                },
                {
                    $match: {
                        "matchedSubRoles.0": { $exists: true }
                    }
                }
            ]);

            if ((userData.length === 1)&& (userData[0]._id.toString() === userId.toString())) {
                throw CustomError(
                    ErrorName.FAILED_TO_DELETE_LAST_ADMIN,
                    "You cannot delete yourself because you are the only admin left in the system."
                );
            }

            const { reasonForDelete } = input;

            if (!reasonForDelete || !reasonForDelete.trim().length) {
                throw new CustomError(ErrorName.REASON_FOR_DELETE_NOT_FOUND);
            }

            const updateUser = await User.findByIdAndUpdate(userId, {
                $set: {
                    deleteRequest: true,
                    deleteRequestDate: Date.now(),
                    reasonForDelete: reasonForDelete,
                },
            });

            try {
             await updateByQueryToElasticSearch(
                "users", 
                `
                    ctx._source.deleteRequest = params.deleteRequest;
                    ctx._source.deleteRequestDate = params.deleteRequestDate;
                    ctx._source.reasonForDelete = params.reasonForDelete;
                `,
                {
                    match: {
                    userId: userId,
                    },
                },
                {
                    deleteRequest: true,
                    deleteRequestDate: Date.now(),
                    reasonForDelete: reasonForDelete,
                }
            );   
            } catch (error) {
                throw CustomError(ErrorName.FAILED, error.message);
                
            }

            if (updateUser) {
                const subscriber = await Subscriber.findOne();

                let subscriberId;

                if (subscriber) {
                    subscriberId = subscriber._id;
                }

                const viewRequestPath = `${process.env.APP_URL}/admin/delete-request?tab=new`;

                const signupRequestNotifcation = {
                    subscriber: subscriberId,
                    title: [{ lang: "en", value: `Delete Request` }],
                    message: [
                        {
                            lang: "en",
                            value: `Delete request received. Please take necessary action.`,
                        },
                    ],
                    notificationType: NotificationType.USER_DELETE_REQUEST,
                    notifyAllAdmin: true,
                    isNotificatonForAdmin: true,
                    notifiers: [],
                    additionalInfo: [
                        {
                            infoType: "VIEW_REQUEST",
                            infoData: {
                                filePath: viewRequestPath,
                            },
                        },
                    ],
                    status: "SENT",
                    employeeNotifiers: [],
                    isUserRequest: true,
                    icon: notificationiconEnum.SUCCESS,
                };
                await notificationHelper.createNotification(signupRequestNotifcation);

                LogHelper.logActivity({
                    subscriber: subscriberId,
                    logType: LogType.DELETE_REQUEST_LOG,
                    operation: "SELF_DELETE_REQUEST",
                    ipInfo: context.ipInfo,
                    affected: [{ targetRef: "User", target: userId }],
                    createdBy: userInfo,
                    additionalInfo: [
                        {
                            infoType: "REASON_FOR_DELETE",
                            infoData: reasonForDelete,
                        },
                    ],
                });

                return "Delete request processed successfully!";
            } else {
                throw new CustomError(ErrorName.FAILED);
            }
        } catch (error) {
            throw CustomError(ErrorName.FAILED, error.message);
        }
    },
    
};
