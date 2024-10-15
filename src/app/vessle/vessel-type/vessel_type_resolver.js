const {
    CustomError,
    ErrorName,
    AuthUser
} = require("../../../util");

const { VesselType } = require("./vessel_type_model");

const { Vessel } = require("../vessel_model");

module.exports.queries = {
    getVesselTypes: async ({ pageInput, filterInput }, context) => {
        try {
            const { subscriberId } = AuthUser(context);

            const skip = pageInput?.skip ?? 0;
            const limit = pageInput?.limit ?? 50;

            let filterConditions = { subscriber: subscriberId, isDeleted: { $ne: true } };

            filterConditions.isActive = filterInput.isActive ? true : false;

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
            throw CustomError(ErrorName.FAILED, `${error.message}`);
        }
    },

    getVesselTypeById: async ({ id }, context) => {
        try {
            const { subscriberId } = AuthUser(context);

            const vesselType = await VesselType.findOne({ _id: id, subscriber: subscriberId, isDeleted: { $ne: true } });

            if (!vesselType) {
                throw new CustomError(ErrorName.NOT_FOUND, 'Vessel Type not found.');
            }

            return vesselType;
        } catch (error) {
            throw CustomError(ErrorName.FAILED, `${error.message}`);
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
            throw CustomError(ErrorName.FAILED, `${error.message}`);
        }
    },
    updateVesselType: async ({ id, input }, context) => {
        try {
            const { role, userId, userInfo, userPermissions, subscriberId } = AuthUser(context);
            const { name } = input;

            const vesselType = await VesselType.findById(id);

            if (!vesselType) {
                throw new CustomError(ErrorName.NOT_FOUND, 'Vessel Type not found.');
            }

            vesselType.name = name;
            vesselType.subscriber = subscriberId;
            vesselType.updatedBy = userId;

            await vesselType.save();

            return vesselType;
        } catch (error) {
            throw CustomError(ErrorName.FAILED, `${error.message}`);
        }
    },
    deleteVesselType: async ({ id }, context) => {
        try {
            const { role, userId, userInfo, userPermissions, subscriberId } = AuthUser(context);

            const vesselType = await VesselType.findById(id);
            if (!vesselType) {
                throw new CustomError(ErrorName.NOT_FOUND, 'Vessel Type not found.');
            }

            const alreadyInUse = await Vessel.findOne({ typeOfVessel: id, isDeleted: { $ne: true } });
            if (alreadyInUse) {
                throw CustomError(ErrorName.ALREADY_IN_USE, 'Vessel Type already in use.');
            }

            vesselType.isDeleted = true;
            vesselType.updatedBy = userId;

            await vesselType.save();
            
            return {
                success: true,
                message: 'Vessel Type deleted successfully.'
            };
        } catch (error) {
            throw CustomError(ErrorName.FAILED, `${error.message}`);
        }
    },

    activateDeactivateVesselType: async ({ id }, context) => {
        try {
            const { role, userId, userInfo, userPermissions, subscriberId } = AuthUser(context);

            const vesselType = await VesselType.findById(id);
            if (!vesselType) {
                throw new CustomError(ErrorName.NOT_FOUND);
            }

            vesselType.isActive = !vesselType.isActive;
            vesselType.updatedBy = userId;

            await vesselType.save();

            return {
                success: true,
                message: `Vessel Type ${vesselType.isActive ? 'activated' : 'deactivated'} successfully.`
            };
        } catch (error) {
            throw CustomError(ErrorName.FAILED, `${error.message}`);
        }
    }
};