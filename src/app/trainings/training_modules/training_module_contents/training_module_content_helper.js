const { ObjectId } = require("../../../../tools");
const { CustomError, ErrorName, AuthUser, UploadHelper } = require("../../../../util");

const { TrainingModuleContent } = require("./training_module_content_model");
const CounterHelper = require("../../../counters/counter_helper");

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

module.exports = {
    checkDurationStyle,
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
};
