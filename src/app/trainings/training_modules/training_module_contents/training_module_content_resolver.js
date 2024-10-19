const { CustomError, ErrorName, AuthUser, DbTransactionHelper, UploadHelper } = require("../../../../util");

const { TrainingModuleContent } = require("./training_module_content_model");

const TrainingModuleContentHelper = require("./training_module_content_helper");
const SubRoleHelper = require("../../../user/sub-roles/sub_role_helper");
const LogHelper = require("../../../logs/log_helper");

const Permission = require("../../../user/sub-roles/permission");
const { ObjectId } = require("../../../../tools");
const Content_status = require("./content_status.json");
const ContentType = require("./content_type.json");
const AwsHelper = require("../../../../util/aws_helper");
const ScromHelper = require("../../scrom_helper")
const pptx2json = require('pptx2json');

module.exports.queries = {
    getTrainingModuleContents: async ({ pageInput, search, contentStatus, recentlyModified, contentType }, context) => {
        const { subscriberId } = AuthUser(context);
        const filterConditions = {
            subscriber: subscriberId,
        };
        if (contentStatus) {
            filterConditions.contentStatus = contentStatus;
        }
        if (contentType) {
            filterConditions.contentType = contentType;
        }
        if (recentlyModified) {
            filterConditions.modifiedDate = { $gte: new Date(new Date() - 24 * 60 * 60 * 1000) };
        }
        if (search) {
            filterConditions['title.value'] = { $regex: search, $options: "i" };
        }
        const skip = pageInput?.skip ?? 0;
        const limitContent = pageInput?.limit ?? 50; //(recentlyModified ? 2 : 6);
        const totalCount = await TrainingModuleContent.countDocuments(filterConditions).exec();
        const contents = await TrainingModuleContent.find(filterConditions).sort({ updatedAt: -1 }).skip(skip).limit(limitContent).lean().exec();
        if (!contents) {
            return {
                contents: [],
                totalCount: 0,
            };
        }
        // const recentlyModifiedContent = contents.map(content => {
        //     return {
        //         ...content,
        //         recentlyModified: recentlyModified ? (new Date() - new Date(contents.updatedAt)) < (24 * 60 * 60 * 1000) : false,
        //     }
        // })
        return {
            // contents: recentlyModifiedContent,
            contents,
            totalCount,
        };
    },
    getTrainingModuleContent: async ({ id }, context) => {
        const { subscriberId } = AuthUser(context);
        const filterConditions = {
            subscriber: subscriberId,
            _id: id
        };
        const contents = await TrainingModuleContent.findOne(filterConditions).lean().exec();
        if (!contents) {
            return null;
        }
        return contents;
    },
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
        if (input.duration) {
            const durationStyleChecked = TrainingModuleContentHelper.checkDurationStyle(input.duration);
            if (!durationStyleChecked) {
                throw CustomError(ErrorName.INVALID_DURATION_FORMAT);
            }
        }

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

        if (input.duration) {
            const durationStyleChecked = TrainingModuleContentHelper.checkDurationStyle(input.duration);
            if (!durationStyleChecked) {
                throw CustomError(ErrorName.INVALID_DURATION_FORMAT);
            }
        }

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

        if (input.duration) {
            const durationStyleChecked = TrainingModuleContentHelper.checkDurationStyle(input.duration);

            if (!durationStyleChecked) {
                throw CustomError(ErrorName.INVALID_DURATION_FORMAT);
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

        if (input.duration) {
            const durationStyleChecked = TrainingModuleContentHelper.checkDurationStyle(input.duration);
            if (!durationStyleChecked) {
                throw CustomError(ErrorName.INVALID_DURATION_FORMAT);
            }
        }

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

        if (input.duration) {
            const durationStyleChecked = TrainingModuleContentHelper.checkDurationStyle(input.duration);
            if (!durationStyleChecked) {
                throw CustomError(ErrorName.INVALID_DURATION_FORMAT);
            }
        }

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

    updateTrainingModuleContentStatus: async ({ title, newStatus }, context) => {
        const { userId, subscriberId } = AuthUser(context);
        const content = await TrainingModuleContent.findOne({
            'title.value': title,
            subscriber: subscriberId
        });
        const invalidUpdates = [];

        if (!content) {
            return {
                success: false,
                message: "Content not found.",
                invalidUpdates: [{
                    name: title,
                    reason: "Content not found."
                }]
            };
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
            if (content.contentStatus === Content_status.RETIRED && newStatus === Content_status.DRAFT) {
                return true;
            }
            invalidUpdates.push({
                name: title,
                reason: `No valid transition from ${content.contentStatus} to ${newStatus}.`
            });
            return false;
        })();

        if (!validUpdate) {
            return {
                success: false,
                message: "Invalid Content status transition.",
                invalidUpdates,
            };
        }

        content.contentStatus = newStatus;
        content.updatedBy = userId;
        content.updatedAt = new Date();
        await content.save();

        return {
            success: true,
            message: `Content status successfully updated to ${newStatus}.`,
            updatedContent: content,
        };
    },

    deleteTrainingModuleContentByID: async ({ id }, context) => {
        const { subscriberId } = AuthUser(context);
        const content = await TrainingModuleContent.findOneAndDelete({
            _id: id,
            subscriber: subscriberId,

        });

        if (!content) {
            throw CustomError(ErrorName.CONTENT_NOT_FOUND);
        }
        return {
            success: true,
            message: "Content deleted successfully."
        };
    },

    createTrainingModuleContent: async ({ input, scorm, thumbnail, image, video, audio, file }, context) => {
        try {
            const { userId, subscriberId } = AuthUser(context);

            const scormFile = scorm ? await scorm : null;
            const thumbnailFile = thumbnail ? await thumbnail : null;
            const imageFile = image ? await image : null;
            const videoFile = video ? await video : null;
            const audioFile = audio ? await audio : null;
            const fileFile = file ? await file : null;

            let pptSlides = 0;

            const allowedFileFormats = ['pdf', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'gif', 'mp3', 'mp4', 'wav', 'zip'];

            const validateFileFormat = async (mediaFile) => {
                const fileExtension = typeof mediaFile.filename === 'string' ? mediaFile.filename.split('.').pop().toLowerCase() : '';

                if (fileExtension === 'ppt' || fileExtension === 'pptx') {
                    const readStream = mediaFile.createReadStream();
                    const pptData = new pptx2json(readStream);
                    const pptSlides = pptData.slides ? pptData.slides.length : 0;

                    console.log("pptData", pptData);
                    console.log("Total Slides:", pptSlides);

                }
                return allowedFileFormats.includes(fileExtension);
            };

            if (scormFile && !validateFileFormat(scormFile)) {
                throw CustomError(ErrorName.INVALID_FILE_FORMAT, 'Invalid SCORM file format');
            }

            if (thumbnailFile && !validateFileFormat(thumbnailFile)) {
                console.log("thumbnail", thumbnailFile);
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

            const existingContent = await TrainingModuleContent.findOne({
                $or: input.title.map(x => ({
                    "title.value": { $regex: x.value.trim(), $options: "i" },
                })),
            }).lean().select("_id");

            if (existingContent) {
                throw CustomError(ErrorName.CONTENT_ALREADY_EXIST);
            }

            if (!input.contentStatus || input.contentStatus === Content_status.DRAFT) {
                input.contentStatus = input?.contentType !== ContentType.QUIZ ? Content_status.PUBLISHED : Content_status.DRAFT;
            }

            if (input.duration) {
                const durationStyleChecked = TrainingModuleContentHelper.checkDurationStyle(input.duration);
                if (!durationStyleChecked) {
                    throw CustomError(ErrorName.INVALID_DURATION_FORMAT);
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

            if (video) {
                const videoUrl = await UploadHelper.uploadVideo({
                    data: video,
                    folderName: `video-content`,
                    fileName: `video_${Date.now()}`,
                    uploadType: UploadHelper.uploadType.trainingContentVideo,
                });
                input.videos = [{ url: videoUrl }];
            }

            if (audio) {
                const audioUrl = await UploadHelper.uploadAudio({
                    data: audio,
                    folderName: `audio-content`,
                    fileName: `audio_${Date.now()}`,
                    uploadType: UploadHelper.uploadType.trainingContentAudio,
                });
                input.audios = [{ url: audioUrl }];
            }

            if (image) {
                const imageUrl = await UploadHelper.uploadImage({
                    data: image,
                    folderName: `image-content`,
                    fileName: `image_${Date.now()}`,
                    uploadType: UploadHelper.uploadType.trainingContentImage,
                });
                input.images = [{ url: imageUrl }];
            }

            if (file) {
                const fileUrl = await UploadHelper.uploadDocument({
                    data: file,
                    folderName: `file-content`,
                    fileName: `file_${Date.now()}`,
                    uploadType: UploadHelper.uploadType.trainingContentFile,
                });
                input.files = [{ url: fileUrl }];
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
            return savedContent;
        } catch (error) {
            console.log("error", error);
            throw CustomError(ErrorName.FAILED, `${error.message}`);
        }
    },

    updateTrainingModuleContent: async ({ input, scorm, thumbnail, image, video, audio, file }, context) => {
        const { userId, subscriberId } = AuthUser(context);

        const scormFile = scorm ? await scorm : null;
        const thumbnailFile = thumbnail ? await thumbnail : null;
        const imageFile = image ? await image : null;
        const videoFile = video ? await video : null;
        const audioFile = audio ? await audio : null;
        const fileFile = file ? await file : null;

        let pptSlides = 0;

        const allowedFileFormats = ['pdf', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'gif', 'mp3', 'mp4', 'wav', 'zip'];

        const validateFileFormat = async (mediaFile) => {
            const fileExtension = typeof mediaFile.filename === 'string' ? mediaFile.filename.split('.').pop().toLowerCase() : '';

            if (fileExtension === 'ppt' || fileExtension === 'pptx') {
                const readStream = mediaFile.createReadStream();
                const pptData = new pptx2json(readStream);
                const pptSlides = pptData.slides ? pptData.slides.length : 0;

                console.log("pptData", pptData);
                console.log("Total Slides:", pptSlides);

            }
            return allowedFileFormats.includes(fileExtension);
        };

        if (scormFile && !validateFileFormat(scormFile)) {
            throw CustomError(ErrorName.INVALID_FILE_FORMAT, 'Invalid SCORM file format');
        }

        if (thumbnailFile && !validateFileFormat(thumbnailFile)) {
            console.log("thumbnail", thumbnailFile);
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

        const existingContent = await TrainingModuleContent.findOne({
            $or: input.title.map(x => ({
                "title.value": { $regex: x.value.trim(), $options: "i" },
            })),
            _id: { $ne: input._id }
        }).lean().select("_id");

        if (existingContent) {
            throw CustomError(ErrorName.CONTENT_ALREADY_EXIST);
        }

        if (!input.contentStatus || input.contentStatus === Content_status.DRAFT) {
            input.contentStatus = input?.contentType !== ContentType.QUIZ ? Content_status.PUBLISHED : Content_status.DRAFT;
        }

        // const existingContent = await TrainingModuleContent.findOne({
        //     _id: input._id ?? undefined,
        //     subscriber: subscriberId,
        //     UID: input.UID ?? undefined
        // });

        // if (!existingContent) {
        //     throw CustomError(ErrorName.CONTENT_NOT_FOUND);
        // }

        if (input.duration) {
            const durationStyleChecked = TrainingModuleContentHelper.checkDurationStyle(input.duration);
            if (!durationStyleChecked) {
                throw CustomError(ErrorName.INVALID_DURATION_FORMAT);
            }
        }

        let updateData = {
            title: input.title,
            description: input.description,
            contentType: input.contentType,
            contentStatus: input.contentStatus,
            duration: input.duration,
            displayPosition: input.displayPosition,
            isActive: input.isActive,
            updatedBy: userId,
            updatedAt: new Date(),
            videos: existingContent.videos,
            audios: existingContent.audios,
            images: existingContent.images,
            files: existingContent.files,
            scorm: existingContent.scorm,
            thumbnail: existingContent.thumbnail,
            version: existingContent.version ? existingContent.version : 1,
            UID: existingContent.UID
        };
        let isUpdated = false;
        let isMediaUpdated = false;

        console.log("Existing")

        const fieldsToCheck = [
            "title",
            "description",
            "contentType",
            "contentStatus",
            "duration",
            "displayPosition",
            "isActive"
        ];

        for (const field of fieldsToCheck) {
            if (JSON.stringify(input[field]) !== JSON.stringify(existingContent[field])) {
                console.log("input field", input[field]);
                console.log("existing field", existingContent[field]);
                console.log("yes");
                isUpdated = true;
                break;
            }
        }

        try {
            if (thumbnail === null) {
                updateData.thumbnail = null;
                isUpdated = true;
            } else if (thumbnail) {
                const thumbnailUrl = await UploadHelper.uploadImage({
                    data: thumbnail,
                    folderName: `image-content-${existingContent._id}`,
                    fileName: `image_${Date.now()}`,
                    uploadType: UploadHelper.uploadType.trainingContentImage,
                });
                updateData.thumbnail = thumbnailUrl;
                isUpdated = true;
                isMediaUpdated = true;
            }
            console.log("thumbnail");
            if (video) {
                const videoUrl = await UploadHelper.uploadVideo({
                    data: video,
                    folderName: `video-content-${existingContent._id}`,
                    fileName: `video_${Date.now()}`,
                    uploadType: UploadHelper.uploadType.trainingContentAudio,
                });
                updateData.videos = [{ url: videoUrl }];
                updateData.audios = [];
                updateData.images = [];
                updateData.files = [];
                updateData.scorm = null;
                isUpdated = true;
                isMediaUpdated = true;
            }
            console.log("video");
            if (audio) {
                const audioUrl = await UploadHelper.uploadAudio({
                    data: audio,
                    folderName: `audio-content-${existingContent._id}`,
                    fileName: `audio_${Date.now()}`,
                    uploadType: UploadHelper.uploadType.trainingContentAudio,
                });
                updateData.audios = [{ url: audioUrl }]
                updateData.videos = [];
                updateData.images = [];
                updateData.files = [];
                updateData.scorm = null;
                isUpdated = true;
                isMediaUpdated = true;
            }
            console.log("audio");
            if (image) {
                const imageUrl = await UploadHelper.uploadImage({
                    data: image,
                    folderName: `image-content-${existingContent._id}`,
                    fileName: `image_${Date.now()}`,
                    uploadType: UploadHelper.uploadType.trainingContentImage,
                });
                updateData.images = [{ url: imageUrl }];
                updateData.videos = [];
                updateData.audios = [];
                updateData.files = [];
                updateData.scorm = null;
                isUpdated = true;
                isMediaUpdated = true;
            }
            console.log("image");
            if (file) {
                const fileUrl = await UploadHelper.uploadDocument({
                    data: file,
                    folderName: `file-content-${existingContent._id}`,
                    fileName: `file_${Date.now()}`,
                    uploadType: UploadHelper.uploadType.trainingContentFile,
                });
                updateData.files = [{ url: fileUrl }];
                updateData.videos = [];
                updateData.images = [];
                updateData.audios = [];
                updateData.scorm = null;
                isUpdated = true;
                isMediaUpdated = true;
            }
            console.log("file");
            if (scorm) {
                let courseInfo = await ScromHelper.uploadToScormCloud(scorm);

                if (courseInfo) {
                    const { filename } = await scorm;
                    updateData.scorm = {
                        courseId: courseInfo.courseId,
                        type: "CLOUD",
                        fileName: filename
                    }
                }
                isUpdated = true;
                isMediaUpdated = true;
            }
            let savedContent = null;
            if (isMediaUpdated) {
                updateData.version = updateData.version + 1;
                updateData.modifiedDate = new Date();

                const savedContentData = new TrainingModuleContent({
                    ...updateData,
                    subscriber: subscriberId,
                });
                savedContent = await savedContentData.save();
            } else {
                savedContent = await TrainingModuleContent.findOneAndUpdate(
                    { _id: existingContent._id, subscriber: subscriberId },
                    { $set: updateData },
                    { new: true, setDefaultsOnInsert: true, runValidators: true }
                );
            }
            return {
                success: true,
                message: "Content updated successfully.",
                updatedContent: savedContent,
                isUpdated,
            };
        } catch (error) {
            console.log("error", error);
            throw CustomError(ErrorName.FAILED, `${error.message}`);
        }
    },
};