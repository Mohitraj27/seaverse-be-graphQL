const { CustomError, ErrorName, Role, AuthUser } = require("../../../util");

const { Subscriber } = require("./subscriber_model");
const { User } = require("../../user/user_model");

const SubscriberHelper = require("./subscriber_helper");

module.exports.queries = {
    getSubscribers: async ({ pageInput, filterInput }, context) => {
        const { role } = AuthUser(context);

        if (role !== Role.SAAS_ADMIN) throw CustomError(ErrorName.FORBIDDEN);

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50;
        let filterConditions = {};

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
                        },
                    ],
                };
            }
        }

        return Subscriber.aggregatePaginate(
            Subscriber.aggregate([
                {
                    $match: filterConditions,
                },
            ]),
            {
                offset: skip,
                limit,
                sort: { createdAt: "descending" },
                customLabels: {
                    docs: "subscribers",
                    totalDocs: "totalCount",
                    offset: "skip",
                },
                pagination: limit !== 0,
                allowDiskUse: true,
            }
        );
    },
    getSubscriber: async ({ id }, context) => {
        const { role, subscriberId } = AuthUser(context);

        if (role === Role.SAAS_ADMIN && id == null) throw CustomError(ErrorName.ARGUMENTS_REQUIRED);

        return Subscriber.findById(id ?? subscriberId)
            .lean()
            .populate("user");
    },
};

module.exports.mutations = {
    createSubscriber: async ({ input }, context) => {
        const { role } = AuthUser(context);
        if (role !== Role.SAAS_ADMIN) throw CustomError(ErrorName.FORBIDDEN);
        return await SubscriberHelper.createSubscriber({ input });
    },
    updateSubscriber: async ({ id, input }, context) => {
        const { role, subscriberId } = AuthUser(context);

        const performAction = async () => {
            const existingSubscriber = await Subscriber.findById(id);
            if (!existingSubscriber) throw CustomError(ErrorName.NOT_FOUND);

            if (input.name) existingSubscriber.name = input.name;

            const savedSubscriber = existingSubscriber.save();
            if (savedSubscriber) return savedSubscriber;
            throw CustomError(ErrorName.FAILED);
        };

        if (role === Role.SAAS_ADMIN) {
            return await performAction();
        } else if (role === Role.ADMIN) {
            id = subscriberId;
            return await performAction();
        }

        throw CustomError(ErrorName.FORBIDDEN);
    },
    deleteSubscriber: async ({ id }, context) => {
        const { role } = AuthUser(context);

        const performAction = async () => {
            const existingSubscriber = await Subscriber.findById(id).select("user");

            if (existingSubscriber) {
                await User.findByIdAndDelete(existingSubscriber.user).lean();
                const deletedSubscriber = existingSubscriber.deleteOne();
                if (deletedSubscriber) return deletedSubscriber;
            }

            throw CustomError(ErrorName.FAILED);
        };

        if (role === Role.SAAS_ADMIN) return await performAction();
        throw CustomError(ErrorName.FORBIDDEN);
    },
};
