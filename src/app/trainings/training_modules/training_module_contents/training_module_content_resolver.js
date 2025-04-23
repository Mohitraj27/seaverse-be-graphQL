const { CustomError, ErrorName, AuthUser, DbTransactionHelper, UploadHelper } = require("../../../../util");

const { TrainingModuleContent } = require("./training_module_content_model");
const { AnswerChoice } = require("./question/answer_choice_model");
const { Question } = require("./question/question_model");

const TrainingModuleContentHelper = require("./training_module_content_helper");
const SubRoleHelper = require("../../../user/sub-roles/sub_role_helper");
const LogHelper = require("../../../logs/log_helper");
const LogType = require("../../../logs/log_type.json")

const Permission = require("../../../user/sub-roles/permission");
const { ObjectId } = require("../../../../tools");
const Content_status = require("./content_status.json");
const ContentType = require("./content_type.json");
const AwsHelper = require("../../../../util/aws_helper");
const ScromHelper = require("../../scrom_helper")
const PptxGenJS = require('pptxgenjs');
const pdfParse = require('pdf-parse');
const { TrainingContentBridge } = require("../../training_content_bridge/training_content_model");
const NotificationHelper = require("../../../notifications/notification_helper");
const NotificationType = require("../../../notifications/notification_type.json");
const notificationiconEnum = require("../../../notifications/notification_icon.json");

const { TrainingProgress } = require("../../../training-registrations/training-progress/training_progress_model");
const { OverallTrainingProgress } = require("../../../training-registrations/overall-course-progress/overall_progress_model");

