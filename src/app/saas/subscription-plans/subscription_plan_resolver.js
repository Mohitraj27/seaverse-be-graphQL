const { ObjectId } = require("../../../tools");
const { CustomError, ErrorName, AuthUser, Role } = require("../../../util");

const { SubscriptionPlan } = require("./subscription_plan_model");

const LogHelper = require("../../logs/log_helper");

const LogType = require("../../logs/log_type.json");

module.exports.queries = {
    getSubscriptionPlans: async ({ pageInput, filterInput }, context) => {
        const { role } = AuthUser(context, false);

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50;
        let filterConditions = { isDeleted: { $ne: true } };

        if (role !== Role.SAAS_ADMIN) filterConditions.isActive = true;

        if (filterInput) {
            if (filterInput.search) {
                filterConditions = {
                    ...filterConditions,
                    $or: [
                        {
                            name: {
                                $regex: ".*" + filterInput.search + ".*",
                                $options: "i",
                            },
                            description: {
                                $regex: ".*" + filterInput.search + ".*",
                                $options: "i",
                            },
                        },
                    ],
                };
            }
        }

        return SubscriptionPlan.aggregatePaginate(
            SubscriptionPlan.aggregate([
                {
                    $match: filterConditions,
                },
            ]),
            {
                offset: skip,
                limit,
                sort: { createdAt: "descending" },
                customLabels: {
                    docs: "subscriptionPlans",
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
    createOrUpdateSubscriptionPlan: async ({ input }, context) => {
        const { userInfo } = AuthUser(context);

        const subscriptionPlanFilterConditions = {
            _id: input._id ?? ObjectId(),
        };

        const subscriptionPlanUpdateData = {};

        if (input.name) subscriptionPlanUpdateData.name = input.name;
        if (input.description) subscriptionPlanUpdateData.description = input.description;
        if (input.features) subscriptionPlanUpdateData.features = input.features;
        if (input.pricing) subscriptionPlanUpdateData.pricing = input.pricing;
        if (input.duration) subscriptionPlanUpdateData.duration = input.duration;
        if (typeof input.isActive === "boolean")
            subscriptionPlanUpdateData.isActive = input.isActive;

        const savedSubscriptionPlan = await SubscriptionPlan.findOneAndUpdate(
            subscriptionPlanFilterConditions,
            {
                ...subscriptionPlanFilterConditions,
                ...subscriptionPlanUpdateData,
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true,
                runValidators: true,
                lean: true,
            }
        );

        if (!savedSubscriptionPlan) throw CustomError(ErrorName.FAILED);

        //region logging
        LogHelper.logActivity({
            logType: LogType.SAAS_SUBSCRIPTION_PLAN_LOG,
            operation: input._id ? "UPDATE" : "CREATE",
            ipInfo: context.ipInfo,
            affected: [
                {
                    targetRef: "SubscriptionPlan",
                    target: savedSubscriptionPlan._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "SAAS_SUBSCRIPTION_PLAN_INFO",
                    infoData: JSON.stringify(input),
                },
            ],
            createdBy: userInfo,
        });
        //endregion

        return savedSubscriptionPlan;
    },
    deleteSubscriptionPlan: async ({ id }, context) => {
        const { userInfo } = AuthUser(context);

        const deletedSubscriptionPlan = await SubscriptionPlan.findOneAndUpdate(
            { _id: id },
            { isDeleted: true },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true,
                runValidators: true,
                lean: true,
            }
        );

        if (!deletedSubscriptionPlan) throw CustomError(ErrorName.FAILED);

        //region logging
        LogHelper.logActivity({
            logType: LogType.SAAS_SUBSCRIPTION_PLAN_LOG,
            operation: "DELETE",
            ipInfo: context.ipInfo,
            affected: [
                {
                    targetRef: "SubscriptionPlan",
                    target: deletedSubscriptionPlan._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "SAAS_SUBSCRIPTION_PLAN_INFO",
                    infoData: JSON.stringify(deletedSubscriptionPlan),
                },
            ],
            createdBy: userInfo,
        });
        //endregion

        return deletedSubscriptionPlan;
    },
};
