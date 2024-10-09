const SubscriptionPlanFeature = require("./subscription_plan_feature");

module.exports = {
    types: `
        enum SubscriptionPlanFeature {
            ${Object.keys(SubscriptionPlanFeature).join(" ")}
        }
        type SubscriptionPlanFeatures {
            inclusive: [String]
            exclusive: [String]
        }
        type SubscriptionPlanPricing {
            _id: ID
            title: String
            duration: Int
            price: Float
        }
        type SubscriptionPlan {
            _id: ID
            name: [LocalisedData]
            description: [LocalisedData]
            features: SubscriptionPlanFeatures
            pricing: [SubscriptionPlanPricing]
            isActive: Boolean
        }
        type SubscriptionPlanList {
            subscriptionPlans: [SubscriptionPlan]
            totalCount: Int
        }
        input SubscriptionPlanFeaturesInput {
            inclusive: [SubscriptionPlanFeature]
            exclusive: [SubscriptionPlanFeature]
        }
        input SubscriptionPlanPricingInput {
            _id: ID
            title: String
            duration: Int
            price: Float
        }
        input SubscriptionPlanInput {
            _id: ID
            name: [LocalisedDataInput]
            description: [LocalisedDataInput]
            features: SubscriptionPlanFeaturesInput
            pricing: [SubscriptionPlanPricingInput]
            isActive: Boolean
        }
        input SubscriptionPlanFilterInput {
            search: String
        }
    `,
    queries: `
        getSubscriptionPlans(pageInput: PageInput, filterInput: SubscriptionPlanFilterInput): SubscriptionPlanList!
    `,
    mutations: `
        createOrUpdateSubscriptionPlan(input: SubscriptionPlanInput!): SubscriptionPlan!
        deleteSubscriptionPlan(id: ID!): SubscriptionPlan!
    `,
};
