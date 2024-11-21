const { ObjectId } = require("../../tools");
const { CustomError, ErrorName, AuthUser, UploadHelper } = require("../../util");
const mongoose = require('mongoose');

const { Training } = require("./training_model");

const NotificationHelper = require("../notifications/notification_helper");
const CounterHelper = require("../counters/counter_helper");

const NotificationType = require("../notifications/notification_type.json");
const ApprovalStatus = require("./approval_status.json");
const CourseType = require("./enum_fields/courseType.json");
const { TargetAudience } = require("./targetAudience/targetAudienceModel");
const { User } = require("../user/user_model");
const { Group } = require("../user/group-user");
const { ClassroomModule } = require("./Classroom_module/Classroom_model");
const { TrainingRegistration } = require("../training-registrations/training_registration_model");
const { TrainingModule } = require("./training_modules/training_module_model");
const { TrainingProgress } = require("../training-registrations/training-progress/training_progress_model");
const { OverallTrainingProgress } = require("../training-registrations/overall-course-progress/overall_progress_model");
const uploadTrainingImages = async ({ coverImage, folderName }) => {

    coverImage._id = coverImage._id ?? ObjectId();

    const savedItem = await UploadHelper.uploadImage({
        data: coverImage,
        folderName: folderName ?? "cover-image",
        fileName: `image_${coverImage._id}_${Date.now()}`,
        uploadType: UploadHelper.uploadType.trainingImage,
    });

    if (savedItem) {
        coverImage = {
            _id: coverImage._id,
            url: savedItem,
        };
    }

    return coverImage;
};

const uploadCertificateTrainingImages = async ({ images, folderName }) => {
    const trainingCertificateImage = [];

    for (const item of images) {
        item._id = item._id ?? ObjectId();

        const savedItem = await UploadHelper.uploadImage({
            data: item.url,
            folderName: folderName ?? "training-certificate-image",
            fileName: `image_${item._id}_${Date.now()}`,
            uploadType: UploadHelper.uploadType.trainingCertificateImage,
        });

        if (savedItem) {
            trainingCertificateImage.push({
                _id: item._id,
                url: savedItem,
            });
        }
    }

    return trainingCertificateImage;
}
const uploadTrainingBannerImage = async ({ bannerImage, folderName }) => {

    bannerImage._id = bannerImage._id ?? ObjectId();

    const savedItem = await UploadHelper.uploadImage({
        data: bannerImage,
        folderName: folderName ?? "training-banner-image",
        fileName: `image_${bannerImage._id}_${Date.now()}`,
        uploadType: UploadHelper.uploadType.trainingBannerImage,
    });

    if (savedItem) {
        bannerImage = {
            _id: bannerImage._id,
            url: savedItem,
        };
    }

    return bannerImage;
}
const generateTrainingUID = async ({ subscriberId, session }) => {
    const savedCounter = await CounterHelper.updateCounter({
        subscriberId,
        modelName: Training.modelName,
        session,
    });

    if (!savedCounter) throw CustomError(ErrorName.FAILED);
    return `COURSE-${savedCounter.count}`;
};

const generateCourseId = (courseType) => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const formattedDate = `${year}${month}${day}`;
    const typeCodes = {
        "SELF_LEARNING": "S",
        "CLASSROOM": "C",
        "VIRTUAL_TYPE": "V"
    }
    const typeCode = typeCodes[courseType];
    const randomIdentifier = Math.floor(1000 + Math.random() * 9000);
    return `Course-${formattedDate}-${typeCode}-${randomIdentifier}`;
};

const validateTrainingProgress = async (input, userId) => {

    try {

        const overallIds = [...new Set(input.map(item => item.overallId))];

        const overallTrainingProgress = await OverallTrainingProgress.find({ _id: { $in: overallIds } });
        const overallIdToTrainingRegMap = Object.fromEntries(
            overallTrainingProgress.map(item => [item._id.toString(), item.trainingRegistration])
        );

        const trainingRegistrationIds = [
            ...new Set(
                Object.values(overallIdToTrainingRegMap).map(id => id.toString())
            )
        ];

        const trainingProgress = await TrainingProgress.find({ trainingRegistration: { $in: trainingRegistrationIds }, user: userId });

        const trainingRegToContentMap = Object.fromEntries(
            trainingProgress.map(item => [
                item.trainingRegistration.toString(),
                new Set([item.trainingModuleContent.toString()])
            ])
        );

        const results = input.map(item => {
            const trainingRegistration = overallIdToTrainingRegMap[item.overallId.toString()];
            const validContents = trainingRegToContentMap[trainingRegistration];

            if (!trainingRegistration || !validContents) {
                return { ...item, isValid: false, reason: "Missing trainingRegistration or TrainingProgress data" };
            }

            const allContentsValid = item.contentDetails.every(detail =>
                validContents.has(detail.contentId.toString())
            );

            return {
                ...item,
                isValid: allContentsValid,
                reason: allContentsValid ? null : "Invalid contentId(s) in contentDetails"
            };
        });

        return results;
    } catch (error) {
        console.error("Error validating training progress:", error);
        throw error;
    }
};

