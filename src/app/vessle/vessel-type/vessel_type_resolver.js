const {
    CustomError,
    ErrorName,
    AuthUser
} = require("../../../util");

const { VesselType } = require("./vessel_type_model");

module.exports.queries = {
    getVesselTypes: async ({ pageInput, filterInput }, context) => {
        try {
            const { subscriberId } = AuthUser(context);
            console.log('subscriberId', subscriberId);

            const skip = pageInput?.skip ?? 0;
            const limit = pageInput?.limit ?? 50;

            let filterConditions = { subscriber: subscriberId, isDeleted: { $ne: true } };

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
            
            return VesselType.aggregatePaginate(
                VesselType.aggregate([{ $match: filterConditions }]),
                {
                    offset: skip,
                    limit,
                    sort: { createdAt: "descending" },
                    customLabels: {
                        docs: "vesseltypes",
                        totalDocs: "totalCount",
                        offset: "skip",
                    },
                    pagination: limit !== 0,
                    allowDiskUse: true,
                }
            );
        } catch (error) {
            return {
                success: true,
                message: 'Something went wrong!.'
            };

        }
    },

    getVesselTypeById: async ({ id }, context) => {
        try {
            const { subscriberId } = AuthUser(context);

            const vesselType = await VesselType.findOne({ _id: id, subscriber: subscriberId, isDeleted: { $ne: true } });

            if (!vesselType) {
                throw new CustomError(ErrorName.NOT_FOUND);
            }

            return vesselType;
        } catch (error) {
            return {
                success: true,
                message: 'Something went wrong!.'
            };

        }
    },
};

module.exports.mutations = {
    createVesselType: async ({ input }, context) => {
        try {
            const { role, userId, userInfo, userPermissions, subscriberId } = AuthUser(context);
            const { name } = input;

            const vesselType = new VesselType({
                name: name,
                subscriber: subscriberId,
                createdBy: userId,
                updatedBy: userId,
            });

            await vesselType.save();

            return vesselType;
        } catch (error) {
            return {
                success: true,
                message: 'Something went wrong!.'
            };
        }
    },
    updateVesselType: async ({ id, input }, context) => {
        try {
            const { role, userId, userInfo, userPermissions, subscriberId } = AuthUser(context);
            const { name } = input;

            const vesselType = await VesselType.findById(id);

            if (!vesselType) {
                throw new CustomError(ErrorName.NOT_FOUND);
            }

            vesselType.name = name;
            vesselType.subscriber = subscriberId;
            vesselType.updatedBy = userId;

            await vesselType.save();

            return vesselType;
        } catch (error) {
            return {
                success: true,
                message: 'Something went wrong!.'
            };
        }
    },
    deleteVesselType: async ({ id }, context) => {
        try {
            const { role, userId, userInfo, userPermissions, subscriberId } = AuthUser(context);
            const vesselType = await VesselType.findById(id);

            if (!vesselType) {
                throw new CustomError(ErrorName.NOT_FOUND);
            }

            vesselType.isDeleted = true;
            vesselType.updatedBy = userId;

            await vesselType.save();

            return {
                success: true,
                message: 'Vessel Type deleted successfully.'
            };
        } catch (error) {
            return {
                success: true,
                message: 'Something went wrong!.'
            };
        }
    },
};