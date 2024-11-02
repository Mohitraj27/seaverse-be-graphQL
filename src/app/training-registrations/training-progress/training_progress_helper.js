const { ObjectId } = require("../../../tools");
const {
    SendEmail,
    AuthUser,
    Wait,
    CustomError,
    ErrorName,
    CurrentDateTime,
    DbTransactionHelper,
    Role,
    EmailTemplate,
    ParseDateTime,
} = require("../../../util");

const {
    TrainingModuleContent,
} = require("../../trainings/training_modules/training_module_contents/training_module_content_model");
const { TrainingProgress } = require("./training_progress_model");
const { TrainingRegistration } = require("../training_registration_model");
const { TrainingCertificate } = require("../training-certificates/training_certificate_model");
const { User } = require("../../user/user_model");
const { SubscriberProfile } = require("../../user/subscriber-profile/subscriber_profile_model");

const TrainingAttendanceHelper = require("../training-attendance/training_attendance_helper");
const TrainingCertificateHelper = require("../training-certificates/training_certificate_helper");
const NotificationHelper = require("../../notifications/notification_helper");
const SubRoleHelper = require("../../user/sub-roles/sub_role_helper");
const { TrainingMode } = require("../training_mode");

const TrainingRegistrationStatus = require("../training_registration_status.json");
const NotificationType = require("../../notifications/notification_type.json");
const Permission = require("../../user/sub-roles/permission.json");
const { EnvSubscriberHelper } = require("../../env_subscriber_helper");
const { Subscriber } = require("../../saas/subscriber/subscriber_model");
const ScromHelper = require("../../trainings/scrom_helper");

const sendCourseCompletionMail = async data => {
    try {
        await Wait(0);
        let subscriberLogo = null;
        let subscriberDetails = {};

        if (data?.subscriber) {
            let subscriberData = await SubscriberProfile.findOne({
                subscriber: data.subscriber,
            })
                .lean()
                .populate("user");
            subscriberLogo = subscriberData?.user?.avatar;
            subscriberDetails.name = `${subscriberData?.user?.firstName ?? ""} ${
                subscriberData?.user?.lastName ?? ""
            }`;
        }
        const receiverEmail = data.employee?.user?.email;
        const trainingTitle = data.trainingTitle?.find(x => x.lang === "en")?.value;
        const trainingRegistrationId = data.trainingRegistration?._id ?? data.trainingRegistration;

        let html = `
                <div style="padding: 20px; text-align: center">
                    <h2 style="color: #281166">Congratulations!</h2>
        
                    <p style="color: #281166">You have successfully completed the course</p>
        
                    <p style="color: #281166">"${trainingTitle}"</p>
        
                    <a
                        href="${process.env.EMPLOYEE_DOMAIN_URL}en/course-certificate/${trainingRegistrationId}"
                    >
                    <button type="button" style="border: none;border-radius: 5px;background-color: #5928E5;color: white;width: 200px;padding: 8px;margin-bottom: 30px;">Click to view and download the certificate</button>
                    </a>
                </div>
            `;

        await SendEmail({
            receiverEmail,
            subject: "Course completion",
            htmlContent: EmailTemplate.emailTemplate(subscriberLogo, subscriberDetails, html),
        }).catch(error => {
            console.log("training_progress_helper.sendCourseCompletionMail:error:", error?.message);
        });
    } catch (e) {
        console.log("training_progress_helper.sendCourseCompletionMail:exception:", e?.message);
    }
};

