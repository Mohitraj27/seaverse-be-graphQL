module.exports = {
    types: `
        type SubscriptionPlanDetails {
            name: [LocalisedData]
            description: [LocalisedData]
            features: SubscriptionPlanFeatures
            pricing: [SubscriptionPlanPricing]
            price: Float
            duration: Int
        }
        type SaasSubscription {
            _id: ID
            subscriber: Subscriber
            startDate: String
            endDate: String
            planDetails: SubscriptionPlanDetails
            payment: SaasPayment
            isActivated: Boolean
            isTrial: Boolean
        }
        type SubscriptionList {
            subscriptions: [SaasSubscription]
            totalCount: Int
        }
        type SubscriptionInfo {
            subscriptionId: ID,
            subscriptionEndDate: String,
            subscriptionFeatures: [String]
            hasSubscription: Boolean
        }
        input SubscriptionInput {
            subscriptionPlanId: ID!
            subscriptionPlanPricingId: ID
        }
        input SubscriptionFilterInput {
            subscriberId: ID
            search: String
            subscriptionPlanId: ID
            isActivated: Boolean
            dateFrom: String
            dateTo: String
        }
    `,
    queries: `
        getSubscriptions(pageInput: PageInput, filterInput: SubscriptionFilterInput): SubscriptionList!
        getActiveSubscriptionInfo: SubscriptionInfo!
    `,
    mutations: `
        createSubscription(paymentInput: SaasPaymentInput!): SaasSubscription!
        createTrialSubscription(subscriptionInput: SubscriptionInput!): SaasSubscription!
    `,
};
