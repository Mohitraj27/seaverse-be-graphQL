const { Role, AuthUser } = require("../../util");

const { Log } = require("./log_model");

module.exports.queries = {
    getLogs: async ({ pageInput = {} }, context) => {
        const { role, subscriberId } = AuthUser(context);

        const skip = pageInput?.skip ?? 0;
        const limit = pageInput?.limit ?? 50;
        let filterConditions = {};

        const fetchResults = async () => {
            return await Log.aggregatePaginate(
                Log.aggregate([
                    {
                        $match: filterConditions,
                    },
                ]),
                {
                    offset: skip,
                    limit,
                    sort: { createdAt: "descending" },
                    customLabels: {
                        docs: "logs",
                        totalDocs: "totalCount",
                        offset: "skip",
                    },
                    pagination: limit !== 0,
                    allowDiskUse: true,
                }
            );
        };

        if (role === Role.SAAS_ADMIN) {
            return await fetchResults();
        } else if (role === Role.ADMIN) {
            filterConditions.subscriber = subscriberId;
            return await fetchResults();
        }

        return {
            logs: [],
            totalCount: 0,
        };
    },
};