const sendTrainingProgressNotification = async (notificationsList, context) => {
    try {
        await Wait(0);

        const { userId, userInfo, subscriberId } = AuthUser(context);

        let employeeName, trainingTitle, trainerId, supervisorId, updatedBy;

        if (notificationsList?.length) {
            const trainingRegistration = notificationsList[0].trainingRegistration;

            if (trainingRegistration?.employee?.user?._id?.toString() !== userId.toString()) {
                updatedBy = userInfo;
            }
        }

        const notifications = notificationsList.map(notification => {
            const notificationType = notification.notificationType;
            const trainingRegistration = notification.trainingRegistration;
            const trainingProgress = notification.trainingProgress;
            const trainingCertificate = notification.trainingCertificate;

            let title = "";
            let message = "";
            const employeeNotifiers = [];
            const affected = [
                {
                    targetRef: "TrainingRegistration",
                    target: trainingRegistration?._id,
                },
            ];
            const additionalInfo = [
                {
                    infoType: "EMPLOYEE_INFO",
                    infoData: {
                        _id: trainingRegistration?.employee?._id,
                        user: {
                            _id: trainingRegistration?.employee?.user?._id,
                            firstName: trainingRegistration?.employee?.user?.firstName,
                            lastName: trainingRegistration?.employee?.user?.lastName,
                        },
                    },
                },
                {
                    infoType: "TRAINING_INFO",
                    infoData: {
                        _id: trainingRegistration?.training?._id,
                        title: trainingRegistration?.training?.title,
                    },
                },
            ];

            employeeName ??= trainingRegistration?.employee?.user?.firstName;

            trainingTitle ??= trainingRegistration?.training?.title?.find(
                x => x.lang === "en" || x.lang === "ar"
            )?.value;

            const trainingModuleContentTitle = trainingProgress?.trainingModuleContent?.title?.find(
                x => x.lang === "en" || x.lang === "ar"
            )?.value;

            trainerId ??= ObjectId.isValid(trainingRegistration?.trainer)
                ? trainingRegistration?.trainer
                : trainingRegistration?.trainer?._id;

            if (trainerId) {
                employeeNotifiers.push(trainerId);
            }

            supervisorId ??= ObjectId.isValid(trainingRegistration?.supervisor)
                ? trainingRegistration?.supervisor
                : trainingRegistration?.supervisor?._id;

            if (supervisorId) {
                employeeNotifiers.push(supervisorId);
            }

            if (
                notificationType === NotificationType.TRAINING_QUIZ_PASSED ||
                notificationType === NotificationType.TRAINING_QUIZ_FAILED
            ) {
                if (notificationType === NotificationType.TRAINING_QUIZ_PASSED) {
                    title = `Employee "${employeeName}" passed the quiz`;
                    message = `Employee "${employeeName}" passed the quiz titled "${trainingModuleContentTitle}" in the course "${trainingTitle}"`;
                } else if (notificationType === NotificationType.TRAINING_QUIZ_FAILED) {
                    title = `Employee "${employeeName}" failed the quiz`;
                    message = `Employee "${employeeName}" failed the quiz titled "${trainingModuleContentTitle}" in the course "${trainingTitle}"`;
                }

                affected.push({
                    targetRef: "TrainingProgress",
                    target: trainingProgress?._id,
                });

                additionalInfo.push({
                    infoType: "TRAINING_MODULE_CONTENT_INFO",
                    infoData: {
                        _id: trainingProgress?.trainingModuleContent?._id,
                        title: trainingProgress?.trainingModuleContent?.title,
                    },
                });
            } else if (notificationType === NotificationType.TRAINING_STARTED) {
                title = `Employee "${employeeName}" started the course`;
                message = `Employee "${employeeName}" started the course "${trainingTitle}"`;
            } else if (notificationType === NotificationType.TRAINING_COMPLETED) {
                if (updatedBy) {
                    title = `Admin user "${updatedBy.firstName}" changed the course status for employee`;
                    message = `Admin user "${updatedBy.firstName}" changed the course(${trainingTitle}) status to "COMPLETED" for employee "${employeeName}"`;

                    additionalInfo.push({
                        infoType: "UPDATER_INFO",
                        infoData: {
                            _id: updatedBy._id,
                            firstName: updatedBy.firstName,
                            lastName: updatedBy.lastName,
                        },
                    });
                } else {
                    title = `Employee "${employeeName}" completed the course`;
                    message = `Employee "${employeeName}" completed the course "${trainingTitle}"`;
                }
            } else if (notificationType === NotificationType.CERTIFICATE_GENERATED) {
                affected.push({
                    targetRef: "TrainingCertificate",
                    target: trainingCertificate?._id,
                });

                additionalInfo.push({
                    infoType: "TRAINING_CERTIFICATE_INFO",
                    infoData: {
                        _id: trainingCertificate?._id,
                        certificateNumber: trainingCertificate?.certificateNumber,
                    },
                });

                if (updatedBy) {
                    title = `Admin user "${updatedBy.firstName}" generated course certificate for employee`;
                    message = `Admin user "${updatedBy.firstName}" generated certificate for the course "${trainingTitle}" for employee "${employeeName}" with certificate no.: ${trainingCertificate?.certificateNumber}`;

                    additionalInfo.push({
                        infoType: "UPDATER_INFO",
                        infoData: {
                            _id: updatedBy._id,
                            firstName: updatedBy.firstName,
                            lastName: updatedBy.lastName,
                        },
                    });
                } else {
                    title = `Generated course certificate for employee`;
                    message = `Generated certificate for the course "${trainingTitle}" for employee "${employeeName}" with certificate no.: ${trainingCertificate?.certificateNumber}`;
                }
            }

            return {
                subscriber: subscriberId,
                organization: trainingRegistration.organization?._id,
                title: [{ lang: "en", value: title }],
                message: [{ lang: "en", value: message }],
                notificationType,
                notifyAdmin: true,
                employeeNotifiers,
                affected,
                additionalInfo,
                createdBy: userId,
            };
        });

        await NotificationHelper.createNotification(notifications);
    } catch (e) {
        console.log(
            "training_progress_helper.sendTrainingProgressNotification:exception:",
            e?.message
        );
    }
};

