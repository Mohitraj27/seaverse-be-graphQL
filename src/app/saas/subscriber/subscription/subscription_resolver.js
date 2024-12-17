const { ObjectId, Moment, ApiHelper } = require("../../../../tools");
const { AuthUser, CustomError, ErrorName, CurrentDateTime, Role } = require("../../../../util");

const { AppSettings } = require("../../../app-settings/app_settings_model");
const { Subscription } = require("./subscription_model");
const { SubscriptionPlan } = require("../../subscription-plans/subscription_plan_model");

const SubscriptionHelper = require("./subscription_helper");
const SaasPaymentHelper = require("../../saas-payment/saas_payment_helper");

module.exports.queries = {
    getSubscriptions: async ({ pageInput, filterInput }, context) => {
        const { role, subscriberId } = AuthUser(context);

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50,
            searchKey = filterInput?.search ?? "";
        let filterConditions = {};

        if (role === Role.SAAS_ADMIN) {
            if (filterInput) {
                if (filterInput.subscriberId)
                    filterConditions.subscriber = ObjectId(filterInput.subscriberId);
                if (filterInput.subscriptionPlanId)
                    filterConditions.subscriptionPlan = filterInput.subscriptionPlanId;
                if (typeof filterInput.isActivated === "boolean")
                    filterConditions.isActivated = filterInput.isActivated;
                if (filterInput.dateFrom || filterInput.dateTo) {
                    filterConditions.createdAt = {};
                    if (filterInput.dateFrom)
                        filterConditions.createdAt.$gte = Moment(filterInput.dateFrom)
                            .startOf("day")
                            .toDate();

                    if (filterInput.dateTo)
                        filterConditions.createdAt.$lte = Moment(filterInput.dateTo)
                            .endOf("day")
                            .toDate();
                }
            }
        } else {
            filterConditions.subscriber = subscriberId;
        }

        return await Subscription.aggregatePaginate(
            Subscription.aggregate([
                {
                    $match: filterConditions,
                },
                {
                    $lookup: {
                        from: "subscribers",
                        localField: "subscriber",
                        foreignField: "_id",
                        pipeline: [
                            {
                                $lookup: {
                                    from: "users",
                                    localField: "user",
                                    foreignField: "_id",
                                    as: "user",
                                },
                            },
                            {
                                $unwind: "$user",
                            },
                        ],
                        as: "subscriber",
                    },
                },
                {
                    $unwind: "$subscriber",
                },
                {
                    $match: {
                        $or: [
                            {
                                "subscriber.user.firstName": {
                                    $regex: ".*" + searchKey + ".*",
                                    $options: "i",
                                },
                            },
                            {
                                "subscriber.user.lastName": {
                                    $regex: ".*" + searchKey + ".*",
                                    $options: "i",
                                },
                            },
                            {
                                "subscriber.user.email": {
                                    $regex: ".*" + searchKey + ".*",
                                    $options: "i",
                                },
                            },
                        ],
                    },
                },
            ]),
            {
                offset: skip,
                limit,
                sort: { createdAt: "descending" },
                customLabels: {
                    docs: "subscriptions",
                    totalDocs: "totalCount",
                    offset: "skip",
                },
                pagination: limit !== 0,
                allowDiskUse: true,
            }
        );
    },
    getActiveSubscriptionInfo: async ({}, context) => {
        const { subscriberId } = AuthUser(context);
        return await SubscriptionHelper.getActiveSubscriptionInfo(subscriberId);
    },
};

module.exports.mutations = {
    createSubscription: async ({ paymentInput }, context) => {
        if (!paymentInput.invoiceId) throw CustomError(ErrorName.ARGUMENTS_REQUIRED);

        const appSettings = await AppSettings.findOne()
            .lean()
            .select("supportedCurrencies currencyTable paymentConfig");

        if (!appSettings?.paymentConfig) throw CustomError(ErrorName.SOME_ERROR);

        const response = await ApiHelper.get(
            `${appSettings.paymentConfig.paymentUrl}charges/${paymentInput.invoiceId}`,
            {
                headers: {
                    Authorization:
                        appSettings.paymentConfig.liveMode === true
                            ? `Bearer ${appSettings.paymentConfig.paymentKey}`
                            : `Bearer ${appSettings.paymentConfig.paymentTestKey}`,
                },
            }
        )
            .then(response => {
                if (response?.data) return response.data;
            })
            .catch(error => {
              throw CustomError(ErrorName.FAILED, error.message);
            });

        if (!response) throw CustomError(ErrorName.FAILED);

        return await SaasPaymentHelper.updatePendingSubscription({
            input: {
                orderReference: response.reference.order,
                hash: response.metadata.hash,
                status: response.status,
            },
        });
    },
    createTrialSubscription: async ({ subscriptionInput }, context) => {
        const { subscriberId } = AuthUser(context);

        if (!subscriberId) throw CustomError(ErrorName.UNAUTHORIZED);

        if (!subscriptionInput?.subscriptionPlanId) throw CustomError(ErrorName.ARGUMENTS_REQUIRED);

        const claimedTrial = await Subscription.findOne({
            subscriber: subscriberId,
            isTrial: true,
        })
            .lean()
            .select("_id");

        if (claimedTrial) throw CustomError(ErrorName.ALREADY_EXIST);

        const selectedSubscriptionPlan = await SubscriptionPlan.findById(
            subscriptionInput.subscriptionPlanId
        ).lean();

        if (!selectedSubscriptionPlan) throw CustomError(ErrorName.NOT_FOUND);

        const subscriptionStartDate = CurrentDateTime().utcDate;
        const subscriptionDuration = 14; 

        const savedSubscription = await new Subscription({
            subscriber: subscriberId,
            subscriptionPlan: selectedSubscriptionPlan,
            startDate: subscriptionStartDate,
            endDate: Moment(subscriptionStartDate).add(subscriptionDuration, "days"),
            planDetails: {
                name: selectedSubscriptionPlan.name,
                description: selectedSubscriptionPlan.description,
                feature: selectedSubscriptionPlan.features,
                pricing: selectedSubscriptionPlan.pricing,
                price: 0,
                duration: subscriptionDuration,
            },
            payment: undefined,
            isActivated: true,
            isTrial: true,
        });

        if (!savedSubscription) throw CustomError(ErrorName.FAILED);

        return savedSubscription;
    },
};
