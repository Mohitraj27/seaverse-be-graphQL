const {
    CustomError,
    ErrorName,
    AuthUser
} = require("../../util");

const { ObjectId } = require("../../tools");

const { Vessel } = require("./vessel_model");
const { User } = require("../user/user_model");
const LogHelper = require("../logs/log_helper");
const LogType = require("../logs/log_type.json");
const { UserVessel } = require("../user/user-vessel-bridge/userVessel_model");

module.exports.queries = {
    getVessels: async ({ pageInput, filterInput }, context) => {
        try {
            const { subscriberId } = AuthUser(context);

            const skip = pageInput?.skip ?? 0;
            const limit = pageInput?.limit ?? 50;

            let filterConditions = { subscriber: subscriberId, isDeleted: { $ne: true } };

            if (filterInput?.isActive !== undefined) {
                filterConditions.isActive = filterInput?.isActive;
            }

            if (filterInput?.vesselName?.length > 0) {
                filterConditions.name = {
                    $in: filterInput.vesselName.map(name => new RegExp(".*" + name + ".*", "i")),
                };
            }

            if (filterInput?.vesselNameAndImoNumber?.length > 0) {
                filterConditions.$or = [
                    {
                        name: {
                            $in: filterInput.vesselNameAndImoNumber.map(name => new RegExp(".*" + name + ".*", "i")),
                        },
                    },
                    {
                        imoNumber: {
                            $in: filterInput.vesselNameAndImoNumber.map(imo => new RegExp(".*" + imo + ".*", "i")),
                        },
                    },
                ];
            }

            if (filterInput?.companyName?.length > 0) {
                filterConditions.companyName = {
                    $in: filterInput.companyName.map(companyName => new RegExp(".*" + companyName + ".*", "i")),
                };
            }

            if (filterInput?.ownerName?.length > 0) {
                filterConditions.ownerName = {
                    $in: filterInput.ownerName.map(ownerName => new RegExp(".*" + ownerName + ".*", "i")),
                };
            }

            if (filterInput?.search) {
                filterConditions.$or = [
                    { name: { $regex: ".*" + filterInput.search + ".*", $options: "i" } },
                    { imoNumber: { $regex: ".*" + filterInput.search + ".*", $options: "i" } },
                    { companyName: { $regex: ".*" + filterInput.search + ".*", $options: "i" } },
                    { ownerName: { $regex: ".*" + filterInput.search + ".*", $options: "i" } },
                ];
            }

            const pipeline = [
                { $match: filterConditions },
                {
                    $lookup: {
                        from: "vesseltypes",
                        localField: "typeOfVessel",
                        foreignField: "_id",
                        as: "typeOfVessel",
                        pipeline: [
                            { $project: { _id: 1, name: 1, isActive: 1, createdAt: 1, updatedAt: 1 } },
                        ],
                    },
                },
                { $unwind: { path: "$typeOfVessel", preserveNullAndEmptyArrays: true } },
            ];

            if (filterInput?.vesselType?.length > 0) {
                pipeline.push({
                    $match: {
                        "typeOfVessel.name": {
                            $in: filterInput.vesselType.map(
                                vesselType => new RegExp(".*" + vesselType + ".*", "i")
                            ),
                        },
                    },
                });
            }

            const vessels = await Vessel.aggregatePaginate(
                Vessel.aggregate(pipeline),
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

            return {
                vessels: vessels.vessels,
                totalCount: vessels.vessels.length,
            };

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
                imoNumber: imoNumber,
                subscriber: subscriberId,
                isDeleted: { $ne: true }
            });
            let message
            if (vessel) {
                message = 'IMO number already exist.';
            } else {
                message = 'IMO number is valid.';
            }

            return {
                status: true,
                message: message
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
                throw CustomError(ErrorName.FIELD_REQUIRED, 'Vessel ID is required.');
            }

            const vesselUsers = await UserVessel.find({
                vessel: { $in: ids },
                isActive: true,
            });

            if (vesselUsers.length > 0) {
                await UserVessel.updateMany(
                    { vessel: { $in: ids } },
                    { $set: { isActive: false, vesselStatus: "ONSHORE" } }
                );
            }

            const vessels = await Vessel.find({ _id: { $in: ids } });


            await Vessel.updateMany(
                { _id: { $in: ids } },
                { $set: { isDeleted: true, updatedBy: userId } }
            );


            for (const vessel of vessels) {
                if (!vessel) continue;

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
                message: 'Vessel(s) deleted successfully.',
            };
        } catch (error) {
            throw new Error(error.message);
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