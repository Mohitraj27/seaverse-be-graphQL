const { CryptoHelper, JwtHelper, Validator } = require("../../tools");
const { CustomError, ErrorName, Role, UploadHelper, VesselStatus } = require("../../util");

const { User, AppUser } = require("./user_model");

const SubscriptionHelper = require("../saas/subscriber/subscription/subscription_helper");
const NotificationHelper = require("../notifications/notification_helper");

const NotificationType = require("../notifications/notification_type.json");

module.exports = {
    makeAuthUser: async user => {

        if (user.role === Role.EMPLOYEE) {
            await user
                .populate({ path: "subRoles", match: { isActive: true, isDeleted: { $ne: true } } })
                .populate("employee")
                .execPopulate();
        }

        let tokenPayload = {
            masterLogin: user.masterLogin,
            role: user.role,
            userId: user._id,
            permissions: [...new Set(user.subRoles?.map(x => x.permissions).flat(1))],
            subscriberId: user.subscriber?._id ?? user.subscriber,
            employeeId: user.employee?._id ?? user.employee,
        };

        if (tokenPayload.subscriberId) {
            const activeSubscriptionInfo = await SubscriptionHelper.getActiveSubscriptionInfo(
                tokenPayload.subscriberId
            );

            tokenPayload = {
                ...tokenPayload,
                ...activeSubscriptionInfo,
            };

            user.subscriptionInfo = activeSubscriptionInfo;
        }

        const accessToken = JwtHelper.sign(tokenPayload, process.env.APP_SECRET, { expiresIn: "8h" });
        const refreshToken = JwtHelper.sign({ userId: user._id }, process.env.REFRESH_SECRET, { expiresIn: "7d" });

        return {
            user: user,
            token: accessToken,
            refreshToken: refreshToken,
            subscriptionInfo: user.subscriptionInfo,
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
            const newAccessToken = JwtHelper.sign(tokenPayload, process.env.APP_SECRET, { expiresIn: "8h" });
            const newRefreshToken = JwtHelper.sign({ userId: user._id }, process.env.REFRESH_SECRET, { expiresIn: "7d" });
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
            if (input.firstName) existingUser.firstName = input.firstName;

            if (input.lastName) existingUser.lastName = input.lastName;

            if (input.country) existingUser.country = input.country;

            if(input.country === '') existingUser.country = null;

            if (input.lastName === '') existingUser.lastName = null;

            if (
                input.civilIdOrPassport &&
                input.civilIdOrPassport !== existingUser.civilIdOrPassport
            ) {
                const civilIdOrPassportExists = await User.findOne({
                    civilIdOrPassport: input.civilIdOrPassport,
                })
                    .lean()
                    .select("_id");
                if (civilIdOrPassportExists) throw CustomError(ErrorName.USER_ALREADY_EXIST);

                existingUser.civilIdOrPassport = input.civilIdOrPassport;
            }

            if (
                input.email &&
                input.email.trim().toLowerCase() !== existingUser.email.toLowerCase()
            ) {
                const emailExists = await User.findOne({
                    email: { $regex: new RegExp(`^${input.email}$`, "i") },
                })
                    .lean()
                    .select("_id");

                if (emailExists) throw CustomError(ErrorName.USER_ALREADY_EXIST);

                existingUser.email = input.email;
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
            return savedUser;
        }

        throw CustomError(ErrorName.NOT_FOUND);
    },
    sendSignUpNotification: async (notificationData, isInvited = true) => {
        const nameOrEmail = notificationData.user?.firstName ?? notificationData.user?.email ?? "";

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
                        firstName: notificationData.user?.firstName,
                        lastName: notificationData.user?.lastName,
                    },
                },
            ],
            createdBy: notificationData.createdBy,
        };

        // await NotificationHelper.createNotification(notification);
    },
};
