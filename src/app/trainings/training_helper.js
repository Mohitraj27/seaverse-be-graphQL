const { CustomError, ErrorName, AuthUser, UploadHelper, DbTransactionHelper, contentTypes, Role } = require("../../util");
// const mongoose = require('mongoose');
const { ObjectId, CryptoHelper } = require("../../tools");

const { MigrationCourse } = require('./migrationcourses/migration_courses_model');
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
const notificationiconEnum = require("../notifications/notification_icon.json");
const { sendNotifications } = require("../../util/firebase_helper");
const courseCompletion = require("../email-template/courseCompletion");
const AWS_HELPER = require("../../util/aws_helper");
const { sendEmail } = require("../../util/aws_helper");

const levenshtein = require('fast-levenshtein');
const { MigrationUser } = require("./migrationcourses/migrationUser/migration_user_model");
const { Subscriber } = require("../saas/subscriber/subscriber_model");
const { Employee } = require("../user/employee/employee_model");
const employeeHelper = require("../user/employee/employee_helper");
const { UserCourseMap } = require("./migrationcourses/userCourseMap/user_course_map_model");
const { generateRandomString } = require("../user/user-profile/user_profile_helper");
const { BatchHelper } = require("../batches/batch_helper");
const { createTrainingProgressForMigrationUsersHelper } = require("../training-registrations/training_registration_helper");
const { decrypt, encrypt } = require('../../util/encryption_helper');
const { runQuery, runQueryStream } = require("../../util/mysql_helper");
const { updateCoursesCountAndProgressInElasticSearch } = require("../training-registrations/overall-course-progress/overall_progress_helper");
const { isNullableType } = require("graphql");

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

    let overallIds = data.map((item) => {
        return ObjectId(item.overallId)
    });

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

                let contentDatasArray;
                if (contentDataMatch) {
                    contentDatasArray = Array.from(contentDataMatch.contentIds);
                }

                if (
                    !contentDataMatch ||
                    !contentDatasArray.includes(contentIdString)
                ) {
                    const key = `${moduleId}-${contentId}`;
                    if (!moduleContentPairs.has(key)) {
                        moduleContentPairs.set(key, { moduleId, contentId });
                    }
                }
            }
        }
    }

    // if (moduleContentPairs.size > 0) {

    //     const queries = Array.from(moduleContentPairs.values());

    //     const trainingContentBridges = await TrainingContentBridge.find({
    //         $or: queries.map(({ moduleId, contentId }) => ({
    //             trainingModule: moduleId,
    //             trainingContent: contentId,
    //         })),
    //     }).lean();

    //     const foundPairs = new Set(
    //         trainingContentBridges.map(
    //             (doc) => `${doc.trainingModule}-${doc.trainingContent}`
    //         )
    //     );

    //     for (const [key, { moduleId, contentId }] of moduleContentPairs) {

    //         if (!foundPairs.has(key)) {
    //             errors.push(
    //                 `Missing content ID ${contentId} for module ${moduleId}`
    //             );
    //         }
    //     }
    // }

    return errors;

}

function extractCourseStructure(trainingModules) {
    return trainingModules.map(module => ({
        moduleId: module.moduleId.toString(),
        contentIds: module.contentDetails
            ? module.contentDetails.map(content => content.contentId.toString())
            : module.contentIds.map(id => id.toString()) // Handle both formats
    }));
}

function areCourseStructuresEqual(structure1, structure2) {
    if (structure1.length !== structure2.length) {
        return false;
    }

    return structure1.every(module1 => {
        return structure2.some(module2 => {
            const sameModuleId = module1.moduleId === module2.moduleId;

            const sameContentIds = module1.contentIds.length === module2.contentIds.length &&
                module1.contentIds.every(id1 =>
                    module2.contentIds.some(id2 => id1 === id2)
                ) &&
                module2.contentIds.every(id2 =>
                    module1.contentIds.some(id1 => id1 === id2)
                );

            return sameModuleId && sameContentIds;
        });
    });
}

function areContentDataEqual(contentData1, contentData2) {
    if (contentData1.length !== contentData2.length) {
        return false;
    }

    return contentData1.every(module1 => {
        return contentData2.some(module2 => {
            const sameModuleId = module1.moduleId.toString() === module2.moduleId.toString();

            const sameContentIds = module1.contentIds.length === module2.contentIds.length &&
                module1.contentIds.every(id1 =>
                    module2.contentIds.some(id2 => id1.toString() === id2.toString())
                );

            return sameModuleId && sameContentIds;
        });
    });
}

