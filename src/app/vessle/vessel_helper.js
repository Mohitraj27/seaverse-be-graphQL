const { CustomError, ErrorName, Role, UploadHelper } = require("../../util");
const { Vessel } = require("./vessel_model");

module.exports = {
    getVesselTypes: async ({ filterInput }, context) => {
        try {
            let filterConditions = { isDeleted: { $ne: true } };

            if (filterInput?.search) {
                filterConditions = {
                    ...filterConditions,
                    $and: [
                        {
                            "name": {
                                $regex: ".*" + filterInput.search + ".*",
                                $options: "i",
                            },
                        },
                    ],
                };
            }

            return Vessel.aggregatePaginate(
                Vessel.aggregate([{ $match: filterConditions }]),
                {
                    sort: { createdAt: "descending" },
                    customLabels: {
                        docs: "vessels",
                        totalDocs: "totalCount",
                        offset: "skip",
                    },
                    pagination: filterInput.limit !== 0,
                    allowDiskUse: true,
                }
            );
        } catch (error) {
            return {
                success: true,
                message: 'Something went wrong!.'
            };
        }
    }
};