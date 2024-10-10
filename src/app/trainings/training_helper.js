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
const uploadTrainingImages = async ({ images, folderName }) => {
    const trainingImages = [];

    for (const item of images) {
        item._id = item._id ?? ObjectId();

        const savedItem = await UploadHelper.uploadImage({
            data: item.url,
            folderName: folderName ?? "training-image",
            fileName: `image_${item._id}_${Date.now()}`,
            uploadType: UploadHelper.uploadType.trainingImage,
        });

        if (savedItem) {
            trainingImages.push({
                _id: item._id,
                url: savedItem,
            });
        }
    }

    return trainingImages;
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
const uploadTrainingBannerImage = async ({ images, folderName }) => {
    const trainingBannerImage = [];

    for(const item of images){
        item._id = item._id ?? ObjectId();

        const savedItem = await UploadHelper.uploadImage({
            data: item.url,
            folderName: folderName ?? "training-banner-image",
            fileName: `image_${item._id}_${Date.now()}`,
            uploadType: UploadHelper.uploadType.trainingBannerImage,
        });

        if(savedItem){
            trainingBannerImage.push({
                _id: item._id,
                url: savedItem,
            });
        }
    }
    return trainingBannerImage;
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
module.exports = {
    uploadTrainingImages,
    generateTrainingUID,
    uploadCertificateTrainingImages,
    createOrUpdateTraining: async ({ input, session }, context) => {
        const { userId, subscriberId } = AuthUser(context);

        if (!input.courseType || !Object.keys(CourseType).includes(input.courseType)) {
            throw CustomError(ErrorName.INVALID_COURSE_TYPE);
        }
        
        const validateCourseId = (courseId, courseType) => {
            const date = new Date();
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");
            const formattedDate = `${year}${month}${day}`;
            const typeCodes = {
                "SELF_LEARNING": "S",
                "CLASSROOM": "C",
                "VIRTUAL_TYPE": "V"
            };
            const typeCode = typeCodes[courseType];
            const regex = new RegExp(`^Course-${formattedDate}-${typeCode}-\\d{4}$`);
            return regex.test(courseId);
        };

        const validateObjectIds = async (objectIds, model, field) => {
            if (!objectIds || !objectIds.length) return;
            const uniqueIds = new Set();
            for (const id of objectIds) {
                if (uniqueIds.has(id.toString())) {
                    throw CustomError(ErrorName.DUPLICATE_TARGET_AUDIENCE_OBJECT_ID,`Duplicate ${field} ID ${id} found.`);
                }
                uniqueIds.add(id.toString());
                const exists = await model.findOne({ _id: mongoose.Types.ObjectId(id) });
                if (!exists) {
                    throw CustomError(ErrorName.INVALID_TARGET_AUDIENCE_ID, `${field} with ID ${id} not found.`);
                }
            }
        };
        const trainingFilterConditions = {
            _id: input._id ?? ObjectId(),
            subscriber: subscriberId,
        };

        const trainingUpdateData = {};

        if (input.courseId) {
            if (!validateCourseId(input.courseId, input.courseType)) {
                throw CustomError(ErrorName.INVALID_COURSE_ID);
            }
            const existingTraining = await Training.findOne({
                courseId: input.courseId,
                subscriber: subscriberId,
                _id: { $ne: input._id }, 
            });
            if (existingTraining) {
                throw CustomError(ErrorName.DUPLICATE_COURSE_ID);
            }
            trainingUpdateData.courseId = input.courseId;
        } else if (!input._id){
            trainingUpdateData.courseId = generateCourseId(input.courseType);
        }

        if (!input._id) {
            trainingUpdateData.UID = await generateTrainingUID({
                subscriberId,
                session,
            });
        }

        if (input.trainingCategories)
            trainingUpdateData.trainingCategories = input.trainingCategories;
        if (input.trainingSubCategories)
            trainingUpdateData.trainingSubCategories = input.trainingSubCategories;
        if (input.title) trainingUpdateData.title = input.title;
        if (input.overview) trainingUpdateData.overview = input.overview;
        
        let TargetAudienceId;
        if (input.targetAudienceId) {
            const { userObjectId, groupUserObjectId } = input.targetAudienceId;
            if (userObjectId && userObjectId.length > 0) {
                await validateObjectIds(userObjectId, User,'userObjectId');
            }
            if (groupUserObjectId && groupUserObjectId.length > 0) {
                await validateObjectIds(groupUserObjectId,  Group,'groupUserObjectId');
            }
            if ((!userObjectId || userObjectId.length === 0) && (!groupUserObjectId || groupUserObjectId.length === 0)) {
                throw new Error('At least one of userObjectId or groupUserObjectId must be provided.');
            }        
            const targetAudience = await TargetAudience.create({
                subscriber: subscriberId,
                userObjectId: userObjectId || [],
                groupUserObjectId: groupUserObjectId || [],
                courseId: trainingFilterConditions._id,
                createdBy: userId,
              });
            TargetAudienceId = targetAudience._id;
            trainingUpdateData.TargetAudienceId = TargetAudienceId;
        }
        let classroomModuleId = null;
        if (input.courseType) {
            trainingUpdateData.courseType = input.courseType
            if(input.courseType === CourseType.CLASSROOM){
                const data = input.classroomModule;
                const classroomData = {
                    title: data.title ? data.title: [],
                    description: data.description ? data.description:[],
                    classroomModuleImage: data.classroomModuleImage ? data.classroomModuleImage:[],
                    details: data.details? data.details:[],
                    time: data.time? data.time: { startTime: '', endTime: '' },
                    meetingRoomName: data.meetingRoomName || '',
                    Instructor: data.Instructor || '',
                    seatLimit: data.seatLimit || 0,
                    createdBy: userId,
                    subscriber: subscriberId,
                }
             const classroomModule = await ClassroomModule.create(classroomData);
              classroomModuleId = classroomModule._id;
            }
            if(input.courseType === CourseType.VIRTUAL_TYPE){
                console.log(`Virtual Classroom  Data...`); 
            }
        };
        if (input.enableFreeFlow) trainingUpdateData.enableFreeFlow = input.enableFreeFlow;
        if (input.unlockOn) trainingUpdateData.unlockOn = input.unlockOn;
        if (input.status) trainingUpdateData.status = input.status;
        if (input.authorName) trainingUpdateData.authorName = input.authorName;
        if (input.courseLevel) trainingUpdateData.courseLevel = input.courseLevel;
        if (input.certifications){
            trainingUpdateData.certifications = await uploadCertificateTrainingImages({
                images: input.certifications,
                folderName: trainingFilterConditions._id,
            });
        }
        if (input.bannerImage) {
            trainingUpdateData.bannerImage = await uploadTrainingBannerImage({
                images: input.bannerImage,
                folderName: trainingFilterConditions._id,
            });
        }
        if(input.skills) {
            if (!Array.isArray(input.skills)) {
                throw CustomError(ErrorName.INVALID_SKILLS_FORMAT);
            }
            trainingUpdateData.skills = input.skills;
        }
        if (typeof input.userFeedback === "boolean") trainingUpdateData.userFeedback = input.userFeedback;
        if (typeof input.managerFeedback === "boolean") trainingUpdateData.managerFeedback = input.managerFeedback;
        if (typeof input.enableEmailNotification === "boolean") trainingUpdateData.enableEmailNotification = input.enableEmailNotification;
        if (typeof input.setReminder === "boolean") trainingUpdateData.setReminder = input.setReminder;
        if (typeof input.userFeedback === "boolean") trainingUpdateData.userFeedback = input.userFeedback;
        
        if (input.setFrequency != null ) trainingUpdateData.setFrequency = input.setFrequency;

        if (input.setFrequencyDate) trainingUpdateData.setFrequencyDate = input.setFrequencyDate;

        if (input.manadatoryModules) trainingUpdateData.manadatoryModules = input.manadatoryModules;

        if (input.course_validity) trainingUpdateData.course_validity = input.course_validity;
        if (input.hideCourseProgress) trainingUpdateData.hideCourseProgress = input.hideCourseProgress;
        if (input.allowMultipleAttempts) {
            trainingUpdateData.allowMultipleAttempts = input.allowMultipleAttempts;
            if (input.attemptFlexibility) trainingUpdateData.attemptFlexibility = input.attemptFlexibility;
            if (input.attemptType) trainingUpdateData.attemptType = input.attemptType;
            if (input.attemptType === "LIMITED_ATTEMPT" && input.setLimitAttempt) {
                trainingUpdateData.setLimitAttempt = input.setLimitAttempt;
            }
        
            if (input.disableFurtherAttemptsOnPass) trainingUpdateData.disableFurtherAttemptsOnPass = input.disableFurtherAttemptsOnPass;
            if (input.lockModulesBetweenAttempts) trainingUpdateData.lockModulesBetweenAttempts = input.lockModulesBetweenAttempts;
            if (input.setTimeLimitForModule) trainingUpdateData.setTimeLimitForModule = input.setTimeLimitForModule;
        
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
        if (input.instructions) trainingUpdateData.instructions = input.instructions;
        if (input.feedback) trainingUpdateData.feedback = input.feedback;

        if (input.images) {
            trainingUpdateData.images = await uploadTrainingImages({
                images: input.images,
                folderName: trainingFilterConditions._id,
            });
        }

        if (input.price) trainingUpdateData.price = input.price;

        if (input.durationHours != null) {
            trainingUpdateData.durationHours = input.durationHours >= 0 ? input.durationHours : undefined;
        }

        if (input.certificateValidity != null) {
            trainingUpdateData.certificateValidity =
                input.certificateValidity >= 0 ? input.certificateValidity : undefined;
        }
        if (input.scorm != null) {
            trainingUpdateData.scorm = input.scorm;
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
                ClassroomModule: classroomModuleId,
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
