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
const {sendNotifications} = require("../../util/firebase_helper");


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

const validateSyncOfflineData = async (data) => {

    let overallIds = data.map((item) => item.overallId);
    let errors = [];

    let overallProgresses = [];
    if (overallIds.length > 0) {
        overallProgresses = await OverallTrainingProgress.find({
            _id: { $in: overallIds },
        }).lean();
    }

    if (overallProgresses.length == 0) {
        errors.push(`Training not found`);
        return;
    }

    const overallProgressMap = new Map(
        overallProgresses.map((doc) => [doc._id.toString(), doc])
    );

    const moduleContentPairs = new Map();

    for (const entry of data) {

        const { overallId, trainingModules } = entry;
        const overallProgress = overallProgressMap.get(overallId.toString());

        if (!overallProgress) {
            errors.push(`Overall ID ${overallId} not found.`);
            continue;
        }

        for (const module of trainingModules) {

            const { moduleId, contentDetails } = module;

            const contentDataMatch = overallProgress.contentData?.find(
                (content) => content.moduleId.toString() == moduleId
            );

            for (const { contentId } of contentDetails) {

                const contentIdString = ObjectId(contentId);

                const contentDatasArray = Array.from(contentDataMatch.contentIds);

                if (
                    !contentDataMatch ||
                    !contentDatasArray.contentIds.includes(contentIdString)
                ) {

                    const key = `${moduleId}-${contentId}`;
                    if (!moduleContentPairs.has(key)) {
                        moduleContentPairs.set(key, { moduleId, contentId });
                    }
                }

            }

        }

    }

    if (moduleContentPairs.size > 0) {

        const queries = Array.from(moduleContentPairs.values());
        const trainingContentBridges = await TrainingContentBridge.find({
            $or: queries.map(({ moduleId, contentId }) => ({
                trainingModule: moduleId,
                trainingContent: contentId,
            })),
        }).lean();

        const foundPairs = new Set(
            trainingContentBridges.map(
                (doc) => `${doc.moduleId}-${doc.contentId}`
            )
        );

        for (const [key, { moduleId, contentId }] of moduleContentPairs) {

            if (!foundPairs.has(key)) {
                errors.push(
                    `Missing content ID ${contentId} for module ${moduleId}`
                );
            }
        }
    }

    return errors;

}

const addDataToOverallTrainingProgress = async (input, errors) => {

    const overallIds = input.map((item) => item.overallId);

    let overallDocs = [];
    if (overallIds.length > 0) {
        overallDocs = await OverallTrainingProgress.find({
            _id: { $in: overallIds },
        }).lean();
    }

    if (overallDocs.length == 0) {
        errors.push(`Training not found`);
        return;
    }

    const overallDocsWithNoContentData = overallDocs.filter((doc) => !doc.contentData || doc.contentData.length == 0);

    if (overallDocsWithNoContentData.length > 0) {

        const trainingIds = overallDocsWithNoContentData.map((doc) => doc.training);

        if (trainingIds.length == 0) {
            errors.push(`Training couldn't found`);
            return;
        }

        const fetchTrainingContents = await TrainingContentBridge.find({
            training: { $in: trainingIds },
        }).lean();

        if (fetchTrainingContents.length == 0) {
            errors.push(`Training content not found`);
            return;
        }

        let contentDataMap = new Map();

        let bulkOperations = [];

        for (const doc of overallDocsWithNoContentData) {

            const matchingContents = fetchTrainingContents.filter(
                (content) => content.training.toString() === doc.training.toString()
            );

            if (matchingContents.length > 0) {

                for (const content of matchingContents) {
                    const moduleId = content.trainingModule.toString();
                    const contentId = content.trainingContent.toString();

                    if (!contentDataMap.has(moduleId)) {
                        contentDataMap.set(moduleId, []);
                    }
                    contentDataMap.get(moduleId).push(contentId);
                }

                const contentData = Array.from(contentDataMap, ([moduleId, contentIds]) => ({
                    moduleId,
                    contentIds,
                }));

                bulkOperations.push({
                    updateOne: {
                        filter: { _id: doc._id },
                        update: { $set: { status: "IN_PROGRESS", contentData, startDate: new Date() } },
                    },
                });
            }
        }

        if (bulkOperations.length > 0) {
            await OverallTrainingProgress.bulkWrite(bulkOperations);
        }

    }

    const updateOverallTrainingProgress = [];
    for (const item of input) {

        const lastModule = item.trainingModules[item.trainingModules.length - 1];
        const lastContent = lastModule.contentDetails[lastModule.contentDetails.length - 1];

        updateOverallTrainingProgress.push({
            updateOne: {
                filter: { _id: item.overallId },
                update: { $set: { lastConsumedContent: { moduleId: lastModule.moduleId, contentId: lastContent.contentId } } }
            }
        })

    }

    if (updateOverallTrainingProgress.length > 0) {
        await OverallTrainingProgress.bulkWrite(updateOverallTrainingProgress);
    }

}
const calculateTrainingCompletion = (overallTrainingProgresses) => {

    return overallTrainingProgresses.map((otp) => {

        const moduleCompletionMap = {};

        const contentDataArray = Array.isArray(otp.contentData)
            ? otp.contentData
            : [otp.contentData];

        otp.trainingProgressData.forEach((progress) => {

            const moduleId = progress.trainingModule;

            if (!moduleCompletionMap[moduleId]) {
                moduleCompletionMap[moduleId] = true;
            }

            if (progress.status !== "COMPLETED") {
                moduleCompletionMap[moduleId] = false;
            }

        });

        const completedModulesCount = Object.values(moduleCompletionMap).filter(
            (isCompleted) => isCompleted
        ).length;

        const totalModules = new Set(contentDataArray.map((cd) => cd.moduleId)).size;

        const mandatoryModules = otp.mandatoryModules || totalModules;

        const isTrainingCompleted =
            completedModulesCount >= mandatoryModules || completedModulesCount === totalModules;

        return {
            overallTrainingProgressId: otp._id,
            completedModulesCount,
            totalModules,
            isTrainingCompleted,
        };
    });
};

