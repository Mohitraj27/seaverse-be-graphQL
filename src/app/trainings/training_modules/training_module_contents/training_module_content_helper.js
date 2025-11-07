const { ObjectId } = require("../../../../tools");
const { CustomError, ErrorName, AuthUser, UploadHelper } = require("../../../../util");

const { TrainingModuleContent } = require("./training_module_content_model");
const CounterHelper = require("../../../counters/counter_helper");
const { TrainingContentBridge } = require("../../training_content_bridge/training_content_model");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { Training} = require("../../training_model");
const mongoose = require("mongoose");
const uploadTrainingModuleContentVideos = async ({ videos, folderName }) => {
    const trainingModuleContentVideos = [];

    for (const item of videos) {
        item._id = item._id ?? ObjectId();

        const savedItem = await UploadHelper.uploadVideo({
            data: item.url,
            folderName: folderName ?? "training-content-video",
            fileName: `video_${item._id}_${Date.now()}`,
            uploadType: UploadHelper.uploadType.trainingContentVideo,
        });

        if (savedItem) {
            trainingModuleContentVideos.push({
                _id: item._id,
                lang: item.lang,
                url: savedItem,
            });
        }
    }

    return trainingModuleContentVideos;
};

const uploadTrainingModuleContentAudios = async ({ audios, folderName }) => {
    const trainingModuleContentAudios = [];

    for (const item of audios) {
        item._id = item._id ?? ObjectId();

        const savedItem = await UploadHelper.uploadAudio({
            data: item.url,
            folderName: folderName ?? "training-content-audio",
            fileName: `audio_${item._id}_${Date.now()}`,
            uploadType: UploadHelper.uploadType.trainingContentAudio,
        });

        if (savedItem) {
            trainingModuleContentAudios.push({
                _id: item._id,
                lang: item.lang,
                url: savedItem,
            });
        }
    }

    return trainingModuleContentAudios;
};

const uploadTrainingModuleContentImages = async ({ images, folderName }) => {
    const trainingModuleContentImages = [];

    for (const item of images) {
        item._id = item._id ?? ObjectId();

        const savedItem = await UploadHelper.uploadImage({
            data: item.url,
            folderName: folderName ?? "training-content-image",
            fileName: `image_${item._id}_${Date.now()}`,
            uploadType: UploadHelper.uploadType.trainingContentImage,
        });

        if (savedItem) {
            trainingModuleContentImages.push({
                _id: item._id,
                lang: item.lang,
                url: savedItem,
            });
        }
    }

    return trainingModuleContentImages;
};

const uploadTrainingModuleContentFiles = async ({ files, folderName }) => {
    const trainingModuleContentFiles = [];

    for (const item of files) {
        item._id = item._id ?? ObjectId();

        const savedItem = await UploadHelper.uploadDocument({
            data: item.url,
            folderName: folderName ?? "training-content-files",
            fileName: `file_${item.id}_${Date.now}`,
            uploadType: UploadHelper.uploadType.trainingContentFile,
        });

        if (savedItem) {
            trainingModuleContentFiles.push({
                _id: item._id,

                url: savedItem,
            });
        }
    }
    return trainingModuleContentFiles;
};

const checkDurationStyle = duration => {
    if (typeof duration === "string") {
        const timeFormat = /^([0-9]{2}):([0-5][0-9]):([0-5][0-9])$/;
        return timeFormat.test(duration);
    }
    return false;
};

const generateContentUID = async ({ session }) => {
    const savedCounter = await CounterHelper.updateCounter({
        modelName: TrainingModuleContent.modelName,
        session,
    });

    if (!savedCounter) throw CustomError(ErrorName.FAILED);

    return `CONTENT-${savedCounter.count}`;
};

const convertDurationToMinutes = (duration) => {
    const [hours, minutes, seconds] = duration.split(":");
    return Number(hours) * 60 + Number(minutes) + Number(seconds) / 60;
}

