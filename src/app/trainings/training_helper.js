const { ObjectId } = require("../../tools");
const { CustomError, ErrorName, AuthUser, UploadHelper, DbTransactionHelper } = require("../../util");
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
const TrainingCertificateHelper = require("../training-registrations/training-certificates/training_certificate_helper");
const { TrainingModuleContent } = require("./training_modules/training_module_contents/training_module_content_model");
const { QuizEvaluation } = require("../quizzes/quiz-attempts/quiz_evaluation_model");
const { TrainingContentBridge } = require("./training_content_bridge/training_content_model");


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

//     const overallIds = input.map((item) => item.overallId);
//     let overallDocs;
//     if (overallIds.length > 0) {
//         overallDocs = await OverallTrainingProgress.find({
//             _id: { $in: overallIds },
//         }).lean();
//     }

//     const overallMap = new Map(overallDocs.map((doc) => [doc._id.toString(), doc]));

//     const errors = [];
//     const missingOverallEntries = [];

//     for (const item of input) {

//         const { overallId, trainingModule, contentDetails } = item;

//         const overallDoc = overallMap.get(overallId.toString());

//         if (!overallDoc) {
//             errors.push({
//                 overallId,
//                 error: `Training not found in contentData`,
//             });
//             continue;
//         }

//         let matchingContentData;
//         if (overallDoc) {
//             matchingContentData = overallDoc.contentData?.find(
//                 (data) => data.moduleId.toString() == trainingModule
//             );
//         }

//         if (!matchingContentData) {

//             missingOverallEntries.push({
//                 updateOne: {
//                     filter: { _id: overallId },
//                     update: {
//                         status: "IN_PROGRESS",
//                         $push: {
//                             contentData: {
//                                 moduleId: trainingModule,
//                                 contentIds: contentDetails.map((content) => content.contentId),
//                             },
//                         },
//                     },
//                     upsert: true,
//                 },
//             });

//             continue;
//         }

//         if (matchingContentData) {
//             for (const content of contentDetails) {

//                 console.log('content');
//                 console.log(content);

//                 const missingContentIds = contentDetails
//                     .map((content) => content.contentId.toString())
//                     .filter(
//                         (contentId) =>
//                             !matchingContentData.contentIds.map((id) => id.toString()).includes(contentId)
//                     );

//                 if (missingContentIds.length > 0) {
//                     errors.push({
//                         overallId,
//                         contentId: content.contentId,
//                         error: `Content ID ${content.contentId} not found in contentIds for the module`,
//                     });
//                     continue;
//                 }
//             }
//         }

//     }

//     if (missingOverallEntries.length > 0) {
//         await OverallTrainingProgress.bulkWrite(missingOverallEntries);
//     }

//     return errors;
// };