module.exports = {
    uploadTrainingImages,
    validateTrainingProgress,
    generateTrainingUID,
    uploadCertificateTrainingImages,
    createOrUpdateTraining: async ({ input, coverImage, bannerImage, session }, context) => {
        const { userId, subscriberId } = AuthUser(context);

        const trainingFilterConditions = {
            _id: input._id ?? ObjectId(),
            subscriber: subscriberId,
        };

        const trainingUpdateData = {};

        if (!input._id) {
            trainingUpdateData.UID = await generateTrainingUID({
                subscriberId,
                session,
            });
        }

        if (input.title) trainingUpdateData.title = input.title;
        if (input.overview) trainingUpdateData.overview = input.overview;
        trainingUpdateData.isCertificate = input?.isCertificate ? true : false;
        if (input.status) trainingUpdateData.status = input.status;
        if (input.authorName) trainingUpdateData.authorName = input.authorName;
        if (input.certifications && input.isCertification) {
            trainingUpdateData.certifications = await uploadCertificateTrainingImages({
                images: input.certifications,
                folderName: trainingFilterConditions._id,
            });
        }
        if (bannerImage) {
            trainingUpdateData.bannerImage = await uploadTrainingBannerImage({
                bannerImage: bannerImage,
                folderName: trainingFilterConditions._id,
            });
        }

        if (typeof input.enableEmailNotification === "boolean") trainingUpdateData.enableEmailNotification = input.enableEmailNotification;

        if (input.manadatoryModules) trainingUpdateData.manadatoryModules = input.manadatoryModules;

        if (input.allowMultipleAttempts) {
            trainingUpdateData.allowMultipleAttempts = input.allowMultipleAttempts;
            if (input.attemptFlexibility) trainingUpdateData.attemptFlexibility = input.attemptFlexibility;
            if (input.attemptType) trainingUpdateData.attemptType = input.attemptType;
            if (input.attemptType === "LIMITED_ATTEMPT" && input.setLimitAttempt) {
                trainingUpdateData.setLimitAttempt = input.setLimitAttempt;
            }

            if (input.disableFurtherAttemptsOnPass) trainingUpdateData.disableFurtherAttemptsOnPass = input.disableFurtherAttemptsOnPass;
            if (input.lockModulesBetweenAttempts) trainingUpdateData.lockModulesBetweenAttempts = input.lockModulesBetweenAttempts;

        }
        else {
            delete trainingUpdateData.attemptFlexibility;
            delete trainingUpdateData.attemptType;
            delete trainingUpdateData.setLimitAttempt;
            delete trainingUpdateData.disableFurtherAttemptsOnPass;
            delete trainingUpdateData.lockModulesBetweenAttempts;
            delete trainingUpdateData.setTimeLimitForModule;
        }
        if (input.description) trainingUpdateData.description = input.description;

        if (coverImage) {
            trainingUpdateData.coverImage = await uploadTrainingImages({
                coverImage: coverImage,
                folderName: trainingFilterConditions._id,
            });
        }

        if (input.durationHours != null) {
            trainingUpdateData.durationHours = input.durationHours >= 0 ? input.durationHours : undefined;
        }

        if (typeof input.isActive === "boolean") trainingUpdateData.isActive = input.isActive;
        const savedTraining = await Training.findOneAndUpdate(
            trainingFilterConditions,
            {
                ...trainingFilterConditions,
                ...trainingUpdateData,
                $setOnInsert: {
                    approvalStatus: ApprovalStatus.PREPARING,
                    createdBy: userId,
                },
                updatedBy: userId,
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true,
                runValidators: true,
                lean: true,
                session,
            }
        ).populate('targetAudienceId')
            .populate('ClassroomModule');
        if (!savedTraining) throw CustomError(ErrorName.FAILED);
        return savedTraining;
    },
    sendNotificationOnCRUD: async notificationData => {
        try {
            const trainingTitle = notificationData.training.title?.find(
                x => x.lang === "en" || x.lang === "ar"
            )?.value;

            const notification = {
                subscriber: notificationData.subscriber,
                title: [{ lang: "en", value: `Training ${notificationData.action}` }],
                notificationType: NotificationType["TRAINING_" + notificationData.action],
                notifyAdmin: true,
                notifiers: notificationData.notifiers ?? [],
                employeeNotifiers: [],
                affected: [
                    {
                        targetRef: "Training",
                        target: notificationData.training._id,
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
                        infoType: "TRAINING_INFO",
                        infoData: {
                            _id: notificationData.training._id,
                            title: notificationData.training.title,
                            approvalStatus: notificationData.training.approvalStatus,
                            isActive: notificationData.training.isActive,
                        },
                    },
                ],
                createdBy: notificationData.createdBy,
            };

            if (notification.notificationType === NotificationType.TRAINING_APPROVAL_REQUEST) {
                notification.message = [
                    {
                        lang: "en",
                        value: `Admin User "${notificationData.createdBy.firstName}" submitted the training "${trainingTitle}" for approval`,
                    },
                ];
            } else {
                notification.message = [
                    {
                        lang: "en",
                        value: `Admin User "${notificationData.createdBy.firstName}" ${notificationData.action} "${trainingTitle}" training`,
                    },
                ];
            }

            await NotificationHelper.createNotification(notification);
        } catch (e) {
            console.log("training_helper.sendNotificationOnCRUD:exception:", e?.message);
        }
    },
};
