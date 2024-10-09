const { ObjectId, CryptoHelper } = require("../../../tools");
const { CustomError, ErrorName, AuthUser, Role, UploadHelper } = require("../../../util");

const { SubscriberProfile } = require("./subscriber_profile_model");
const { Subscriber } = require("../../saas/subscriber/subscriber_model");
const { User } = require("../user_model");

const UserHelper = require("../user_helper");

module.exports.queries = {
    getSubscriberProfile: async ({}, context) => {
        const { subscriberId } = AuthUser(context);

        return SubscriberProfile.findOne({
            subscriber: subscriberId,
        })
            .lean()
            .populate("user");
    },
};

module.exports.mutations = {
    createOrUpdateSubscriberProfile: async ({ input }, context) => {
        const { role, userId, userPermissions, subscriberId } = AuthUser(context);

        if (role !== Role.ADMIN) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const existingSubscriber = await Subscriber.findOne({ user: userId });
        let subscriberProfileUpdateData = await SubscriberProfile.findOne({ user: userId });

        if (existingSubscriber) {
            if (input.user) {
                const existingUser = await User.findById(userId).lean();

                if (!existingUser) throw CustomError(ErrorName.NOT_FOUND);

                await UserHelper.updateUser(
                    {
                        id: existingUser._id,
                        input: input.user,
                    },
                    { currentRole: role }
                );
            }

            let basicInfo = {};
            let bankDetails = {};
            let vatDetails = {};

            if (input?.basicInfo?.alternatePhone)
                basicInfo.alternatePhone = input.basicInfo.alternatePhone;
            if (input?.basicInfo?.address) basicInfo.address = input.basicInfo.address;
            if (input?.basicInfo?.fax) basicInfo.fax = input.basicInfo.fax;
            if (input?.basicInfo?.website) basicInfo.website = input.basicInfo.website;
            if (input?.basicInfo?.currency) basicInfo.currency = input.basicInfo.currency;

            if (input.certificateSettings) {
                if (input.certificateSettings.backgroundImage) {
                    const savedImage = await UploadHelper.uploadImage({
                        data: input.certificateSettings.backgroundImage,
                        folderName: existingSubscriber._id,
                        fileName: `background_image_${existingSubscriber._id}_${Date.now()}`,
                        uploadType: UploadHelper.uploadType.certificateImage,
                    });

                    if (savedImage) {
                        subscriberProfileUpdateData.certificateSettings = {
                            ...subscriberProfileUpdateData.certificateSettings,
                            backgroundImage: savedImage,
                        };
                    }
                }

                if (input.certificateSettings.sealImage) {
                    const savedImage = await UploadHelper.uploadImage({
                        data: input.certificateSettings.sealImage,
                        folderName: existingSubscriber._id,
                        fileName: `seal_image_${existingSubscriber._id}_${Date.now()}`,
                        uploadType: UploadHelper.uploadType.certificateImage,
                    });

                    if (savedImage) {
                        subscriberProfileUpdateData.certificateSettings = {
                            ...subscriberProfileUpdateData.certificateSettings,
                            sealImage: savedImage,
                        };
                    }
                }

                if (input.certificateSettings.managingDirectorSignature) {
                    const savedSignature = await UploadHelper.uploadImage({
                        data: input.certificateSettings.managingDirectorSignature,
                        folderName: existingSubscriber._id,
                        fileName: `md_signature_${existingSubscriber._id}_${Date.now()}`,
                        uploadType: UploadHelper.uploadType.certificateImage,
                    });

                    if (savedSignature) {
                        subscriberProfileUpdateData.certificateSettings = {
                            ...subscriberProfileUpdateData.certificateSettings,
                            managingDirectorSignature: savedSignature,
                        };
                    }
                }

                if (input.certificateSettings.onlineTrainerSignature) {
                    const savedSignature = await UploadHelper.uploadImage({
                        data: input.certificateSettings.onlineTrainerSignature,
                        folderName: existingSubscriber._id,
                        fileName: `online_trainer_signature_${
                            existingSubscriber._id
                        }_${Date.now()}`,
                        uploadType: UploadHelper.uploadType.certificateImage,
                    });

                    if (savedSignature) {
                        subscriberProfileUpdateData.certificateSettings = {
                            ...subscriberProfileUpdateData.certificateSettings,
                            onlineTrainerSignature: savedSignature,
                        };
                    }
                }

                if (input.certificateSettings.managingDirectorName) {
                    subscriberProfileUpdateData.certificateSettings = {
                        ...subscriberProfileUpdateData.certificateSettings,
                        managingDirectorName: input.certificateSettings.managingDirectorName,
                    };
                }
            }

            if (input.profileCardSettings) {
                if (input.profileCardSettings.backgroundImage) {
                    const savedImage = await UploadHelper.uploadImage({
                        data: input.profileCardSettings.backgroundImage,
                        folderName: existingSubscriber._id,
                        fileName: `background_image_${existingSubscriber._id}_${Date.now()}`,
                        uploadType: UploadHelper.uploadType.certificateImage,
                    });

                    if (savedImage) {
                        subscriberProfileUpdateData.profileCardSettings = {
                            ...subscriberProfileUpdateData.profileCardSettings,
                            backgroundImage: savedImage,
                        };
                    }
                }
            }

            if (input?.invoicePriority)
                subscriberProfileUpdateData.invoicePriority = input.invoicePriority;

            if (input?.bankDetails?.accountName)
                bankDetails.accountName = input.bankDetails.accountName;
            if (input?.bankDetails?.bankName) bankDetails.bankName = input.bankDetails.bankName;
            if (input?.bankDetails?.accountNumber)
                bankDetails.accountNumber = input.bankDetails.accountNumber;
            if (input?.bankDetails?.branch) bankDetails.branch = input.bankDetails.branch;
            if (input?.bankDetails?.ifsc) bankDetails.ifsc = input.bankDetails.ifsc;

            if (input?.vatDetails?.vat) vatDetails.vat = input.vatDetails.vat;
            if (input?.vatDetails?.vatPercentage)
                vatDetails.vatPercentage = input.vatDetails.vatPercentage;

            if (input?.termsAndConditions)
                subscriberProfileUpdateData.termsAndConditions = input.termsAndConditions;

            if (input?.privacyPolicy)
                subscriberProfileUpdateData.privacyPolicy = input.privacyPolicy;

            if (input?.introVideos) {
                if (input?.introVideos?.length) {
                    for (let videoObj of input.introVideos) {
                        videoObj._id = videoObj._id ?? ObjectId();
                        const savedItem = await UploadHelper.uploadVideo({
                            data: videoObj?.url,
                            folderName: "intro-video",
                            fileName: `video_${videoObj?._id}_${Date.now()}`,
                            uploadType: UploadHelper.uploadType.introVideo,
                        });

                        if (savedItem) {
                            subscriberProfileUpdateData.introVideos = [];
                            subscriberProfileUpdateData.introVideos.push({
                                _id: videoObj?._id,
                                lang: videoObj?.lang,
                                url: savedItem,
                            });
                        }
                    }
                } else subscriberProfileUpdateData.introVideos = [];
            }

            if (input?.attendanceRevisionDate)
                subscriberProfileUpdateData.attendanceRevisionDate = input.attendanceRevisionDate;

            if (input?.employeeMasterPassword)
                subscriberProfileUpdateData.employeeMasterPassword = await CryptoHelper.hash(
                    input.employeeMasterPassword,
                    10
                );

            if (JSON.stringify(basicInfo) !== "{}")
                subscriberProfileUpdateData.basicInfo = {
                    ...subscriberProfileUpdateData.basicInfo,
                    ...basicInfo,
                };
            if (JSON.stringify(bankDetails) !== "{}")
                subscriberProfileUpdateData.bankDetails = {
                    ...subscriberProfileUpdateData.bankDetails,
                    ...bankDetails,
                };
            if (JSON.stringify(vatDetails) !== "{}")
                subscriberProfileUpdateData.vatDetails = {
                    ...subscriberProfileUpdateData.vatDetails,
                    ...vatDetails,
                };

            const savedSubscriberProfile = await SubscriberProfile.findOneAndUpdate(
                { user: userId },
                {
                    ...subscriberProfileUpdateData,
                    user: userId,
                    subscriber: existingSubscriber._id,
                },
                {
                    upsert: true,
                    new: true,
                    setDefaultsOnInsert: true,
                    runValidators: true,
                    lean: true,
                }
            ).populate({
                path: "user",
                populate: {
                    path: "subRoles",
                    match: { isActive: true, isDeleted: { $ne: true } },
                },
            });

            if (!savedSubscriberProfile) throw CustomError(ErrorName.FAILED);
            return savedSubscriberProfile;
        }

        throw CustomError(ErrorName.NOT_FOUND);
    },
};