function mergeTrainingData(data) {
    const mergedData = {};

    data.forEach(item => {
        const { _id, contentData, trainingProgressData } = item;

        if (!mergedData[_id]) {
            mergedData[_id] = {
                ...item,
                contentData: {},
                trainingProgressData: []
            };
        }

        mergedData[_id].trainingProgressData.push(...trainingProgressData);

        const { moduleId, contentIds } = contentData;
        if (!mergedData[_id].contentData[moduleId]) {
            mergedData[_id].contentData[moduleId] = [];
        }
        if (!mergedData[_id].contentData[moduleId].includes(contentIds)) {
            mergedData[_id].contentData[moduleId].push(contentIds);
        }
    });

    Object.values(mergedData).forEach(item => {
        item.contentData = Object.entries(item.contentData).map(([moduleId, contentIds]) => ({
            moduleId,
            contentIds
        }));
    });

    return Object.values(mergedData);
}

// const validateAndUpdateContentData = async (input) => {

//     const overallIds = input.map((item) => item.overallId);

//     let overallDocs = [];
//     if (overallIds.length > 0) {
//         overallDocs = await OverallTrainingProgress.find({
//             _id: { $in: overallIds },
//         }).lean();
//     }

//     if (overallDocs.length == 0) {
//         errors.push(`Training not found`);
//         return;
//     }

//     const getTrainingIds = overallDocs.map((doc) => doc.training);

//     if (getTrainingIds.length == 0) {
//         errors.push(`Training couldn't found`);
//         return;
//     }

//     const overallMap = new Map(overallDocs.map((doc) => [doc._id.toString(), doc]));

//     const errors = [];
//     const missingOverallEntries = [];

//     for (const item of input) {

//         const { overallId, trainingModules } = item;

//         const overallDoc = overallMap.get(overallId.toString());

//         if (!overallDoc) {
//             errors.push({
//                 overallId,
//                 error: `Training not found for overallId`,
//             });
//             break;
//         }

//         for (const trainingModule of trainingModules) {
//             const { moduleId, contentDetails } = trainingModule;

//             let matchingModuleData;
//             if (overallDoc) {
//                 matchingModuleData = overallDoc.contentData?.find(
//                     (data) => data.moduleId.toString() == moduleId
//                 );
//             }

//             if (!matchingModuleData) {

//                 missingOverallEntries.push({
//                     updateOne: {
//                         filter: { _id: overallId },
//                         update: {
//                             status: "IN_PROGRESS",
//                             $push: {
//                                 contentData: {
//                                     moduleId,
//                                     contentIds: contentDetails.map((content) => content.contentId),
//                                 },
//                             },
//                         },
//                         upsert: true,
//                     },
//                 });

