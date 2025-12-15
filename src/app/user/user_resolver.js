const { Validator, CryptoHelper, Moment, JwtHelper, Crypto } = require("../../tools");
const {
    CustomError,
    ErrorName,
    Role,
    GenerateOtp,
    SendEmail,
    EmailTemplate,
    DbTransactionHelper,
    AuthUser,
    consentTypes,
} = require("../../util");

const { User, DeletedUser, AppUser } = require("./user_model");
const { Subscriber } = require("../saas/subscriber/subscriber_model");
const { Employee, AppEmployee } = require("./employee/employee_model");
const { SubscriberProfile } = require("./subscriber-profile/subscriber_profile_model");

const UserHelper = require("./user_helper");
const SubscriberHelper = require("../saas/subscriber/subscriber_helper");
const EmployeeHelper = require("./employee/employee_helper");
const { OverallTrainingProgress } = require("../training-registrations/overall-course-progress/overall_progress_model");
const { ImportLog } = require("./import-log/import_log_model");

const AwsHelper = require("../../util/aws_helper");
const NotificationHelper = require("../notifications/notification_helper");
const notificationType = require("../notifications/notification_type.json");
const notificationiconEnum = require("../notifications/notification_icon.json");
const Export = require("../user/exportUser/exportUser_model");
const { Designation } = require("../designations/designation_model");
const { generateRandomString } = require("./user-profile/user_profile_helper");
const SignUpOtp = require('./SignUpOtp');
const nodemailer = require("nodemailer");
const SignupRequest = require('../signup-request/signup-request-model');
const signupstatus = require('../signup-request/signup-status.json');
const subscriptionHelper = require("../saas/subscriber/subscription/subscription_helper");
const NotificationType = require('../notifications/notification_type.json');
const { signUpVerifyEmailTemplate } = require('../email-template/signUpEmailVerification');
const ContentLanguage = require('../trainings/training_modules/training_module_contents/content_languages/content_languages_model');
const mongoose = require('mongoose');
const { consentsforLearnerInitalLogin } = require('../email-template/consentsforLearnerInitalLogin');
const { sendConsentsforAllAdminsInitalLogin } = require('../email-template/consentsforAllAdminsInitalLogin');
const { SubRole } = require("../user/sub-roles/sub_role_model");
const { encrypt, decrypt } = require("../../util/encryption_helper");
// Replaced Elasticsearch with MongoDB UserSearchCache
// const { updateByQueryToElasticSearch, indexDocumenttoElasticSearch } = require("../../util/elastic_helper");
const { updateByQueryToElasticSearch, indexDocumenttoElasticSearch } = require("../../util/user_search_helper");
module.exports.queries = {
    downloadNotification: async ({ input }, context) => {



        const { subscriberId, userInfo } = AuthUser(context);

        try {

            if (!input.downloadType || !input.id) {
                throw CustomError(ErrorName.ARGUMENTS_REQUIRED);
            }

            let fetchUrl;
            if (input.downloadType == 'IMPORT_LOG') {
                fetchUrl = await ImportLog.findById(input.id).lean().select("filePath");

                await NotificationHelper.createNotificationhelper({
                    subscriber: subscriberId,
                    titleValue: `Import Log is ready!`,
                    messageValue: `Your import log download is ready!`,
                    notificationType: notificationType.IMPORT_LOG_DOWNLOAD_READY,
                    notifyAllAdmin: true,
                    additionalInfo: [
                        {
                            infoType: "EXPORT_URL",
                            infoData: {
                                filePath: fetchUrl?.filePath.url
                            }
                        }
                    ],
                    affected: [],
                    status: 'SENT',
                    icon: notificationiconEnum.SUCCESS,
                    createdBy: userInfo,
                });

                return {
                    status: "SUCCESS",
                    message: "Import Log Download is ready!",
                };
            }

            if (input.downloadType == 'REPORT') {

                const fetchUrl = await Export.findById(input.id).lean().select("filePath");


                await NotificationHelper.createNotificationhelper({
                    subscriber: subscriberId,
                    titleValue: `Custom Report is ready!`,
                    messageValue: `Your custom report download is ready!`,
                    notificationType: notificationType.IMPORT_LOG_DOWNLOAD_READY,
                    notifyAllAdmin: true,
                    additionalInfo: [
                        {
                            infoType: "EXPORT_URL",
                            infoData: {
                                filePath: fetchUrl.filePath
                            }
                        }
                    ],
                    affected: [],
                    status: 'SENT',
                    icon: notificationiconEnum.SUCCESS,
                    createdBy: userInfo,
                });

                return {
                    status: "SUCCESS",
                    message: "Import Log Download is ready!",
                };

            }

            if (!fetchUrl.filePath) {

                await NotificationHelper.createNotificationhelper({
                    subscriber: subscriberId,
                    titleValue: `Failed!`,
                    messageValue: `Your File Download is failed!`,
                    notificationType: notificationType.IMPORT_LOG_DOWNLOAD_FAILED,
                    notifyAllAdmin: true,
                    affected: [],
                    status: 'SENT',
                    icon: notificationiconEnum.ERROR,
                    createdBy: userInfo,
                });

                throw CustomError(ErrorName.NOT_FOUND, 'File not found!');
            }

        } catch (error) {
            throw new Error(error.message);
        }

    }
}

