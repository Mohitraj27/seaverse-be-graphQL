const { Moment } = require("../../../../tools");

const { Subscription } = require("./subscription_model");

module.exports = {
    getActiveSubscriptionInfo: async subscriberId => {
        if (subscriberId) {
            const existingSubscription = await Subscription.findOne({
                subscriber: subscriberId,
                isActivated: true,
                endDate: { $gte: Moment.utc().startOf("day").toDate() },
                isDeleted: { $ne: true },
            })
                .lean()
                .select("endDate planDetails.features.inclusive");

            if (existingSubscription)
                return {
                    subscriptionId: existingSubscription?._id,
                    subscriptionEndDate: existingSubscription?.endDate,
                    subscriptionFeatures:
                        existingSubscription?.planDetails?.features?.inclusive ?? [],
                    hasSubscription:
                        Moment.duration(
                            Moment.utc(existingSubscription?.endDate).diff(Moment.utc())
                        ).asDays() > 0,
                };
        }

        return { hasSubscription: false };
    },
};
