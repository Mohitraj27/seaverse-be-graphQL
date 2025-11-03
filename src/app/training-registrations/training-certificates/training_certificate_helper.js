const { ObjectId } = require("../../../tools");
const { AuthUser, Role, CustomError, ErrorName, CurrentDateTime } = require("../../../util");

const { TrainingCertificate } = require("./training_certificate_model");
const { Subscriber } = require("../../saas/subscriber/subscriber_model");
const { User } = require("../../user/user_model");
const { Employee } = require("../../user/employee/employee_model");

const CounterHelper = require("../../counters/counter_helper");
const NotificationHelper = require("../../notifications/notification_helper");
const NotificationType = require("../../notifications/notification_type.json");
const { certificateLayout } = require("../../trainings/certificate_layout/certificateLayout_model");
const { OverallTrainingProgress } = require("../overall-course-progress/overall_progress_model");
const { TrainingProgress } = require("../training-progress/training_progress_model");
const { Training } = require("../../trainings/training_model");
const { v4: uuidv4 } = require('uuid');
const notificationiconEnum = require("../../notifications/notification_icon.json");
const { decrypt } = require('../../../util/encryption_helper');
const generateTrainingCertificateNumber = async ({ subscriberId, userId, session }) => {
    const currentYear = CurrentDateTime().utcDateTimeObj.year();

    const savedCounter = await CounterHelper.updateCounter({
        subscriberId,
        modelName: TrainingCertificate.modelName,
        session
    });

    if (!savedCounter) throw CustomError(ErrorName.FAILED);
    const subscriberName = process.env.SUBSCRIBER;
    return `CERT-${userId}-${currentYear}-${savedCounter.count
        .toString()
        .padStart(6, "0")}`;
}

const generateSVCertificateId = async () => {
    const uuid = uuidv4().replace(/-/g, '').toUpperCase();
    const certNumber = `SV-${uuid.substring(0, 8)}`;
    return certNumber;
}