//                 continue;
//             }

//             for (const content of contentDetails) {

//                 const { contentId } = content;

//                 const isContentPresent = matchingModuleData.contentIds
//                     .map((id) => id.toString())
//                     .includes(contentId.toString());

//                 if (!isContentPresent) {
//                     errors.push({
//                         overallId,
//                         moduleId,
//                         contentId,
//                         error: `Content ID ${contentId} not found in contentIds for the module ${moduleId}`,
//                     });
//                 }

//             }
//         }
//     }

//     if (missingOverallEntries.length > 0) {
//         await OverallTrainingProgress.bulkWrite(missingOverallEntries);
//     }

//     return errors;
// };

const validateAndGenerateCertificate = async (overallIds, userId, session) => {

    if (overallIds.length > 0) {

        if (!overallIds) return;

        const fetchDetails = await OverallTrainingProgress.aggregate([
            {
                $match: {
                    _id: { $in: overallIds }
                }
            },
            { $unwind: "$contentData" },
            { $unwind: "$contentData.contentIds" },
            {
                $lookup: {
                    from: "trainingprogresses",
                    let: {
                        overallId: "$_id",
                        moduleId: "$contentData.moduleId",
                        contentId: "$contentData.contentIds"
                    },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$overallTrainingProgress", "$$overallId"] },
                                        { $eq: ["$trainingModule", "$$moduleId"] },
                                        { $eq: ["$trainingModuleContent", "$$contentId"] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "trainingProgressData"
                }
            },
            { $match: { trainingProgressData: { $ne: [] } } },
            {
                $project: {
                    _id: 1,
                    user: 1,
                    training: 1,
                    trainingRegistration: 1,
                    mandatoryModules: 1,
                    "contentData.moduleId": 1,
                    "contentData.contentIds": 1,
                    trainingProgressData: 1
                }
            },
        ]);

        const processedData = mergeTrainingData(fetchDetails);

        const trainingCompletionStatus = calculateTrainingCompletion(processedData);

        const completedOverallIds = trainingCompletionStatus.filter((item) => item.isTrainingCompleted).map((item) => item.overallTrainingProgressId);

        const overallDocs = await OverallTrainingProgress.find({
            _id: { $in: completedOverallIds },
            trainingRegistration: { $ne: null }
        });

        if (overallDocs.length > 0) {
            await TrainingCertificateHelper.generateCertificateBulk(overallDocs, userId, session);
            for (const doc of overallDocs) {
                const training = await Training.findById(doc.training); 
                const courseTitle = training.title?.find((item) => item.lang === 'en')?.value ;
                if(courseTitle){
                    await sendNotifications({
                        userIds: [userId],
                        title: `Certificate Generated Successfully`,
                        body: `Your certificate for the course ${courseTitle} has been successfully generated.`,
                        content: "Certificate Details",
                        webLink: ""
                    });  
                } else {
                    throw new Error(`Course title is missing for training ID ${doc.training}. Cannot send notification.`);
                }
               }
        }

    }

}

const updateOverallProgressPercentage = async (overallDocs, session) => {

    const overallIds = overallDocs.map((item) => item._id);

    let trainingProgressInput = [];
    overallDocs.forEach((doc) => {
        trainingProgressInput.push({
            overallTrainingProgress: doc._id,
            attemptCount: doc.attemptCount || 1,
        });
    });

    const query = {
        $or: trainingProgressInput.map((input) => ({
            overallTrainingProgress: input.overallTrainingProgress,
            attemptCount: input.attemptCount,
        }))
    };

    const trainingProgresses = await TrainingProgress.find(query).populate('trainingModuleContent');

    if (trainingProgresses.length === 0) return;

    let overallIdContentPercentagesMap = new Map();
    overallIds.forEach(overallId => {
        const trainingProgress = trainingProgresses.filter(prog =>
            prog.overallTrainingProgress.toString() === overallId.toString()
        );

        if (trainingProgress.length > 0) {

            const progressPercentages = trainingProgress.map(prog => prog.progressPercentage);
            const durations = trainingProgress.map(prog => prog.trainingModuleContent?.duration || 0);

            overallIdContentPercentagesMap.set(overallId.toString(), { progressPercentages, durations });

        }
    });

    let bulkOperations = [];

    overallIdContentPercentagesMap.forEach(({ progressPercentages, durations }, overallId) => {

        const totalDuration = durations.reduce((sum, val) => sum + val, 0);
        const total = progressPercentages.reduce((sum, val) => sum + val, 0);
        const average = progressPercentages.length > 0 ? (total / progressPercentages.length).toFixed(2) : 0.00;
        const timeSpend = (totalDuration * (average / 100)).toFixed(2);

        const updateFields = {
            progressPercentage: average,
            totalDuration,
            timeSpend
        };

        if (average == 100) {
            updateFields.status = "COMPLETED";
            updateFields.endDate = new Date();
        }

        bulkOperations.push({
            updateOne: {
                filter: { _id: overallId },
                update: { $set: updateFields }
            }
        });

    });

    if (bulkOperations.length > 0) {
        await OverallTrainingProgress.bulkWrite(bulkOperations, { session });
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

    let trainingProgressInput = [];

    overallDocs.forEach((doc) => {
        trainingProgressInput.push({
            overallTrainingProgress: doc._id,
            attemptCount: doc.attemptCount || 1,
        });
    });

    const query = {
        $or: trainingProgressInput.map((input) => ({
            overallTrainingProgress: input.overallTrainingProgress,
            attemptCount: input.attemptCount,
        }))
    };

    trainingProgressDocs = await TrainingProgress.find(query);

    let overallContentMap;

    if (trainingProgressDocs) {
        overallContentMap = new Map(
            trainingProgressDocs.map((doc) => [
                `${doc.overallTrainingProgress}_${doc.trainingModuleContent}`,
                doc,
            ])
        );
    }

    const bulkOps = [];

    let overallProgressPercentageMap = new Map();

    input.forEach((item) => {

        const trainingRegistration = trainingRegMap.get(item.overallId.toString());

        if (!trainingRegistration) return;

        item.trainingModules.forEach((module) => {

            module.contentDetails.forEach((content) => {

                const progressKey = `${item.overallId}_${content.contentId}`;
                const existingProgress = overallContentMap?.get(progressKey);

                const overallDoc = overallDocs.find((doc) => doc._id.toString() === item.overallId.toString());

                if (overallProgressPercentageMap.has(item.overallId)) {
                    overallProgressPercentageMap.get(item.overallId).push(content.progressPercentage);
                } else {
                    overallProgressPercentageMap.set(item.overallId, [content.progressPercentage]);
                }

                if (existingProgress) {

                    bulkOps.push({
                        updateOne: {
                            filter: { _id: existingProgress._id },
                            update: {
                                $set: {
                                    status: content.contentStatus,
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
                                overallTrainingProgress: item.overallId,
                                attemptCount: overallDoc.attemptCount ?? 1,
                                status: content.contentStatus,
                                lastAccessedDuration: content.duration,
                                progressPercentage: content.progressPercentage,
                                playerSettings: content.playerSettings,
                            },
                        },
                    });

                }
            });
        });

    });

    // Update/add all the contents to the trainingprogresses collection
    let updateTrainingProgress;
    if (bulkOps.length > 0) {
        updateTrainingProgress = await TrainingProgress.bulkWrite(bulkOps);
    }

    const overallTrainingMap = new Map(
        overallDocs.map((doc) => [doc._id.toString(), doc.training])
    );

    const arrayOfTrainingIds = [...overallTrainingMap.values()];

    const trainingModules = await TrainingModule.find({ training: { $in: arrayOfTrainingIds } });

    let trainingModuleIds = trainingModules.map((mod) => mod._id.toString());

    const trainingModuleMap = trainingModules.reduce((acc, mod) => {
        const trainingId = mod.training.toString();
        if (!acc[trainingId]) acc[trainingId] = [];
        acc[trainingId].push(mod._id.toString());
        return acc;
    }, {});

    let overallModuleMap = {};
    overallIds.forEach(overallId => {
        const trainingId = overallTrainingMap.get(overallId.toString());
        overallModuleMap[overallId] = trainingModuleMap[trainingId] || [];
    });

    const trainingModuleContents = await TrainingContentBridge.find({
        trainingModule: { $in: trainingModuleIds }
    });

    const trainingModuleContentMap = trainingModuleContents.reduce((acc, doc) => {
        const { trainingModule, trainingContent } = doc;

        if (!acc[trainingModule]) {
            acc[trainingModule] = [];
        }
        acc[trainingModule].push(trainingContent.toString());
        return acc;
    }, {});

    const trainingModuleContentIds = trainingModuleContents.map((item) => item.trainingContent);

    const existingProgresses = await TrainingProgress.find({
        trainingRegistration: { $in: overallIds.map(id => trainingRegMap.get(id.toString())) },
        overallTrainingProgress: { $in: overallIds },
        trainingModule: { $in: trainingModuleIds },
        trainingModuleContent: { $in: Object.values(trainingModuleContentMap).flat() },
    });

    const existingSet = new Set(
        existingProgresses.map(
            prog => `${prog.overallTrainingProgress}_${prog.trainingModuleContent}_${prog.attemptCount || 1}`
        )
    );

    const newProgresses = [];

    overallIds.forEach(overallId => {

        const training = overallTrainingMap.get(overallId.toString());

        const trainingRegistration = trainingRegMap.get(overallId.toString());

        const overallDoc = overallDocs.find((doc) => doc._id.toString() === overallId.toString());
        const attemptCount = overallDoc.attemptCount ?? 1;

        const moduleIds = trainingModules
            .filter(mod => mod.training.toString() == training)
            .map(mod => mod._id.toString());

        moduleIds.forEach(trainingModule => {
            const contentIds = trainingModuleContentMap[trainingModule] || [];
            contentIds.forEach(trainingModuleContent => {
                const key = `${overallId}_${trainingModuleContent}_${attemptCount}`;
                if (!existingSet.has(key)) {
                    newProgresses.push({
                        training,
                        trainingModule,
                        trainingModuleContent,
                        trainingRegistration,
                        overallTrainingProgress: overallId,
                        attemptCount
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

    const updatedTraining = await DbTransactionHelper.performDbTransaction(async session => {

        let updatedTrainingProgress;
        if (newProgresses.length > 0) {
            updatedTrainingProgress = await TrainingProgress.insertMany(newProgresses);
        }

        if (overallIds) {
            await updateOverallProgressPercentage(overallDocs, session);
        }

        let quizErrors = [];
        if (evaluationData) {
            quizErrors = await quizEvaluationBulk(evaluationData, userId, overallDocs, session);
        }

        if (quizErrors && quizErrors.length > 0) {
            errors.push(quizErrors[0]);
            return;
        }
        const generatedTrainingCertificate = await validateAndGenerateCertificate(overallIds, userId, session);

    });


    return { updatedCount: bulkOps.length };
};

const quizEvaluationBulk = async (evaluationData, userId, overallDocs, session) => {

    try {

        let errors = [];

        const overallIds = evaluationData.map(data => data.overallId);

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
        const trainingIds = evaluationData.map(data => overallIdToTrainingIdMap[data.overallId]);

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

        let results = [];

        let quizEvaluations = [];
        let updateTrainingProgress = [];
        let updateTrainingProgressData = [];

        for (const data of evaluationData) {

            const { contentId, trainingModuleId, overallId, questionAnswers } = data;

            const trainingId = overallIdToTrainingIdMap[overallId];

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

            const quizEvaluationData = {
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
            };
            quizEvaluations.push(quizEvaluationData);

            const overallDoc = overallDocs.find(doc => doc._id.toString() === overallId.toString());

            const attemptCount = overallDoc.attemptCount || 1;

            const trainingProgressUpdates = {
                attended: filteredQuestionAnswers.length,
                totalQuestions: trainingModuleContent.quiz.length,
                totalPoints: totalScore,
                acquiredMarks: acquiredScore,
                percentage: scorePercentage,
                skippedQuestions,
                isPassed,
                attendedQuestions: questionResults,
            }

            updateTrainingProgressData.push({
                updateOne: {
                    filter: {
                        overallTrainingProgress: overallId,
                        trainingModuleContent: trainingModuleContent,
                        attemptCount: attemptCount,
                    },
                    update: {
                        $set: {
                            quizAttemptDetails: trainingProgressUpdates,
                        },
                    },
                    upsert: true,
                },
            });


        }

        results = await QuizEvaluation.insertMany(quizEvaluations, { session });
        const udpateTrainingProgress = await TrainingProgress.bulkWrite(updateTrainingProgressData, { session });

        return errors;

    } catch (error) {
        console.error("Error evaluating quiz in bulk:", error);
    }
};

module.exports = {
    uploadTrainingImages,
    updateTrainingProgress,
    addDataToOverallTrainingProgress,
    validateSyncOfflineData,
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