module.exports = {
    updateTrainingProgress: async ({ input, existingTrainingRegistration }, context) => {
        const { role, userPermissions, userId, subscriberId, employeeId, isOrganizationManager } =
            AuthUser(context);

        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
        const existingSubscriberUser = (
            await Subscriber.findById(subscriberId).lean().populate("user")
        )?.user;

        if (!input.trainingRegistrationId) throw CustomError(ErrorName.ARGUMENTS_REQUIRED);



        const findAndUpdateTrainingProgress = async filterConditions => {
            let savedTrainingCertificate, notificationTrainingRegistrationStatus;

            let currentExistingTrainingModuleContent;
            let currentExistingTrainingProgress;
            let quizStatus;

            if (input.currentTrainingModuleContentId) {
                currentExistingTrainingModuleContent = await TrainingModuleContent.findById(
                    input.currentTrainingModuleContentId
                )
                    .lean()
                    .populate("quizContent");

                if (!currentExistingTrainingModuleContent) throw CustomError(ErrorName.NOT_FOUND);

                currentExistingTrainingProgress = await TrainingProgress.findOne({
                    trainingRegistration: input.trainingRegistrationId,
                    trainingModuleContent: input.currentTrainingModuleContentId,
                });

                if (!currentExistingTrainingProgress) throw CustomError(ErrorName.NOT_FOUND);

                currentExistingTrainingProgress.updatedBy = userId;

                if (input.currentTrainingModuleContentQuestionAnswers) {
                    const quizContent =
                        currentExistingTrainingModuleContent?.quizContent?.quiz ??
                        currentExistingTrainingModuleContent?.quiz;

                    let totalMark = 0;
                    let acquiredMark = 0;

                    const questionAnswers = input.currentTrainingModuleContentQuestionAnswers.map(
                        item => {
                            const existingQuestion = quizContent?.questionAnswers.find(
                                x => x._id.toString() === item.questionId.toString()
                            );

                            totalMark += existingQuestion?.mark ?? 0;
                            let isCorrectAnswer = false;
                            const correctAnswerKey = existingQuestion?.answerKey;
                            const givenAnswerKey = item.givenAnswerKey?.toLowerCase();

                            if (existingQuestion && correctAnswerKey === givenAnswerKey) {
                                acquiredMark += existingQuestion.mark ?? 0;
                                isCorrectAnswer = true;
                            }

                            return {
                                questionId: existingQuestion?._id,
                                question: existingQuestion?.question,
                                choices: existingQuestion?.choices,
                                givenAnswer: existingQuestion?.choices?.find(
                                    x => x.key === givenAnswerKey
                                )?.value,
                                correctAnswer: existingQuestion?.choices?.find(
                                    x => x.key === existingQuestion?.answerKey
                                )?.value,
                                givenAnswerKey,
                                correctAnswerKey,
                                isCorrectAnswer,
                            };
                        }
                    );

                    const acquiredMarkPercentage = (acquiredMark / totalMark) * 100;
                    const passMarkPercentage = quizContent?.passMark ?? 0;
                    quizStatus = acquiredMarkPercentage >= passMarkPercentage ? "PASSED" : "FAILED";

                    currentExistingTrainingProgress.quizAttempts.push({
                        questionAnswers,
                        totalMark,
                        acquiredMark,
                        status: quizStatus,
                        attemptedAt: CurrentDateTime().utcDateTime,
                    });
                    if (quizStatus === "FAILED") {
                        delete input.currentTrainingModuleContentStatus;
                        delete input.nextTrainingModuleContentId;
                        delete input.trainingRegistrationStatus;
                        delete input.trainingRegistrationProgressPercentage;
                    }
                }

                if (
                    input.currentTrainingModuleContentStatus === "COMPLETED" &&
                    currentExistingTrainingProgress.status !== "COMPLETED"
                ) {
                    currentExistingTrainingProgress.trainingModuleContentData = {
                        trainingId: currentExistingTrainingModuleContent.training,
                        trainingModuleId: currentExistingTrainingModuleContent.trainingModule,
                        trainingModuleContentId: currentExistingTrainingModuleContent._id,
                        ...currentExistingTrainingModuleContent,
                    };

                    currentExistingTrainingProgress.status =
                        input.currentTrainingModuleContentStatus;

                    currentExistingTrainingProgress.completedAt = CurrentDateTime().utcDateTime;
                }

                if (input.currentTrainingModuleContentLastAccessedItem) {
                    currentExistingTrainingProgress.lastAccessedItem =
                        input.currentTrainingModuleContentLastAccessedItem;

                    currentExistingTrainingProgress.lastAccessedAt = CurrentDateTime().utcDateTime;

                    currentExistingTrainingProgress.lastAccessedDuration =
                        input.currentTrainingModuleContentLastAccessedDuration;
                }
            }
            let nextExistingTrainingModuleContent;
            let nextTrainingProgressUpdateData;

            if (input.nextTrainingModuleContentId) {
                nextExistingTrainingModuleContent = await TrainingModuleContent.findById(
                    input.nextTrainingModuleContentId
                )
                    .lean()
                    .populate("quizContent");

                if (!nextExistingTrainingModuleContent) throw CustomError(ErrorName.NOT_FOUND);

                const quizContent =
                    nextExistingTrainingModuleContent?.quizContent?.quiz ??
                    nextExistingTrainingModuleContent?.quiz;

                nextTrainingProgressUpdateData = {
                    subscriber: subscriberId,
                    trainingRegistration: input.trainingRegistrationId,
                    trainingModuleContent: input.nextTrainingModuleContentId,
                    trainingModuleContentData: {
                        trainingId: nextExistingTrainingModuleContent.training,
                        trainingModuleId: nextExistingTrainingModuleContent.trainingModule,
                        trainingModuleContentId: nextExistingTrainingModuleContent._id,
                        ...nextExistingTrainingModuleContent,
                    },
                    retryCount: quizContent?.retryCount ?? 1,
                    status: "ON_GOING",
                    startedAt: CurrentDateTime().utcDateTime,
                    createdBy: userId,
                };
            }

            existingTrainingRegistration ??= await TrainingRegistration.findOne({
                _id: input.trainingRegistrationId,
                subscriber: subscriberId,
                ...filterConditions,
                isActive: true,
            });

            if (!existingTrainingRegistration) throw CustomError(ErrorName.FAILED);

            existingTrainingRegistration.updatedBy = userId;
            input.trainingMode = existingTrainingRegistration.trainingMode ?? input.trainingMode;

            const existingTrainingCertificate = await TrainingCertificate.findOne({
                trainingRegistration: input.trainingRegistrationId,
            })
                .lean()
                .select("_id");

            await existingTrainingRegistration
                .populate([
                    { path: "training" },
                    { path: "organization" },
                    {
                        path: "employee",
                        populate: { path: "user" },
                    },
                    {
                        path: "trainer",
                        populate: { path: "user" },
                    },
                ])
                .execPopulate();

            if (existingTrainingRegistration.training?.scorm) {
                if (existingTrainingRegistration.training.scorm.type == "CLOUD") {
                    let scormInput = {
                        learnerId: String(subscriberId),
                        courseId: String(existingTrainingRegistration.training.scorm.courseId),
                        registrationId: existingTrainingRegistration?.scorm.registrationId,
                    };
                    let launchData = await ScromHelper.buildLaunchUrl(scormInput);
                    existingTrainingRegistration.scorm = {
                        courseId: String(existingTrainingRegistration.training.scorm.courseId),
                        launchUrl: launchData.launchLink,
                        registrationId: launchData.registrationId,
                        learnerId: String(subscriberId),
                    };
                }

            }

            if (
                !existingTrainingRegistration.sortedTrainingModules?.length &&
                input.trainingRegistrationSortedTrainingModules
            ) {
                existingTrainingRegistration.sortedTrainingModules =
                    input.trainingRegistrationSortedTrainingModules;
            }

            if (
                input.trainingRegistrationStatus &&
                existingTrainingRegistration.status !== input.trainingRegistrationStatus
            ) {
                if (input.trainingRegistrationStatus === TrainingRegistrationStatus.STARTED) {
                    notificationTrainingRegistrationStatus = TrainingRegistrationStatus.STARTED;
                    existingTrainingRegistration.status = TrainingRegistrationStatus.STARTED;
                    existingTrainingRegistration.startedAt = CurrentDateTime().utcDateTime;
                } else if (
                    input.trainingRegistrationStatus === TrainingRegistrationStatus.COMPLETED
                ) {
                    notificationTrainingRegistrationStatus = TrainingRegistrationStatus.COMPLETED;
                    existingTrainingRegistration.status = TrainingRegistrationStatus.COMPLETED;

                    if (input.trainingMode === TrainingMode.ONLINE) {
                        existingTrainingRegistration.completedAt = CurrentDateTime().utcDateTime;
                    } else {
                        const endDate = ParseDateTime(
                            existingTrainingRegistration.endDate
                        )?.utcDateTimeObj?.format();

                        existingTrainingRegistration.completedAt =
                            endDate ?? CurrentDateTime().utcDateTime;
                    }
                }
            }

            if (input.trainingRegistrationProgressPercentage != null) {
                existingTrainingRegistration.trainingProgressPercentage =
                    input.trainingRegistrationProgressPercentage;
            }

            if (input.trainingMode && !existingTrainingRegistration.trainingMode) {
                existingTrainingRegistration.trainingMode = input.trainingMode;
            }

            const result = await DbTransactionHelper.performDbTransaction(async session => {
                const savedTrainingProgresses = [];

                if (currentExistingTrainingProgress) {
                    const currentSavedTrainingProgress = await currentExistingTrainingProgress.save(
                        { session }
                    );

                    if (!currentSavedTrainingProgress) throw CustomError(ErrorName.FAILED);

                    if (currentSavedTrainingProgress) {
                        savedTrainingProgresses.push({
                            ...currentSavedTrainingProgress.toJSON(),
                            trainingModuleContent: currentExistingTrainingModuleContent,
                        });
                    }
                }
                if (nextTrainingProgressUpdateData) {
                    const nextSavedTrainingProgress = await TrainingProgress.findOneAndUpdate(
                        {
                            trainingRegistration: input.trainingRegistrationId,
                            trainingModuleContent: input.nextTrainingModuleContentId,
                        },
                        {
                            $setOnInsert: nextTrainingProgressUpdateData,
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

                    if (!nextSavedTrainingProgress) throw CustomError(ErrorName.FAILED);

                    if (nextSavedTrainingProgress) {
                        savedTrainingProgresses.push({
                            ...nextSavedTrainingProgress,
                            trainingModuleContent: nextExistingTrainingModuleContent,
                        });
                    }
                }
                const savedTrainingRegistration = await existingTrainingRegistration.save({
                    session,
                });

                if (!savedTrainingRegistration) throw CustomError(ErrorName.NOT_FOUND);
                if (input.trainingRegistrationStatus === TrainingRegistrationStatus.STARTED) {
                    savedTrainingRegistration.trainingAttendance =
                        await TrainingAttendanceHelper.createOrUpdateTrainingAttendance(
                            {
                                input: {
                                    trainingRegistrationId: input.trainingRegistrationId,
                                    employee: savedTrainingRegistration.employee,
                                    attendances: [
                                        { date: CurrentDateTime().utcDate, status: "PRESENT" },
                                    ],
                                },
                                session,
                            },
                            context
                        );
                }
                if (
                    !existingTrainingCertificate &&
                    savedTrainingRegistration.status === TrainingRegistrationStatus.COMPLETED &&
                    quizStatus !== "FAILED"
                ) {
                    const certificateValidity =
                        savedTrainingRegistration.certificateValidity ??
                        existingTrainingRegistration.training?.certificateValidity;
                    const trainingMode = savedTrainingRegistration.trainingMode;
                    let trainerName = "",
                        trainerSignature = "",
                        mdName = "",
                        mdSignature = "",
                        approvalInfo = "",
                        contactInfo = "";
                    let completedAt;
                    let generatedAt;
                    let expiresAt;

                    if (trainingMode === TrainingMode.ONLINE) {
                        completedAt =
                            savedTrainingRegistration.completedAt ?? CurrentDateTime()?.utcDateTime;
                        generatedAt = CurrentDateTime()?.utcDateTime;
                        expiresAt =
                            certificateValidity && completedAt
                                ? ParseDateTime(completedAt)
                                    ?.utcDateTimeObj.add({ days: certificateValidity })
                                    .format()
                                : undefined;
                
                        ({ trainerName, trainerSignature } = EnvSubscriberHelper.getEnvCertificateRelatedValues());
                    } else {
                        const endDate = ParseDateTime(savedTrainingRegistration.endDate)?.utcDateTimeObj?.format();
                
                        completedAt =
                            endDate ??
                            savedTrainingRegistration.completedAt ??
                            CurrentDateTime()?.utcDateTime;
                        generatedAt = endDate ?? CurrentDateTime()?.utcDateTime;
                        expiresAt =
                            certificateValidity && completedAt
                                ? ParseDateTime(completedAt)
                                    ?.utcDateTimeObj?.add({ days: certificateValidity })
                                    ?.format()
                                : undefined;
                
                        trainerName = `${existingTrainingRegistration.trainer?.user?.firstName ?? ""} ${existingTrainingRegistration.trainer?.user?.lastName ?? ""}`;
                        trainerSignature = existingTrainingRegistration.trainer?.signature;
                    }
                
                    ({ mdName, mdSignature, approvalInfo, contactInfo } = EnvSubscriberHelper.getEnvCertificateRelatedValues());
                
                    const additionalData = input.additionalData || []; 
                
                    savedTrainingCertificate = await TrainingCertificate.findOneAndUpdate(
                        { trainingRegistration: input.trainingRegistrationId },
                        {
                            $setOnInsert: {
                                subscriber: subscriberId,
                                trainingRegistration: input.trainingRegistrationId,
                                training: savedTrainingRegistration.training,
                                organization: savedTrainingRegistration.organization,
                                branch: savedTrainingRegistration.branch,
                                user: savedTrainingRegistration.user, 
                                trainer: savedTrainingRegistration.trainer,
                                supervisor: savedTrainingRegistration.supervisor,
                                subscriberLogo: existingSubscriberUser?.avatar,
                                userName: `${existingTrainingRegistration.user?.firstName ?? ""} ${existingTrainingRegistration.user?.lastName ?? ""}`, 
                                userUID: existingTrainingRegistration.user?.UID, 
                                userDesignation: existingTrainingRegistration.user?.designation, 
                                userCivilIdOrPassport: existingTrainingRegistration.user?.civilIdOrPassport, 
                                userNo: existingTrainingRegistration.user?.employeeNo, 
                                userRigNumber: existingTrainingRegistration.user?.rigNumber, 
                                userEmail: existingTrainingRegistration.user?.email, 
                                userAvatar: existingTrainingRegistration.user?.avatar, 
                                organizationName: existingTrainingRegistration.organization?.name,
                                trainerName,
                                trainerSignature,
                                trainingTitle: existingTrainingRegistration.training?.title,
                                trainingDescription: existingTrainingRegistration.training?.description,
                                trainingImages: existingTrainingRegistration.training?.images,
                                trainingCategories: existingTrainingRegistration.training?.trainingCategories,
                                trainingSubCategories: existingTrainingRegistration.training?.trainingSubCategories,
                                trainingDuration: existingTrainingRegistration.trainingDuration ?? existingTrainingRegistration.training?.duration,
                                trainingCertificateValidity: certificateValidity,
                                status: TrainingRegistrationStatus.COMPLETED,
                                gradeMark: 0,
                                badge: 0,
                                certificateNumber: await TrainingCertificateHelper.generateTrainingCertificateNumber({
                                    subscriberId,
                                    session,
                                }),
                                startDate: savedTrainingRegistration.startDate,
                                endDate: savedTrainingRegistration.endDate,
                                startedAt: savedTrainingRegistration.startedAt,
                                completedAt,
                                generatedAt,
                                expiresAt,
                                trainingMode,
                                mdName,
                                mdSignature,
                                approvalInfo,
                                contactInfo,
                                additionalData, 
                                createdBy: userId,
                                version: "1.0",
                            },
                        },
                        {
                            upsert: true,
                            new: true,
                            setDefaultsOnInsert: true,
                            runValidators: true,
                            session,
                        }
                    );
                
                    if (!savedTrainingCertificate) throw CustomError(ErrorName.FAILED);
                }
                let response = {
                    ...existingTrainingRegistration.toJSON(),
                    trainingProgresses: savedTrainingProgresses,
                    scorm: existingTrainingRegistration.scorm,
                };
                return response;
            });

            if (!result) throw CustomError(ErrorName.FAILED);
            if (savedTrainingCertificate) {
                await savedTrainingCertificate
                    .populate({
                        path: "employee",
                        select: "user",
                        populate: {
                            path: "user",
                            select: "firstName lastName email languagePreference",
                        },
                    })
                    .execPopulate();

                sendCourseCompletionMail(savedTrainingCertificate);
            }
            const notificationsList = [];

            if (quizStatus === "PASSED" || quizStatus === "FAILED") {
                notificationsList.push({
                    notificationType:
                        quizStatus === "PASSED"
                            ? NotificationType.TRAINING_QUIZ_PASSED
                            : NotificationType.TRAINING_QUIZ_FAILED,
                    trainingRegistration: existingTrainingRegistration,
                    trainingProgress: {
                        ...currentExistingTrainingProgress.toJSON(),
                        trainingModuleContent: currentExistingTrainingModuleContent,
                    },
                });
            }

            if (
                notificationTrainingRegistrationStatus === TrainingRegistrationStatus.STARTED ||
                notificationTrainingRegistrationStatus === TrainingRegistrationStatus.COMPLETED
            ) {
                notificationsList.push({
                    notificationType:
                        notificationTrainingRegistrationStatus ===
                        TrainingRegistrationStatus.STARTED
                            ? NotificationType.TRAINING_STARTED
                            : NotificationType.TRAINING_COMPLETED,
                    trainingRegistration: existingTrainingRegistration,
                });

                if (savedTrainingCertificate) {
                    notificationsList.push({
                        notificationType: NotificationType.CERTIFICATE_GENERATED,
                        trainingRegistration: existingTrainingRegistration,
                        trainingCertificate: savedTrainingCertificate,
                    });
                }
            }

            if (notificationsList.length) {
                sendTrainingProgressNotification(notificationsList, context);
            }

            return result;
        };
/** 
 *          COMMENTED PART IS REQUIRED IN THE FUTURE
 *  
        if (context.platform === Role.EMPLOYEE && role === Role.EMPLOYEE && employeeId) {
            input.trainingMode = TrainingMode.ONLINE;
            return await findAndUpdateTrainingProgress({ employee: employeeId });
        } else if (context.platform === Role.ADMIN) {
            if (
                !SubRoleHelper.hasPermission({
                    currentRole: role,
                    currentPermissions: userPermissions,
                    requiredPermission: Permission.UPDATE_TRAINING_REGISTRATION,
                    restrictOrganizationManager: isOrganizationManager,
                })
            ) {
                throw CustomError(ErrorName.FORBIDDEN);
            }

            input.trainingMode = TrainingMode.OFFLINE;
            return await findAndUpdateTrainingProgress();
        }
        throw CustomError(ErrorName.FORBIDDEN);
 */

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.UPDATE_TRAINING_REGISTRATION,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        input.trainingMode = TrainingMode.OFFLINE;
        return await findAndUpdateTrainingProgress();
    },
    updateScormTrainingProgress: async ({ input }, context) => {
        let existingTrainingRegistration = await TrainingRegistration.findOne({
            _id: input.trainingRegistrationId,
        });
        let scormStatus = await ScromHelper.checkScormCourseStatus(
            existingTrainingRegistration.scorm.registrationId
        );
        if (scormStatus.registrationCompletion == "COMPLETE") {
            existingTrainingRegistration.status = "COMPLETED";
            await existingTrainingRegistration.save();
        }
        return existingTrainingRegistration;
    },
};
