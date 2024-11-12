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

const generateTrainingCertificateNumber  =  async ({ subscriberId, userId, session }) => {
    const currentYear = CurrentDateTime().utcDateTimeObj.year();

    const savedCounter = await CounterHelper.updateCounter({
        subscriberId,
        modelName: TrainingCertificate.modelName,
        session,
    });

    if (!savedCounter) throw CustomError(ErrorName.FAILED);
    const subscriberName = process.env.SUBSCRIBER;
    return `CERT-${userId}-${currentYear}-${savedCounter.count
        .toString()
        .padStart(6, "0")}`;
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
                userMessage:[
                    {
                        lang: "en",
                        value: `Your certificate has been generated for completing ${trainingTitle} `,
                    },
                ],
                notificationType: `TRAINING_NEW_${notificationData.action}`,
                notifyAdmin: true,
                notifiers: notificationData.userIds?notificationData.userIds:[],
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
    generateCertificate: async (input,context) => {
        try {
            const { role, userPermissions, userId, subscriberId, employeeId, isOrganizationManager } = AuthUser(context);
    
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
    
            const selectedCertificateLayout = await certificateLayout.findOne({
                layout: setCertificateLayout
            });
    
            if (!selectedCertificateLayout) {
                throw CustomError(ErrorName.NOT_FOUND, "Layout Not Found");
            }
    
            const existingProgressData = await OverallTrainingProgress.findOne({
                trainingRegistration: input.trainingRegistrationId,
                user: userId,
            });
    
            if (!existingProgressData) {
                throw CustomError(ErrorName.NOT_FOUND, "Training Registration Not Found");
            }
    
            const startDate = await TrainingProgress.findOne({
                training: existingProgressData.training._id,
                user: userId,
                trainingModuleContent: existingProgressData.trainingModuleContentIds[0]
            }).createdAt;
    
            const certificateValidity = existingProgressData.training?.certificateValidity;
            const completedAt = CurrentDateTime()?.utcDateTime;
            const generatedAt = CurrentDateTime()?.utcDateTime;
            const expiresAt = certificateValidity && completedAt
                ? ParseDateTime(completedAt)?.utcDateTimeObj.add({ days: certificateValidity }).format()
                : undefined;
            
            const userName = `${existingProgressData.user?.firstName ?? ""} ${existingProgressData.user?.lastName?? ""}`
            const certificateNumber = await generateTrainingCertificateNumber({
                subscriberId, 
                userId,
                session: input.session 
            });
    
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
                additionalData: input.additionalData || [],
            };
    
            const savedTrainingCertificate = await TrainingCertificate.create(certificateData);
    
            if (!savedTrainingCertificate) {
                throw CustomError(ErrorName.FAILED, "Failed to generate certificate");
            }
    
            return savedTrainingCertificate;
    
        } catch (error) {
            throw error;
        }
    }
    
    
    ,
    
};
