const { CronHelper, Moment } = require("../../../../tools");
const { SendEmail } = require("../../../../util");

const { Subscription } = require("./subscription_model");

module.exports = {
    sendSubscriptionRemainder: () => {
        try {
            CronHelper.schedule("0 10 * * *", async () => {
                const existingSubscriptions = await Subscription.aggregate([
                    {
                        $match: {
                            isActivated: true,
                        },
                    },
                    {
                        $match: {
                            $or: [
                                {
                                    endDate: {
                                        $lt: Moment().utc().startOf("day").toDate(),
                                        $gte: Moment()
                                            .utc()
                                            .subtract(1, "days")
                                            .startOf("day")
                                            .toDate(),
                                    },
                                },
                                {
                                    endDate: {
                                        $gte: Moment().utc().startOf("day").toDate(),
                                        $lt: Moment().utc().add(1, "days").startOf("day").toDate(),
                                    },
                                },
                                {
                                    endDate: {
                                        $gte: Moment().utc().add(1, "days").startOf("day").toDate(),
                                        $lt: Moment().utc().add(2, "days").startOf("day").toDate(),
                                    },
                                },
                                {
                                    endDate: {
                                        $gte: Moment().utc().add(2, "days").startOf("day").toDate(),
                                        $lt: Moment().utc().add(3, "days").startOf("day").toDate(),
                                    },
                                },
                                {
                                    endDate: {
                                        $gte: Moment().utc().add(6, "days").startOf("day").toDate(),
                                        $lt: Moment().utc().add(7, "days").startOf("day").toDate(),
                                    },
                                },
                                {
                                    endDate: {
                                        $gte: Moment()
                                            .utc()
                                            .add(13, "days")
                                            .startOf("day")
                                            .toDate(),
                                        $lt: Moment().utc().add(14, "days").startOf("day").toDate(),
                                    },
                                },
                            ],
                        },
                    },
                    {
                        $lookup: {
                            from: "users",
                            localField: "subscriber",
                            foreignField: "subscriber",
                            as: "user",
                        },
                    },
                ]);

                for (const subscription of existingSubscriptions) {
                    const subscriptionEndDate = subscription.endDate;

                    const emailObject = {
                        receiverEmail: subscriptions.user[0]?.email,
                        subject: `${process.env.SUBSCRIBER_NAME} subscription plan`,
                    };

                    if (
                        subscriptionEndDate < Moment().utc().startOf("day").toDate() &&
                        subscriptionEndDate >=
                            Moment().utc().subtract(1, "days").startOf("day").toDate()
                    ) {
                        emailObject.htmlContent = "Your plan has been expired";
                    } else if (
                        subscriptionEndDate >= Moment().utc().startOf("day").toDate() &&
                        subscriptionEndDate < Moment().utc().add(1, "days").startOf("day").toDate()
                    ) {
                        emailObject.htmlContent = "Your plan will be expired today";
                    } else if (
                        subscriptionEndDate >=
                            Moment().utc().add(1, "days").startOf("day").toDate() &&
                        subscriptionEndDate < Moment().utc().add(2, "days").startOf("day").toDate()
                    ) {
                        emailObject.htmlContent = "Your plan will be expires within 2 days";
                    } else if (
                        subscriptionEndDate >=
                            Moment().utc().add(2, "days").startOf("day").toDate() &&
                        subscriptionEndDate < Moment().utc().add(3, "days").startOf("day").toDate()
                    ) {
                        emailObject.htmlContent = "Your plan will be expires within 3 days";
                    } else if (
                        subscriptionEndDate >=
                            Moment().utc().add(6, "days").startOf("day").toDate() &&
                        subscriptionEndDate < Moment().utc().add(7, "days").startOf("day").toDate()
                    ) {
                        emailObject.htmlContent = "Your plan will be expires within 7 days";
                    } else if (
                        subscriptionEndDate >=
                            Moment().utc().add(13, "days").startOf("day").toDate() &&
                        subscriptionEndDate < Moment().utc().add(14, "days").startOf("day").toDate()
                    ) {
                        emailObject.htmlContent = "Your plan will be expires within 14 days";
                    }

                    if (emailObject?.htmlContent) SendEmail(emailObject);
                }
            });
        } catch (e) {
            throw Error(e.message);
        }
    },
};
