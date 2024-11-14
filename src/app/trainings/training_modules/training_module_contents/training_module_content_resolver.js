const { CustomError, ErrorName, AuthUser, DbTransactionHelper, UploadHelper } = require("../../../../util");

const { TrainingModuleContent } = require("./training_module_content_model");
const { AnswerChoice } = require("./question/answer_choice_model");
const { Question } = require("./question/question_model");

const TrainingModuleContentHelper = require("./training_module_content_helper");
const SubRoleHelper = require("../../../user/sub-roles/sub_role_helper");
const LogHelper = require("../../../logs/log_helper");

const Permission = require("../../../user/sub-roles/permission");
const { ObjectId } = require("../../../../tools");
const Content_status = require("./content_status.json");
const ContentType = require("./content_type.json");
const AwsHelper = require("../../../../util/aws_helper");
const ScromHelper = require("../../scrom_helper")
const PptxGenJS = require('pptxgenjs');
const pdfParse = require('pdf-parse');
const { TrainingContentBridge } = require("../../training_content_bridge/training_content_model");

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
        const limitContent = pageInput?.limit ?? 50;

        const contentUsageCounts = await TrainingContentBridge.aggregate([
            { $match: { isDeleted: false } },
            { $group: { _id: "$trainingContent", featuredInCourses: { $sum: 1 } } }
        ]);

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
                {
                    $unwind: "$createdBy",
                },
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
                {
                    $unwind: "$updatedBy",
                },
                {
                    $lookup: {
                        from: "trainingcontentbridges",
                        localField: "_id",
                        foreignField: "trainingContent",
                        as: "courseUsage"
                    }
                },
                {
                    $addFields: {
                        featuredInCourses: {
                            $size: {
                                $filter: {
                                    input: contentUsageCounts,
                                    as: "count",
                                    cond: { $eq: ["$$count._id", "$_id"] }
                                }
                            }
                        }
                    }
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
                limitContent,
                sort: { createdAt: "descending" },
                customLabels: {
                    docs: "contents",
                    totalDocs: "totalCount",
                    offset: "skip",
                },
                pagination: limitContent !== 0,
                allowDiskUse: true,
            }
        );
        if (!contents) {
            return {
                contents: [],
                totalCount: 0,
            };
        }

        return contents;
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
                select: "id title"
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

    updateTrainingModuleContentStatus: async ({ ids, newStatus }, context) => {
        const { userId, subscriberId } = AuthUser(context);
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
        const { userId, subscriberId } = AuthUser(context);
        const invalidDeletes = [];

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
            } catch (error) {
                invalidDeletes.push({
                    id,
                    reason: `Error deleting content: ${error.message}`,
                });
            }
        }

        return {
            success: invalidDeletes.length === 0,
            message: invalidDeletes.length === 0
                ? "All content deleted successfully."
                : "Some content could not be deleted.",
            invalidDeletes,
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

            const allowedFileFormats = ['pdf', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'mp3', 'mp4', 'wav', 'zip'];

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
            throw Error(error.message);
        }
    },

    createTrainingModuleContentQuiz: async ({ input }, context) => {
        const { userId, subscriberId } = AuthUser(context);

        try {
            const { title, description, questions = [], percentageCriteria } = input;

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

            return savedContent;
        } catch (error) {
            throw Error(error.message);
        }
    },

    updateTrainingModuleContent: async ({ input, scorm, thumbnail, image, video, audio, file }, context) => {
        const { userId, subscriberId } = AuthUser(context);
        try {
            const existingContent = await TrainingModuleContent.findOne({
                _id: input._id ?? undefined,
                subscriber: subscriberId,
                UID: input.UID ?? undefined
            });

            if (!existingContent) {
                throw CustomError(ErrorName.CONTENT_NOT_FOUND);
            }

            const usedInCourses = await TrainingContentBridge.find({ trainingContent: existingContent._id, isDeleted: false });

            const scormFile = scorm ? await scorm : null;
            const thumbnailFile = thumbnail ? await thumbnail : null;
            const imageFile = image ? await image : null;
            const videoFile = video ? await video : null;
            const audioFile = audio ? await audio : null;
            const fileFile = file ? await file : null;

            const allowedFileFormats = ['pdf', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'mp3', 'mp4', 'wav', 'zip'];

            const validateFileFormat = async (mediaFile) => {
                const fileExtension = typeof mediaFile.filename === 'string' ? mediaFile.filename.split('.').pop().toLowerCase() : '';
                return allowedFileFormats.includes(fileExtension);
            };

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
                createdBy: existingContent.createdBy,
                updatedBy: userId,
                updatedAt: new Date(),
                videos: existingContent.videos,
                audios: existingContent.audios,
                images: existingContent.images,
                files: existingContent.files,
                scorm: existingContent.scorm,
                thumbnail: existingContent.thumbnail,
                version: existingContent.version ? existingContent.version : 1,
                UID: existingContent.UID,
            };
            let isUpdated = false;
            let isMediaUpdated = false;

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
                    isUpdated = true;
                    break;
                }
            }

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
                updateData.isPublished = usedInCourses.length > 0 ? true : false;

                const savedContentData = new TrainingModuleContent({
                    ...updateData,
                    subscriber: subscriberId,
                });
                savedContent = await savedContentData.save();

                await TrainingModuleContent.findOneAndUpdate(
                    { _id: input._id, subscriber: subscriberId },
                    { $set: { isUpdated: true } }
                )
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
            throw Error(error.message);
        }
    },

    updateTrainingModuleContentQuiz: async ({ input }, context) => {
        const { userId, subscriberId } = AuthUser(context);

        try {
            const existingContent = await TrainingModuleContent.findOne({
                _id: input._id ?? undefined,
                subscriber: subscriberId,
                UID: input.UID ?? undefined,
                isUpdated: false
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
                input.percentageCriteria = Math.round((input.percentageCriteria / score) * 100);
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
    pushLatestContent: async ({ id }, context) => {

        const { subscriberId } = AuthUser(context);

        if (!id) throw CustomError(ErrorName.ARGUMENTS_REQUIRED);

        const inputContent = await TrainingModuleContent.findOne({
            _id: id,
            subscriber: subscriberId
        });

        if (!inputContent) {
            throw CustomError(ErrorName.NOT_FOUND);
        }

        const fetchCurrentContents = await TrainingContentBridge.find({})
            .populate("trainingContent")
            .lean();

        if (!fetchCurrentContents) {
            throw CustomError(ErrorName.NOT_FOUND);
        }

        const bridgesToUpdate = fetchCurrentContents
            .filter((content) => content.trainingContent && content.trainingContent.UID === inputContent.UID)
            .map((content) => content._id);

        let updateContent;
        if (bridgesToUpdate.length > 0) {
            updateContent = await TrainingContentBridge.updateMany(
                { _id: { $in: bridgesToUpdate } },
                { trainingContent: inputContent._id }
            );
        }

        if (!updateContent) {
            throw CustomError(ErrorName.FAILED);
        }

        await TrainingModuleContent.findOneAndUpdate(
            { _id: id, subscriber: subscriberId },
            { $set: { isPublished: false } }
        );

        return {
            status: 1,
            message: "New content pushed to lessons successfully.",
        }
    }
};