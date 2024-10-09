const { ObjectId } = require("../../../tools");
const { CustomError, ErrorName, AuthUser, CurrentDateTime } = require("../../../util");

const { TrainingRegistrationInvoice } = require("./training_registration_invoice_model");
const { Subscriber } = require("../../saas/subscriber/subscriber_model");

const NotificationHelper = require("../../notifications/notification_helper");
const CounterHelper = require("../../counters/counter_helper");

const NotificationType = require("../../notifications/notification_type.json");

module.exports = {
    createOrUpdateTrainingRegistrationInvoice: async ({ input, session }, context) => {
        const { userId, subscriberId } = AuthUser(context);

        const invoiceFilterConditions = {
            _id: input._id ?? ObjectId(),
            subscriber: subscriberId,
        };

        const invoiceUpdateData = {};

        // if (input.invoiceReference) invoiceUpdateData.invoiceReference = input.invoiceReference;
        // if (input.price) invoiceUpdateData.price = input.price;
        // if (input.invoiceAmount) invoiceUpdateData.invoiceAmount = input.invoiceAmount;
        // if (input.invoiceDate) invoiceUpdateData.invoiceDate = input.invoiceDate;
        // if (input.discount) invoiceUpdateData.discount = input.discount;
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
                        value: `Admin User "${notificationData.createdBy.firstName}" ${notificationData.action} invoice for "${organizationName}"`,
                    },
                ],
                notificationType: NotificationType["INVOICE_" + notificationData.action],
                notifyAdmin: true,
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
                            firstName: notificationData.createdBy.firstName,
                            lastName: notificationData.createdBy.lastName,
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
            console.log(
                "training_registration_invoice_helper.sendNotificationOnCRUD:exception:",
                e?.message
            );
        }
    },
    generateTrainingRegistrationInvoiceNumber: async ({ subscriberId, session }) => {
        // const existingSubscriber = await Subscriber.findById(subscriberId)
        //     .lean()
        //     .select("name")
        //     .populate({ path: "user", select: "firstName" });
        //
        // if (!existingSubscriber) throw CustomError(ErrorName.FAILED);

        const currentUtcDateTime = CurrentDateTime().utcDateTimeObj;

        const savedCounter = await CounterHelper.updateCounter({
            subscriberId,
            modelName: TrainingRegistrationInvoice.modelName,
            // filterConditions: { year: currentUtcDateTime.year() },
            session,
        });

        if (!savedCounter) throw CustomError(ErrorName.FAILED);
        //5M/2022/NOV/024
        // const subscriberName = existingSubscriber.user?.firstName ?? "";
        const subscriberName = process.env.SUBSCRIBER;
        return `${subscriberName
            .slice(0, 2)
            .toUpperCase()}/${currentUtcDateTime.year()}/${currentUtcDateTime
            .format("MMM")
            .toUpperCase()}/${savedCounter.count.toString().padStart(6, "0")}`;
    },
};