const validateAndUpdateContentData = async (input) => {

    const overallIds = input.map((item) => item.overallId);
    let overallDocs;

    if (overallIds.length > 0) {
        overallDocs = await OverallTrainingProgress.find({
            _id: { $in: overallIds },
        }).lean();
    }

    const trainingIds = overallDocs.map((doc) => doc.training);

    if (!overallDocs.contentData || overallDocs.contentData.length == 0) {

        if (trainingIds.length > 0) {
            const fetchModuleContents = await TrainingContentBridge.find({
                training: { $in: trainingIds },
            })

            if (fetchModuleContents.length > 0) {

                const bulkOperations = [];
                fetchModuleContents.forEach((content) => {
                    bulkOperations.push({
                        updateOne: {
                            filter: { _id: content.training },
                            update: {
                                status: "IN_PROGRESS",
                                $push: {
                                    contentData: {
                                        moduleId: content.trainingModule,
                                        contentIds: [content.trainingContent],
                                    },
                                },
                            },
                            upsert: true,
                        },
                    });
                });

            }
        }

    }


    const overallMap = new Map(overallDocs.map((doc) => [doc._id.toString(), doc]));

    const errors = [];
    const missingOverallEntries = [];

    for (const item of input) {

        const { overallId, trainingModules } = item;

        const overallDoc = overallMap.get(overallId.toString());

        if (!overallDoc) {
            errors.push({
                overallId,
                error: `Training not found for overallId`,
            });
            continue;
        }

        for (const trainingModule of trainingModules) {
            const { moduleId, contentDetails } = trainingModule;

            let matchingModuleData;
            if (overallDoc) {
                matchingModuleData = overallDoc.contentData?.find(
                    (data) => data.moduleId.toString() == moduleId
                );
            }

            if (!matchingModuleData) {



                missingOverallEntries.push({
                    updateOne: {
                        filter: { _id: overallId },
                        update: {
                            status: "IN_PROGRESS",
                            $push: {
                                contentData: {
                                    moduleId,
                                    contentIds: contentDetails.map((content) => content.contentId),
                                },
                            },
                        },
                        upsert: true,
                    },
                });

                continue;
            }

            for (const content of contentDetails) {

                const { contentId } = content;

                const isContentPresent = matchingModuleData.contentIds
                    .map((id) => id.toString())
                    .includes(contentId.toString());

                if (!isContentPresent) {
                    errors.push({
                        overallId,
                        moduleId,
                        contentId,
                        error: `Content ID ${contentId} not found in contentIds for the module ${moduleId}`,
                    });
                }

            }
        }
    }

    if (missingOverallEntries.length > 0) {
        await OverallTrainingProgress.bulkWrite(missingOverallEntries);
    }

    return errors;
};

const validateAndGenerateCertificate = async (updateTrainingProgress, trainingRegMap, overallDocs, session) => {

    if (updateTrainingProgress && trainingRegMap && overallDocs) {

        const trainingRegistrationIds = overallDocs
            .map((doc) => trainingRegMap.get(doc._id.toString()))
            .filter(Boolean);

        const allTrainingProgresses = await TrainingProgress.find({
            trainingRegistration: { $in: trainingRegistrationIds },
        }).lean();

        const trainingProgressMap = new Map();
        allTrainingProgresses.forEach((progress) => {
            const trainingRegistrationStr = progress.trainingRegistration.toString();
            if (!trainingProgressMap.has(trainingRegistrationStr)) {
                trainingProgressMap.set(trainingRegistrationStr, []);
            }
            trainingProgressMap.get(trainingRegistrationStr).push(progress);
        });

        const registrationsForCertificates = [];

        for (const overallDoc of overallDocs) {

            const mandatoryModulesCount = overallDoc.mandatoryModules ?? 0;

            if (mandatoryModulesCount > 0) {

                const trainingRegistration = trainingRegMap.get(overallDoc._id.toString());

                if (trainingRegistration) {

                    const trainingRegistrationStr = trainingRegistration.toString();
                    const trainingProgresses = trainingProgressMap.get(trainingRegistrationStr) || [];

                    const completedProgresses = trainingProgresses.filter(
                        (progress) => progress.progressPercentage === 100
                    );

                    if (completedProgresses.length >= mandatoryModulesCount) {
                        registrationsForCertificates.push(trainingRegistration);
                    }
                }
            }
        }

        // if (registrationsForCertificates.length > 0) {
        //     await TrainingCertificateHelper.generateCertificateBulk(registrationsForCertificates, session);
        // }

    }

}

