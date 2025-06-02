const { ObjectId } = require("../../../tools");
const { CustomError, ErrorName, AuthUser, CurrentDateTime } = require("../../../util");

const { TrainingRegistrationInvoice } = require("./training_registration_invoice_model");
const { Subscriber } = require("../../saas/subscriber/subscriber_model");

const NotificationHelper = require("../../notifications/notification_helper");
const CounterHelper = require("../../counters/counter_helper");

const NotificationType = require("../../notifications/notification_type.json");
const { decrypt } = require('../../../util/encryption_helper');
module.exports = {
    createOrUpdateTrainingRegistrationInvoice: async ({ input, session }, context) => {
        const { userId, subscriberId } = AuthUser(context);

        const invoiceFilterConditions = {
            _id: input._id ?? ObjectId(),
            subscriber: subscriberId,
        };

        const invoiceUpdateData = {};
        if (input.remarks) invoiceUpdateData.remarks = input.remarks;
        if (input.status) invoiceUpdateData.status = input.status;
        if (typeof input.isActive === "boolean") invoiceUpdateData.isActive = input.isActive;

        const savedTrainingRegistrationInvoice = await TrainingRegistrationInvoice.findOneAndUpdate(
            invoiceFilterConditions,
            {
                ...invoiceFilterConditions,
                ...invoiceUpdateData,
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

        if (!savedTrainingRegistrationInvoice) throw CustomError(ErrorName.FAILED);
        return savedTrainingRegistrationInvoice;
    },
    sendNotificationOnCRUD: async notificationData => {
        try {
            const organizationName =
                notificationData.trainingRegistrationInvoice.organizationDetails?.organizationName?.find(
                    x => x.lang === "en" || x.lang === "ar"
                )?.value;

            const notification = {
                subscriber: notificationData.subscriber,
                title: [{ lang: "en", value: `Invoice ${notificationData.action}` }],
                message: [
                    {
                        lang: "en",
                        value: `Admin User "${decrypt(notificationData.createdBy.firstName)}" ${notificationData.action} invoice for "${organizationName}"`,
                    },
                ],
                notificationType: NotificationType["INVOICE_" + notificationData.action],
                notifyAllAdmin: true,
                isNotificatonForAdmin: true,
                notifiers: [],
                employeeNotifiers: [],
                affected: [
                    {
                        targetRef: "TrainingRegistrationInvoice",
                        target: notificationData.trainingRegistrationInvoice._id,
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
                        infoType: "ORGANIZATION_INFO",
                        infoData: {
                            _id: notificationData.trainingRegistrationInvoice.organizationDetails
                                ?.organization,
                            name: notificationData.trainingRegistrationInvoice.organizationDetails
                                ?.organizationName,
                        },
                    },
                ],
                createdBy: notificationData.createdBy,
            };

            await NotificationHelper.createNotification(notification);
        } catch (e) {
            throw Error(e?.message);
        
        }
    },
    generateTrainingRegistrationInvoiceNumber: async ({ subscriberId, session }) => {

        const currentUtcDateTime = CurrentDateTime().utcDateTimeObj;

        const savedCounter = await CounterHelper.updateCounter({
            subscriberId,
            modelName: TrainingRegistrationInvoice.modelName,
            session,
        });

        if (!savedCounter) throw CustomError(ErrorName.FAILED);
        const subscriberName = process.env.SUBSCRIBER;
        return `${subscriberName
            .slice(0, 2)
            .toUpperCase()}/${currentUtcDateTime.year()}/${currentUtcDateTime
            .format("MMM")
            .toUpperCase()}/${savedCounter.count.toString().padStart(6, "0")}`;
    },
};