function escapeRegex(str) {
    return str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

module.exports.queries = {
    getTrainingModuleContents: async ({ pageInput, search, contentStatus, recentlyModified, contentType, useStatus }, context) => {
        const { subscriberId } = AuthUser(context);
        const filterConditions = {
            subscriber: subscriberId,
            isUpdated: { $ne: true },
            isDeleted: { $ne: true },
        };
        if (contentStatus) {
            filterConditions.contentStatus = contentStatus;
        }
        if (contentType && contentType.length > 0) {
            filterConditions.contentType = { $in: contentType };
        }
        if (recentlyModified) {
            filterConditions.modifiedDate = { $gte: new Date(new Date() - 24 * 60 * 60 * 1000) };
        }

        if (search) {
            const escapedSearch = escapeRegex(search);
            filterConditions['title.value'] = { $regex: escapedSearch, $options: "i" };
        }

        const skip = pageInput?.skip ?? 0;
        const limitContent = pageInput?.limit ?? 50;

        const contents = await TrainingModuleContent.aggregatePaginate(
            TrainingModuleContent.aggregate([
                { $match: filterConditions },
                {
                    $lookup: {
                        from: "questions",
                        localField: "quiz",
                        foreignField: "_id",
                        as: "quiz",
                        pipeline: [
                            { $project: { _id: 1, question: 1, questionType: 1, choices: 1, answerKey: 1, allowMultipleAnswers: 1, points: 1, negativePoints: 1 } },
                            {
                                $lookup: {
                                    from: "answerchoices",
                                    localField: "choices",
                                    foreignField: "_id",
                                    as: "choices",
                                    pipeline: [
                                        { $project: { _id: 1, question: 1, choice: 1 } }
                                    ]
                                }
                            }
                        ],
                    },
                },
                {
                    $lookup: {
                        from: "users",
                        localField: "createdBy",
                        foreignField: "_id",
                        as: "createdBy",
                        pipeline: [
                            { $project: { _id: 1, firstName: 1, lastName: 1 } }
                        ]
                    },
                },
                { $unwind: "$createdBy" },
                {
                    $lookup: {
                        from: "users",
                        localField: "updatedBy",
                        foreignField: "_id",
                        as: "updatedBy",
                        pipeline: [
                            { $project: { _id: 1, firstName: 1, lastName: 1 } }
                        ]
                    },
                },
                { $unwind: "$updatedBy" },
                {
                    $lookup: {
                        from: "trainingcontentbridges",
                        localField: "_id",
                        foreignField: "trainingContent",
                        as: "courseUsage",
                        pipeline: [
                            {
                                $match: {
                                    isDeleted: false
                                }
                            },
                            {
                                $lookup: {
                                    from: "trainings",
                                    localField: "training",
                                    foreignField: "_id",
                                    as: "trainingData",
                                    pipeline: [
                                        {
                                            $match: {
                                                isDeleted: false,
                                                isActive: true
                                            }
                                        }
                                    ]
                                }
                            },
                            {
                                $unwind: {
                                    path: "$trainingData",
                                    preserveNullAndEmptyArrays: false
                                }
                            }
                        ]
                    },
                },
                {
                    $addFields: {
                        featuredInCourses: { $size: "$courseUsage" }
                    },
                },
                ...(useStatus
                    ? [{
                        $match: {
                            featuredInCourses: useStatus === "IN_USE" ? { $gt: 0 } : 0
                        }
                    }]
                    : []
                )
            ]),
            {
                offset: skip,
                limit: limitContent,
                sort: { updatedAt: -1 },
                customLabels: {
                    docs: "contents",
                    totalDocs: "totalCount",
                    offset: "skip",
                },
                pagination: limitContent !== 0,
                allowDiskUse: true,
            }
        );

        if (contents.contents.length === 0) {
            return {
                contents: [],
                totalCount: 0,
            };
        }

        return {
            contents: contents.contents,
            totalCount: contents.contents.length,
        };
    },
    getTrainingModuleContent: async ({ id }, context) => {
        const { subscriberId } = AuthUser(context);
        const filterConditions = {
            subscriber: subscriberId,
            _id: id
        };
        const populate = [
            ({
                path: "quiz",
                populate: [
                    {
                        path: 'choices',
                        select: { _id: 1, question: 1, choice: 1 }
                    }
                ]
            })
        ]
        const contents = await TrainingModuleContent.findOne(filterConditions).populate(populate).lean().exec();
        if (!contents) {
            return null;
        }
        return contents;
    },
    getFeaturedInCourses: async ({ id }, context) => {

        const { subscriberId } = AuthUser(context);

        if (!id) throw CustomError(ErrorName.ARGUMENTS_REQUIRED);

        const usedCourses = await TrainingContentBridge.find({ trainingContent: id, isDeleted: false })
            .populate({
                path: "training",
                select: "id title isDeleted isActive",
                match: { isDeleted: false, isActive: true }
            })
            .lean();

        if (!usedCourses) throw CustomError(ErrorName.NOT_FOUND);

        let courseNames = [];
        let courseCount = 0;

        for (const course of usedCourses) {
            if (course.training && course.training.title) {
                courseCount++;
                courseNames.push(course.training.title[0].value);
            }
        }

        return {
            courseCount: courseCount,
            courseNames: courseNames
        }

    }
};

module.exports.mutations = {
    uploadTrainingModuleContentSorm: async ({ input, scorm, thumbnail }, context) => {
        const { userId, subscriberId } = AuthUser(context);
        const existingContent = await TrainingModuleContent.findOne({
            $or: input.title.map(x => ({
                "title.value": { $regex: x.value.trim(), $options: "i" },
            })),
        }).lean().select("_id");

        if (existingContent) {
            throw CustomError(ErrorName.CONTENT_ALREADY_EXIST);
        }
        // if (input.duration) {
        //     const durationStyleChecked = TrainingModuleContentHelper.checkDurationStyle(input.duration);
        //     if (!durationStyleChecked) {
        //         throw CustomError(ErrorName.INVALID_DURATION_FORMAT);
        //     }
        // }

        let courseInfo = await ScromHelper.uploadToScormCloud(scorm);

        if (courseInfo) {
            const { filename } = await scorm;
            input.scorm = {
                courseId: courseInfo.courseId,
                type: "CLOUD",
                fileName: filename
            }
        }

        if (thumbnail) {
            const thumbnailUrl = await UploadHelper.uploadImage({
                data: thumbnail,
                folderName: `image-content`,
                fileName: `image_${Date.now()}`,
                uploadType: UploadHelper.uploadType.trainingContentImage,
            });
            input.thumbnail = thumbnailUrl;
        }
        const contentData = {
            ...input,
            createdBy: userId,
            updatedBy: userId,
        };
        const savedContent = await TrainingModuleContent.findOneAndUpdate(
            { _id: input._id ?? new ObjectId(), subscriber: subscriberId },
            contentData,
            { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
        );

        if (!savedContent) throw CustomError(ErrorName.FAILED);
        return savedContent;
    },

    uploadTrainingModuleContentImage: async ({ input, image, thumbnail }, context) => {
        const { userId, subscriberId } = AuthUser(context);

        const existingContent = await TrainingModuleContent.findOne({
            $or: input.title.map(x => ({
                "title.value": { $regex: x.value.trim(), $options: "i" },
            })),
        })
            .lean()
            .select("_id");

        if (existingContent) {
            throw CustomError(ErrorName.CONTENT_ALREADY_EXIST);
        }

        // if (input.duration) {
        //     const durationStyleChecked = TrainingModuleContentHelper.checkDurationStyle(input.duration);
        //     if (!durationStyleChecked) {
        //         throw CustomError(ErrorName.INVALID_DURATION_FORMAT);
        //     }
        // }

        const savedItem = await UploadHelper.uploadImage({
            data: image,
            folderName: "image-content",
            fileName: `image_${Date.now()}`,
            uploadType: UploadHelper.uploadType.trainingContentImage,
        });
        if (thumbnail) {
            const thumbnailUrl = await UploadHelper.uploadImage({
                data: thumbnail,
                folderName: `image-content`,
                fileName: `image_${Date.now()}`,
                uploadType: UploadHelper.uploadType.trainingContentImage,
            });
            input.thumbnail = thumbnailUrl;
        }
        const contentData = {
            ...input,
            images: [{ url: savedItem }],
            createdBy: userId,
            updatedBy: userId,
        }

        const savedContent = await TrainingModuleContent.findOneAndUpdate(
            { _id: input._id ?? new ObjectId(), subscriber: subscriberId },
            contentData,
            { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
        );
        if (!savedContent) throw CustomError(ErrorName.FAILED);
        return savedContent;
    },
    uploadTrainingModuleContentVideo: async ({ input, video, thumbnail }, context) => {
        const { userId, subscriberId } = AuthUser(context);

        const existingContent = await TrainingModuleContent.findOne({
            $or: input.title.map(x => ({
                "title.value": { $regex: x.value.trim(), $options: "i" },
            })),
        }).lean().select("_id");

        if (existingContent) {
            throw CustomError(ErrorName.CONTENT_ALREADY_EXIST);
        }

        // if (input.duration) {
        //     const durationStyleChecked = TrainingModuleContentHelper.checkDurationStyle(input.duration);
        //     if (!durationStyleChecked) {
        //         throw CustomError(ErrorName.INVALID_DURATION_FORMAT);
        //     }
        //     input.duration = TrainingModuleContentHelper.convertDurationToMinutes(input.duration);
        // }

        if (thumbnail) {
            const thumbnailUrl = await UploadHelper.uploadImage({
                data: thumbnail,
                folderName: `image-content`,
                fileName: `image_${Date.now()}`,
                uploadType: UploadHelper.uploadType.trainingContentImage,
            });
            input.thumbnail = thumbnailUrl;
        }
        const savedItem = await UploadHelper.uploadVideo({
            data: video,
            folderName: "video-content",
            fileName: `video_${Date.now()}`,
            uploadType: UploadHelper.uploadType.trainingContentVideo,
        });
        const contentData = {
            ...input,
            videos: [{ url: savedItem }],
            createdBy: userId,
            updatedBy: userId,
        };
        const savedContent = await TrainingModuleContent.findOneAndUpdate(
            { _id: input._id ?? new ObjectId(), subscriber: subscriberId },
            contentData,
            { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
        );

        if (!savedItem) throw CustomError(ErrorName.FAILED);
        return savedContent;
    },
    uploadTrainingModuleContentFiles: async ({ input, file, thumbnail }, context) => {
        const { userId, subscriberId } = AuthUser(context);
        const existingContent = await TrainingModuleContent.findOne({
            $or: input.title.map(x => ({
                "title.value": { $regex: x.value.trim(), $options: "i" },
            })),
        }).lean().select("_id");

        if (existingContent) {
            throw CustomError(ErrorName.CONTENT_ALREADY_EXIST);
        }

        // if (input.duration) {
        //     const durationStyleChecked = TrainingModuleContentHelper.checkDurationStyle(input.duration);
        //     if (!durationStyleChecked) {
        //         throw CustomError(ErrorName.INVALID_DURATION_FORMAT);
        //     }
        //     input.duration = TrainingModuleContentHelper.convertDurationToMinutes(input.duration);
        // }

        const savedItem = await UploadHelper.uploadDocument({
            data: file,
            folderName: "file-content",
            fileName: `file_${Date.now()}`,
            uploadType: UploadHelper.uploadType.trainingContentFile,
        });
        if (thumbnail) {
            const thumbnailUrl = await UploadHelper.uploadImage({
                data: thumbnail,
                folderName: `image-content`,
                fileName: `image_${Date.now()}`,
                uploadType: UploadHelper.uploadType.trainingContentImage,
            });
            input.thumbnail = thumbnailUrl;
        }
        const contentData = {
            ...input,
            files: [{ url: savedItem }],
            createdBy: userId,
            updatedBy: userId,
        };
        const savedContent = await TrainingModuleContent.findOneAndUpdate(
            { _id: input._id ?? new ObjectId(), subscriber: subscriberId },
            contentData,
            { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
        );

        if (!savedContent) throw CustomError(ErrorName.FAILED);
        return savedContent;
    },
    uploadTrainingModuleContentaudio: async ({ input, audio, thumbnail }, context) => {
        const { userId, subscriberId } = AuthUser(context);
        const existingContent = await TrainingModuleContent.findOne({
            $or: input.title.map(x => ({
                "title.value": { $regex: x.value.trim(), $options: "i" },
            })),
        }).lean().select("_id");

        if (existingContent) {
            throw CustomError(ErrorName.CONTENT_ALREADY_EXIST);
        }

        // if (input.duration) {
        //     const durationStyleChecked = TrainingModuleContentHelper.checkDurationStyle(input.duration);

        //     if (!durationStyleChecked) {
        //         throw CustomError(ErrorName.INVALID_DURATION_FORMAT);
        //     }

        //     input.duration = TrainingModuleContentHelper.convertDurationToMinutes(input.duration);
        // }

        const savedItem = await UploadHelper.uploadAudio({
            data: audio,
            folderName: "audio-content",
            fileName: `audio_${Date.now()}`,
            uploadType: UploadHelper.uploadType.trainingContentAudio,
        });
        if (thumbnail) {
            const thumbnailUrl = await UploadHelper.uploadImage({
                data: thumbnail,
                folderName: `image-content`,
                fileName: `image_${Date.now()}`,
                uploadType: UploadHelper.uploadType.trainingContentImage,
            });
            input.thumbnail = thumbnailUrl;
        }
        const contentData = {
            ...input,
            audios: [{ url: savedItem }],
            createdBy: userId,
            updatedBy: userId,
        };
        const savedContent = await TrainingModuleContent.findOneAndUpdate(
            { _id: input._id ?? new ObjectId(), subscriber: subscriberId },
            contentData,
            { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
        );
        if (!savedContent) throw CustomError(ErrorName.FAILED);
        return savedContent;
    },

    updateTrainingModuleContentStatus: async ({ ids, newStatus }, context) => {
        const { userId, subscriberId, userInfo } = AuthUser(context);
        const invalidUpdates = [];
        const updatedContents = [];

        for (const id of ids) {
            const content = await TrainingModuleContent.findOne({
                _id: id,
                subscriber: subscriberId,
                isUpdated: { $ne: true },
            });

            if (!content) {
                invalidUpdates.push({
                    id: id,
                    reason: "Content not found."
                });
                continue;
            }

            const validUpdate = (() => {
                if (content.contentStatus === Content_status.PUBLISHED && newStatus === Content_status.DRAFT) {
                    invalidUpdates.push({
                        name: title,
                        reason: "Published to Draft is not allowed directly. Must move to Retired first."
                    });
                    return false;
                }
                if (content.contentStatus === Content_status.PUBLISHED && newStatus === Content_status.RETIRED) {
                    return true;
                }
                if (content.contentStatus === Content_status.DRAFT && newStatus === Content_status.PUBLISHED) {
                    return true;
                }
                if (content.contentStatus === Content_status.RETIRED && newStatus === Content_status.PUBLISHED) {
                    return true;
                }
                invalidUpdates.push({
                    id: id,
                    reason: `No valid transition from ${content.contentStatus} to ${newStatus}.`
                });
                return false;
            })();

            if (!validUpdate) {
                continue;
            }

            content.contentStatus = newStatus;
            content.updatedBy = userId;
            content.updatedAt = new Date();
            content.modifiedDate = new Date();
            await content.save();

            updatedContents.push(content);
            //content status update notification
            /*  await NotificationHelper.createNotificationhelper({
                 subscriber: subscriberId,
                 titleValue: `Content Status Updated`,
                 messageValue: `The status of the training module content ${content.title[0]?.value} has been updated to ${newStatus} by the ${userInfo?.firstName} ${userInfo?.lastName}.`,
                 notificationType: NotificationType.TRAINING_MODULE_CONTENT_STATUS_UPDATED,
                 notifyAllAdmin: true,
                 affected: [
                     {
                         targetRef: "TrainingModuleContent",
                         target: content._id,
                     },
                 ],
                 status: 'SENT',
                 icon: notificationiconEnum.SUCCESS,
                 createdBy: userId,
             }); */
        }

        return {
            success: invalidUpdates.length === 0,
            message: invalidUpdates.length === 0
                ? `All content statuses updated to ${newStatus}.`
                : `Some content statuses could not be updated.`,
            updatedContents,
            invalidUpdates
        };
    },

    deleteTrainingModuleContentByIDs: async ({ ids }, context) => {
        const { userId, subscriberId, userInfo } = AuthUser(context);
        const invalidDeletes = [];
        const successfullyDeleted = [];
        for (const id of ids) {
            try {
                const content = await TrainingModuleContent.findOne({
                    _id: id,
                    subscriber: subscriberId,
                    contentStatus: { $in: [Content_status.DRAFT, Content_status.RETIRED] },
                });

                if (!content) {
                    invalidDeletes.push({
                        id,
                        reason: "Content not found.",
                    });
                    continue;
                }

                content.isDeleted = true;
                content.updatedAt = new Date();
                content.updatedBy = userId;
                content.modifiedDate = new Date();
                await content.save();
                successfullyDeleted.push(content);
            } catch (error) {
                invalidDeletes.push({
                    id,
                    reason: `Error deleting content: ${error.message}`,
                });
            }
        }
        /* 
                if (successfullyDeleted.length > 0) {
                    for (const content of successfullyDeleted) {
                        await NotificationHelper.createNotificationhelper({
                            subscriber: subscriberId,
                            titleValue: `Training Module Content Deleted`,
                            messageValue: `The training module content ${content.title[0]?.value} has been deleted by the ${userInfo?.firstName} ${userInfo?.lastName}.`,
                            notificationType: NotificationType.TRAINING_MODULE_CONTENT_DELETED,
                            notifyAllAdmin: true,
                            affected: [
                                {
                                    targetRef: "TrainingModuleContent",
                                    target: content._id,
                                },
                            ],
                            status: 'SENT',
                            icon: notificationiconEnum.WARNING,
                            createdBy: userId,
                        });
                    }
                }
        */
        return {
            success: invalidDeletes.length === 0,
            message: invalidDeletes.length === 0
                ? "All content deleted successfully."
                : "Some content could not be deleted.",
            invalidDeletes,
        };
    },

    createTrainingModuleContent: async ({ input, scorm, thumbnail, image, videos, videoMetas, subtitles, audio, file }, context) => {

        try {
            const { userId, subscriberId, userInfo } = AuthUser(context);

            if (!videos && input.title) {
                const titleValues = input.title.map(x => x.value.trim());
                if (titleValues.some(x => x === "")) {
                    throw CustomError(ErrorName.INVALID_TITLE, "Name of the content cannot be empty!");
                }
            }
            /*
            if (input.description) {
                const descriptionValues = input.description.map(x => x.value.trim());
                if (descriptionValues.some(x => x === "")) {
                    throw CustomError(ErrorName.INVALID_DESCRIPTION, "Description cannot be empty");
                }
            }
            */
            const existingContent = await TrainingModuleContent.findOne({
                $or: input.title.map(x => ({
                    "title.value": x.value.trim(),
                })),
                isDeleted: { $ne: true },
            }).lean().select("_id");

            if (existingContent) {
                throw CustomError(ErrorName.CONTENT_ALREADY_EXIST, "Content already exists with this title");
            }

            const scormFile = scorm ? await scorm : null;
            const thumbnailFile = thumbnail ? await thumbnail : null;
            const imageFile = image ? await image : null;
            const videoFile = videos ? await videos : null;
            const audioFile = audio ? await audio : null;
            const fileFile = file ? await file : null;
            const subtitlesFile = subtitles ? await subtitles : null;

            const allowedFileFormats = ['pdf', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'mp3', 'mp4', 'wav', 'zip', 'srt', 'vtt'];

            const validateFileFormat = async (mediaFile) => {
                const fileExtension = typeof mediaFile.filename === 'string' ? mediaFile.filename.split('.').pop().toLowerCase() : '';
                return allowedFileFormats.includes(fileExtension);
            }

            if (scormFile && !validateFileFormat(scormFile)) {
                throw CustomError(ErrorName.INVALID_FILE_FORMAT, 'Invalid SCORM file format');
            }

            if (thumbnailFile && !validateFileFormat(thumbnailFile)) {
                throw CustomError(ErrorName.INVALID_FILE_FORMAT, 'Invalid thumbnail file format');
            }

            if (imageFile && !validateFileFormat(imageFile)) {
                throw CustomError(ErrorName.INVALID_FILE_FORMAT, 'Invalid image file format');
            }

            if (videoFile && !validateFileFormat(videoFile)) {
                throw CustomError(ErrorName.INVALID_FILE_FORMAT, 'Invalid video file format');
            }

            if (audioFile && !validateFileFormat(audioFile)) {
                throw CustomError(ErrorName.INVALID_FILE_FORMAT, 'Invalid audio file format');
            }

            if (fileFile && !validateFileFormat(fileFile)) {
                throw CustomError(ErrorName.INVALID_FILE_FORMAT, 'Invalid file format');
            }

            if (!input.contentStatus || input.contentStatus === Content_status.DRAFT) {
                input.contentStatus = input?.contentType !== ContentType.QUIZ ? Content_status.PUBLISHED : Content_status.DRAFT;
            }

            // if (input.duration) {
            //     const durationStyleChecked = TrainingModuleContentHelper.checkDurationStyle(input.duration);
            //     if (!durationStyleChecked) {
            //         throw CustomError(ErrorName.INVALID_DURATION_FORMAT);
            //     }
            //     input.duration = Math.round(TrainingModuleContentHelper.convertDurationToMinutes(input.duration));
            // }
            let contentTypeNotification = '';
            if (thumbnail) {
                const thumbnailUrl = await UploadHelper.uploadImage({
                    data: thumbnail,
                    folderName: `image-content`,
                    fileName: `image_${Date.now()}_${thumbnailFile?.filename?.split('.')?.[0]}`,
                    uploadType: UploadHelper.uploadType.trainingContentImage,
                });
                input.thumbnail = thumbnailUrl;
                contentTypeNotification = 'Thumbnail'
            }

            if (videos?.length) {
                const videoUrls = await Promise.all(videos.map(async (v) => {
                    const videoUrl = await UploadHelper.uploadVideo({
                        data: v,
                        folderName: `video-content`,
                        fileName: `video_${Date.now()}_${v?.filename?.split('.')?.[0]}`,
                        uploadType: UploadHelper.uploadType.trainingContentVideo,
                    });
                    return videoUrl;
                }));

                const subtitleUrls = await Promise.all((subtitles || []).map(async (s, i) => {
                    const subtitleUrl = await UploadHelper.uploadSubtitle({
                        data: s,
                        folderName: `subtitle-content`,
                        fileName: `subtitle_${Date.now()}_${s?.filename?.split('.')?.[0]}`,
                        uploadType: UploadHelper.uploadType.trainingContentSubtitle,
                    });
                    return subtitleUrl;
                }));

                const vData = videoUrls.map((v, i) => {
                    const meta = videoMetas?.[i] || {};
                    const subtitleRefs = meta.subtitles || [];

                    const mappedSubtitles = subtitleRefs.map(ref => {
                        const subtitleUrl = subtitleUrls[ref.index];
                        return subtitleUrl ? { lang: ref.lang, url: subtitleUrl } : null;
                    }).filter(Boolean);

                    return {
                        url: v,
                        lang: meta.lang,
                        isDefault: meta.isDefault,
                        title: meta.title,
                        description: meta.description,
                        duration: meta.duration,
                        isShowSubtitle: meta.isShowSubtitle,
                        subtitles: mappedSubtitles
                    };
                });

                input.videos = vData;

                contentTypeNotification = 'Videos';
            }


            if (audio) {
                const audioUrl = await UploadHelper.uploadAudio({
                    data: audio,
                    folderName: `audio-content`,
                    fileName: `audio_${Date.now()}_${audioFile?.filename?.split('.')?.[0]}`,
                    uploadType: UploadHelper.uploadType.trainingContentAudio,
                });
                input.audios = [{ url: audioUrl }];
                contentTypeNotification = 'Audio';
            }

            if (image) {
                const imageUrl = await UploadHelper.uploadImage({
                    data: image,
                    folderName: `image-content`,
                    fileName: `image_${Date.now()}_${imageFile?.filename?.split('.')?.[0]}`,
                    uploadType: UploadHelper.uploadType.trainingContentImage,
                });
                input.images = [{ url: imageUrl }];
                contentTypeNotification = 'Image';
            }

            if (file) {
                const fileUrl = await UploadHelper.uploadDocument({
                    data: file,
                    folderName: `file-content`,
                    fileName: `file_${Date.now()}_${fileFile?.filename?.split('.')?.[0]}`,
                    uploadType: UploadHelper.uploadType.trainingContentFile,
                });
                input.files = [{ url: fileUrl }];
                contentTypeNotification = 'Document';
            }

            const contentData = {
                ...input,
                createdBy: userId,
                updatedBy: userId,
            };

            const savedContent = await DbTransactionHelper.performDbTransaction(async session => {
                const savedContent = new TrainingModuleContent({
                    ...contentData,
                    subscriber: subscriberId,
                    UID: await TrainingModuleContentHelper.generateContentUID({ subscriberId, session })
                })
                await savedContent.save();
                return savedContent;
            });

            if (!savedContent) throw CustomError(ErrorName.FAILED, 'Failed to create the content');

            LogHelper.logActivity({
                subscriber: subscriberId,
                logType: LogType.TRAINING_MODULE_CONTENT_LOG,
                operation: "CREATE",
                ipInfo: context.ipInfo,
                affected: [
                    {
                        targetRef: "TrainingModuleContent",
                        target: savedContent._id,
                    },
                ],
                additionalInfo: [
                    {
                        infoType: "TRAINING_MODULE_CONTENT_INFO",
                        infoData: JSON.stringify(savedContent),
                    },
                ],
                createdBy: userInfo,
            });
            /* await NotificationHelper.createNotificationhelper({
                subscriber: subscriberId,
                titleValue: `New  Content Created`,
                messageValue: `A new ${contentTypeNotification} has been added to the training module by ${userInfo?.firstName} ${userInfo?.lastName}.`,
                notificationType: NotificationType.TRAINING_MODULE_CONTENT_CREATED,
                notifyAllAdmin: true,
                affected: [
                    {
                        targetRef: "TrainingModuleContent",
                        target: savedContent._id,
                    },
                ],
                status: 'SENT',
                icon: notificationiconEnum.SUCCESS,
                createdBy: userInfo,
            }); */
            return savedContent;
        } catch (error) {
            console.error("Error in createTrainingModuleContent:", error);
            throw CustomError(ErrorName.FAILED, error.message);
        }
    },

    createTrainingModuleContentQuiz: async ({ input }, context) => {
        const { userId, subscriberId, userInfo } = AuthUser(context);

        try {
            const { title, description, questions = [], percentageCriteria } = input;

            const existingContent = await TrainingModuleContent.findOne({
                $or: title.map(x => ({
                    "title.value": x.value.trim(),
                })),
                isDeleted: { $ne: true },
            }).lean().select("_id");

            if (existingContent) {
                throw CustomError(ErrorName.CONTENT_ALREADY_EXIST, "Content already exists with this title");
            }

            if (!input.contentStatus || questions.length === 0) {
                input.contentStatus = (title && description && questions.length > 0)
                    ? Content_status.PUBLISHED
                    : Content_status.DRAFT;
            } else {
                input.contentStatus = input.contentStatus;
            }

            let totalScore = 0;
            let questionsIdArr = [];

            if (questions.length > 0) {
                for (const questionDetails of questions) {
                    const questionId = ObjectId();
                    const choiceDocs = questionDetails.choices.map(choiceDetail => ({
                        subscriber: subscriberId,
                        question: questionId,
                        choice: choiceDetail.choice.map(item => ({ lang: item.lang, value: item.value })),
                        createdBy: userId,
                        updatedBy: userId,
                    }));

                    const savedChoices = await AnswerChoice.insertMany(choiceDocs);
                    const choiceIds = savedChoices.map(choice => choice._id);

                    const questionDoc = new Question({
                        subscriber: subscriberId,
                        question: questionDetails.question,
                        questionType: questionDetails.questionType,
                        choices: choiceIds,
                        answerKey: questionDetails.answerKey,
                        allowMultipleAnswers: questionDetails.allowMultipleAnswers,
                        points: questionDetails.points,
                        negativePoints: questionDetails.negativePoints,
                        createdBy: userId,
                        updatedBy: userId,
                    });

                    const savedQuestion = await questionDoc.save();
                    questionsIdArr.push(savedQuestion._id);
                    totalScore += questionDetails.points;
                }

                input.quiz = questionsIdArr;
                input.totalScore = totalScore;
                input.totalQuestions = questionsIdArr.length;

                if (percentageCriteria > totalScore) {
                    throw CustomError(ErrorName.INVALID_PERCENTAGE_CRITERIA);
                } else {
                    input.percentageCriteria = Math.round((percentageCriteria / totalScore) * 100);
                }
            }

            // if (input.duration) {
            //     const durationStyleChecked = TrainingModuleContentHelper.checkDurationStyle(input.duration);
            //     if (!durationStyleChecked) {
            //         throw CustomError(ErrorName.INVALID_DURATION_FORMAT);
            //     }
            //     input.duration = TrainingModuleContentHelper.convertDurationToMinutes(input.duration);
            // }

            const contentData = {
                ...input,
                contentType: ContentType.QUIZ,
                createdBy: userId,
                updatedBy: userId,
            };

            const savedContent = await DbTransactionHelper.performDbTransaction(async session => {
                const contentDoc = new TrainingModuleContent({
                    ...contentData,
                    subscriber: subscriberId,
                    UID: await TrainingModuleContentHelper.generateContentUID({ subscriberId, session })
                });
                await contentDoc.save();
                return contentDoc;
            });

            if (!savedContent) throw CustomError(ErrorName.FAILED, 'Failed to create the content');

            LogHelper.logActivity({
                subscriber: subscriberId,
                logType: LogType.TRAINING_MODULE_CONTENT_LOG,
                operation: "CREATE",
                ipInfo: context.ipInfo,
                affected: [
                    {
                        targetRef: "TrainingModuleContent",
                        target: savedContent._id,
                    },
                ],
                additionalInfo: [
                    {
                        infoType: "TRAINING_MODULE_CONTENT_INFO",
                        infoData: JSON.stringify(savedContent),
                    },
                ],
                createdBy: userInfo,
            });
            /* 
                        await NotificationHelper.createNotificationhelper({
                            subscriber: subscriberId,
                            titleValue: `New Content Created`,
                            messageValue: `A new Quiz has been added to the training module by ${userInfo?.firstName} ${userInfo?.lastName}.`,
                            notificationType: NotificationType.TRAINING_MODULE_CONTENT_CREATED,
                            notifyAllAdmin: true,
                            affected: [
                                {
                                    targetRef: "TrainingModuleContent",
                                    target: savedContent._id,
                                },
                            ],
                            status: 'SENT',
                            icon: notificationiconEnum.SUCCESS,
                            createdBy: userInfo,
                        });
              */
            return savedContent;
        } catch (error) {
            throw Error(error.message);
        }
    },

    updateTrainingModuleContent: async ({ input, scorm, thumbnail, image, videos, videoMetas, audio, file, deletedVideos,deletedSubtitles,subtitles }, context) => {
        const { userId, subscriberId, userInfo } = AuthUser(context);

        const existingContent = await TrainingModuleContent.findOne({
            _id: input._id ?? undefined,
        });

        if (!existingContent) {
            throw CustomError(ErrorName.CONTENT_NOT_FOUND);
        }

        const usedInCourses = await TrainingContentBridge.find({ trainingContent: existingContent._id, isDeleted: false });

        const scormFile = scorm ? await scorm : null;
        const thumbnailFile = thumbnail ? await thumbnail : null;
        const imageFile = image ? await image : null;
        const videoFiles = videos ? await videos : null;
        const audioFile = audio ? await audio : null;
        const fileFile = file ? await file : null;

        const allowedFileFormats = ['pdf', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'mp3', 'mp4', 'wav', 'zip'];

        const validateFileFormat = (mediaFile) => {
            const fileExtension = typeof mediaFile.filename === 'string' ? mediaFile.filename.split('.').pop().toLowerCase() : '';
            return allowedFileFormats.includes(fileExtension);
        };

        // const validateFiles = [scormFile, thumbnailFile, imageFile, audioFile, fileFile, ...(videoFiles || [])];
        // for (const mediaFile of validateFiles) {
        //     console.log(mediaFile,"medifile")
        //     if (mediaFile && !validateFileFormat(mediaFile)) {
        //         throw CustomError(ErrorName.INVALID_FILE_FORMAT, 'Invalid file format');
        //     }
        // }

        if (!input.contentStatus || input.contentStatus === Content_status.DRAFT) {
            input.contentStatus = input?.contentType !== ContentType.QUIZ ? Content_status.PUBLISHED : Content_status.DRAFT;
        }

        let updateData = {
            title: input.title,
            description: input.description,
            contentType: input.contentType,
            contentStatus: input.contentStatus,
            duration: input.duration,
            displayPosition: input.displayPosition,
            isActive: input.isActive,
            createdBy: existingContent.createdBy,
            updatedBy: userId,
            updatedAt: new Date(),
            videos: existingContent.videos || [],
            audios: existingContent.audios || [],
            images: existingContent.images || [],
            files: existingContent.files || [],
            scorm: existingContent.scorm || null,
            thumbnail: existingContent.thumbnail || null,
            version: existingContent.version || 1,
            UID: existingContent.UID,
        };

        let isUpdated = false;
        let isMediaUpdated = false;

        const fieldsToCheck = ["title", "description", "contentType", "contentStatus", "duration", "displayPosition", "isActive"];

        for (const field of fieldsToCheck) {
            if (JSON.stringify(input[field]) !== JSON.stringify(existingContent[field])) {
                isUpdated = true;
                break;
            }
        }

        if ((!videoFiles || videoFiles.length === 0) && videoMetas?.length > 0) {
            let videoUpdated = false;

            for (let i = 0; i < videoMetas.length; i++) {
                const videoMeta = videoMetas[i];
                if (!videoMeta?.lang) continue;

                // Find the video with the same language
                const existingVideo = updateData.videos.find(video => video.lang === videoMeta.lang);
                if (existingVideo) {
                    // Update metadata
                    existingVideo.title = videoMeta.title ?? existingVideo.title;
                    existingVideo.description = videoMeta.description ?? existingVideo.description;
                    existingVideo.isDefault = videoMeta.isDefault ?? existingVideo.isDefault;
                    existingVideo.duration = videoMeta.duration ?? existingVideo.duration
                    videoUpdated = true;
                }
                else {
                    throw CustomError(ErrorName.FAILED, "VIDEO META NOT FOUND")
                }
            }

            if (videoUpdated) {
                isUpdated = true;
            }
        }


        if (deletedVideos?.length > 0 && Array.isArray(deletedVideos)) {
            const deletedIds = deletedVideos.map(id => id.toString());
            updateData.videos = updateData.videos.filter(video => {
                const videoIdStr = video._id?.toString?.();
                return videoIdStr && !deletedIds.includes(videoIdStr);
            });
            isUpdated = true;
            isMediaUpdated = true;
        }

        if (deletedSubtitles?.length > 0) {
            for (const subtitleId of deletedSubtitles) {
                for (const video of updateData.videos) {
                    const index = video.subtitles?.findIndex(s => s._id?.toString() === subtitleId.toString());
                    if (index >= 0) {
                        video.subtitles.splice(index, 1);
                        isUpdated = true;
                        // isMediaUpdated = true;
                    }
                }
            }
        }


        if (videoFiles?.length > 0 && videoMetas?.length > 0) {
            // try {
            updateData.videos = updateData.videos.map(v => v.toObject?.() || v);

            const uploadedVideos = (await Promise.all(
                videoFiles.map(async (videoFile, i) => {
                    const videoMeta = videoMetas[i];
                    if (!videoFile || !videoMeta?.lang) return null;

                    const videoUrl = await UploadHelper.uploadVideo({
                        data: videoFile,
                        folderName: `video-content`,
                        fileName: `video_${Date.now()}_${videoFile?.filename?.split('.')?.[0]}`,
                        uploadType: UploadHelper.uploadType.trainingContentVideo,
                    });

                    return {
                        url: videoUrl,
                        lang: videoMeta.lang,
                        title: videoMeta.title,
                        description: videoMeta.description,
                        isDefault: videoMeta.isDefault,
                        duration: videoMeta.duration
                    };
                })
            )).filter(Boolean);

            // Filter out any nulls (in case some were skipped)
            for (const newVideo of uploadedVideos.filter(Boolean)) {
                const existingIndex = updateData.videos.findIndex(video => video.lang === newVideo.lang);
                if (existingIndex !== -1) {
                    updateData.videos[existingIndex] = { ...updateData.videos[existingIndex], ...newVideo };
                } else {
                    updateData.videos.push(newVideo);
                }
            }

            isUpdated = true;
            isMediaUpdated = true;
            updateData.audios = [];
            updateData.images = [];
            updateData.files = [];
            // } catch (err) {
            //     throw CustomError(ErrorName.FAILED, `Error uploading one or more videos`);
            // }
        }

        if (subtitles?.length > 0 && videoMetas?.length > 0) {
            for (let i = 0; i < videoMetas.length; i++) {
                const videoMeta = videoMetas[i];
                const video = updateData.videos.find(v => v.lang === videoMeta.lang);
                if (!video) continue;

                video.subtitles = video.subtitles || [];

                if (videoMeta.subtitles?.length > 0) {
                    for (let j = 0; j < videoMeta.subtitles.length; j++) {
                        const meta = videoMeta.subtitles[j];
                        const subtitleFile = subtitles[j];
                        if (!meta?.lang || !subtitleFile) continue;

                        const subtitleUrl = await UploadHelper.uploadSubtitle({
                            data: subtitleFile,
                            folderName: `subtitle-content-${existingContent._id}`,
                            fileName: `subtitle_${Date.now()}_${subtitleFile?.filename?.split('.')?.[0]}`,
                            uploadType: UploadHelper.uploadType.trainingContentSubtitle,
                        });

                        // Push only new subtitles (you could check ID existence here)
                        video.subtitles.push({
                            url: subtitleUrl,
                            lang: meta.lang,
                        });
                        

                        isUpdated = true;
                    }
                }
            }
        }



        if (thumbnail === null) {
            updateData.thumbnail = null;
            isUpdated = true;
        } else if (thumbnailFile) {
            const thumbnailUrl = await UploadHelper.uploadImage({
                data: thumbnail,
                folderName: `image-content-${existingContent._id}`,
                fileName: `image_${Date.now()}_${thumbnailFile?.filename?.split('.')?.[0]}`,
                uploadType: UploadHelper.uploadType.trainingContentImage,
            });
            updateData.thumbnail = thumbnailUrl;
            isUpdated = true;
            isMediaUpdated = true;
        }

        if (audio) {
            const audioUrl = await UploadHelper.uploadAudio({
                data: audio,
                folderName: `audio-content-${existingContent._id}`,
                fileName: `audio_${Date.now()}_${audioFile?.filename?.split('.')?.[0]}`,
                uploadType: UploadHelper.uploadType.trainingContentAudio,
            });
            updateData.audios = [{ url: audioUrl }];
            updateData.images = [];
            updateData.videos = [];
            updateData.files = [];
            updateData.scorm = null;
            isUpdated = true;
            isMediaUpdated = true;
        }

        if (image) {
            const imageUrl = await UploadHelper.uploadImage({
                data: image,
                folderName: `image-content-${existingContent._id}`,
                fileName: `image_${Date.now()}_${imageFile?.filename?.split('.')?.[0]}`,
                uploadType: UploadHelper.uploadType.trainingContentImage,
            });
            updateData.images = [{ url: imageUrl }];
            updateData.audios = [];
            updateData.files = [];
            updateData.videos = [];
            updateData.scorm = null;
            isUpdated = true;
            isMediaUpdated = true;
        }

        if (file) {
            const fileUrl = await UploadHelper.uploadDocument({
                data: file,
                folderName: `file-content-${existingContent._id}`,
                fileName: `file_${Date.now()}_${fileFile?.filename?.split('.')?.[0]}`,
                uploadType: UploadHelper.uploadType.trainingContentFile,
            });
            updateData.files = [{ url: fileUrl }];
            updateData.images = [];
            updateData.audios = [];
            updateData.videos = [];
            updateData.scorm = null;
            isUpdated = true;
            isMediaUpdated = true;
        }

        if (scorm) {
            const courseInfo = await ScromHelper.uploadToScormCloud(scorm);
            if (courseInfo) {
                updateData.scorm = {
                    courseId: courseInfo.courseId,
                    type: "CLOUD",
                    fileName: scormFile.filename
                };
                updateData.audios = [];
                updateData.images = [];
                updateData.files = [];
                updateData.videos = [];
                isUpdated = true;
                isMediaUpdated = true;
            }
        }

        let savedContent = null;

        if (isMediaUpdated) {
            updateData.version = (existingContent.version || 1) + 1;
            updateData.modifiedDate = new Date();
            updateData.isPublished = usedInCourses.length > 0;

            const savedContentData = new TrainingModuleContent({
                ...updateData,
                subscriber: subscriberId,
            });
            savedContent = await savedContentData.save();

            await TrainingModuleContent.updateOne(
                { _id: existingContent._id, subscriber: subscriberId },
                { $set: { isUpdated: true } }
            );
        } else {
            savedContent = await TrainingModuleContent.findOneAndUpdate(
                { _id: existingContent._id, subscriber: subscriberId },
                { $set: updateData },
                { new: true, setDefaultsOnInsert: true, runValidators: true }
            );
        }

        await LogHelper.logActivity({
            subscriber: subscriberId,
            logType: LogType.TRAINING_MODULE_CONTENT_LOG,
            operation: "UPDATE",
            ipInfo: context.ipInfo,
            affected: [
                {
                    targetRef: "TrainingModuleContent",
                    target: savedContent._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "TRAINING_MODULE_CONTENT_INFO",
                    infoData: JSON.stringify(savedContent),
                },
            ],
            createdBy: userInfo,
        });

        return {
            success: true,
            message: "Content updated successfully.",
            isUpdated,
        };
    },


    updateTrainingModuleContentQuiz: async ({ input }, context) => {
        const { userId, subscriberId, userInfo } = AuthUser(context);

        try {
            const alreadyContentExist = await TrainingModuleContent.findOne({
                $or: input.title.map(x => ({
                    "title.value": x.value.trim(),
                })),
                UID: { $ne: input.UID },
                isDeleted: { $ne: true },
            }).lean().select("_id");

            if (alreadyContentExist) {
                throw CustomError(ErrorName.CONTENT_ALREADY_EXIST, "Content already exists with this title");
            }

            const existingContent = await TrainingModuleContent.findOne({
                _id: input._id ?? undefined,
                subscriber: subscriberId,
                UID: input.UID ?? undefined
            });

            if (!existingContent) {
                throw CustomError(ErrorName.CONTENT_NOT_FOUND);
            }

            const usedInCourses = await TrainingContentBridge.find({ trainingContent: existingContent._id, isDeleted: false });

            let updatedContentStatus
            if (!input.contentStatus) {
                updatedContentStatus = (input.title && input.description && input.questions.length > 0)
                    ? Content_status.PUBLISHED
                    : Content_status.DRAFT;
            } else {
                input.contentStatus = input.contentStatus;
            }

            let questionsChanged = false;
            let totalScore = 0;
            let questionsIdArr = [];

            // if (input.duration) {
            //     const durationStyleChecked = TrainingModuleContentHelper.checkDurationStyle(input.duration);
            //     if (!durationStyleChecked) {
            //         throw CustomError(ErrorName.INVALID_DURATION_FORMAT);
            //     }
            //     input.duration = TrainingModuleContentHelper.convertDurationToMinutes(input.duration);
            // }

            let savedContent;

            if (input.questions && input.questions.length > 0) {

                for (const questionDetails of input.questions) {
                    const questionId = ObjectId();
                    const choiceDocs = questionDetails.choices.map(choiceDetail => ({
                        subscriber: subscriberId,
                        question: questionId,
                        choice: choiceDetail.choice.map(item => ({ lang: item.lang, value: item.value })),
                        createdBy: userId,
                        updatedBy: userId,
                    }));

                    const savedChoices = await AnswerChoice.insertMany(choiceDocs);
                    const choiceIds = savedChoices.map(choice => choice._id);

                    const questionDoc = new Question({
                        subscriber: subscriberId,
                        question: questionDetails.question,
                        questionType: questionDetails.questionType,
                        choices: choiceIds,
                        answerKey: questionDetails.answerKey,
                        allowMultipleAnswers: questionDetails.allowMultipleAnswers,
                        points: questionDetails.points,
                        negativePoints: questionDetails.negativePoints,
                        createdBy: userId,
                        updatedBy: userId,
                    });

                    const savedQuestion = await questionDoc.save();
                    questionsIdArr.push(savedQuestion._id);
                    totalScore += questionDetails.points;
                }

                questionsChanged = true;
            }
            const score = questionsChanged ? totalScore : existingContent.totalScore;
            if (input.percentageCriteria > score) {
                throw CustomError(ErrorName.INVALID_PERCENTAGE_CRITERIA);
            } else {
                input.percentageCriteria = Math.round((input.percentageCriteria / score) * 100) || 0;
            }

            const updateData = {
                title: input.title,
                description: input.description,
                duration: input.duration,
                quiz: input.questions ? questionsIdArr : existingContent.quiz,
                contentStatus: updatedContentStatus ? updatedContentStatus : input.contentStatus,
                totalScore: questionsChanged ? totalScore : existingContent.totalScore,
                totalQuestions: questionsChanged ? questionsIdArr.length : existingContent.totalQuestions,
                percentageCriteria: input.percentageCriteria,
                randomiseQuestionOrder: input.randomiseQuestionOrder,
                randomiseAnswerOptionOrder: input.randomiseAnswerOptionOrder,
                showCorrectAnswersToLearnerAfterQuiz: input.showCorrectAnswersToLearnerAfterQuiz,
                onlyLearnerPassTheQuiz: input.onlyLearnerPassTheQuiz,
                evenLearnerFailTheQuiz: input.evenLearnerFailTheQuiz,
                createdBy: existingContent.createdBy,
                updatedBy: userId,
                updatedAt: new Date(),
                modifiedDate: new Date(),
            };

            if (questionsChanged && existingContent.contentStatus !== Content_status.DRAFT) {
                updateData.version = existingContent.version + 1;
                updateData.isUpdated = false;
                updateData.isPublished = usedInCourses.length > 0 ? true : false;

                const newContent = new TrainingModuleContent({
                    ...existingContent.toObject(),
                    ...updateData,
                    subscriber: subscriberId,
                    createdBy: userId,
                    updatedBy: userId,
                    _id: undefined
                });

                await newContent.save();

                existingContent.isUpdated = true;
                existingContent.modifiedDate = new Date();
                existingContent.updatedAt = new Date();
                await existingContent.save();

                LogHelper.logActivity({
                    subscriber: subscriberId,
                    logType: LogType.TRAINING_MODULE_CONTENT_LOG,
                    operation: "UPDATE",
                    ipInfo: context.ipInfo,
                    affected: [],
                    additionalInfo: [
                        {
                            infoType: "TRAINING_MODULE_CONTENT_INFO",
                            infoData: JSON.stringify(newContent),
                        },
                    ],
                    createdBy: userInfo,
                });
                /* 
                                await NotificationHelper.createNotificationhelper({
                                    subscriber: subscriberId,
                                    titleValue: `Training Module Content Updated`,
                                    messageValue: `Training Module Content Updated by ${userInfo?.firstName} ${userInfo?.lastName}`,
                                    notificationType: NotificationType.TRAINING_MODULE_CONTENT_UPDATED,
                                    notifyAllAdmin: true,
                                    affected: [],
                                    status: 'SENT',
                                    icon: notificationiconEnum.SUCCESS,
                                    createdBy: userInfo,
                                });
                  */
                return {
                    success: true,
                    message: "Quiz content updated with a new version.",
                    updatedContent: newContent,
                };
            } else {
                const fieldsToUpdate = ['title', 'description', 'duration'];
                fieldsToUpdate.forEach(field => {
                    if (input[field]) {
                        existingContent[field] = input[field];
                    }
                });

                savedContent = await TrainingModuleContent.findOneAndUpdate(
                    { _id: existingContent._id, subscriber: subscriberId },
                    { $set: updateData },
                    { new: true, setDefaultsOnInsert: true, runValidators: true }
                );

                LogHelper.logActivity({
                    subscriber: subscriberId,
                    logType: LogType.TRAINING_MODULE_CONTENT_LOG,
                    operation: "UPDATE",
                    ipInfo: context.ipInfo,
                    affected: [
                        {
                            targetRef: "TrainingModuleContent",
                            target: savedContent._id,
                        },
                    ],
                    additionalInfo: [
                        {
                            infoType: "TRAINING_MODULE_CONTENT_INFO",
                            infoData: JSON.stringify(savedContent),
                        },
                    ],
                    createdBy: userInfo,
                });
                /*  
                                await NotificationHelper.createNotificationhelper({
                                    subscriber: subscriberId,
                                    titleValue: `Training Module Content Updated`,
                                    messageValue: `Training Module Content Updated by ${userInfo?.firstName} ${userInfo?.lastName}`,
                                    notificationType: NotificationType.TRAINING_MODULE_CONTENT_UPDATED,
                                    notifyAllAdmin: true,
                                    affected: [
                                        {
                                            targetRef: "TrainingModuleContent",
                                            target: savedContent._id,
                                        },
                                    ],
                                    status: 'SENT',
                                    icon: notificationiconEnum.SUCCESS,
                                    createdBy: userInfo,
                                });
                  */
                return {
                    success: true,
                    message: "Quiz content updated successfully.",
                    updatedContent: savedContent,
                };
            }
        } catch (error) {
            throw Error(error.message);
        }
    },
    pushLatestContent: async ({ ids }, context) => {
        const { subscriberId, userInfo, userId } = AuthUser(context);

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            throw CustomError(ErrorName.ARGUMENTS_REQUIRED);
        }

        try {

            const inputContents = await TrainingModuleContent.find({
                _id: { $in: ids },
                subscriber: subscriberId,
            });

            if (!inputContents || inputContents.length === 0) {
                throw CustomError(ErrorName.NOT_FOUND);
            }

            const contentUIDs = inputContents.map(content => content.UID);

            const matchingTrainingContents = await TrainingModuleContent.find({ UID: { $in: contentUIDs } }).select('_id');
            const matchingTrainingContentIds = matchingTrainingContents.map(content => content._id);

            const fetchCurrentContents = await TrainingContentBridge.find({ trainingContent: { $in: matchingTrainingContentIds } }).populate('trainingContent').lean();

            if (!fetchCurrentContents.length) {
                throw CustomError(ErrorName.NOT_FOUND);
            }

            const bridgesToUpdate = fetchCurrentContents.map(content => ({
                bridgeId: content._id,
                trainingContentId: inputContents.find(ic => ic.UID === content.trainingContent.UID)._id,
                currentContent: content?.trainingContent?._id
            }));

            const bulkBridgeUpdates = bridgesToUpdate.map(({ bridgeId, trainingContentId }) => ({
                updateOne: {
                    filter: { _id: bridgeId },
                    update: { trainingContent: trainingContentId }
                }
            }));

            await TrainingContentBridge.bulkWrite(bulkBridgeUpdates);

            const currentContentId = bridgesToUpdate[0].currentContent;
            const trainingContentId = bridgesToUpdate[0].trainingContentId;

            const updatedDocs = await TrainingProgress.find({
                trainingModuleContent: { $in: currentContentId },
                isDeleted: { $ne: true },
                status: 'NOT_STARTED'
            }).lean();

            await TrainingProgress.updateMany(
                {
                    trainingModuleContent: { $in: currentContentId },
                    isDeleted: { $ne: true },
                    status: 'NOT_STARTED'
                },
                [
                    { $set: { trainingModuleContent: trainingContentId } }
                ]
            );

            const overallTrainingProgressIds = updatedDocs.map(doc => doc.overallTrainingProgress);
            if (overallTrainingProgressIds.length > 0) {
                await OverallTrainingProgress.updateMany(
                    {
                        _id: { $in: overallTrainingProgressIds },
                        "contentData.contentIds": { $in: currentContentId }
                    },
                    {
                        $set: {
                            "contentData.$[outer].contentIds.$[inner]": trainingContentId
                        }
                    },
                    {
                        arrayFilters: [
                            { "outer.contentIds": { $in: currentContentId } },
                            { "inner": { $in: currentContentId } }
                        ]
                    }
                );
            }

            await TrainingModuleContent.updateMany(
                { _id: { $in: ids }, subscriber: subscriberId },
                { $set: { isPublished: false } }
            );

            const impactedCoursesCount = bridgesToUpdate.length;
            const titles = inputContents.map((content) => content.title[0]?.value).join(", ");
            /* 
                        await NotificationHelper.createNotificationhelper({
                            subscriber: subscriberId,
                            titleValue: `Content Successfully Pushed to the Courses`,
                            messageValue: `The contents titled ${titles} have been successfully pushed to ${impactedCoursesCount} course(s) by ${userInfo?.firstName} ${userInfo?.lastName}.`,
                            notificationType: NotificationType.CONTENT_PUSHED,
                            notifyAllAdmin: true,
                            affected: inputContents.map((content) => ({
                                targetRef: "TrainingModuleContent",
                                target: content._id,
                            })),
                            status: 'SENT',
                            icon: notificationiconEnum.SUCCESS,
                            createdBy: userId,
                        }); 
            */
            return {
                status: 1,
                message: "New content pushed to lessons successfully.",
            };

        } catch (error) {
            return Error(error);
        }

    },

};