const updateTrainingProgress = async (input, userId) => {

    const overallIds = input.map((item) => item.overallId);

    if (overallIds.length == 0) return;


    const overallDocs = await OverallTrainingProgress.find({
        _id: { $in: overallIds },
    }).lean();

    if (overallDocs.length == 0) return;

    const trainingRegMap = new Map(
        overallDocs.map((doc) => [doc._id.toString(), doc.trainingRegistration])
    );

    const trainingRegistrationIds = [];
    const contentIds = new Set();
    let trainingProgressDocs;

    input.forEach((item) => {
        const trainingRegistration = trainingRegMap.get(item.overallId.toString());

        if (trainingRegistration) {
            trainingRegistrationIds.push(trainingRegistration);
            item.trainingModules.forEach((module) => {
                module.contentDetails.forEach((content) => {
                    contentIds.add(content.contentId);
                });
            });
        }
    });

    trainingProgressDocs = await TrainingProgress.find({
        trainingRegistration: { $in: trainingRegistrationIds },
        trainingModuleContent: { $in: [...contentIds] },
    }).lean();

    let trainingProgressMap;

    if (trainingProgressDocs) {
        trainingProgressMap = new Map(
            trainingProgressDocs.map((doc) => [
                `${doc.trainingRegistration}_${doc.trainingModuleContent}`,
                doc,
            ])
        );
    }

    const bulkOps = [];

    input.forEach((item) => {

        const trainingRegistration = trainingRegMap.get(item.overallId.toString());

        if (!trainingRegistration) return;

        item.trainingModules.forEach((module) => {

            module.contentDetails.forEach((content) => {
                const progressKey = `${trainingRegistration}_${content.contentId}`;
                const existingProgress = trainingProgressMap?.get(progressKey);

                if (existingProgress) {

                    bulkOps.push({
                        updateOne: {
                            filter: { _id: existingProgress._id },
                            update: {
                                $set: {
                                    contentStatus: content.contentStatus,
                                    lastAccessedDuration: content.duration,
                                    progressPercentage: content.progressPercentage,
                                    playerSettings: content.playerSettings,
                                },
                            },
                        },
                    });

                } else {

                    bulkOps.push({
                        insertOne: {
                            document: {
                                trainingRegistration,
                                trainingModule: module.moduleId,
                                trainingModuleContent: ObjectId(content.contentId),
                                contentStatus: content.contentStatus,
                                lastAccessedDuration: content.duration,
                                progressPercentage: content.progressPercentage,
                                playerSettings: content.playerSettings,
                                status: "IN_PROGRESS",
                            },
                        },
                    });

                }
            });
        });

    });

    const evaluationData = input.flatMap(overall =>
        overall.trainingModules.flatMap(module =>
            module.contentDetails.filter(content => content.questionAnswers && content.questionAnswers.length > 0)
                .map(content => ({
                    contentId: content.contentId,
                    trainingModuleId: module.moduleId,
                    overallId: overall.overallId,
                    questionAnswers: content.questionAnswers
                }))
        )
    );

    let errors = [];
    const quizResults = await quizEvaluationBulk(evaluationData, userId, errors);

    if (errors.length > 0) {
        console.log(errors[0]);
    }

    const updatedTraining = await DbTransactionHelper.performDbTransaction(async session => {

        let updateTrainingProgress;
        if (bulkOps.length > 0) {
            updateTrainingProgress = await TrainingProgress.bulkWrite(bulkOps, { session });
        }

        // const generatedTrainingCertificate = await validateAndGenerateCertificate(updateTrainingProgress, trainingRegMap, overallDocs, session);

    });


    return { updatedCount: bulkOps.length };
};

