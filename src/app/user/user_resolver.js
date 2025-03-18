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
const  SignUpOtp  = require('./SignUpOtp');
const nodemailer = require("nodemailer");
const SignupRequest = require('../signup-request/signup-request-model');
const signupstatus = require('../signup-request/signup-status.json');
const subscriptionHelper = require("../saas/subscriber/subscription/subscription_helper");
const {signUpVerifyEmailTemplate} = require('../email-template/signUpEmailVerification');
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
                    notifyAdmin: true,
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
                    notifyAdmin: true,
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
                    notifyAdmin: true,
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

                const { firstName, lastName, password, confirmPassword, email, country } = input;

                if (!password || !confirmPassword || !email) {
                    throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Required fields are missing");
                }

                if (password !== confirmPassword) throw CustomError(ErrorName.PASSWORD_MISMATCH, "Passwords do not match");

                const passwordRegex = new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.{8,})");
                if (!passwordRegex.test(password)) {
                    throw CustomError(
                        ErrorName.INVALID_PASSWORD,
                        "Password must have at least one uppercase letter, one lowercase letter, one number and minimum 8 characters"
                    );
                }

                const existingUser = await User.findOne({ email, isDeleted: false }).session(session);

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
                        firstName: firstName,
                        lastName: lastName ?? null,
                        password: encryptedPassword,
                        email: email,
                        dummyPassword: dummyPassword,
                        isRegistered: false,
                        directSignup: true,
                        isSignupAdminAprroved: false,
                        isResetPasswordDialog: true,
                        UID: await EmployeeHelper.generateUserUID({ session }),
                    }
                ], { session });
                if (!createUser) throw CustomError(ErrorName.FAILED, "User creation failed!");

                let employeeUpdate = {
                    subscriber: subscriberId,
                    user: createUser[0],
                    regType: 1,
                    country: country,
                    designation: 'null'

                };

                const savedEmployee = await Employee.create({
                    ...employeeUpdate,
                    UID: await EmployeeHelper.generateEmployeeUID({ subscriberId }),
                });
                if (!savedEmployee) throw CustomError(ErrorName.FAILED, "Employee creation failed!");
                const result = await SignupRequest.create([{
                    firstName: firstName,
                    lastName: lastName,
                    email: email,
                    country: country,
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

                const emailOrCivilIdOrPassport = input.emailOrCivilIdOrPassport;
                const password = input.password;

                // for app signup
                const fetchAppUser = await AppUser.findOne({
                    $or: [
                        { email: { $regex: new RegExp(`^${input.emailOrCivilIdOrPassport}$`, "i") } },
                        { civilIdOrPassport: input.emailOrCivilIdOrPassport },
                    ],
                }).session(session);

                if (fetchAppUser) {
                    const valid = await CryptoHelper.compare(input.password, fetchAppUser.password);

                    if (valid) {

                        const fetchUser = await User.findOne({ email: "testuser@example.com" }).session(session);
                        if (!fetchUser) {
                            return CustomError(ErrorName.USER_NOT_FOUND);
                        }
                        return await UserHelper.makeAuthUser(fetchUser);
                    }
                } else {

                    const expiredUser = await User.findOne({
                        $or: [
                            { email: { $regex: new RegExp(`^${input.emailOrCivilIdOrPassport}$`, "i") } },
                            { civilIdOrPassport: input.emailOrCivilIdOrPassport },
                        ],
                        isDeleted: true,
                        deleteRequest: true,
                        isActive: false
                    }).session(session);

                    if (expiredUser) {
                        expiredUser.isDeleted = false;
                        expiredUser.isActive = true;
                        expiredUser.deleteRequest = false;
                        expiredUser.deleteRequestDate = null;
                        expiredUser.reasonForDelete = null;
                        await expiredUser.save({ session });

                        await OverallTrainingProgress.updateMany(
                            { user: expiredUser._id },
                            {
                                $set: {
                                    isDeleted: false,
                                }
                            }
                        ).session(session);
                    }


                    const existingUser = await User.findOne({
                        $or: [
                            { email: { $regex: new RegExp(`^${input.emailOrCivilIdOrPassport}$`, "i") } },
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


                    const processValidUser = async () => {
                        if (input.firebaseToken) {
                            existingUser.firebaseTokens = [input.firebaseToken];
                        }

                        if (input.deviceId) {
                            existingUser.deviceIds = [input.deviceId];
                        }

                        existingUser.lastLoginAt = Moment().format();
                        await existingUser.save({ session });
                        return await UserHelper.makeAuthUser(existingUser);
                    };


                    const valid = await CryptoHelper.compare(input.password, existingUser.password);

                    if (valid) {
                        return await processValidUser();
                    } else if (existingUser.role === Role.EMPLOYEE) {

                        const subscriberProfile = await SubscriberProfile.findOne({
                            subscriber: existingUser.subscriber,
                        }).lean().select("employeeMasterPassword").session(session);

                        if (
                            context.platform === Role.EMPLOYEE &&
                            subscriberProfile?.employeeMasterPassword?.length
                        ) {
                            const valid = await CryptoHelper.compare(
                                input.password,
                                subscriberProfile.employeeMasterPassword
                            );

                            if (valid) {
                                return await processValidUser();
                            }
                        }

                        if (
                            existingUser.isRegistered !== true &&
                            existingUser.password === process.env.USER_DUMMY_PASSWORD
                        ) {
                            return CustomError(ErrorName.UNAUTHORIZED);
                        }
                    }
                }


                return CustomError(ErrorName.WRONG_PASSWORD);
            });
            return signIn;

        } catch (error) {
            throw new Error(error.message);
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
            const { country, email } = input;
            if (!email) throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Email is required!");
            const existingUser = await User.findOne({ email, isDeleted: false });
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

            // const sendEmailResponse = await AwsHelper.sendEmail({
            //     receiverEmail: email,
            //     subject: "OTP Email Verification",
            //     htmlContent: html,
            // });




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

            const encryptedOtp = await CryptoHelper.hash(otp.toString(), 10);
            if (sendEmailResponse) {
                await SignUpOtp.create({
                    email : email,
                    otp: encryptedOtp,
                    generatedtoken: generatedtoken,
                    country: country
                });
            }
            return {
                status: true,
                message: "OTP sent successfully!",
                generatedtoken:generatedtoken,
                email:email,
                country: country
            };
        } catch (error) {
            throw CustomError(ErrorName.EMAIL_VERIFICATION_FAILED, error.message);
        }
    },

    verifyOTPSignup: async ({ input }) => {
        try {
            const { email, generatedtoken, otp } = input;
            if (!email || !otp || !generatedtoken ) throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Email or otp is missing!");
            const savedOtp = await SignUpOtp.findOne({ generatedtoken });
            if (!savedOtp) throw CustomError(ErrorName.OTP_EXPIRED,'OTP expired');
            
            const isOtpValid = await CryptoHelper.compare(otp.toString(), savedOtp.otp);
            if (!isOtpValid) throw CustomError(ErrorName.INVALID_OTP,'Invalid OTP');
            
            await SignUpOtp.deleteMany({ email });
            return {
                status: true,
                message: "OTP verified successfully!",
                email: savedOtp.email,
                country: savedOtp.country
            };
          
        } catch (error) {
            throw CustomError(ErrorName.OTP_VERIFICATION_FAILED, error.message);
        }
    },
};