const addDataToOverallTrainingProgress = async (input, errors, session, fromDownload) => {


    const overallIds = input.map((item) => item.overallId);

    let overallDocs = [];
    if (overallIds.length > 0) {
        overallDocs = await OverallTrainingProgress.find({
            _id: { $in: overallIds },
        }).lean();
    }

    if (overallDocs.length == 0) {
        return;
    }

    const overallDocsWithNoContentData = overallDocs.filter((doc) => !doc.contentData || doc.contentData.length == 0);

    if (fromDownload) {

        const trainingIds = overallDocs.map((doc) => doc.training);

        const trainingData = await Training.aggregate([
            {
                $match: {
                    _id: {
                        $in: trainingIds
                    }
                }
            },
            {
                $lookup: {
                    from: "certificatelayouts",

                    localField: "_id",

                    foreignField: "training",

                    as: "certificateLayouts",

                    let: {
                        currentCertificateLayout:
                            "$$ROOT.currentCertificateLayout"
                    },
                    pipeline: [
                        {
                            $project: {
                                _id: 1,
                                layout: 1,
                                version: 1,
                                certificateExpiry: 1
                            }
                        },
                        {
                            $match: {
                                $expr: {
                                    $eq: [
                                        "$layout",
                                        "$$currentCertificateLayout"
                                    ]
                                }
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                certificateExpiry: 1,
                                version: 1
                            }
                        },
                        {
                            $sort: {
                                version: -1
                            }
                        },
                        {
                            $limit: 1
                        }
                    ]
                }
            },
            {
                $unwind: {
                    path: "$certificateLayouts",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    _id: 1,
                    isCertificate: 1,
                    currentCertificateLayout: 1,
                    layoutId: "$certificateLayouts._id",
                    certificateValidity: "$certificateLayouts.certificateExpiry",
                }
            }
        ]);

        const trainingDataById = trainingData.reduce((acc, training) => {
            acc[training._id.toString()] = training;
            return acc;
        }, {});

        if (trainingIds.length == 0) {
            errors.push(`Training couldn't found`);
            return;
        }

        const fetchTrainingContents = await TrainingContentBridge.find({
            training: { $in: trainingIds },
            isDeleted: { $ne: true },
        })
            .sort({ order: 1 })
            .lean();

        if (fetchTrainingContents.length == 0) {
            errors.push(`Training content not found`);
            return;
        }

        let contentDataMap = new Map();

        let bulkOperations = [];

        for (const doc of overallDocs) {

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

                // Manage the order of modules
                const moduleIds = Array.from(contentDataMap.keys());
                const trainingModules = await TrainingModule.find({ _id: { $in: moduleIds } })
                    .select("_id order")
                    .lean();
                const moduleOrderMap = new Map(trainingModules.map((module) => [module._id.toString(), module.order]));

                const contentData = Array.from(contentDataMap, ([moduleId, contentIds]) => ({
                    moduleId,
                    contentIds,
                })).sort((a, b) => {
                    const orderA = moduleOrderMap.get(a.moduleId.toString()) || 0;
                    const orderB = moduleOrderMap.get(b.moduleId.toString()) || 0;
                    return orderA - orderB;
                });

                const existingContentFromDownload = doc?.contentFromDownload || [];

                let updateFields = {};

                if (fromDownload) {
                    // Check for duplicates
                    const isDuplicate = existingContentFromDownload.some(entry =>
                        areContentDataEqual(entry.courseDetails, contentData)
                    );

                    if (!isDuplicate) {
                        const maxVersion = existingContentFromDownload.length > 0
                            ? Math.max(...existingContentFromDownload.map(item => item.version))
                            : 0;

                        // updateFields.$push = {
                        //     contentFromDownload: {
                        //         courseDetails: contentData,
                        //         version: maxVersion + 1
                        //     }
                        // };

                        const pushOperation = {
                            updateOne: {
                                filter: { _id: doc._id },
                                update: {
                                    $push: {
                                        contentFromDownload: {
                                            courseDetails: contentData,
                                            version: doc?.version || 1,
                                            downloadedCertificateLayoutId: doc?.assignedCertificateLayoutId || null
                                        }
                                    }
                                },
                            },
                        };

                        bulkOperations.push(pushOperation);

                    }
                }

                if (doc.status !== "COMPLETED") {
                    updateFields.isCertificatePresent = trainingDataById[doc.training.toString()]?.isCertificate;
                    updateFields.assignedCertificateLayout = trainingDataById[doc.training.toString()]?.currentCertificateLayout;
                    updateFields.certificateExpiry = trainingDataById[doc.training.toString()]?.certificateValidity;
                    updateFields.assignedCertificateLayoutId = trainingDataById[doc.training.toString()]?.layoutId;
                }

                bulkOperations.push({
                    updateOne: {
                        filter: { _id: doc._id },
                        update: { $set: updateFields },
                    },
                });

            }
        }

        if (bulkOperations.length > 0) {
            await OverallTrainingProgress.bulkWrite(bulkOperations);
        }

    }

    if (overallDocsWithNoContentData.length > 0 && !fromDownload) {

        const trainingIds = overallDocsWithNoContentData.map((doc) => doc.training);

        const trainingData = await Training.aggregate([
            {
                $match: {
                    _id: {
                        $in: trainingIds
                    }
                }
            },
            {
                $lookup: {
                    from: "certificatelayouts",

                    localField: "_id",

                    foreignField: "training",

                    as: "certificateLayouts",

                    let: {
                        currentCertificateLayout:
                            "$$ROOT.currentCertificateLayout"
                    },
                    pipeline: [
                        {
                            $project: {
                                _id: 1,
                                layout: 1,
                                version: 1,
                                certificateExpiry: 1
                            }
                        },
                        {
                            $match: {
                                $expr: {
                                    $eq: [
                                        "$layout",
                                        "$$currentCertificateLayout"
                                    ]
                                }
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                certificateExpiry: 1,
                                version: 1
                            }
                        },
                        {
                            $sort: {
                                version: -1
                            }
                        },
                        {
                            $limit: 1
                        }
                    ]
                }
            },
            {
                $unwind: {
                    path: "$certificateLayouts",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    _id: 1,
                    isCertificate: 1,
                    currentCertificateLayout: 1,
                    layoutId: "$certificateLayouts._id",
                    certificateValidity: "$certificateLayouts.certificateExpiry",
                }
            }
        ]);

        const trainingDataById = trainingData.reduce((acc, training) => {
            acc[training._id.toString()] = training;
            return acc;
        }, {});

        if (trainingIds.length == 0) {
            errors.push(`Training couldn't found`);
            return;
        }

        const fetchTrainingContents = await TrainingContentBridge.find({
            training: { $in: trainingIds },
            isDeleted: { $ne: true },
        })
            .sort({ order: 1 })
            .lean();

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

                // Manage the order of modules
                const moduleIds = Array.from(contentDataMap.keys());
                const trainingModules = await TrainingModule.find({ _id: { $in: moduleIds } })
                    .select("_id order")
                    .lean();
                const moduleOrderMap = new Map(trainingModules.map((module) => [module._id.toString(), module.order]));

                const contentData = Array.from(contentDataMap, ([moduleId, contentIds]) => ({
                    moduleId,
                    contentIds,
                })).sort((a, b) => {
                    const orderA = moduleOrderMap.get(a.moduleId.toString()) || 0;
                    const orderB = moduleOrderMap.get(b.moduleId.toString()) || 0;
                    return orderA - orderB;
                });

                // bulkOperations.push({
                //     updateOne: {
                //         filter: { _id: doc._id },
                //         update: {
                //             $set: {
                //                 status: "IN_PROGRESS",
                //                 contentData, startDate: new Date(),
                //                 totalTrainingModules: contentData?.length,
                //                 isCertificatePresent: trainingDataById[doc.training.toString()]?.isCertificate,
                //                 assignedCertificateLayout: trainingDataById[doc.training.toString()]?.currentCertificateLayout,
                //                 certificateExpiry: trainingDataById[doc.training.toString()]?.certificateValidity,
                //                 assignedCertificateLayoutId: trainingDataById[doc.training.toString()]?.layoutId,
                //             }
                //         },
                //     },
                // });

                // let updateFields = {
                //     contentFromDownload: [],
                // };

                const existingContentFromDownload = doc?.contentFromDownload || [];

                let updateFields = {};

                if (fromDownload) {
                    // Check for duplicates
                    const isDuplicate = existingContentFromDownload.some(entry =>
                        areContentDataEqual(entry.courseDetails, contentData)
                    );

                    if (!isDuplicate) {
                        const maxVersion = existingContentFromDownload.length > 0
                            ? Math.max(...existingContentFromDownload.map(item => item.version))
                            : 0;

                        updateFields.$push = {
                            contentFromDownload: {
                                courseDetails: contentData,
                                version: maxVersion + 1
                            }
                        };
                    }
                } else {
                    updateFields = {
                        status: "IN_PROGRESS",
                        contentData,
                        startDate: new Date(),
                        totalTrainingModules: contentData?.length,
                    };
                }

                if (doc.status !== "COMPLETED") {
                    updateFields.isCertificatePresent = trainingDataById[doc.training.toString()]?.isCertificate;
                    updateFields.assignedCertificateLayout = trainingDataById[doc.training.toString()]?.currentCertificateLayout;
                    updateFields.certificateExpiry = trainingDataById[doc.training.toString()]?.certificateValidity;
                    updateFields.assignedCertificateLayoutId = trainingDataById[doc.training.toString()]?.layoutId;
                }

                bulkOperations.push({
                    updateOne: {
                        filter: { _id: doc._id },
                        update: { $set: updateFields },
                    },
                });

            }
        }

        if (bulkOperations.length > 0) {
            await OverallTrainingProgress.bulkWrite(bulkOperations, { session });
        }

    }

    if (!fromDownload) {

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
            await OverallTrainingProgress.bulkWrite(updateOverallTrainingProgress, { session });
        }

    }


    const overallProgresses = await OverallTrainingProgress.find({ _id: { $in: overallIds } });

    if (overallProgresses.length > 0) {
        return overallProgresses;
    }

}
const calculateTrainingCompletion = (overallTrainingProgresses) => {
    return overallTrainingProgresses.map((otp) => {
        const moduleContentStatus = {};

        const contentDataArray = Array.isArray(otp.contentData)
            ? otp.contentData
            : [otp.contentData];

        // Group progress by module and collect content statuses
        otp.trainingProgressData.forEach((progress) => {
            const moduleId = progress.trainingModule;

            if (!moduleContentStatus[moduleId]) {
                moduleContentStatus[moduleId] = [];
            }

            moduleContentStatus[moduleId].push(progress.status);
        });

        // A module is complete only if all its contents are completed
        const moduleCompletionMap = {};

        for (const moduleId in moduleContentStatus) {
            const allCompleted = moduleContentStatus[moduleId].every(
                (status) => status === "COMPLETED"
            );
            moduleCompletionMap[moduleId] = allCompleted;
        }

        const completedModulesCount = Object.values(moduleCompletionMap).filter(
            (isCompleted) => isCompleted
        ).length;

        const totalModules = new Set(contentDataArray.map((cd) => cd.moduleId)).size;

        const mandatoryModules = otp?.trainingDetails?.manadatoryModules || totalModules;

        const isTrainingCompleted =
            completedModulesCount >= mandatoryModules || completedModulesCount === totalModules;

        const isTrainingCompletedNotFirstTime =
            isTrainingCompleted && !otp.finishedCourseFirstTime;

        return {
            overallTrainingProgressId: otp._id,
            completedModulesCount,
            totalModules,
            isTrainingCompleted,
            isTrainingCompletedNotFirstTime
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

const validateAndGenerateCertificate = async (overallIds, userId, subscriberId, session) => {

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
                        contentId: "$contentData.contentIds",
                        // attemptCount: "$attemptCount"
                    },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$overallTrainingProgress", "$$overallId"] },
                                        { $eq: ["$trainingModule", "$$moduleId"] },
                                        { $eq: ["$trainingModuleContent", "$$contentId"] },
                                        // { $eq: ["$attemptCount", "$$attemptCount"] }
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
                $lookup: {
                    from: "trainings",
                    localField: "training",
                    foreignField: "_id",
                    as: "trainingDetails"
                }
            },
            {
                $project: {
                    _id: 1,
                    user: 1,
                    training: 1,
                    trainingRegistration: 1,
                    finishedCourseFirstTime: 1,
                    mandatoryModules: 1,
                    "contentData.moduleId": 1,
                    "contentData.contentIds": 1,
                    trainingProgressData: 1,
                    trainingDetails: { $arrayElemAt: ["$trainingDetails", 0] }
                }
            },
        ]).session(session);

        const processedData = mergeTrainingData(fetchDetails);

        const trainingCompletionStatus = calculateTrainingCompletion(processedData);

        const completedOverallIds = trainingCompletionStatus.filter((item) => item.isTrainingCompleted).map((item) => item.overallTrainingProgressId);
        const completedOverallIdNotFirstTime = trainingCompletionStatus.filter((item) => item.isTrainingCompletedNotFirstTime).map((item) => item.overallTrainingProgressId);

        if (completedOverallIdNotFirstTime.length > 0) {

            const trainingData = await OverallTrainingProgress.find({
                _id: { $in: completedOverallIds }
            }).populate('training').populate('user').session(session);

            const notifications = [];
            const emails = [];
            const idsToUpdate = [];

            for (const item of trainingData) {

                if (item.completionNotificationSent) continue;

                const trainingName = item?.training?.title[0]?.value;
                const userId = item?.user?._id;

                notifications.push({
                    subscriber: subscriberId,
                    title: [{ lang: "en", value: `Course completed successfully!` }],
                    message: [{ lang: "en", value: `The course ${trainingName ?? ''} has been successfully completed.` }],
                    notificationType: NotificationType.COURSE_COMPLETION,
                    notifyAllAdmin: false,
                    isNotificatonForAdmin: false,
                    notifiers: [userId],
                    employeeNotifiers: [userId],
                    additionalInfo: [],
                    affected: [],
                    createdBy: null,
                    status: 'SENT',
                    icon: notificationiconEnum.SUCCESS,
                    isRead: false,
                });

                const courseImages = await AWS_HELPER.fetchFile(item?.training?.coverImage?.url) ||
                    'https://squadra-media-assets.s3.amazonaws.com/public/course-image.png';
                if (item.user.isEmailNotification) {
                    const decryptedUserName = decrypt(item?.user?.firstName);
                    emailContent = courseCompletion({
                        firstName: decryptedUserName,
                        trainingTitle: trainingName,
                        durationHours: item?.training?.durationHours,
                        courseId: item._id,
                        courseImage: courseImages,
                        certificatePresent: item.isCertificatePresent,
                        userId: item?.user?._id,
                    });

                    emails.push({
                        email: item.user.email,
                        trainingTitle: trainingName,
                        emailContent
                    })
                }

                idsToUpdate.push(item._id);

            }

            await NotificationHelper.createNotification(notifications);

            if (emails.length > 0) {
                for (const item of emails) {
                    await sendEmail({
                        receiverEmail: decrypt(item.email),
                        subject: `Congratulations on Completing the ${item?.trainingTitle} Course!`,
                        htmlContent: item.emailContent,
                    });
                }
            }

            if (idsToUpdate.length > 0) {
                await OverallTrainingProgress.updateMany(
                    { _id: { $in: idsToUpdate } },
                    { $set: { completionNotificationSent: true } }
                ).session(session);
            }

        }

        const overallDocs = await OverallTrainingProgress.find({
            _id: { $in: completedOverallIds },
            trainingRegistration: { $ne: null },
            isCertificatePresent: true
        }).session(session);

        if (overallDocs.length > 0) {
            //certificate generation
            await TrainingCertificateHelper.generateCertificateBulk(overallDocs, userId, session);
            const sendCertificateNotification = [];
            for (const doc of overallDocs) {
                const training = await Training.findById(doc.training);
                const courseTitle = training.title?.find((item) => item.lang === 'en')?.value;
                const isCertificate = training?.isCertificate;
                if (courseTitle && !doc.isCertificateGenerated) {
                    if (isCertificate) {
                        sendCertificateNotification.push({
                            subscriber: subscriberId,
                            title: [{ lang: "en", value: `Your course certificate issued` }],
                            message: [{ lang: "en", value: `Congratulations! Certificate for the ${courseTitle ?? ''} has been issued.` }],
                            notificationType: NotificationType.COURSE_COMPLETION,
                            notifyAllAdmin: false,
                            isNotificatonForAdmin: false,
                            notifiers: [userId],
                            employeeNotifiers: [userId],
                            additionalInfo: [],
                            affected: [],
                            createdBy: null,
                            status: 'SENT',
                            icon: notificationiconEnum.SUCCESS,
                            isRead: false,
                        });
                    }
                }
            }

            if (sendCertificateNotification.length > 0) {
                await NotificationHelper.createNotification(sendCertificateNotification);
            }

            // Note: isCertificateGenerated flag is now set atomically within generateCertificateBulk
            // to prevent race conditions and duplicate certificate generation
        }

    }

}