const quizEvaluationBulk = async (evaluationData, userId, errors) => {
    try {

        const overallIds = evaluationData.map(data => data.trainingId);

        if (overallIds.length == 0) {
            errors.push("No overallId found in evaluationData");
            return;
        }

        const overallTrainingProgress = await OverallTrainingProgress.find({
            _id: { $in: overallIds }
        }).lean();

        if (!overallTrainingProgress) {
            errors.push("Overall training progress data not found!");
            return;
        }

        const overallIdToTrainingIdMap = overallTrainingProgress.reduce((acc, doc) => {
            acc[doc._id.toString()] = doc.training.toString();
            return acc;
        }, {});

        const contentIds = evaluationData.map(data => data.contentId);
        const trainingModuleIds = evaluationData.map(data => data.trainingModuleId);
        const trainingIds = evaluationData.map(data => overallIdToTrainingIdMap[data.trainingId]);

        if (contentIds.length == 0 || trainingModuleIds.length == 0 || trainingIds.length == 0) {
            errors.push("No contentId, trainingModuleId or trainingId found in evaluationData");
            return;
        }

        const trainingModuleContents = await TrainingModuleContent.find({
            _id: { $in: contentIds }
        }).populate({
            path: "quiz",
            model: "Question"
        }).lean();

        const trainingModules = await TrainingModule.find({
            _id: { $in: trainingModuleIds }
        }).lean();

        const trainings = await Training.find({
            _id: { $in: trainingIds }
        }).lean();

        if (!trainingModuleContents || !trainings || !trainingModules) {
            errors.push("No contentId, trainingModuleId or trainingId found");
            return;
        }

        const results = [];

        for (const data of evaluationData) {

            const { contentId, trainingModuleId, trainingId, questionAnswers } = data;

            const trainingModuleContent = trainingModuleContents.find(content => content._id.toString() === contentId.toString());
            const trainingModule = trainingModules.find(module => module._id.toString() === trainingModuleId.toString());
            const training = trainings.find(training => training._id.toString() === trainingId.toString());

            if (!trainingModuleContent || !trainingModule || !training) {
                continue;
            }

            let totalScore = 0;
            let acquiredScore = 0;
            let skippedQuestions = 0;
            let isPassed = false;

            const filteredQuestionAnswers = questionAnswers?.filter(el => {
                if (Array.isArray(el?.answer)) {
                    return el.answer.some(ans => ans && ans.trim() !== "");
                }
                return (
                    el?.answer &&
                    el.answer !== "" &&
                    el.answer !== null &&
                    el.answer !== undefined
                );
            }) || [];

            const questionResults = trainingModuleContent.quiz.map(question => {

                const userAnswer = filteredQuestionAnswers?.find(
                    ans => ans.questionId.toString() === question._id.toString()
                );

                totalScore += question.points;

                if (!userAnswer || !userAnswer.answer || userAnswer.answer.length === 0) {
                    skippedQuestions += 1;

                    return {
                        questionId: question._id,
                        question: question.question,
                        givenAnswer: null,
                        correctAnswer: question.answerKey,
                        isCorrectAnswer: false,
                        points: question.points,
                        negativePoints: question.negativePoints,
                        isSkipped: true,
                    };
                }

                const isCorrectAnswer =
                    question.answerKey.every(correctAnswer =>
                        userAnswer.answer.includes(correctAnswer)
                    ) && userAnswer.answer.length === question.answerKey.length;

                if (isCorrectAnswer) {
                    acquiredScore += question.points;
                } else {
                    acquiredScore -= question.negativePoints;
                }

                return {
                    questionId: question._id,
                    question: question.question,
                    givenAnswer: userAnswer.answer,
                    correctAnswer: question.answerKey,
                    isCorrectAnswer,
                    points: question.points,
                    negativePoints: question.negativePoints,
                    isSkipped: false,
                };
            });

            const scorePercentage = totalScore
                ? Math.max((acquiredScore / totalScore) * 100, 0).toFixed(2)
                : 0;

            isPassed = scorePercentage >= trainingModuleContent?.percentageCriteria;

            const quizEvaluation = new QuizEvaluation({
                contentId,
                trainingModuleId,
                trainingId,
                userId,
                attended: filteredQuestionAnswers.length,
                totalQuestions: trainingModuleContent.quiz.length,
                totalPoints: totalScore,
                acquiredMarks: acquiredScore,
                percentage: scorePercentage,
                skippedQuestions,
                isPassed,
                attendedQuestions: questionResults,
            });

            await quizEvaluation.save();
            results.push(quizEvaluation);
        }

        return results;

    } catch (error) {
        console.error("Error evaluating quiz in bulk:", error);
    }
};

module.exports = {
    uploadTrainingImages,
    updateTrainingProgress,
    validateAndUpdateContentData,
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