module.exports = {
    checkDurationStyle,
    convertDurationToMinutes,
    generateContentUID,
    uploadTrainingModuleContentVideos,
    uploadTrainingModuleContentAudios,
    uploadTrainingModuleContentImages,
    uploadTrainingModuleContentFiles,
    createOrUpdateTrainingModuleContent: async ({ input, session }, context) => {
        const { userId, subscriberId } = AuthUser(context);

        const trainingModuleContentFilterConditions = {
            _id: input._id ?? ObjectId(),
            subscriber: subscriberId,
        };

        const trainingModuleContentUpdateData = {};

        if (input.contentType) trainingModuleContentUpdateData.contentType = input.contentType;
        if (input.duration) trainingModuleContentUpdateData.duration = input.duration;

        if (input.quiz) trainingModuleContentUpdateData.quiz = input.quiz;
        if (input.quizContent) {
            trainingModuleContentUpdateData.title = undefined;
            trainingModuleContentUpdateData.description = undefined;
            trainingModuleContentUpdateData.quiz = undefined;
            trainingModuleContentUpdateData.quizContent = input.quizContent;
        }

        else {
            if (input.title) trainingModuleContentUpdateData.title = input.title;
            if (input.description) trainingModuleContentUpdateData.description = input.description;
        }

        if (input.videos) {
            trainingModuleContentUpdateData.videos = await uploadTrainingModuleContentVideos({
                videos: input.videos,
                folderName: trainingModuleContentFilterConditions._id,
            });
        }

        if (input.audios) {
            trainingModuleContentUpdateData.audios = await uploadTrainingModuleContentAudios({
                audios: input.audios,
                folderName: trainingModuleContentFilterConditions._id,
            });
        }

        if (input.images) {
            trainingModuleContentUpdateData.images = await uploadTrainingModuleContentImages({
                images: input.images,
                folderName: trainingModuleContentFilterConditions._id,
            });
        }

        if (input.files) {
            trainingModuleContentUpdateData.files = await uploadTrainingModuleContentFiles({
                files: input.files,
                folderName: trainingModuleContentFilterConditions._id,
            });
        }
        if (input.text) trainingModuleContentUpdateData.text = input.text;


        if (input.displayPosition)
            trainingModuleContentUpdateData.displayPosition = input.displayPosition;
        if (typeof input.isActive === "boolean")
            trainingModuleContentUpdateData.isActive = input.isActive;

        const savedTrainingModuleContent = await TrainingModuleContent.findOneAndUpdate(
            trainingModuleContentFilterConditions,
            {
                ...trainingModuleContentFilterConditions,
                ...trainingModuleContentUpdateData,
                $setOnInsert: {
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
        );

        if (!savedTrainingModuleContent) throw CustomError(ErrorName.FAILED);
        return savedTrainingModuleContent;
    },

     getPresignedUrlHelper : async (fileName, fileType) => {
        try {
            
    
            if (!fileName || !fileType) {
                throw CustomError(ErrorName.BAD_REQUEST, "Missing fileName or fileType");
            } 
           
            const s3 = new S3Client({
                region: process.env.AWS_REGION,
                credentials: {
                    accessKeyId: process.env.AWS_ACCESS_KEY,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                },
            });
    
            const videoFileKey = `training-contents/video-content/videos/${Date.now()}_${fileName}`;
            const pptPdfFileKey = `training-contents/ppt-pdf-content/files/${Date.now()}_${fileName}`;
    
            const command = new PutObjectCommand({
                Bucket: process.env.S3_BUCKET,
                Key: fileType?.split("/")?.[0] === "video" ? videoFileKey : pptPdfFileKey,
                ContentType: fileType,
            });
    
            const url = await getSignedUrl(s3, command, { expiresIn: 60 * 5 });

            return { url, key: fileType?.split("/")?.[0] === "video" ? videoFileKey : pptPdfFileKey };
        } catch (err) {
            console.error(err);
            throw  CustomError(ErrorName.INTERNAL_SERVER_ERROR, "Failed to generate presigned URL");
        }
    },
    createOrUpdateTrainingModuleContentInTrainingCreation: async ({ input, session }, context) => {

        let updateTrainingBridge;
        let trainingModuleContentUpdateData = [];
        let trainingModuleIds = [];
        const trainingModuleContentBulkOperations = input.trainingModules.map((module) => {
            if (module.trainingModuleContents) trainingModuleContentUpdateData.push(...module.trainingModuleContents);
            if (module._id) trainingModuleIds.push(module._id);
        });

        if (trainingModuleContentUpdateData.length > 0) {

            const existingContentBridges = await TrainingContentBridge.find(
                {
                    training: input.training,
                    trainingModule: { $in: trainingModuleIds },
                },
                { trainingModule: 1, trainingContent: 1, isDeleted: 1 }
            ).lean();

            const existingContentMap = new Map();
            if (existingContentBridges) {
                existingContentBridges.forEach(doc => {
                    const key = `${doc.trainingModule}_${doc.trainingContent}`;
                    existingContentMap.set(key, doc);
                });
            }

            const trainingContentBridgeBulkOperations = [];

            for (const module of input.trainingModules) {
                const moduleId = module._id;

                module.trainingModuleContents.forEach((contentId, index) => {
                    const key = `${moduleId}_${contentId}`;
                    if (!existingContentMap.has(key)) {
                        trainingContentBridgeBulkOperations.push({
                            updateOne: {
                                filter: {
                                    training: input.training,
                                    trainingModule: moduleId,
                                    trainingContent: contentId,
                                },
                                update: {
                                    $setOnInsert: { isDeleted: false, order: index + 1 },
                                },
                                upsert: true,
                            },
                        });
                    } else {
                        trainingContentBridgeBulkOperations.push({
                            updateOne: {
                                filter: {
                                    training: input.training,
                                    trainingModule: moduleId,
                                    trainingContent: contentId,
                                },
                                update: { $set: { isDeleted: false, order: index + 1 } },
                            },
                        });
                    }
                    existingContentMap.delete(key);
                });
            }

            existingContentMap.forEach(doc => {
                if (doc.isDeleted === false) {
                    trainingContentBridgeBulkOperations.push({
                        updateOne: {
                            filter: {
                                training: input.training,
                                trainingModule: doc.trainingModule,
                                trainingContent: doc.trainingContent,
                            },
                            update: { $set: { isDeleted: true } },
                        },
                    });
                }
            });

            updateTrainingBridge = await TrainingContentBridge.bulkWrite(trainingContentBridgeBulkOperations, { session });
        }

        return updateTrainingBridge;

    },
updateTrainingDurations: async (validTrainings) => {
    try {
        const trainingIds = [...new Set(validTrainings.map(v => v.training._id.toString()))];

        const allTrainingBridges = await TrainingContentBridge.find({
            training: { $in: trainingIds },
            isDeleted: false
        }).select('training trainingContent').lean();

        const allContentIds = [...new Set(allTrainingBridges.map(b => b.trainingContent.toString()))];

        const validContents = await TrainingModuleContent.find({
            _id: { $in: allContentIds },
            isDeleted: false,
            contentStatus: 'PUBLISHED'
        }).select('_id duration').lean();

        // Convert "1.35" / "12" / "0.32" / "00:01:35" → seconds
        const toSeconds = (durationValue) => {
            if (!durationValue) return 0;

            if (typeof durationValue === 'string' && durationValue.includes(':')) {
                const [hh = 0, mm = 0, ss = 0] = durationValue.split(':').map(Number);
                return hh * 3600 + mm * 60 + ss;
            }

            const str = durationValue.toString();
            let minutes = 0, seconds = 0;

            if (str.includes('.')) {
                const [minPart, secPart] = str.split('.');
                minutes = Number(minPart) || 0;
                seconds = Number(secPart.padEnd(2, '0')) || 0;
            } else {
                minutes = Number(str) || 0;
                seconds = 0;
            }

            return (minutes * 60) + seconds;
        };

        // Map content → seconds
        const contentDurationMap = validContents.reduce((acc, curr) => {
            acc[curr._id.toString()] = toSeconds(curr.duration);
            return acc;
        }, {});

        // Sum per training
        const trainingDurationMap = {};
        allTrainingBridges.forEach(bridge => {
            const trainingId = bridge.training.toString();
            const contentId = bridge.trainingContent.toString();
            const durationInSeconds = contentDurationMap[contentId] || 0;
            trainingDurationMap[trainingId] = (trainingDurationMap[trainingId] || 0) + durationInSeconds;
        });

        // Convert seconds → "M.SS" (like 1.35)
        const toDurationHoursFormat = (totalSeconds) => {
            const totalMinutes = Math.floor(totalSeconds / 60);
            const remainingSeconds = totalSeconds % 60;
            const result = `${totalMinutes}.${remainingSeconds.toString().padStart(2, '0')}`;
            return parseFloat(result);
        };

        const bulkUpdates = Object.entries(trainingDurationMap).map(([trainingId, totalSeconds]) => ({
            updateOne: {
                filter: { _id: trainingId },
                update: { $set: { durationHours: toDurationHoursFormat(totalSeconds) } },
            },
        }));

        if (bulkUpdates.length > 0) {
            await Training.bulkWrite(bulkUpdates);
        }

    } catch (error) {
        throw CustomError(ErrorName.FAILED_UPDATE_TRAINING_DURATION, error.message);
    }
}
}