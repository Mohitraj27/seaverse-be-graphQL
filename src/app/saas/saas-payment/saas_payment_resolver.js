const { ObjectId, Moment, ApiHelper, Crypto } = require("../../../tools");
const { AuthUser, Role, CustomError, ErrorName, CurrentDateTime } = require("../../../util");

const { AppSettings } = require("../../app-settings/app_settings_model");
const { SaasPayment } = require("./saas_payment_model");
const { SubscriptionPlan } = require("../subscription-plans/subscription_plan_model");
const {
    Subscription,
    PendingSubscription,
} = require("../subscriber/subscription/subscription_model");

const PaymentType = require("./saas_payment_type");
const PaymentStatus = require("./saas_payment_status");

module.exports.queries = {
    getSaasPayments: async ({ pageInput, filterInput }, context) => {
        const { role } = AuthUser(context);

        if (role !== Role.SAAS_ADMIN) CustomError(ErrorName.UNAUTHORIZED);

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50;
        let filterConditions = {};
        
        if (filterInput) {
            if (filterInput.dateFrom || filterInput.dateTo) filterConditions.createdAt = {}; 
            if (filterInput.paymentId) {
                filterConditions = { ...filterConditions, _id: filterInput.paymentId };
            }
            if (filterInput.status) {
                filterConditions = { ...filterConditions, status: filterInput.status };
            }
            if (filterInput.dateFrom) {
                filterConditions.createdAt.$gte = filterInput.dateFrom;
            }
            if (filterInput.dateTo) {
                filterConditions.createdAt.$lte = filterInput.dateTo;
            }
            if (filterInput.searchPayment) {
                filterConditions = {
                    ...filterConditions,
                    $or: [
                        {
                            firstName: {
                                $regex: ".*" + filterInput?.searchPayment + ".*",
                                $options: "i",
                            },
                        },
                        {
                            "phone.number": {
                                $regex: ".*" + filterInput?.searchPayment + ".*",
                            },
                            email: {
                                $regex: ".*" + filterInput?.searchPayment + ".*",
                            },
                            invoiceId: {
                                $regex: ".*" + filterInput?.searchPayment + ".*",
                            },
                        },
                    ],
                };
            }
        }

        return await SaasPayment.aggregatePaginate(
            SaasPayment.aggregate([
                {
                    $match: filterConditions,
                },
            ]),
            {
                offset: skip,
                limit,
                sort: { createdAt: "descending" },
                customLabels: {
                    docs: "payments",
                    totalDocs: "totalCount",
                    offset: "skip",
                },
                pagination: limit !== 0,
                allowDiskUse: true,
            }
        );
    },
};