const updateOverallProgressPercentage = async (overallDocs, isFromDownload = false, session) => {

    const overallIds = overallDocs.map((item) => item._id);
    const userIds = [...new Set(overallDocs.map(item => item.user))];

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
            attemptCount: input.attemptCount
        }))
    };

    const trainingProgresses = await TrainingProgress.find(query)
        .populate('trainingModuleContent trainingModule')
        .session(session);

    if (trainingProgresses.length === 0) return;

    let overallIdModuleProgressMap = new Map();

    overallIds.forEach(overallId => {
        const trainingProgress = trainingProgresses.filter(prog =>
            prog.overallTrainingProgress.toString() === overallId.toString()
        );

        if (trainingProgress.length > 0) {
            let moduleProgressMap = new Map();

            trainingProgress.forEach(prog => {
                const moduleId = prog.trainingModule.toString();
                if (!moduleProgressMap.has(moduleId)) {
                    moduleProgressMap.set(moduleId, { progressSum: 0, count: 0, durationSum: 0 });
                }

                let moduleData = moduleProgressMap.get(moduleId);
                moduleData.progressSum += prog.progressPercentage;
                moduleData.count += 1;
                moduleData.durationSum += prog.trainingModuleContent?.duration || 0;
                moduleProgressMap.set(moduleId, moduleData);
            });

            const modulePercentages = [];
            const moduleDurations = [];

            moduleProgressMap.forEach(({ progressSum, count, durationSum }) => {
                modulePercentages.push(progressSum / count);
                moduleDurations.push(durationSum);
            });

            overallIdModuleProgressMap.set(overallId.toString(), {
                progressPercentages: modulePercentages,
                durations: moduleDurations
            });
        }
    });

    let bulkOperations = [];
    console.log(isFromDownload, 'isFromDownload in the updateOverallProgressPercentage function');
    overallIdModuleProgressMap.forEach(({ progressPercentages, durations }, overallId) => {

        // Find doc with overallId
        const overallDoc = overallDocs.find(doc => doc._id.toString() === overallId.toString());

        const totalDuration = durations.reduce((sum, val) => sum + val, 0);
        const total = progressPercentages.reduce((sum, val) => sum + val, 0);
        const average = progressPercentages.length > 0 ? Math.round(total / progressPercentages.length) : 0;
        const timeSpend = (totalDuration * (average / 100)).toFixed(2);
        const completedCount = progressPercentages?.filter(percentage => percentage === 100).length;
        let updateFields = {};
        if (isFromDownload) {
            console.log('in download block')
            const latestContent = overallDoc?.contentFromDownload?.reduce((prev, current) => {
                return current.version > prev.version ? current : prev;
            });

            // Extract downloadedCertificateLayoutId
            const downloadedCertificateLayoutId = latestContent?.downloadedCertificateLayoutId;
            console.log('downloadedCertificateLayoutId:', downloadedCertificateLayoutId);
            updateFields = {
                progressPercentage: overallDoc?.adminMarkedAsCompleted
                    ? overallDoc?.progressPercentage
                    : average,
                totalDuration,
                completedModules: completedCount,
                assignedCertificateLayoutId: downloadedCertificateLayoutId ?? null,
                isCertificatePresent: downloadedCertificateLayoutId ? true : false,
            };
        } else {
            console.log('not in download block')
            updateFields = {
                progressPercentage: overallDoc?.adminMarkedAsCompleted
                    ? overallDoc?.progressPercentage
                    : average,
                totalDuration,
                completedModules: completedCount,
            };
        }


        if (average == 100) {
            updateFields.status = "COMPLETED";
            updateFields.endDate = overallDoc?.completionDate ?? new Date();
        } else if (average >= 0 && average < 100) {
            updateFields.status = overallDoc?.adminMarkedAsCompleted ? overallDoc?.status : "IN_PROGRESS";
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
        await updateCoursesCountAndProgressInElasticSearch(userIds, session);
    }
};

// const calculateTimeSpend = async (overallIds, session) => {
//     try {

//         const overallProgressData = await OverallTrainingProgress.find(
//             { _id: { $in: overallIds } },
//             '_id contentData attemptCount'
//         ).session(session);

//         if (!overallProgressData.length) {
//             return;
//         }

//         const contentIdToOverallIdMap = new Map();
//         const contentIdToAttemptCountMap = new Map();
//         const allContentIds = new Set();
//         const overallIdToAttemptCountMap = new Map();


//         overallProgressData.forEach(({ _id: overallId, contentData, attemptCount }) => {
//             overallIdToAttemptCountMap.set(overallId.toString(), attemptCount);

//             contentData.forEach(module => {
//                 module.contentIds.forEach(content => {
//                     const contentId = content;
//                     allContentIds.add(contentId);
//                     contentIdToOverallIdMap.set(contentId, overallId);
//                     contentIdToAttemptCountMap.set(contentId, attemptCount);
//                 });
//             });
//         });


//         const contentDurations = await TrainingModuleContent.find(
//             { _id: { $in: Array.from(allContentIds) } },
//             '_id duration'
//         ).session(session);

//         const progressData = await TrainingProgress.find(
//             {
//                 $or: Array.from(allContentIds).map(trainingModuleContent => {
//                     const overallTrainingProgress = contentIdToOverallIdMap.get(trainingModuleContent);
//                     const attemptCount = overallIdToAttemptCountMap.get(overallTrainingProgress.toString());
//                     return { trainingModuleContent, overallTrainingProgress, attemptCount };
//                 })
//             },
//             'overallTrainingProgress trainingModuleContent progressPercentage'
//         ).session(session).lean();


//         const durationMap = new Map(contentDurations.map(content => [content._id.toString(), content.duration]));
//         const progressMap = new Map(
//             progressData.map(progress => [`${progress.overallTrainingProgress}-${progress.trainingModuleContent}`, progress.progressPercentage])
//         );

//         const timeSpendResults = {};

//         const bulkOperations = [];

//         overallProgressData.forEach(({ _id: overallId }) => {
//             let totalTimeSpend = 0;

//             Array.from(allContentIds).forEach(contentId => {
//                 if (contentIdToOverallIdMap.get(contentId) === overallId) {

//                     const duration = durationMap.get(String(contentId)) || 0;
//                     const progressPercentage =
//                         progressMap.get(`${overallId}-${contentId}`) || 0;
//                     const contentTimeSpend = duration * (progressPercentage / 100);
//                     totalTimeSpend += contentTimeSpend;
//                 }
//             });

//             bulkOperations.push({
//                 updateOne: {
//                     filter: { _id: overallId },
//                     update: { $set: { timeSpend: totalTimeSpend.toFixed(2) } }
//                 }
//             });

//         });

//         if (bulkOperations.length > 0) {
//             bulkWriteResult = await OverallTrainingProgress.bulkWrite(bulkOperations, { session });
//         }

//     } catch (error) {
//         console.error('Error calculating timeSpend for overallIds:', error.message);
//     }
// }
/* const updateTimeSpendInOverallTrainingProgress = async (input, session) => {

    const overallDurationMap = new Map();
    const uniqueOverallIds = [...new Set(input.map(item => item.overallId))];
    console.log(uniqueOverallIds);
    const result = await TrainingProgress.aggregate([
        {
            $match: {
                overallTrainingProgress: { $in: uniqueOverallIds },
                isDeleted: false, 
            },
        },
        {
            $group: {
                _id: "$overallTrainingProgress",
                totalLastAccessedDuration: { $sum: "$lastAccessedDuration" },
            },
        },
    ]);

    console.log(result);
    input.forEach(({ overallId, trainingModules, finishedCourseFirstTime }) => {
        let totalDuration = 0;

        trainingModules.forEach(module => {
            module.contentDetails.forEach(content => {
                // if (typeof content.duration === 'number') {
                totalDuration += content.duration;
                // }
            });
        });

        overallDurationMap.set(overallId, {
            totalDuration,
            finishedCourseFirstTime,
        });
    });

    const bulkUpdates = Array.from(overallDurationMap.entries()).map(([overallId, { totalDuration, finishedCourseFirstTime }]) => {
        const update = {
            $set: { timeSpend: totalDuration }
        };

        if (typeof finishedCourseFirstTime === 'boolean') {
            update.$set = { finishedCourseFirstTime };
        }

        return {
            updateOne: {
                filter: { _id: overallId },
                update
            }
        };
    });

    await OverallTrainingProgress.bulkWrite(bulkUpdates, { session });

} */

const updateTimeSpendInOverallTrainingProgress = async (input, session) => {
    const overallDurationMap = new Map();
    const uniqueOverallIds = [...new Set(input.map(item => item.overallId))];

    // Aggregation to fetch total lastAccessedDuration per overallTrainingProgress
    const result = await TrainingProgress.aggregate([
        {
            $match: {
                overallTrainingProgress: { $in: uniqueOverallIds },
                isDeleted: false,
            },
        },
        {
            $group: {
                _id: "$overallTrainingProgress",
                totalLastAccessedDuration: { $sum: "$lastAccessedDuration" },
            },
        },
    ]).session(session);

    // Convert aggregation result into a map for quick lookup
    const durationMap = new Map(
        result.map(item => [item._id.toString(), item.totalLastAccessedDuration])
    );


    // Map input to overallDurationMap using aggregation result

    input.forEach(({ overallId, finishedCourseFirstTime }) => {
        overallDurationMap.set(overallId.toString(), {
            totalDuration: durationMap.get(overallId.toString()) || 0,
            finishedCourseFirstTime,
        });
    });


    // Prepare bulk updates
    const bulkUpdates = Array.from(overallDurationMap.entries()).map(
        ([overallId, { totalDuration, finishedCourseFirstTime }]) => {
            const update = {
                $max: { timeSpend: totalDuration },
            };

            if (typeof finishedCourseFirstTime === "boolean") {
                update.$set.finishedCourseFirstTime = finishedCourseFirstTime;
            }

            return {
                updateOne: {
                    filter: { _id: overallId },
                    update,
                },
            };
        }
    );

    if (bulkUpdates.length > 0) {
        console.log('overallIds: ', uniqueOverallIds);
        console.log("insertingTimeSpend: ", bulkUpdates[0].updateOne.update.$max.timeSpend);
        const result = await OverallTrainingProgress.bulkWrite(bulkUpdates, { session });
    }
};



const updateTrainingProgress = async (input, userId, subscriberId, session) => {

    const overallIds = input.map((item) => item.overallId);
    const isFromDownload = input[0]?.isFromOfflineSync ?? false;
    console.log(isFromDownload, 'isFromDownload in updateTrainingProgress')
    if (overallIds.length == 0) return;

    const overallDocs = await OverallTrainingProgress.find({
        _id: { $in: overallIds },
    }).session(session).lean();

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

    trainingProgressDocs = await TrainingProgress.find(query).session(session);

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

                // if content.duration present, convert it to number
                if (content.duration) {
                    content.duration = parseFloat(content.duration);
                }

                if (content.videoDuration) {
                    content.videoDuration = parseFloat(content.videoDuration);
                }

                if (existingProgress) {

                    bulkOps.push({
                        updateOne: {
                            filter: { _id: existingProgress._id },
                            update: [
                                {
                                    $set: {
                                        status: {
                                            $cond: {
                                                if: { $eq: ["$status", "COMPLETED"] },
                                                then: "$status",
                                                else: content.contentStatus
                                            }
                                        },
                                        lastAccessedDuration: {
                                            $cond: {
                                                if: {
                                                    $and: [
                                                        { $eq: ["$status", "COMPLETED"] },
                                                        { $ne: ["$lastAccessedDuration", 0] }
                                                    ]
                                                },
                                                then: "$lastAccessedDuration",
                                                else: content.duration ?? 0
                                            }
                                        },
                                        videoDuration: content?.videoDuration || null,
                                        playerSettings: content.playerSettings,
                                        progressPercentage: {
                                            $cond: {
                                                if: { $eq: ["$status", "COMPLETED"] },
                                                then: "$progressPercentage",
                                                else: {
                                                    $cond: {
                                                        if: {
                                                            $and: [
                                                                { $ne: [content.videoId, "$videoId"] },
                                                                { $ne: [content.videoId, null] },
                                                                { $ne: [content.videoId, undefined] }
                                                            ]
                                                        },
                                                        then: content.progressPercentage,
                                                        else: {
                                                            $cond: {
                                                                if: { $gt: [content.progressPercentage, "$progressPercentage"] },
                                                                then: content.progressPercentage,
                                                                else: "$progressPercentage"
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        },
                                        videoId: {
                                            $cond: {
                                                if: { $eq: ["$status", "COMPLETED"] },
                                                then: "$videoId",
                                                else: {
                                                    $cond: {
                                                        if: { $ne: [content.videoId, "$videoId"] },
                                                        then: content.videoId,
                                                        else: "$videoId"
                                                    }
                                                }
                                            }
                                        },
                                    }
                                }
                            ]
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
                                videoId: content?.videoId || null,
                            },
                        },
                    });

                }
            });
        });

    });

    let updateTrainingProgress;
    if (bulkOps.length > 0) {
        updateTrainingProgress = await TrainingProgress.bulkWrite(bulkOps, { session });
    }

    const overallTrainingMap = new Map(
        overallDocs.map((doc) => [doc._id.toString(), doc.training])
    );

    const arrayOfTrainingIds = [...overallTrainingMap.values()];

    const trainingModules = await TrainingModule.find({ training: { $in: arrayOfTrainingIds } }).session(session);

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

    const existingProgresses = await TrainingProgress.find({
        trainingRegistration: { $in: overallIds.map(id => trainingRegMap.get(id.toString())) },
        overallTrainingProgress: { $in: overallIds },
    }).session(session);

    const existingSet = new Set(
        existingProgresses.map(
            prog => `${prog.overallTrainingProgress}_${prog.trainingModule}_${prog.trainingModuleContent}_${prog.attemptCount || 1}`
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

            const contentEntry = overallDoc.contentData.find(
                (entry) => entry.moduleId._id.toString() === trainingModule.toString()
            );

            const contentIds = contentEntry
                ? contentEntry.contentIds.map(id => id._id)
                : [];

            contentIds.forEach(trainingModuleContent => {
                const key = `${overallId}_${trainingModule}_${trainingModuleContent}_${attemptCount}`;
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
            module.contentDetails.map(content => ({
                contentId: content.contentId,
                trainingModuleId: module.moduleId,
                overallId: overall.overallId,
                questionAnswers: content?.questionAnswers || null
            }))
        )
    );

    let updatedTrainingProgress;
    if (newProgresses.length > 0) {
        await TrainingProgress.insertMany(newProgresses, {
            ordered: false,
            session
        });
    }

    let quizErrors = [];
    if (evaluationData) {
        quizErrors = await quizEvaluationBulk(evaluationData, userId, overallDocs, session);
    }

    if (quizErrors && quizErrors.length > 0) {
        errors.push(quizErrors[0]);
        return;
    }

    if (overallIds) {
        console.log(isFromDownload, 'isFromDownload in updateTrainingProgress - before calling updateOverallProgressPercentage')
        await updateOverallProgressPercentage(overallDocs, isFromDownload, session);
        await updateTimeSpendInOverallTrainingProgress(input, session)
    }

    const generatedTrainingCertificate = await validateAndGenerateCertificate(overallIds, userId, subscriberId, session);

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

        if (!overallTrainingProgress || overallTrainingProgress.length == 0) {
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

            const overallDoc = overallDocs.find(doc => doc._id.toString() === overallId.toString());
            const attemptCount = overallDoc.attemptCount || 1;

            if (!trainingModuleContent || !trainingModule || !training) {
                continue;
            }

            if (trainingModuleContent.contentType != contentTypes.QUIZ) {
                continue;
            }

            if (questionAnswers && questionAnswers !== null) {

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

                    let isCorrectAnswer;
                    const isAnswerNumber = /^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(userAnswer.answer[0]);

                    if (question.questionType === "FILL_IN_THE_BLANK" && !isAnswerNumber) {

                        const threshold = 2;

                        if (userAnswer.answer.length !== question.answerKey.length) {
                            isCorrectAnswer = false;
                        } else {
                            isCorrectAnswer = userAnswer.answer.every((userAns, index) => {
                                const correctAnswer = question.answerKey[index];
                                const distance = levenshtein.get(correctAnswer.toLowerCase(), userAns.toLowerCase());
                                return distance <= threshold;
                            });
                        }

                        if (isCorrectAnswer) {
                            acquiredScore += question.points;
                        } else {
                            acquiredScore -= question.negativePoints;
                        }

                    } else {

                        isCorrectAnswer = question.answerKey.every(correctAnswer =>
                            userAnswer.answer.includes(correctAnswer)
                        ) && userAnswer.answer.length === question.answerKey.length;

                        if (isCorrectAnswer) {
                            acquiredScore += question.points;
                        } else {
                            acquiredScore -= question.negativePoints;
                        }

                    }

                    return {
                        questionId: question._id,
                        question: question.question,
                        givenAnswer: isCorrectAnswer ? question.answerKey : userAnswer.answer,
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

                // const overallDoc = overallDocs.find(doc => doc._id.toString() === overallId.toString());

                // const attemptCount = overallDoc.attemptCount || 1;

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

                if (!isPassed) {

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
                                    progressPercentage: 0,
                                    status: "IN_PROGRESS",
                                },
                            },
                            upsert: true,
                        },
                    });

                } else {

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

            } else {

                updateTrainingProgressData.push({
                    updateOne: {
                        filter: {
                            overallTrainingProgress: overallId,
                            trainingModuleContent: trainingModuleContent,
                            attemptCount: attemptCount,
                        },
                        update: {
                            $set: {
                                progressPercentage: 0,
                                status: "IN_PROGRESS",
                            },
                        },
                        upsert: true,
                    },
                });

            }

        }

        results = await QuizEvaluation.insertMany(quizEvaluations, { session });
        await TrainingProgress.bulkWrite(updateTrainingProgressData, { session });

        return errors;

    } catch (error) {
        throw Error(error.message);
    }
};

