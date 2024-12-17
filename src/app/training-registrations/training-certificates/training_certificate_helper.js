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
                        value: `Certificate has been generated for ${notificationData.userId.firstName} ${notificationData.userId.lastName} for completing ${trainingTitle} `,
                    },
                ],
                userMessage: [
                    {
                        lang: "en",
                        value: `Your certificate has been generated for completing ${trainingTitle} `,
                    },
                ],
                notificationType: `TRAINING_NEW_${notificationData.action}`,
                notifyAdmin: true,
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
                            firstName: notificationData.createdBy.firstName,
                            lastName: notificationData.createdBy.lastName,
                        },
                    },
                    {
                        infoType: "EMPLOYEE_INFO",
                        infoData: {
                            _id: notificationData.trainingRegistration.employee?._id,
                            user: {
                                _id: notificationData.trainingRegistration.employee?.user?._id,
                                firstName:
                                    notificationData.trainingRegistration.employee?.user?.firstName,
                                lastName:
                                    notificationData.trainingRegistration.employee?.user?.lastName,
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



module.exports = {
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
            const certificateNumber = await generateSVCertificateId();
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
                notifyAdmin: false,
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

            let errors = [];

            if (!overallDocs || !userId) {
                errors.push("Pass arguments to generate certificate");
                return errors;
            }

            const trainingRegistrations = overallDocs.map(doc => doc.trainingRegistration);

            const existingCertificates = await TrainingCertificate.find({
                trainingRegistration: { $in: trainingRegistrations },
                user: userId
            }).session(session).lean();

            const existingCertRegIds = existingCertificates.map(cert => cert.trainingRegistration.toString());

            const nonExistingRegistrations = trainingRegistrations.filter(regId => !existingCertRegIds.includes(regId.toString()));

            if (nonExistingRegistrations.length > 0) {

                const nonExistingOverallDocs = overallDocs.filter(doc => !nonExistingRegistrations.includes(doc.trainingRegistration.toString()));

                const registrationOverallMap = new Map(
                    overallDocs.map(doc => [doc.trainingRegistration.toString(), doc])
                );

                const trainingIds = [...new Set(nonExistingOverallDocs.map(doc => doc.training._id.toString()))];

                const certificateLayouts = await certificateLayout.find({
                    training: { $in: trainingIds },
                }).session(session).lean();

                const filteredNonExistingOverallDocs = nonExistingOverallDocs.filter(doc => {
                    const layout = certificateLayouts.find(layout => layout.training.toString() === doc.training._id.toString());
                    return layout;
                });

                const certificateLayoutMap = new Map();
                certificateLayouts.forEach(layout => {
                    certificateLayoutMap.set(layout.training.toString(), layout);
                });

                const overallIdCertificateLayoutMap = new Map();
                filteredNonExistingOverallDocs.forEach(doc => {
                    const trainingId = doc.training.toString();
                    if (certificateLayoutMap.has(trainingId)) {
                        overallIdCertificateLayoutMap.set(doc._id.toString(), certificateLayoutMap.get(trainingId));
                    }
                });

                const filteredNonExistingTrainingIds = filteredNonExistingOverallDocs.map(doc => doc.training.toString());
                const trainingData = await Training.find({
                    _id: { $in: filteredNonExistingTrainingIds }
                }).session(session).lean();

                const trainingDataMap = new Map();
                trainingData.forEach(training => {
                    trainingDataMap.set(training._id.toString(), training);
                });
                const overallIdTrainingDataMap = new Map();
                filteredNonExistingOverallDocs.forEach(doc => {
                    const trainingId = doc.training.toString();
                    if (trainingDataMap.has(trainingId)) {
                        overallIdTrainingDataMap.set(doc._id.toString(), trainingDataMap.get(trainingId));
                    }
                });

                const trainingProgresses = await TrainingProgress.find({
                    overallTrainingProgress: { $in: filteredNonExistingOverallDocs.map(doc => doc._id) }
                }).session(session);

                if (trainingProgresses.length === 0) {
                    errors.push("No training progress found");
                    return errors;
                }


                let overallCreatedAtMap;
                if (trainingProgresses.length > 0) {
                    overallCreatedAtMap = new Map(
                        trainingProgresses.map(doc => [doc.overallTrainingProgress.toString(), doc.createdAt])
                    );
                }

                const certificatesToCreate = [];

                for (const overallDoc of filteredNonExistingOverallDocs) {

                    const startDate = overallCreatedAtMap.get(overallDoc._id.toString());

                    const trainingData = overallIdTrainingDataMap.get(overallDoc._id.toString());
                    const certificateValidity = trainingData?.certificateValidity;

                    const completedAt = CurrentDateTime()?.utcDateTime;
                    const expiresAt = certificateValidity
                        ? ParseDateTime(completedAt)?.utcDateTimeObj.add({ days: certificateValidity }).format()
                        : undefined;

                    const certificateNumber = await generateSVCertificateId();

                    const layout = overallIdCertificateLayoutMap.get(overallDoc._id.toString());

                    certificatesToCreate.push({
                        subscriber: trainingData.subscriber,
                        trainingRegistration: overallDoc.trainingRegistration,
                        training: trainingData._id,
                        certificateLayout: layout._id,
                        user: userId,
                        trainingCertificateValidity: certificateValidity,
                        status: 'COMPLETED',
                        certificateNumber,
                        startDate,
                        completedAt,
                        generatedAt: completedAt,
                        expiresAt,
                        additionalData: [],
                    });

                }

                if (certificatesToCreate.length > 0) {
                    await TrainingCertificate.insertMany(certificatesToCreate, { session });
                }

            } else {
                errors.push("No registrations to generate certificates for");
                return errors;
            }

        } catch (error) {
            throw Error(error);
        }
    }
};