module.exports.mutations = {
    initiateSaasPayment: async ({ paymentInput, subscriptionInput }, context) => {
        const { userId, subscriberId } = AuthUser(context);

        if (
            !paymentInput ||
            !paymentInput.firstName ||
            !paymentInput.phone ||
            !subscriptionInput ||
            !subscriptionInput.subscriptionPlanId ||
            !subscriptionInput.subscriptionPlanPricingId
        ) {
            throw CustomError(ErrorName.ARGUMENTS_REQUIRED);
        }

        const existingSubscription = await Subscription.findOne({
            subscriber: subscriberId,
            endDate: { $gte: Moment.utc().startOf("day").toDate() },
            isActivated: true,
            isTrial: { $ne: true },
        })
            .lean()
            .select("_id");

        if (existingSubscription) throw CustomError(ErrorName.ALREADY_EXIST);

        const selectedSubscriptionPlan = await SubscriptionPlan.findById(
            subscriptionInput.subscriptionPlanId
        ).lean();

        if (!selectedSubscriptionPlan) throw CustomError(ErrorName.NOT_FOUND);

        const appSettings = await AppSettings.findOne()
            .lean()
            .select("supportedCurrencies currencyTable paymentConfig");

        if (!appSettings?.paymentConfig) throw CustomError(ErrorName.SOME_ERROR);

        const subscriptionId = ObjectId();

        const body = {
            amount: paymentInput.invoiceAmount,
            currency: paymentInput.currency,
            save_card: false,
            description: process.env.SUBSCRIBER_NAME,
            receipt: {
                email: true,
                sms: true,
            },
            metadata: {
            },
            reference: {
                order: subscriptionId,
            },
            customer: {
                first_name: paymentInput.firstName,
                email: paymentInput.email,
                phone: {
                    country_code: paymentInput.phone?.countryCode,
                    number: paymentInput.phone?.number,
                },
            },
            source: {
                id: "src_all",
            },
            post: {
                url: "https://dummyurl/api/updatePendingSubscription", 
            },
            redirect: {
                url: paymentInput.redirectUrl || "https://armino.in", 
            },
        };

        body.metadata.hash = Crypto.createHmac("sha256", process.env.PAYMENT_WEB_HOOK_SECRET_KEY)
            .update(body.reference.order.toString())
            .digest()
            .toString("base64");

        const response = await ApiHelper.post(
            `${appSettings.paymentConfig.paymentUrl}charges`,
            body,
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
                console.error(
                    "saas_payment_resolver:initiatePayment:error:",
                    error.response?.data ? error.response.data : error.message
                );
            });

        if (!response?.transaction) throw CustomError(ErrorName.EXTERNAL_API_ERROR);
        const savedPayment = await new SaasPayment({
            subscriber: subscriberId,
            subscription: subscriptionId,
            paymentConfigType: paymentInput.paymentConfigType,
            paymentType: PaymentType.OTHER,
            invoiceId: response.id,
            invoiceAmount: paymentInput.invoiceAmount,
            currency: paymentInput.currency,
            status: PaymentStatus.INITIATED,
            firstName: paymentInput.firstName,
            lastName: paymentInput.lastName,
            phone: paymentInput.phone,
            email: paymentInput.email,
            metadata: response.metadata,
            transaction: response.transaction,
            reference: response.reference,
            customer: response.customer,
            createdBy: userId,
        }).save();

        if (!savedPayment) throw CustomError(ErrorName.FAILED);

        const selectedSubscriptionPlanPricing = selectedSubscriptionPlan.pricing.find(
            x => x._id.toString() === subscriptionInput.subscriptionPlanPricingId.toString()
        );

        const subscriptionStartDate = CurrentDateTime().utcDate;

        const savedSubscription = await new PendingSubscription({
            _id: subscriptionId,
            subscriber: subscriberId,
            subscriptionPlan: selectedSubscriptionPlan,
            startDate: subscriptionStartDate,
            endDate: Moment.utc(subscriptionStartDate)
                .add(selectedSubscriptionPlanPricing.duration, "days")
                .startOf("day"),
            planDetails: {
                name: selectedSubscriptionPlan.name,
                description: selectedSubscriptionPlan.description,
                features: selectedSubscriptionPlan.features,
                pricing: selectedSubscriptionPlan.pricing,
                price: selectedSubscriptionPlanPricing.price,
                duration: selectedSubscriptionPlanPricing.duration,
            },
            payment: savedPayment,
            isActivated: true, 
            isTrial: false,
        }).save();

        if (!savedSubscription) throw CustomError(ErrorName.FAILED);

        return response.transaction.url;
    },
    updateSaasPaymentStatus: async ({ id, status }, context) => {
        const { role } = AuthUser(context);

        if (role !== Role.SAAS_ADMIN) throw CustomError(ErrorName.FORBIDDEN);

        const savedSaasPayment = await SaasPayment.findByIdAndUpdate(
            id,
            { status },
            { new: true, lean: true }
        );

        if (!savedSaasPayment) throw CustomError(ErrorName.NOT_FOUND);

        return savedSaasPayment;
    },
};