const dataMigrationBackground = async (migrationcourseId, trainingId) => {

    console.log('reached inside dataMigrationBackground');

    // Convert migrationcourseId to ObjectId if it's a string
    if (typeof migrationcourseId === 'string') {
        migrationcourseId = ObjectId(migrationcourseId);
    }

    const migrationCourse = await MigrationCourse.findById(migrationcourseId).select('UID');

    if (!migrationCourse) return;

    const migrationCourseUID = migrationCourse?.UID;

    console.log('migrationCourseUID');
    console.log(migrationCourseUID);

    const completedMigrationUsers = [];

    try {

        const sql = `SELECT EMPLOYEE_ID, EMAIL, FIRST_NAME, LAST_NAME
        FROM (
            SELECT EMPLOYEE_ID, EMAIL, FIRST_NAME, LAST_NAME
            FROM crew_certificates_synergy_new
            WHERE EMAIL IS NOT NULL 
            AND COURSE_ID = ?

            UNION

            SELECT EMPLOYEE_ID, EMAIL, FIRST_NAME, LAST_NAME
            FROM crew_certificates_denmark_new
            WHERE EMAIL IS NOT NULL 
            AND COURSE_ID = ?
        ) AS combined
        GROUP BY EMPLOYEE_ID, EMAIL, FIRST_NAME, LAST_NAME
        ORDER BY FIRST_NAME, LAST_NAME;`;

        // const sql = `SELECT EMPLOYEE_ID, EMAIL FROM crew_certificates_synergy_new LIMIT 5`;

        // const users = await runQueryStream(sql);

        for await (const row of runQueryStream(sql, [migrationCourseUID, migrationCourseUID])) {
            completedMigrationUsers.push(row);
        }

    } catch (error) {
        console.error("❌ SQL query error:", error);
    }


    if (completedMigrationUsers.length === 0) return;

    // User creation start
    const savedRegistrations = await DbTransactionHelper.performDbTransaction(async session => {

        const emails = completedMigrationUsers.map(user => {
            try {
                return encrypt(user.EMAIL.trim().toLowerCase());
            } catch (err) {
                console.error("Encryption failed for email:", user.EMAIL);
                throw err;
            }
        });


        // const ids = completedMigrationUsers.map((user) => encrypt(user.EMPLOYEE_ID));

        const existingUsers = await User.find({
            $or: [
                { email: { $in: emails } },
                // { civilIdOrPassport: { $in: ids } }
            ]
        }).session(session).lean();

        const subscriber = await Subscriber.findOne().session(session).lean();
        let subscriberId;

        if (subscriber) subscriberId = subscriber._id;

        let userIds = [];

        existingUsers.forEach(user => {
            userIds.push(user._id);
        });

        // Course enrollment start
        let existingTrainingRegistration;
        let existingTrainingRegId;
        if (trainingId) {
            existingTrainingRegistration = await TrainingRegistration.findOne({ training: trainingId });

            if (existingTrainingRegistration) {
                existingTrainingRegId = existingTrainingRegistration._id;
            }
        }


        const updateFields = { subscriber: subscriberId, $addToSet: {} };
        if (userIds?.length) {
            updateFields.$addToSet.users = { $each: userIds };
        }

        let savedTrainingRegistration;
        let trainingRegistrationId;
        let notEnrolledUsers = [];

        if (existingTrainingRegistration) {

            let existingOverallProgresses = await OverallTrainingProgress.find({ training: ObjectId(trainingId), user: { $in: userIds } }).session(session).lean();

            /* userIds = userIds.filter(userId =>
                !existingOverallProgresses.some(progress => progress.user.toString() === userId.toString())
            ); */

            savedTrainingRegistration = await TrainingRegistration.updateOne(
                { _id: existingTrainingRegId },
                updateFields,
                { session }
            );

            const updatedRegistrations = await TrainingRegistration.find({
                training: ObjectId(trainingId),
            }).session(session);
            trainingRegistrationId = existingTrainingRegId;

        } else {

            savedTrainingRegistration = await TrainingRegistration.create([{ training: trainingId, users: userIds, subscriber: subscriberId }], { session });
            trainingRegistrationId = savedTrainingRegistration[0]._id;

        }

        if (savedTrainingRegistration) {

            let trainingProgressIds;

            let overallIds = [];
            trainingProgressIds = await createTrainingProgressForMigrationUsersHelper(userIds, trainingId, subscriberId, trainingRegistrationId, session);

        }
        console.log('✅ Courese Migration completed for users count: ', userIds?.length);
        return {
            message: "Course enrollment successful!",
        };
        // Course enrollment end

    });


}