module.exports.mutations = {
    createSaasAdmin: async ({ input }) => {
        const existingUser = await User.findOne({ role: Role.SAAS_ADMIN }).lean().select("_id");

        if (existingUser) throw CustomError(ErrorName.USER_ALREADY_EXIST);

        const savedUser = await new User({
            firstName: input.firstName,
            email: input.emailOrCivilIdOrPassport,
            phone: input.phone,
            password: await CryptoHelper.hash(input.password, 10),
            role: Role.SAAS_ADMIN,
            isVerified: true,
            isRegistered: true,
            isProfileCompleted: true,
        }).save();

        if (savedUser) return await UserHelper.makeAuthUser(savedUser);
        throw CustomError(ErrorName.FAILED);
    },
    saasAdminSignIn: async ({ input }) => {
        const existingSaasAdmin = await User.findOne({
            $or: [
                { email: { $regex: new RegExp(`^${input.emailOrCivilIdOrPassport}$`, "i") } },
                { civilIdOrPassport: input.emailOrCivilIdOrPassport },
            ],
            role: Role.SAAS_ADMIN,
        });

        if (existingSaasAdmin) {
            const valid = await CryptoHelper.compare(input.password, existingSaasAdmin.password);

            if (valid) {
                existingSaasAdmin.lastLoginAt = Moment().format();
                await existingSaasAdmin.save();
                return await UserHelper.makeAuthUser(existingSaasAdmin);
            }
        }

        throw CustomError(ErrorName.NOT_FOUND);
    },
    subscriberSignUp: async ({ input }) => {
        throw CustomError(ErrorName.FORBIDDEN);
    },
    signUp: async ({ input }) => {
        try {
            const signUp = await DbTransactionHelper.performDbTransaction(async session => {

                const { password, confirmPassword, TermsAndConditions, email, firstName, lastName } = input;

                if (!password || !confirmPassword || !email) {
                    throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Required fields are missing");
                }

                if (password !== confirmPassword) throw CustomError(ErrorName.PASSWORD_MISMATCH, "Passwords do not match");

                const passwordRegex = new RegExp("^(?=.*[A-Z])(?=.*[!@#$%^&*.,])(?=.*[0-9])(?=.{8,})(?![a-z])");
                if (!passwordRegex.test(password)) {
                    throw CustomError(
                        ErrorName.INVALID_PASSWORD,
                        "Password must have at least one uppercase letter, one special character, one number and minimum 8 characters"
                    );
                }

                const existingUser = await User.findOne({ email: encrypt(email?.toLowerCase()), isDeleted: false }).session(session);

                if (existingUser) throw CustomError(ErrorName.ALREADY_EXIST, "Email entered already exists. Please log in to continue");


                const encryptedPassword = await CryptoHelper.hash(password, 10);

                const generateDummyPassword = generateRandomString(10);
                const dummyPasswordHash = await CryptoHelper.hash(generateDummyPassword, 10);
                const dummyPassword = `${dummyPasswordHash}~~~${generateDummyPassword}`;

                const subscriber = await Subscriber.findOne().session(session);
                let subscriberId = subscriber ? subscriber._id : null;
                const createUser = await User.create([
                    {
                        subscriber: subscriberId,
                        firstName: encrypt(firstName.toLowerCase()),
                        lastName: encrypt(lastName.toLowerCase()) ?? null,
                        password: encryptedPassword,
                        email: encrypt(email?.toLowerCase()),
                        dummyPassword: dummyPassword,
                        isRegistered: false,
                        directSignup: true,
                        isSignupAdminAprroved: false,
                        isResetPasswordDialog: true,
                        TermsAndConditions: TermsAndConditions ?? null,
                        UID: await EmployeeHelper.generateUserUID({ session }),
                    }
                ], { session });
                if (!createUser) throw CustomError(ErrorName.FAILED, "User creation failed!");

                let employeeUpdate = {
                    subscriber: subscriberId,
                    user: createUser[0],
                    regType: 1,
                    designation: 'null'
                };

                const savedEmployee = await Employee.create({
                    ...employeeUpdate,
                    UID: await EmployeeHelper.generateEmployeeUID({ subscriberId }),
                });
                if (!savedEmployee) throw CustomError(ErrorName.FAILED, "Employee creation failed!");

                const document = {
                    employeeId: savedEmployee._id?.toString(),
                    UID: savedEmployee.UID,
                    designation: savedEmployee.designation,
                    empDesignation: savedEmployee.empDesignation?.toString(),
                    bulkId: savedEmployee.bulkId,
                    regType: savedEmployee.regType,
                    isActive: savedEmployee.isActive,
                    isDeleted: savedEmployee.isDeleted,
                    subscriber: savedEmployee.subscriber?.toString(),
                    createdAt: savedEmployee.createdAt,
                    updatedAt: savedEmployee.updatedAt,

                    // Nested user fields
                    userId: savedEmployee.user?._id?.toString(),
                    firstName: savedEmployee.user?.firstName,
                    lastName: savedEmployee.user?.lastName,
                    email: savedEmployee.user?.email,
                    civilIdOrPassport: savedEmployee.user?.civilIdOrPassport,
                    languagePreference: savedEmployee.user?.languagePreference,
                    role: savedEmployee.user?.role,
                    subRoles: savedEmployee.user?.subRoles,
                    isVerified: savedEmployee.user?.isVerified,
                    isRegistered: savedEmployee.user?.isRegistered,
                    superAdmin: savedEmployee.user?.superAdmin,
                    deleteRequest: savedEmployee.user?.deleteRequest,
                    isDeleted_user: savedEmployee.user?.isDeleted,
                    directSignup: savedEmployee.user?.directSignup,
                    contentlanguages: savedEmployee.user?.contentlanguages,
                    currentVessel: savedEmployee.user?.currentVessel?.toString(),
                    vesselStatus: savedEmployee.user?.vesselStatus,
                    isEmailNotification: savedEmployee.user?.isEmailNotification,
                    isPushNotification: savedEmployee.user?.isPushNotification,
                    lastLoginAt: savedEmployee.user?.lastLoginAt,
                    isSignupAdminAprroved: savedEmployee.user?.isSignupAdminAprroved,
                    userCreatedAt: savedEmployee.user?.createdAt,
                    userUpdatedAt: savedEmployee.user?.updatedAt,
                    isResetPasswordDialog: savedEmployee.user?.isResetPasswordDialog,
                    indexedAt: new Date(),
                };

                try {
                    await indexDocumenttoElasticSearch("users", savedEmployee?._id, document);
                } catch (error) {
                    throw CustomError(ErrorName.SIGNUP_FAILED, error.message);
                }

                const result = await SignupRequest.create([{
                    firstName: encrypt(firstName.toLowerCase()),
                    lastName: encrypt(lastName.toLowerCase()),
                    email: encrypt(email?.toLowerCase()),
                    signupStatus: signupstatus.PENDING,
                    userId: createUser[0]._id,
                }], { session });
                if (!result) throw CustomError(ErrorName.FAILED, "Signup request creation failed!");

                let tokenPayload = {
                    role: savedEmployee?.user?.role,
                    userId: savedEmployee?.user?._id,
                    permissions: [...new Set(savedEmployee?.user?.subRoles?.map(x => x.permissions).flat(1))],
                    subscriberId: savedEmployee?.user?.subscriber?._id ?? savedEmployee?.user?.subscriber,
                    employeeId: savedEmployee?._id,
                };

                if (tokenPayload.subscriberId) {
                    const activeSubscriptionInfo = await subscriptionHelper.getActiveSubscriptionInfo(
                        tokenPayload.subscriberId
                    );

                    tokenPayload = {
                        ...tokenPayload,
                        ...activeSubscriptionInfo,
                    };

                    savedEmployee.user.subscriptionInfo = activeSubscriptionInfo;
                }

                if (!tokenPayload) throw CustomError(ErrorName.FAILED, "Signup request creation failed!");

                const accessToken = JwtHelper.sign(tokenPayload, process.env.APP_SECRET, { expiresIn: "8h" });
                const refreshToken = JwtHelper.sign({ userId: savedEmployee?.user?._id }, process.env.REFRESH_SECRET, { expiresIn: "7d" });
                const viewRequestPath = `${process.env.APP_URL}/admin/signup-request`;
                const signupRequestNotifcation = {
                    subscriber: subscriberId,
                    title: [{ lang: "en", value: `Sign Up Request` }],
                    message: [
                        {
                            lang: "en",
                            value: `Signup request received. Please take necessary action.`,
                        },
                    ],
                    notificationType: NotificationType.SIGNUP_USER_REQUEST,
                    notifyAllAdmin: true,
                    isNotificatonForAdmin: true,
                    notifiers: [],
                    additionalInfo: [
                        {
                            infoType: "VIEW_REQUEST",
                            infoData: {
                                filePath: viewRequestPath
                            }
                        }
                    ],
                    status: 'SENT',
                    employeeNotifiers: [],
                    isUserRequest: true,
                    icon: notificationiconEnum.SIGNUP_REQUEST,
                };
                await NotificationHelper.createNotification([signupRequestNotifcation], { session });
                return {
                    message: "You have successfully signed up! Please wait for admin approval",
                    status: 'true',
                    user: employeeUpdate?.user,
                    token: accessToken,
                    refreshToken: refreshToken,
                };

            });
            return signUp;

        } catch (error) {
            throw CustomError(ErrorName.SIGNUP_FAILED, error.message);
        }
    },
    signIn: async ({ input }, context) => {
        try {
            const signIn = await DbTransactionHelper.performDbTransaction(async session => {
                const encryptedEmail = encrypt(input.emailOrCivilIdOrPassport);

                const existingUser = await User.findOne({
                    $or: [
                        { email: encryptedEmail },
                        { civilIdOrPassport: input.emailOrCivilIdOrPassport },
                    ],
                    role: { $ne: Role.SAAS_ADMIN },
                    isActive: true,
                    isDeleted: { $ne: true },
                }).populate({
                    path: 'subRoles',
                    select: '_id name permissions isActive isPredefined description isDefault primaryRole',
                }).session(session);

                if (!existingUser) {
                    return CustomError(ErrorName.USER_NOT_FOUND);
                }


                if (existingUser.deleteRequest === true) {
                    return CustomError(ErrorName.DELETE_REQUEST_PENDING, 'Your account delete request is pending. Please contact your admin');
                }


                const isPasswordValid = await CryptoHelper.compare(input.password, existingUser.password);


                if (!isPasswordValid) {
                    return CustomError(ErrorName.WRONG_PASSWORD);
                }


                if (input?.consents?.length > 0) {
                    const termsAndConditionsInput = input.consents;
                    const existingConditionsMap = new Map(
                        existingUser.consents.map(tc => [tc._id.toString(), tc])
                    );

                    termsAndConditionsInput.forEach(condition => {
                        const inputConditionId = condition._id ? condition._id.toString() : null;

                        if (inputConditionId && existingConditionsMap.has(inputConditionId)) {

                            const existingCondition = existingConditionsMap.get(inputConditionId);
                            existingCondition.message = condition.message;
                            existingCondition.consentType = consentTypes.INITIAL_LOGIN;
                            existingCondition.title = condition.title;
                            existingCondition.status = condition.status;
                            existingCondition.timestamp = condition.timestamp || new Date().toISOString();
                        } else {
                            existingUser.consents.push({
                                _id: new mongoose.Types.ObjectId(),
                                consentType: consentTypes.INITIAL_LOGIN,
                                message: condition.message,
                                title: condition.title,
                                status: condition.status,
                                timestamp: condition.timestamp || new Date().toISOString(),
                            });
                        }
                    });


                    if (input?.consents?.some(consent => consent.status === false)) {
                        const decryptedUserEmail = decrypt(existingUser?.email);
                        const decryptedUserFirstName = decrypt(existingUser?.firstName);


                        await AwsHelper.sendEmail({
                            receiverEmail: decryptedUserEmail,
                            subject: `Your Sign In Was Not Complete`,
                            htmlContent: consentsforLearnerInitalLogin({ firstName: decryptedUserFirstName }),
                        });

                        const adminSubRole = await SubRole.findOne({ name: 'ADMIN' }).select('_id');
                        const adminUserEmails = await User.find(
                            { subRoles: { $in: adminSubRole?._id } },
                            { email: 1, firstName: 1, lastName: 1 }
                        ).lean();


                        const adminUsers = adminUserEmails?.map(user => ({
                            email: decrypt(user?.email),
                            firstName: decrypt(user?.firstName),
                            lastName: user?.lastName ? decrypt(user?.lastName) : '',
                        }));

                        await Promise.all(adminUsers?.map(async user => await AwsHelper.sendEmail({
                            receiverEmail: user?.email,
                            subject: `Alert: Learner Rejected Terms and Conditions`,
                            htmlContent: sendConsentsforAllAdminsInitalLogin({
                                adminFirstName: decrypt(user?.firstName),
                                learnerfirstName: decryptedUserFirstName,
                                learnerEmail: decryptedUserEmail
                            }),
                        })));
                    }
                }

                return await UserHelper.makeAuthUser(existingUser);
            });

            return signIn;

        } catch (error) {
            throw new Error(error.message);
        }
    },

    lastLoginAt: async ({ firebaseToken }, context) => {
        const { userId } = AuthUser(context);
        if (!userId) throw CustomError(ErrorName.UNAUTHORIZED, "User not authenticated");

        const lastLoginAtTime = Moment().format();

        try {
            const updatePromises = [];

            const mongoUpdate = {
                lastLoginAt: lastLoginAtTime
            };

            if (firebaseToken) {
                mongoUpdate.firebaseTokens = [firebaseToken];
            }

            // Use DbTransactionHelper for atomic update
            const { DbTransactionHelper } = require('../../util');
            const { UserSearchCache } = require('../user/user_search_cache/user_search_cache_model');

            await DbTransactionHelper.performDbTransaction(async (session) => {
                await User.findByIdAndUpdate(userId, mongoUpdate, {
                    new: false,
                    lean: true,
                    session
                });

                // Update cache within transaction
                await UserSearchCache.updateOne(
                    { userId: userId.toString() },
                    { $set: { lastLoginAt: lastLoginAtTime } },
                    { session }
                );
            });

            return "Last login time updated successfully";

        } catch (error) {
            console.error("Failed to update last login time:", error);
            throw CustomError(ErrorName.FAILED, `Failed to update last login time: ${error.message}`);
        }
    },
    generateRefreshToken: async ({ token }) => {
        if (!token) throw CustomError(ErrorName.NO_REFRESH_TOKEN);
        try {
            return await UserHelper.refreshToken(token);
        } catch {
            throw CustomError(ErrorName.UNAUTHORIZED);
        }
    },

    signOut: async ({ input }, context) => {
        const { isAuthenticated, masterLogin, userId } = AuthUser(context, false);

        if (isAuthenticated && masterLogin !== true) {
            await User.findByIdAndUpdate(userId, {
                firebaseTokens: [],
            })
                .lean()
                .select("_id");
        }

        return "SUCCESS";
    },

    // for app signup
    appSignUp: async ({ input }) => {

        if (
            !input.firstName ||
            !input.email ||
            !input.password
        )
            throw CustomError(ErrorName.ARGUMENTS_REQUIRED);

        const existingUser = await AppUser.findOne({ email: input.email });

        if (existingUser) throw CustomError(ErrorName.USER_ALREADY_EXIST);

        const savedEmployees = await DbTransactionHelper.performDbTransaction(async session => {

            const savedEmployees = [];

            const password = await CryptoHelper.hash(input.password, 10);

            const designation = await Designation.findOne();

            const subscriberId = (await Subscriber.findOne().lean().select("_id"))?._id;

            const civilIdOrPassport = generateRandomString(8);

            let userRole = Role.LEARNER;

            const savedUser = await AppUser.create({
                subscriber: subscriberId,
                firstName: input.firstName,
                lastName: input.lastName ?? null,
                civilIdOrPassport: civilIdOrPassport,
                isRegistered: true,
                isResetPasswordDialog: true,
                email: input.email,
                role: userRole,
                password,
                UID: await EmployeeHelper.generateUserUID({ session }),
            });

            if (!savedUser) throw CustomError(ErrorName.FAILED);


            let employeeUpdate = {
                subscriber: subscriberId,
                user: savedUser,
                empDesignation: designation._id,
                designation: designation.name,
            };

            const savedEmployee = await AppEmployee.create({
                ...employeeUpdate,
                UID: await EmployeeHelper.generateEmployeeUID({ subscriberId, session }),
            });

            if (!savedEmployee) throw CustomError(ErrorName.FAILED);

            return savedEmployees;
        });

        return {
            status: true,
            message: "User created successfully!",
        };
    },
    signUpVerifyEmail: async ({ input }) => {
        try {
            const { email } = input;
            if (!email) throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Email is required!");
            const lowercaseEmail = encrypt(email.toLowerCase());
            const existingUser = await User.findOne({ email: lowercaseEmail, isDeleted: false });
            if (existingUser) throw CustomError(ErrorName.USER_ALREADY_EXIST, "Email entered already exists!");

            const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
            if (!emailRegex.test(email))
                throw CustomError(ErrorName.INVALID_EMAIL, "Invalid email format!");

            const generatedtoken = Crypto.randomBytes(16).toString("hex");

            const otp = Math.floor(100000 + Math.random() * 900000);
            const html = `<div style="text-align: center;">
            <h2>Otp for Email Verification</h2>
            <p>Your OTP for email verification is <b>${otp}</b></p>
            <p></p>
            <p>Click on the link below to verify your email <a href="${process.env.APP_URL}/verification-code?token=${generatedtoken}">Verify Email</a></p>
            </div>`;

            const sendEmailResponse = await AwsHelper.sendEmail({
                receiverEmail: email,
                subject: "OTP Email Verification",
                htmlContent: signUpVerifyEmailTemplate({
                    otp: otp,
                    verificationLink: `${process.env.APP_URL}/verification-code?token=${generatedtoken}`
                }),
            });



            /*
            const transporter = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: '587',
                secure: false, 
                auth: {
                    user: 'squadramedia.in@gmail.com',
                    pass: 'qsla srjn keet zsxk',
                },
            });

            const mailOptions = {
                from: process.env.EMAIL_VERIFIED_SENDER,
                to: email,
                subject: "OTP Email Verification",
                html: signUpVerifyEmailTemplate({
                    otp: otp,
                    verificationLink: `${process.env.APP_URL}/verification-code?token=${generatedtoken}`
                }),
            };

            const sendEmailResponse = await transporter.sendMail(mailOptions);
            */
            const encryptedOtp = await CryptoHelper.hash(otp.toString(), 10);
            if (sendEmailResponse) {
                await SignUpOtp.create({
                    email: lowercaseEmail,
                    otp: encryptedOtp,
                    generatedtoken: generatedtoken,
                });
            }
            return {
                status: true,
                message: `OTP sent successfully to ${email}`,
                generatedtoken: generatedtoken,
                email: email,
            };
        } catch (error) {
            throw CustomError(ErrorName.EMAIL_VERIFICATION_FAILED, error.message);
        }
    },

    verifyOTPSignup: async ({ input }) => {
        try {
            const { email, generatedtoken, otp } = input;
            if (!otp || !generatedtoken) throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Otp or generated token is missing!");
            const savedOtp = await SignUpOtp.findOne({ generatedtoken });
            if (!savedOtp) throw CustomError(ErrorName.OTP_EXPIRED, 'OTP expired');

            const isOtpValid = await CryptoHelper.compare(otp.toString(), savedOtp.otp);
            if (!isOtpValid) throw CustomError(ErrorName.INVALID_OTP, 'Invalid OTP');

            await SignUpOtp.deleteMany({ email });
            return {
                status: true,
                message: "OTP verified successfully!",
                email: savedOtp.email,
            };

        } catch (error) {
            throw CustomError(ErrorName.OTP_VERIFICATION_FAILED, error.message);
        }
    },
    updateProfileforCourseSetting: async ({ input }, context) => {
        try {
            const { languagecode, userId } = input;

            if (!languagecode && !userId) throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Required fields are missing");

            const user = await User.findOne({ _id: userId });
            if (!user) throw CustomError(ErrorName.USER_NOT_FOUND, "User not found");

            let updatedLanguages = [];

            if (languagecode && languagecode?.length > 0) {
                const validLanguages = await ContentLanguage.find({
                    title: { $in: languagecode }
                }).select("title");

                const foundCodes = validLanguages.map(lang => lang.title);
                if (foundCodes.length !== languagecode.length) {
                    throw CustomError(ErrorName.INVALID_CONTENT_LANGUAGE, "Invalid content languages provided");
                }
                updatedLanguages = foundCodes;
            } else {
                updatedLanguages = user?.contentlanguages || [];
            }
            user.contentlanguages = updatedLanguages;
            await user.save();

            return {
                status: true,
                message: languagecode && languagecode?.length > 0
                    ? "Profile updated successfully with provided content languages."
                    : "Profile updated successfully with existing content languages.",
            };
        } catch (error) {
            throw CustomError(ErrorName.FAILED_TO_UPDATE_CONTENT_LANGUAGE, error.message);
        }
    },
    switchNotifcation: async ({ input }, context) => {
        try {
            const { userInfo, userId } = AuthUser(context);
            const { isEmailNotification, isPushNotification } = input;
            const user = await User.findOne({ _id: userId });
            if (!user) throw CustomError(ErrorName.USER_NOT_FOUND, "User not found");
            if (typeof isEmailNotification === 'boolean') {
                user.isEmailNotification = isEmailNotification;
            }
            if (typeof isPushNotification === 'boolean') {
                user.isPushNotification = isPushNotification;
            }
            await user.save();

            return {
                status: true,
                message: "Notification preferences updated successfully",
                currentNotificationStatus: {
                    isEmailNotification: user.isEmailNotification,
                    isPushNotification: user.isPushNotification
                }
            };
        } catch (error) {
            throw CustomError(ErrorName.FAILED_TO_SWITCH_NOTIFICATION, error.message);
        }
    }
};
