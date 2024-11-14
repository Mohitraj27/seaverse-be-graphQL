const {
    CustomError,
    ErrorName,
    AuthUser
} = require("../../util");

const { ObjectId } = require("../../tools");

const { Vessel } = require("./vessel_model");
const { VesselType } = require("./vessel-type/vessel_type_model");
const { VesselHelper } = require("./vessel_helper");
const LogHelper = require("../logs/log_helper");
const LogType = require("../logs/log_type.json");

module.exports.queries = {
    getVessels: async ({ pageInput, filterInput }, context) => {
        try {
            const { subscriberId } = AuthUser(context);

            const skip = pageInput?.skip ?? 0;
            const limit = pageInput?.limit ?? 50;

            let filterConditions = { subscriber: subscriberId, isDeleted: { $ne: true } };

            if (filterInput?.isActive !== undefined) {
                filterConditions.isActive = filterInput?.isActive ? true : false;
            }

            if (filterInput?.vesselType) {
                filterConditions = {
                    ...filterConditions,
                    typeOfVessel: ObjectId(filterInput.vesselType),
                };
            }

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
                Vessel.aggregate([
                    { $match: filterConditions },
                    {
                        $lookup: {
                            from: "vesseltypes",
                            localField: "typeOfVessel",
                            foreignField: "_id",
                            as: "typeOfVessel",
                            pipeline: [{ $project: { _id: 1, name: 1, isActive: 1, createdAt: 1, updatedAt: 1 } }],
                        },
                    },
                    { $unwind: { path: "$typeOfVessel", preserveNullAndEmptyArrays: true } },
                ]),
                {
                    offset: skip,
                    limit,
                    sort: { createdAt: "descending" },
                    customLabels: {
                        docs: "vessels",
                        totalDocs: "totalCount",
                        offset: "skip",
                    },
                    pagination: limit !== 0,
                    allowDiskUse: true,
                }
            );
        } catch (error) {
            throw Error(error.message);
        }
    },

    getVesselById: async ({ id }, context) => {
        try {
            const { subscriberId } = AuthUser(context);

            const vessel = await Vessel.findOne({ _id: id, subscriber: subscriberId });
            if (!vessel) {
                throw CustomError(ErrorName.NOT_FOUND, 'Vessel not found.');
            }

            return vessel;
        } catch (error) {
            throw Error(error.message);
        }
    },

    validateImoNumber: async ({ imoNumber }, context) => {
        try {
            const { subscriberId } = AuthUser(context);

            const vessel = await Vessel.findOne({ 
                imoNumber: imoNumber, subscriber: subscriberId });
            if (vessel) {
                throw CustomError(ErrorName.ALREADY_EXIST, 'IMO number already exist');
            }

            return {
                status: true,
                message: 'IMO number is valid'
            };
        } catch (error) {
            throw Error(error.message);
        }
    },
};

