const { CryptoHelper, JwtHelper, Validator } = require("../../tools");
const { CustomError, ErrorName, Role, UploadHelper } = require("../../util");

const { User } = require("./user_model");

const { decrypt, encrypt } = require('../../util/encryption_helper');
module.exports = {
    makeAuthUser: async user => {
        const tokenPayload = {
            role: user.role,
            userId: user._id,
            subscriberId: user.subscriber?._id ?? user.subscriber,
            isShipAdmin: user.isShipAdmin,
        };

        const accessToken = JwtHelper.sign(tokenPayload, process.env.APP_SECRET, { expiresIn: "1d" });
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
                isShipAdmin: user.isShipAdmin,
            };
            const newAccessToken = JwtHelper.sign(tokenPayload, process.env.APP_SECRET, { expiresIn: "1d" });
            const newRefreshToken = JwtHelper.sign({ userId: user._id }, process.env.REFRESH_SECRET, { expiresIn: "7d" });
            console.log('🟢 TEST: Token refresh successful');
            console.log(`📅 New Access Token expires in: 1 day`);
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
            if (input?.consents?.length > 0) {
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

            // Use transaction for atomic update with cache
            const mongoose = require('mongoose');
            const session = await mongoose.startSession();
            await session.startTransaction();

            let savedUser;
            try {
                savedUser = await existingUser.save({ session });
                if (!savedUser) throw CustomError(ErrorName.FAILED);

                // Update cache within transaction
                const { updateDocumenttoElasticSearch } = require('../../util/user_search_helper');
                const cacheUpdate = {};

                if (input.firstName) cacheUpdate.firstName = savedUser.firstName;
                if (input.lastName) cacheUpdate.lastName = savedUser.lastName;
                if (input.email) cacheUpdate.email = savedUser.email;
                if (input.civilIdOrPassport) cacheUpdate.civilIdOrPassport = savedUser.civilIdOrPassport;
                if (input.languagePreference) cacheUpdate.languagePreference = savedUser.languagePreference;
                if (input.isRegistered != null) cacheUpdate.isRegistered = savedUser.isRegistered;
                if (input.currentVessel !== undefined) cacheUpdate.currentVessel = savedUser.currentVessel;
                if (input.vesselStatus !== undefined) cacheUpdate.vesselStatus = savedUser.vesselStatus;
                if (input.role) cacheUpdate.role = savedUser.role;
                if (input.subRoles) cacheUpdate.subRoles = savedUser.subRoles;
                if (input.isActive != null) cacheUpdate.isActive = savedUser.isActive;
                if (input.isVerified != null) cacheUpdate.isVerified = savedUser.isVerified;

                cacheUpdate.updatedAt = new Date();

                await updateDocumenttoElasticSearch('users', savedUser._id, cacheUpdate, session);

                await session.commitTransaction();
                return savedUser;
            } catch (error) {
                await session.abortTransaction();
                throw error;
            } finally {
                session.endSession();
            }
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
                        lastName: notificationData.user?.lastName ? decrypt(notificationData.user?.lastName) : '',
                    },
                },
            ],
            createdBy: notificationData.createdBy,
        };

        // await NotificationHelper.createNotification(notification);
    },
};
