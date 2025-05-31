const { ObjectId } = require("../../tools");
const { UploadHelper, CustomError, ErrorName } = require("../../util");

const { QuizContent } = require("./quiz_content_model");

const NotificationHelper = require("../notifications/notification_helper");
const CounterHelper = require("../counters/counter_helper");

const NotificationType = require("../notifications/notification_type.json");
const {decrypt } = require("../../util/encryption_helper");
const uploadQuizContentImages = async ({ images, folderName }) => {
    const quizContentImages = [];

    for (const item of images) {
        item._id = item._id ?? ObjectId();

        const savedItem = await UploadHelper.uploadImage({
            data: item.url,
            folderName: folderName ?? "quiz-content-images",
            fileName: `image_${item._id}_${Date.now()}`,
            uploadType: UploadHelper.uploadType.quizContentImage,
        });

        if (savedItem) {
            quizContentImages.push({
                _id: item._id,
                url: savedItem,
            });
        }
    }

    return quizContentImages;
};

const generateQuizContentUID = async ({ subscriberId, session }) => {
    const savedCounter = await CounterHelper.updateCounter({
        subscriberId,
        modelName: QuizContent.modelName,
        session,
    });

    if (!savedCounter) throw CustomError(ErrorName.FAILED);
    return `QUIZ-${savedCounter.count}`;
};

module.exports.QuizContentHelper = {
    uploadQuizContentImages,
    generateQuizContentUID,
    sendNotificationOnCRUD: async notificationData => {
        try {
            const quizContentTitle = notificationData.quizContent.title?.find(
                x => x.lang === "en" || x.lang === "ar"
            )?.value;

            const notification = {
                subscriber: notificationData.subscriber,
                title: [{ lang: "en", value: `Quiz ${notificationData.action}` }],
                notificationType: NotificationType["QUIZ_" + notificationData.action],
                notifyAllAdmin: true,
                notifiers: notificationData.notifiers ?? [],
                employeeNotifiers: [],
                affected: [
                    {
                        targetRef: "QuizContent",
                        target: notificationData.quizContent._id,
                    },
                ],
                additionalInfo: [
                    {
                        infoType: "UPDATER_INFO",
                        infoData: {
                            _id: notificationData.createdBy._id,
                            firstName: decrypt(notificationData.createdBy.firstName),
                            lastName: decrypt(notificationData.createdBy.lastName),
                        },
                    },
                    {
                        infoType: "QUIZ_CONTENT_INFO",
                        infoData: {
                            _id: notificationData.quizContent._id,
                            title: notificationData.quizContent.title,
                            isActive: notificationData.quizContent.isActive,
                        },
                    },
                ],
                createdBy: notificationData.createdBy,
            };

            if (notification.notificationType === NotificationType.QUIZ_APPROVAL_REQUEST) {
                notification.message = [
                    {
                        lang: "en",
                        value: `Admin User "${decrypt(notificationData.createdBy.firstName)}" submitted the quiz "${quizContentTitle}" for approval`,
                    },
                ];
            } else {
                notification.message = [
                    {
                        lang: "en",
                        value: `Admin User "${decrypt(notificationData.createdBy.firstName)}" ${notificationData.action} "${quizContentTitle}" quiz`,
                    },
                ];
            }

            // await NotificationHelper.createNotification(notification);
        } catch (e) {
            throw Error(e.message);
        }
    },
};