module.exports.mutations = {
    createVessel: async ({ input }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId } = AuthUser(context);
        try {
            const { name, typeOfVessel, imoNumber, isActive, companyName, ownerName, address } = input;

            if (!input) throw CustomError(ErrorName.FIELD_REQUIRED, 'Input is required.');
            if (!input.name) throw CustomError(ErrorName.FIELD_REQUIRED, 'Name is required.');
            if (!input.typeOfVessel) throw CustomError(ErrorName.FIELD_REQUIRED, 'Type of vessel is required.');
            if (!input.imoNumber) throw CustomError(ErrorName.FIELD_REQUIRED, 'IMO number is required.');
            if (input.isActive === undefined || input.isActive === null) throw CustomError(ErrorName.FIELD_REQUIRED, 'Is Active is required.');

            const existingImoNumber = await Vessel.findOne({ imoNumber: imoNumber });
            if (existingImoNumber) {
                throw CustomError(ErrorName.ALREADY_EXIST, 'IMO number already exist.');
            }

            const vessel = new Vessel({
                subscriber: subscriberId,
                name: name,
                typeOfVessel: typeOfVessel,
                imoNumber: imoNumber,
                isActive: isActive,
                companyName: companyName,
                ownerName: ownerName,
                address: address,
                createdBy: userId,
                updatedBy: userId,
            });
            await vessel.save();

            const vesselData = await Vessel.findOne({ _id: vessel._id }).populate('typeOfVessel');

            LogHelper.logActivity({
                subscriber: subscriberId,
                logType: LogType.VESSEL_LOG,
                operation: "CREATE",
                ipInfo: context.ipInfo,
                affected: [
                    {
                        targetRef: "Vessel",
                        target: vesselData._id,
                    },
                ],
                additionalInfo: [
                    {
                        infoType: "VESSEL_INFO",
                        infoData: JSON.stringify(vesselData),
                    },
                ],
                createdBy: userInfo,
            });

            return {
                success: true,
                message: 'Vessel created successfully.',
                vessel: vesselData
            }
        } catch (error) {
            throw Error(error.message);
        }
    },

    updateVessel: async ({ id, input }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId } = AuthUser(context);
        try {
            const { name, typeOfVessel, imoNumber, isActive, companyName, ownerName, address } = input;

            const vessel = await Vessel.findOne({ _id: id });
            if (!vessel) {
                throw new CustomError(ErrorName.NOT_FOUND, 'Vessel not found.');
            }

            if (!input) throw CustomError(ErrorName.FIELD_REQUIRED, 'Input is required.');
            if (!input.name) throw CustomError(ErrorName.FIELD_REQUIRED, 'Name is required.');
            if (!input.typeOfVessel) throw CustomError(ErrorName.FIELD_REQUIRED, 'Type of vessel is required.');
            if (!input.imoNumber) throw CustomError(ErrorName.FIELD_REQUIRED, 'IMO number is required.');
            if (input.isActive === undefined || input.isActive === null) throw CustomError(ErrorName.FIELD_REQUIRED, 'Is Active is required.');

            const existingImoNumber = await Vessel.findOne({ _id: { $ne: vessel._id }, imoNumber: imoNumber });
            if (existingImoNumber) {
                throw new CustomError(ErrorName.ALREADY_EXIST, 'IMO number already exist.');
            }

            vessel.name = name;
            vessel.typeOfVessel = typeOfVessel;
            vessel.imoNumber = imoNumber;
            vessel.isActive = isActive;
            vessel.companyName = companyName;
            vessel.ownerName = ownerName;
            vessel.address = address;
            vessel.subscriber = subscriberId;

            await vessel.save();

            const vesselData = await Vessel.findOne({ _id: vessel._id }).populate('typeOfVessel');

            LogHelper.logActivity({
                subscriber: subscriberId,
                logType: LogType.VESSEL_LOG,
                operation: "UPDATE",
                ipInfo: context.ipInfo,
                affected: [
                    {
                        targetRef: "Vessel",
                        target: vesselData._id,
                    },
                ],
                additionalInfo: [
                    {
                        infoType: "VESSEL_INFO",
                        infoData: JSON.stringify(vesselData),
                    },
                ],
                createdBy: userInfo,
            });

            return {
                success: true,
                message: 'Vessel updated successfully.',
                vessel: vesselData
            }
        } catch (error) {
            throw Error(error.message);
        }
    },

    deleteVessel: async ({ ids }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId } = AuthUser(context);
        try {
            if (!ids || ids.length === 0) {
                throw CustomError(ErrorName.FIELD_REQUIRED, 'Vessel id is required.');
            }

            for (let id of ids) {
                const vessel = await Vessel.findOne({ _id: id });

                if (!vessel) {
                    throw CustomError(ErrorName.NOT_FOUND, 'Vessel not found.');
                }
                if (vessel.isDeleted) {
                    throw CustomError(ErrorName.ALREADY_DELETED, 'Vessel already deleted.');
                }
                vessel.isDeleted = true;
                vessel.updatedBy = userId;

                await vessel.save();

                LogHelper.logActivity({
                    subscriber: subscriberId,
                    logType: LogType.VESSEL_LOG,
                    operation: "DELETE",
                    ipInfo: context.ipInfo,
                    affected: [
                        {
                            targetRef: "Vessel",
                            target: vessel._id,
                        },
                    ],
                    additionalInfo: [
                        {
                            infoType: "VESSEL_INFO",
                            infoData: JSON.stringify(vessel),
                        },
                    ],
                    createdBy: userInfo,
                });
            }

            return {
                success: true,
                message: 'Vessel deleted successfully.'
            };
        } catch (error) {
            throw Error(error.message);
        }
    },

    activateDeactivateVessel: async ({ ids }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId } = AuthUser(context);
        try {
            let vessel
            for (let id of ids) {
                vessel = await Vessel.findOne({ _id: id });
                if (!vessel) {
                    throw new CustomError(ErrorName.NOT_FOUND, 'Vessel not found.');
                }

                vessel.isActive = !vessel.isActive;
                vessel.updatedBy = userId;

                await vessel.save();

                LogHelper.logActivity({
                    subscriber: subscriberId,
                    logType: LogType.VESSEL_LOG,
                    operation: "ACTIVATE_DEACTIVATE",
                    ipInfo: context.ipInfo,
                    affected: [
                        {
                            targetRef: "Vessel",
                            target: vessel._id,
                        },
                    ],
                    additionalInfo: [
                        {
                            infoType: "VESSEL_INFO",
                            infoData: JSON.stringify(vessel),
                        },
                    ],
                    createdBy: userInfo,
                });
            }

            return {
                success: true,
                message: `Vessel ${vessel.isActive ? 'activated' : 'deactivated'} successfully.`
            };
        } catch (error) {
            throw Error(error.message);
        }
    },
};