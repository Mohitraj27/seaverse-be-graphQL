const { CryptoHelper, JwtHelper, Validator } = require("../../tools");
const { CustomError, ErrorName, Role, UploadHelper, VesselStatus } = require("../../util");

const { User  } = require("./user_model");

const SubscriptionHelper = require("../saas/subscriber/subscription/subscription_helper");
const NotificationHelper = require("../notifications/notification_helper");

const NotificationType = require("../notifications/notification_type.json");
const { decrypt, encrypt } = require('../../util/encryption_helper');
const { updateByQueryToElasticSearch } = require("../../util/elastic_helper");
module.exports = {
    makeAuthUser: async user => {
        const tokenPayload = {
            role: user.role,
            userId: user._id,
            subscriberId: user.subscriber?._id ?? user.subscriber,
        };

        const accessToken = JwtHelper.sign(tokenPayload, process.env.APP_SECRET, { expiresIn: "1m" });
        const refreshToken = JwtHelper.sign({ userId: user._id }, process.env.REFRESH_SECRET, { expiresIn: "7d" });
        // console.log('🧪 TEST MODE: Created tokens with short expiration');
        // console.log(`📅 Access Token expires in: 15 minutes`);
        // console.log(`📅 Refresh Token expires in: 7 days`);
        return {
            user: user,
            token: accessToken,
            refreshToken: refreshToken,
        };
    },
    refreshToken: async (refreshToken) => {
        if (!refreshToken) {
            throw CustomError(ErrorName.NO_REFRESH_TOKEN);
        }
        try {
            const decoded = JwtHelper.verify(refreshToken, process.env.REFRESH_SECRET);
            if (!decoded) {
                throw CustomError(ErrorName.UNAUTHORIZED);
            }
            const user = await User.findOne({ _id: decoded.userId, isDeleted: false });
            if (!user) {
                throw CustomError(ErrorName.USER_NOT_FOUND);
            }
            const tokenPayload = {
                masterLogin: user.masterLogin,
                role: user.role,
                userId: user._id,
                permissions: [...new Set(user.subRoles?.map(x => x.permissions).flat(1))],
                subscriberId: user.subscriber?._id ?? user.subscriber,
                employeeId: user.employee?._id ?? user.employee,
            };
            const newAccessToken = JwtHelper.sign(tokenPayload, process.env.APP_SECRET, { expiresIn: "1m" });
            const newRefreshToken = JwtHelper.sign({ userId: user._id }, process.env.REFRESH_SECRET, { expiresIn: "7d" });
            console.log('🟢 TEST: Token refresh successful');
            console.log(`📅 New Access Token expires in: 1 minute`);
            console.log(`📅 New Refresh Token expires in: 7 days`);
            return {
                accessToken: newAccessToken,
                refreshToken: newRefreshToken
            };
        } catch (error) {
            throw CustomError(ErrorName.FAILED, `${error.message}`);
        }

    },
    createUser: async ({ input }) => {
        if (!Validator.isEmail(input.emailOrCivilIdOrPassport) || !input.password)
            throw CustomError(ErrorName.BAD_REQUEST);

        const existingUser = await User.findOne({
            $or: [
                { email: { $regex: new RegExp(`^${input.emailOrCivilIdOrPassport}$`, "i") } },
            ],
        })
            .lean()
            .select("_id");

        if (existingUser) throw CustomError(ErrorName.USER_ALREADY_EXIST);

        const newUser = new User({
            subscriber: input.subscriber,
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.emailOrCivilIdOrPassport,
            phone: input.phone,
            password: await CryptoHelper.hash(input.password, 10),
            role: input.role,
            subRoles: input.subRoles,
            firebaseTokens: input.firebaseToken ? [input.firebaseToken] : [],
            deviceIds: input.deviceId ? [input.deviceId] : [],
            isVerified: input.isVerified ?? false,
            isActive: input.isActive != null ? input.isActive : true,
            isRegistered: input.isRegistered ?? false,
        });

        if (input.avatar) {
            const savedAvatar = await UploadHelper.uploadImage({
                imageData: input.avatar,
                folderName: newUser._id,
                fileName: `avatar_${newUser._id}_${Date.now()}`,
                uploadType: UploadHelper.uploadType.userImage,
            });

            if (savedAvatar) newUser.avatar = savedAvatar;
        }

        const savedUser = newUser.save();
        if (!savedUser) throw CustomError(ErrorName.FAILED);
        return savedUser;
    },
    updateUser: async ({ id, input }, { currentRole }) => {
        const existingUser = await User.findById(id);

        if (existingUser) {
            if (input.firstName) existingUser.firstName = encrypt(input.firstName.trim().toLowerCase());

            if (input.lastName) existingUser.lastName = encrypt(input.lastName.trim().toLowerCase());



            if (input.lastName === '') existingUser.lastName = null;

            if (
                input.civilIdOrPassport &&
                encrypt(input.civilIdOrPassport.toUpperCase()) !== existingUser.civilIdOrPassport
            ) {
                const civilIdOrPassportExists = await User.findOne({
                    civilIdOrPassport: encrypt(input.civilIdOrPassport.toUpperCase()),
                })
                    .lean()
                    .select("_id");
                if (civilIdOrPassportExists) throw CustomError(ErrorName.USER_ALREADY_EXIST);

                existingUser.civilIdOrPassport = encrypt(input.civilIdOrPassport.toUpperCase());
            }

            if (
                input.email &&
                encrypt(input.email.trim().toLowerCase()) !== existingUser.email
            ) {
                const emailExists = await User.findOne({
                    email: encrypt(input.email.trim().toLowerCase()),
                })
                    .lean()
                    .select("_id");

                if (emailExists) throw CustomError(ErrorName.USER_ALREADY_EXIST);

                existingUser.email = encrypt(input.email.trim().toLowerCase());
            }
            if (input?.consents?.length > 0 ) {
                const validConsents = input.consents.every(consent =>
                    typeof consent.title === 'string' &&
                    typeof consent.message === 'string' &&
                    typeof consent.status === 'boolean'
                );
                if (!validConsents) {
                     throw CustomError(ErrorName.INVALID_CONSENT_FORMAT, 'Invalid consent format');
                }
               await User.findByIdAndUpdate(
                    input?._id,
                    { $set: { consents: input.consents } },
                    { new: true }
                );
            }

            if (input.phone) existingUser.phone = input.phone;

            if (input.avatar) {
                const savedAvatar = await UploadHelper.uploadImage({
                    data: input.avatar,
                    folderName: existingUser._id,
                    fileName: `avatar_${existingUser._id}_${Date.now()}`,
                    uploadType: UploadHelper.uploadType.userImage,
                });

                if (savedAvatar) existingUser.avatar = savedAvatar;
            }

            if (input.subRoles) existingUser.subRoles = input.subRoles;

            if (input.languagePreference)
                existingUser.languagePreference = input.languagePreference;

            if (input.isRegistered != null) existingUser.isRegistered = input.isRegistered;
            if (input.currentVessel || input.currentVessel === '') existingUser.currentVessel = input.currentVessel === '' ? null : input.currentVessel;
            if (!input.currentVessel) existingUser.currentVessel = null;
            if (input.vesselStatus || input.vesselStatus === '') existingUser.vesselStatus = input.vesselStatus === '' ? null : input.vesselStatus;

            if (input.isProfileCompleted != null)
                existingUser.isProfileCompleted = input.isProfileCompleted;

            if (input.isOrganizationManager != null) {
                existingUser.isOrganizationManager = input.isOrganizationManager;
                existingUser.managingOrganization = input.isOrganizationManager
                    ? input.organization
                    : undefined;
            }

            if (
                currentRole === Role.SAAS_ADMIN ||
                currentRole === Role.EMPLOYEE ||
                currentRole === Role.ADMIN ||
                currentRole === Role.AUTHOR
            ) {
                if (input.password)
                    existingUser.password = await CryptoHelper.hash(input.password, 10);

                if (input.role && input.role !== Role.SAAS_ADMIN) existingUser.role = input.role;

                if (input.isVerified != null) existingUser.isVerified = input.isVerified;

                if (input.isActive != null) existingUser.isActive = input.isActive;
            }

            const savedUser = await existingUser.save();
            if (!savedUser) throw CustomError(ErrorName.FAILED);

            try {
                await updateByQueryToElasticSearch(
                    "users", 
                    `
                        ctx._source.firstName = params.firstName;
                        ctx._source.lastName = params.lastName;
                        ctx._source.email = params.email;
                        ctx._source.civilIdOrPassport = params.civilIdOrPassport;
                        ctx._source.isRegistered = params.isRegistered;
                        ctx._source.vesselStatus = params.vesselStatus;
                        ctx._source.currentVessel = params.currentVessel;
                        ctx._source.subRoles = params.subRoles;
                        ctx._source.role = params.role;
                        ctx._source.isActive = params.isActive;
                        ctx._source.isVerified = params.isVerified;
                        ctx._source.avatar = params.avatar;
                    `,
                    {
                        term: { userId: savedUser._id.toString() }
                    },
                    {
                        firstName: savedUser.firstName,
                        lastName: savedUser.lastName,
                        email: savedUser.email,
                        phone: savedUser.phone,
                        civilIdOrPassport: savedUser.civilIdOrPassport,
                        avatar: savedUser.avatar,
                        languagePreference: savedUser.languagePreference,
                        isRegistered: savedUser.isRegistered,
                        vesselStatus: savedUser.vesselStatus,
                        currentVessel: savedUser.currentVessel,
                        subRoles: savedUser.subRoles,
                        role: savedUser.role,
                        isActive: savedUser.isActive,
                        isVerified: savedUser.isVerified,
                        isOrganizationManager: savedUser.isOrganizationManager,
                        managingOrganization: savedUser.managingOrganization,
                        avatar: savedUser.avatar,
                    }
                );
            } catch (error) {
                throw CustomError(ErrorName.NOT_FOUND);
            }
            
            return savedUser;
        }

        throw CustomError(ErrorName.NOT_FOUND);
    },
    sendSignUpNotification: async (notificationData, isInvited = true) => {
        const nameOrEmail = decrypt(notificationData.user?.firstName) ?? decrypt(notificationData.user?.email) ?? "";

        let notification = {
            subscriber: notificationData.subscriber,
            title: [{ lang: "en", value: `Employee joined` }],
            message: [
                {
                    lang: "en",
                    value: isInvited
                        ? `"${nameOrEmail}" has joined using invitation link`
                        : `"${nameOrEmail}" has joined`,
                },
            ],
            notificationType: NotificationType.EMPLOYEE_JOINED,
            notifyAllAdmin: true,
            isNotificatonForAdmin: true,
            notifiers: [],
            employeeNotifiers: [],
            affected: [
                {
                    targetRef: "User",
                    target: notificationData.user._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "USER_INFO",
                    infoData: {
                        _id: notificationData.user._id,
                        firstName: decrypt(notificationData.user?.firstName),
                        lastName: notificationData.user?.lastName ? decrypt(notificationData.user?.lastName):'',
                    },
                },
            ],
            createdBy: notificationData.createdBy,
        };

        // await NotificationHelper.createNotification(notification);
    },
};