module.exports = {
    uploadTrainingImages,
    updateTrainingProgress,
    addDataToOverallTrainingProgress,
    validateSyncOfflineData,
    generateTrainingUID,
    uploadCertificateTrainingImages,
    dataMigrationBackground,
    extractCourseStructure,
    areCourseStructuresEqual,
    createOrUpdateTraining: async ({ input, coverImage, bannerImage, session }, context) => {
        const { userId, subscriberId } = AuthUser(context);

        const trainingFilterConditions = {
            _id: input._id ?? ObjectId(),
            subscriber: subscriberId,
        };

        const trainingUpdateData = {};
        let trainingData;

        const titleValue = input.title[0].value.trim();

        const existingTraining = await Training.findOne({
            subscriber: subscriberId,
            "title.value": { $regex: `^${titleValue}$`, $options: "i" },
            _id: { $ne: input._id || null },
            isDeleted: { $ne: true },
        });

        if (existingTraining) {
            throw CustomError(
                ErrorName.COURSE_TITLE_ALREADY_EXIST,
                `A training with this title "${input.title[0].value}" already exists.`
            );
        }
        if (!input._id) {
            trainingUpdateData.UID = await generateTrainingUID({
                subscriberId,
                session,
            });
        } else {
            trainingData = await Training.findOne({ _id: input._id });
        }

        if (input.title) trainingUpdateData.title = input.title;
        if (input.overview) trainingUpdateData.overview = input.overview;
        trainingUpdateData.isCertificate = input?.isCertificate ? true : false;
        if (input.status) trainingUpdateData.status = input.status;
        if (input.authorName) trainingUpdateData.authorName = input.authorName;
        if (input.migrationcoursesId) trainingUpdateData.migrationcoursesId = input.migrationcoursesId;
        if (input.certifications && input.isCertification) {
            trainingUpdateData.certifications = await uploadCertificateTrainingImages({
                images: input.certifications,
                folderName: trainingFilterConditions._id,
            });
        }

        if (bannerImage) {
            const { filename } = await bannerImage;
            if (filename && typeof filename == "string") {
                trainingUpdateData.bannerImage = await uploadTrainingBannerImage({
                    bannerImage: bannerImage,
                    folderName: trainingFilterConditions._id,
                });
            } else if (input._id && input.bannerImageDelete) {
                trainingUpdateData.bannerImage = null;
            }
        } else if (input._id && input.bannerImageDelete) {
            trainingUpdateData.bannerImage = null;
        }

        if (typeof input.enableEmailNotification === "boolean") trainingUpdateData.enableEmailNotification = input.enableEmailNotification;
        if (typeof input.isOrdered === 'boolean') {
            trainingUpdateData.isOrdered = input.isOrdered;
        }

        if (input.manadatoryModules) trainingUpdateData.manadatoryModules = input.manadatoryModules;
        if (input.manadatoryModules === 0) trainingUpdateData.manadatoryModules = null;

        if ('allowMultipleAttempts' in input) {

            trainingUpdateData.allowMultipleAttempts = input.allowMultipleAttempts;
            if (input.attemptFlexibility) trainingUpdateData.attemptFlexibility = input.attemptFlexibility;
            if (input.attemptType) trainingUpdateData.attemptType = input.attemptType;
            if (input.attemptType === "LIMITED_ATTEMPT" && input.setLimitAttempt) {
                trainingUpdateData.setLimitAttempt = input.setLimitAttempt;
            } else {
                trainingUpdateData.setLimitAttempt = null;
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
            const { filename } = await coverImage;
            if (filename && typeof filename == "string") {
                trainingUpdateData.coverImage = await uploadTrainingImages({
                    coverImage: coverImage,
                    folderName: trainingFilterConditions._id,
                });
            } else if (input._id && input.coverImageDelete) {
                trainingUpdateData.coverImage = null;
            }
        } else if (input._id && input.coverImageDelete) {
            trainingUpdateData.coverImage = null;
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
                title: [{ lang: "en", value: `Course ${notificationData?.action?.toLowerCase()}` }],
                notificationType: NotificationType["TRAINING_" + notificationData.action],
                notifyAllAdmin: false,
                isNotificatonForAdmin: true,
                employeeNotifiers: notificationData.notifiers ?? [],
                notifiers: [notificationData?.createdBy?._id],
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
                            firstName: decrypt(notificationData.createdBy.firstName),
                            lastName: notificationData.createdBy.lastName ? decrypt(notificationData.createdBy.lastName) : '',
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
                        value: `Admin User "${decrypt(notificationData.createdBy.firstName)}" submitted the training "${trainingTitle}" for approval`,
                    },
                ];
            } else {
                notification.message = [
                    {
                        lang: "en",
                        value: `A new course "${trainingTitle ?? ""}" has been ${notificationData.action} by "${decrypt(notificationData.createdBy?.firstName) ?? ""}"`,
                    },
                ];
            }

            await NotificationHelper.createNotification(notification);
        } catch (e) {
            throw Error(e.message);
        }
    },
};