const generateUniqueCertificateId = async () => {
    const date = new Date();
    const formattedDate = date.toLocaleDateString("en-GB").replace(/\//g, "");
    const prefix = "CERT";

    let newCertId;
    let isUnique = false;

    while (!isUnique) {

        const lastCertificate = await TrainingCertificate.findOne().sort({ createdAt: -1 });

        if (lastCertificate) {
            const lastCertificateIdNum = parseInt(lastCertificate.certificateNumber.slice(12), 10);
            const newCertNum = lastCertificateIdNum + 1;
            const paddedNewCertNum = newCertNum.toString().padStart(5, "0");
            newCertId = `${prefix}${formattedDate}${paddedNewCertNum}`;
        } else {
            newCertId = `${prefix}${formattedDate}00001`;
        }

        // Check if this ID is unique
        const existingCert = await TrainingCertificate.findOne({ certificateNumber: newCertId });

        if (!existingCert) {
            isUnique = true;
        }
    }
    return newCertId;
}

const sendCertificateGenerationNotification = async notificationsData => {
    if (notificationsData?.length) {
        const notifications = [];

        const training = await Training.findById(notificationsData[0].trainingRegistration.training)
            .select("title")
            .lean();

        const trainingTitle = training?.title.find(x => x.lang === "en" || x.lang === "ar")?.value;

        for (const notificationData of notificationsData) {
            const notification = {
                subscriber: notificationData.subscriber,
                title: [{ lang: "en", value: "Certificate Generated" }],
                message: [
                    {
                        lang: "en",
                        value: `Certificate has been generated for ${decrypt(notificationData.userId.firstName)} ${decrypt(notificationData.userId.lastName)} for completing ${trainingTitle} `,
                    },
                ],
                userMessage: [
                    {
                        lang: "en",
                        value: `Your certificate has been generated for completing ${trainingTitle} `,
                    },
                ],
                notificationType: `TRAINING_NEW_${notificationData.action}`,
                notifyAllAdmin: true,
                isNotificatonForAdmin: false,
                notifiers: notificationData.userIds ? notificationData.userIds : [],
                employeeNotifiers: [],
                affected: [
                    {
                        targetRef: "TrainingRegistration",
                        target: notificationData.trainingRegistration._id,
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
                        infoType: "EMPLOYEE_INFO",
                        infoData: {
                            _id: notificationData.trainingRegistration.employee?._id,
                            user: {
                                _id: notificationData.trainingRegistration.employee?.user?._id,
                                firstName:
                                    decrypt(notificationData.trainingRegistration.employee?.user?.firstName),
                                lastName:
                                    notificationData.trainingRegistration.employee?.user?.lastName ? decrypt(notificationData.trainingRegistration.employee?.user?.lastName) : '',
                            },
                        },
                    },
                    {
                        infoType: "TRAINING_INFO",
                        infoData: {
                            _id: training?._id,
                            title: training?.title,
                        },
                    },
                ],
                createdBy: notificationData.createdBy,
            };

            notifications.push(notification);
        }

        await NotificationHelper.createNotification(notifications);
    }
};

const calculateExpiryDate = async (completionDateStr, validityPeriod) => {
    if (validityPeriod === null) {
        return null;
    }
    const completionDate = new Date(completionDateStr);
    completionDate.setDate(completionDate.getDate() + validityPeriod);

    return completionDate.toISOString();
}


module.exports = {
    calculateExpiryDate,
    generateUniqueCertificateId,
    generateCertificate: async (input, context) => {
        try {
            const { role, userPermissions, userId, subscriberId, employeeId, isOrganizationManager, userInfo } = AuthUser(context);

            if (!input.trainingRegistrationId) {
                throw CustomError(ErrorName.ARGUMENTS_REQUIRED);
            }

            const setCertificateLayout = "0";

            const existingCertificate = await TrainingCertificate.findOne({
                trainingRegistration: input.trainingRegistrationId,
                user: userId
            });

            if (existingCertificate) {
                throw CustomError(ErrorName.ALREADY_EXIST, "Certificate already exists for this user and training registration.");
            }


            const existingProgressData = await OverallTrainingProgress.findOne({
                trainingRegistration: input.trainingRegistrationId,
                user: userId,
            });

            if (!existingProgressData) {
                throw CustomError(ErrorName.NOT_FOUND, "Training Registration Not Found");
            }

            const selectedCertificateLayout = await certificateLayout.findOne({
                training: existingProgressData.training._id,
            });

            if (!selectedCertificateLayout) {
                throw CustomError(ErrorName.NOT_FOUND, "Layout Not Found");
            }

            const firstContentInfo = await TrainingProgress.findOne({
                trainingRegistration: existingProgressData.trainingRegistration._id,
                user: userId,
                trainingModuleContent: existingProgressData.trainingModuleContentIds[0]
            });

            const selectedCourse = await Training.findOne({
                _id: existingProgressData.training?._id
            })
            if (!selectedCourse) {
                throw CustomError(ErrorName.NOT_FOUND, "course not found");
            }

            const startDate = firstContentInfo.createdAt;

            const certificateValidity = selectedCourse?.certificateValidity;
            const completedAt = CurrentDateTime()?.utcDateTime;
            const generatedAt = CurrentDateTime()?.utcDateTime;
            const expiresAt = certificateValidity && completedAt
                ? ParseDateTime(completedAt)?.utcDateTimeObj.add({ days: certificateValidity }).format()
                : undefined;

            const userName = `${existingProgressData.user?.firstName ?? ""} ${existingProgressData.user?.lastName ?? ""}`
            const certificateNumber = await generateUniqueCertificateId();
            const certificateData = {
                subscriber: subscriberId,
                trainingRegistration: input.trainingRegistrationId,
                training: existingProgressData.training,
                certificateLayout: selectedCertificateLayout._id,
                user: userId,
                trainingCertificateValidity: certificateValidity,
                status: "COMPLETED",
                certificateNumber: certificateNumber,
                startDate: startDate,
                completedAt: completedAt,
                generatedAt: generatedAt,
                expiresAt: expiresAt,
                certificateLayout: selectedCertificateLayout._id,
                additionalData: input.additionalData || [],
            };

            const savedTrainingCertificate = await TrainingCertificate.create(certificateData);

            if (!savedTrainingCertificate) {
                throw CustomError(ErrorName.FAILED, "Failed to generate certificate");
            }

            await NotificationHelper.createNotificationhelper({
                subscriber: subscriberId,
                titleValue: `Certificate Generated Successfully`,
                messageValue: `Congratulations! Your certificate for completing the course ${selectedCourse.title} has been successfully generated.`,
                notificationType: NotificationType.CERTIFICATE_GENERATED_SUCCESS,
                notifyAllAdmin: false,
                isNotificatonForAdmin: false,
                notifiers: [userId],
                employeeNotifiers: [userId],
                status: 'SENT',
                createdBy: userInfo,
                icon: notificationiconEnum.SUCCESS
            });
            return savedTrainingCertificate;

        } catch (error) {
            throw error;
        }
    },

    generateCertificateBulk: async (overallDocs, userId, subscriber, session) => {

        try {
            console.log("\n\ngenerating Certificates in bulk");
            const overallDocIds = overallDocs?.map(doc => doc?._id);
            const overallDocIsCertificateGeneratedList = overallDocs?.map(doc => doc?.isCertificateGenerated);
            console.log(`[CERT-GEN] Starting for user: ${userId}, overallDocs length: ${overallDocs.length}, IDs: ${overallDocIds}, flags: ${overallDocIsCertificateGeneratedList}`);
            let errors = [];

            if (!overallDocs || !userId) {
                errors.push("Pass arguments to generate certificate");
                return errors;
            }

            const trainingRegistrations = overallDocs.map(doc => doc.trainingRegistration);
            const trainigIds = overallDocs.map(doc => doc.training);

            // Use atomic findAndModify to prevent race conditions
            const atomicUpdates = [];
            for (const doc of overallDocs) {
                try {
                    const updatedDoc = await OverallTrainingProgress.findOneAndUpdate(
                        {
                            _id: doc._id,
                            isCertificateGenerated: { $ne: true } // Only update if not already generated
                        },
                        {
                            $set: { isCertificateGenerated: true }
                        },
                        {
                            new: true,
                            session: session
                        }
                    );

                    if (updatedDoc) {
                        atomicUpdates.push(doc);
                    }
                } catch (error) {
                    console.log(`Failed to atomically update doc ${doc._id}:`, error);
                }
            }

            console.log(`[CERT-GEN] Atomic updates successful for ${atomicUpdates.length} out of ${overallDocs.length} documents`);

            if (atomicUpdates.length === 0) {
                console.log(`[CERT-GEN] No documents to process - certificates already generated`);
                errors.push("Certificates already generated for all provided registrations");
                return errors;
            }

            // Double-check for existing certificates (safety measure)
            const existingCertificates = await TrainingCertificate.find({
                trainingRegistration: { $in: atomicUpdates.map(doc => doc.trainingRegistration) },
                training: { $in: atomicUpdates.map(doc => doc.training) },
                user: userId
            }).session(session).lean();

            const existingCombinations = new Set(
                existingCertificates.map(cert =>
                    `${cert.trainingRegistration.toString()}-${cert.training.toString()}`
                )
            );

            const nonExistingOverallDocs = atomicUpdates.filter(doc => {
                const combinationKey = `${doc.trainingRegistration.toString()}-${doc.training.toString()}`;
                return !existingCombinations.has(combinationKey);
            });

            const assignedLayoutKeys = nonExistingOverallDocs.map(doc => doc.assignedCertificateLayout);
            const certificateLayouts = await certificateLayout.find({
                layout: { $in: assignedLayoutKeys },
            }).session(session).lean();

            const certificateLayoutMap = new Map(
                certificateLayouts.map(layout => [layout.layout, layout])
            );

            const validOverallDocs = nonExistingOverallDocs.filter(doc =>
                certificateLayoutMap.has(doc.assignedCertificateLayout)
            );

            if (validOverallDocs.length === 0) {
                errors.push("No valid certificate layouts found for the registrations");
                return errors;
            }

            const validTrainingIds = [...new Set(validOverallDocs.map(doc => doc.training.toString()))];
            const trainingData = await Training.find({
                _id: { $in: validTrainingIds }
            }).session(session).lean();

            const trainingDataMap = new Map(
                trainingData.map(training => [training._id.toString(), training])
            );

            /* 
            
            //removed because it was  throwing error instead of generating certificates when the course ends with ppt or pdf
            //hope this was used for getting the startDate
            const trainingProgresses = await TrainingProgress.find({
                overallTrainingProgress: { $in: validOverallDocs.map(doc => doc._id) }
            }).session(session); 
    
            if (trainingProgresses.length === 0) {
                errors.push("No training progress found");
                return errors;
            }
    
            const overallCreatedAtMap = new Map(
                trainingProgresses.map(doc => [doc.overallTrainingProgress.toString(), doc.createdAt])
            ); 
            */

            const certificatesToCreate = [];
            const sendCertificateNotification = [];

            for (const overallDoc of validOverallDocs) {
                const trainingId = overallDoc.training.toString();
                const training = trainingDataMap.get(trainingId);

                if (!training) continue;

                // Note: isCertificateGenerated check is now handled atomically above
                const certificateLayout = overallDoc?.assignedCertificateLayoutId;
                const startDate = overallDoc?.startDate ?? CurrentDateTime().utcDateTime;
                const completedAt = overallDoc?.completionDate ?? CurrentDateTime().utcDateTime;
                const expiresAt = overallDoc.certificateExpiry
                    ? await calculateExpiryDate(completedAt, overallDoc.certificateExpiry)
                    : null;

                // Prepare certificate
                const certificate = {
                    subscriber: training.subscriber,
                    trainingRegistration: overallDoc.trainingRegistration,
                    training: training._id,
                    certificateLayout: certificateLayout,
                    user: userId,
                    trainingCertificateValidity: overallDoc.certificateExpiry,
                    status: "COMPLETED",
                    certificateNumber: await generateUniqueCertificateId(),
                    startDate,
                    completedAt,
                    generatedAt: completedAt,
                    expiresAt,
                    additionalData: [],
                };
                certificatesToCreate.push(certificate);

                // Prepare notification (if applicable)
                const courseTitle = training.title?.find(item => item.lang === "en")?.value;

                sendCertificateNotification.push({
                    subscriber: subscriber,
                    title: [{ lang: "en", value: `Your course certificate issued` }],
                    message: [
                        {
                            lang: "en",
                            value: `Congratulations! Certificate for the ${courseTitle} has been issued.`,
                        },
                    ],
                    notificationType: NotificationType.COURSE_COMPLETION,
                    notifyAllAdmin: false,
                    isNotificatonForAdmin: false,
                    notifiers: [userId],
                    employeeNotifiers: [userId],
                    additionalInfo: [],
                    affected: [],
                    createdBy: null,
                    status: "SENT",
                    icon: notificationiconEnum.SUCCESS,
                    isRead: false,
                });
                
            }

            // Insert certificates
            if (certificatesToCreate.length > 0) {
                console.log(`[CERT-GEN] Creating ${certificatesToCreate.length} certificates`);
                try {
                    await TrainingCertificate.insertMany(certificatesToCreate, {
                        session,
                        ordered: false // Continue inserting even if some fail due to duplicates
                    });
                    console.log(`[CERT-GEN] Successfully created ${certificatesToCreate.length} certificates`);
                } catch (error) {
                    // Handle duplicate key errors gracefully
                    if (error.code === 11000 || error.name === 'BulkWriteError' ||
                        (error.writeErrors && error.writeErrors.some(e => e.code === 11000))) {
                        console.log(`[CERT-GEN] Some certificates already exist (duplicate key error), continuing...`);
                        // Count successful inserts from bulk write error
                        const successfulInserts = error.result ? error.result.insertedCount :
                            (error.insertedCount !== undefined ? error.insertedCount : 0);
                        console.log(`[CERT-GEN] Successfully created ${successfulInserts} new certificates out of ${certificatesToCreate.length} attempted`);

                        // Log which ones were duplicates for debugging
                        if (error.writeErrors) {
                            const duplicateErrors = error.writeErrors.filter(e => e.code === 11000);
                            console.log(`[CERT-GEN] ${duplicateErrors.length} certificates were duplicates`);
                        }
                    } else {
                        console.error(`[CERT-GEN] Unexpected error during certificate creation:`, error);
                        throw error;
                    }
                }

                // Send notifications
                if (sendCertificateNotification.length > 0) {
                    console.log(
                        `[CERT-FLOW] Sending ${sendCertificateNotification.length} certificate notifications`
                    );
                    await NotificationHelper.createNotification(sendCertificateNotification);
                } else {
                    console.log(`[CERT-FLOW] No certificate notifications to send`);
                }
            } else {
                console.log(`[CERT-GEN] No certificates to create`);
            }

            return errors;
        } catch (error) {
            console.log("Error in generateCertificateBulk", error);
            throw Error(error);
        }
    }
};
