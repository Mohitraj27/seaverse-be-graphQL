const { Validator, CryptoHelper, Moment, JwtHelper } = require("../../tools");
const {
    CustomError,
    ErrorName,
    Role,
    GenerateOtp,
    SendEmail,
    EmailTemplate,
    DbTransactionHelper,
} = require("../../util");

const { User } = require("./user_model");
const { Otp } = require("./otp_model");
const { Subscriber } = require("../saas/subscriber/subscriber_model");
const { Employee } = require("./employee/employee_model");
const { SubscriberProfile } = require("./subscriber-profile/subscriber_profile_model");

const UserHelper = require("./user_helper");
const SubscriberHelper = require("../saas/subscriber/subscriber_helper");
const EmployeeHelper = require("./employee/employee_helper");

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
    signUp: async ({ input, token }) => {
        if (token) {
            const user = await JwtHelper.verify(token, process.env.APP_SECRET, {
                ignoreExpiration: true,
            });

            if (user?.id) {
                if (
                    input.emailOrCivilIdOrPassport !== user.email &&
                    input.emailOrCivilIdOrPassport !== user.civilIdOrPassport
                ) {
                    throw CustomError(ErrorName.NOT_FOUND);
                }

                const existingUser = await User.findById(user.id)
                    .lean()
                    .select("firstName lastName isRegistered password");

                if (!existingUser) throw CustomError(ErrorName.NOT_FOUND);

                if (
                    existingUser.isRegistered &&
                    existingUser.password !== process.env.USER_DUMMY_PASSWORD
                ) {
                    throw CustomError(ErrorName.USER_ALREADY_EXIST);
                }

                if (user.role === Role.EMPLOYEE) {
                    input.isProfileCompleted = false;
                }

                input.email = user.email;
                input.civilIdOrPassport = user.civilIdOrPassport;

                const savedUser = await UserHelper.updateUser(
                    {
                        id: user.id,
                        input: { ...input, isRegistered: true },
                    },
                    { currentRole: user.role }
                );

                if (savedUser) {
                    UserHelper.sendSignUpNotification({
                        subscriber: savedUser.subscriber,
                        user: savedUser,
                        createdBy: savedUser._id,
                    });

                    return await UserHelper.makeAuthUser(savedUser);
                }
            }
        } else {
            if (!Validator.isEmail(input.emailOrCivilIdOrPassport) || !input.password)
                throw CustomError(ErrorName.BAD_REQUEST);

            const existingUser = await User.findOne({
                email: { $regex: new RegExp(`^${input.emailOrCivilIdOrPassport}$`, "i") },
            })
                .lean()
                .select("_id");

            if (existingUser) throw CustomError(ErrorName.USER_ALREADY_EXIST);

            const subscriberId = (await Subscriber.findOne().lean().select("_id"))?._id;
            if (!subscriberId) throw CustomError(ErrorName.FAILED);

            const savedUser = await DbTransactionHelper.performDbTransaction(async session => {
                const savedUser = await new User({
                    UID: await EmployeeHelper.generateUserUID({ session }),
                    subscriber: subscriberId,
                    email: input.emailOrCivilIdOrPassport,
                    password: await CryptoHelper.hash(input.password, 10),
                    role: Role.EMPLOYEE,
                    isRegistered: true,
                }).save({ session });

                if (!savedUser) throw CustomError(ErrorName.FAILED);

                const savedEmployee = await new Employee({
                    UID: await EmployeeHelper.generateEmployeeUID({
                        subscriberId,
                        session,
                    }),
                    subscriber: subscriberId,
                    user: savedUser._id,
                }).save({ session });

                if (!savedEmployee) throw CustomError(ErrorName.FAILED);

                return savedUser;
            });

            UserHelper.sendSignUpNotification(
                {
                    subscriber: savedUser.subscriber,
                    user: savedUser,
                    createdBy: savedUser._id,
                },
                false
            );

            return await UserHelper.makeAuthUser(savedUser);
        }

        throw CustomError(ErrorName.BAD_REQUEST);
    },
    signIn: async ({ input }, context) => {
        const existingUser = await User.findOne({
            $or: [
                { email: { $regex: new RegExp(`^${input.emailOrCivilIdOrPassport}$`, "i") } },
                { civilIdOrPassport: input.emailOrCivilIdOrPassport },
            ],
            role: { $ne: Role.SAAS_ADMIN },
            isActive: true,
            isDeleted: { $ne: true },
        });
        
        if (existingUser) {
            const processValidUser = async () => {
                if (input.firebaseToken) {
                    existingUser.firebaseTokens = [input.firebaseToken];
                }

                if (input.deviceId) {
                    existingUser.deviceIds = [input.deviceId];
                }

                existingUser.lastLoginAt = Moment().format();
                
                await existingUser.save();
                return await UserHelper.makeAuthUser(existingUser);
            };

            const valid = await CryptoHelper.compare(input.password, existingUser.password);
            
            if (valid) {
                return await processValidUser();
            } else if (existingUser.role === Role.EMPLOYEE) {
                const subscriberProfile = await SubscriberProfile.findOne({
                    subscriber: existingUser.subscriber,
                })
                    .lean()
                    .select("employeeMasterPassword");

                if (
                    context.platform === Role.EMPLOYEE &&
                    subscriberProfile?.employeeMasterPassword?.length
                ) {
                    const valid = await CryptoHelper.compare(
                        input.password,
                        subscriberProfile.employeeMasterPassword
                    );

                    if (valid) return await processValidUser();
                }

                if (
                    existingUser.isRegistered !== true &&
                    existingUser.password === process.env.USER_DUMMY_PASSWORD
                ) {
                    throw CustomError(ErrorName.UNAUTHORIZED);
                }
            }

            throw CustomError(ErrorName.WRONG_PASSWORD);
        }

        throw CustomError(ErrorName.NOT_FOUND);
    },
    generateRefreshToken: async ({token}) => {
        if(!token) throw CustomError(ErrorName.NO_REFRESH_TOKEN);
        try {
            return await UserHelper.refreshToken(token);
        }catch{
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
};
