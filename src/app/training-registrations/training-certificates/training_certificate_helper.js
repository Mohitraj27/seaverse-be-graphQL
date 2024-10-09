const { ObjectId } = require("../../../tools");
const { AuthUser, Role, CustomError, ErrorName, CurrentDateTime } = require("../../../util");

const { TrainingCertificate } = require("./training_certificate_model");
const { Subscriber } = require("../../saas/subscriber/subscriber_model");
const { User } = require("../../user/user_model");
const { Employee } = require("../../user/employee/employee_model");

const CounterHelper = require("../../counters/counter_helper");
const NotificationHelper = require("../../notifications/notification_helper");

const NotificationType = require("../../notifications/notification_type.json");

module.exports = {
    generateTrainingCertificateNumber: async ({ subscriberId, session }) => {
        const currentYear = CurrentDateTime().utcDateTimeObj.year();

        const savedCounter = await CounterHelper.updateCounter({
            subscriberId,
            modelName: TrainingCertificate.modelName,
            session,
        });

        if (!savedCounter) throw CustomError(ErrorName.FAILED);
        const subscriberName = process.env.SUBSCRIBER;
        return `${subscriberName.slice(0, 2).toUpperCase()}-${currentYear}-${savedCounter.count
            .toString()
            .padStart(6, "0")}`;
    },
};
