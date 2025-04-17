const {
    CustomError,
    ErrorName,
    AuthUser,
    SendEmail,
    DbTransactionHelper,
} = require("../../util");

const { ObjectId } = require("../../tools");

const { Vessel } = require("./vessel_model");
const { User, DeletedUser } = require("../user/user_model");
const LogHelper = require("../logs/log_helper");
const LogType = require("../logs/log_type.json");
const { UserVessel } = require("../user/user-vessel-bridge/userVessel_model");
const NotificationHelper = require("../notifications/notification_helper");
const NotificationType = require("../notifications/notification_type.json");
const notificationiconEnum = require("../notifications/notification_icon.json");
const { vesselStatusUpdateEmail, vesselStatusUpdateEmailAdmin } = require("../email-template/vesselStatusUpdate");
const { sendNotifications } = require("../../util/firebase_helper");

const { Owner } = require("../vessle/owner/owner_model");

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
                { $unwind: { path: "$typeOfVessel" } },
                {
                    $lookup: {
                        from: "owners",
                        localField: "ownerId",
                        foreignField: "_id",
                        as: "owner",
                        pipeline: [
                            { $project: { _id: 1, name: 1, address: 1 } },
                        ],
                    },
                },
                { $unwind: { path: "$owner", preserveNullAndEmptyArrays: true } },
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
                    sort: { updatedAt: -1 },
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

            if (vessel) {
                return {
                    status: false,
                    message: 'IMO number already exist.'
                };
            } else {
                return {
                    status: true,
                    message: 'IMO number is valid.'
                };
            }
        } catch (error) {
            throw Error(error.message);
        }
    },
};

module.exports.mutations = {
    createVessel: async ({ input }, context) => {

        const { role, userId, userInfo, userPermissions, subscriberId } = AuthUser(context);

        try {
            const { name, typeOfVessel, imoNumber, isActive, companyName, ownerId, address } = input;

            if (!input) throw CustomError(ErrorName.FIELD_REQUIRED, 'Input is required.');
            if (!input.name) throw CustomError(ErrorName.FIELD_REQUIRED, 'Name is required.');
            if (!input.typeOfVessel) throw CustomError(ErrorName.FIELD_REQUIRED, 'Type of vessel is required.');
            if (!input.imoNumber) throw CustomError(ErrorName.FIELD_REQUIRED, 'IMO number is required.');
            if (input.isActive === undefined || input.isActive === null) throw CustomError(ErrorName.FIELD_REQUIRED, 'Is Active is required.');

            const existingImoNumber = await Vessel.findOne({ imoNumber: imoNumber });
            if (existingImoNumber) {
                throw CustomError(ErrorName.ALREADY_EXIST, 'IMO number already exist.');
            }

            let ownerName;

            if (ownerId && ownerId !== '') {
                const existingOwner = await Owner.findById(ownerId);
                if (!existingOwner) throw CustomError(ErrorName.FAILED,'Owner does not exist');
                if (address) {
                    existingOwner.address = address;
                    await existingOwner.save();
                }

                ownerName = existingOwner?.name;

                if (!ownerName) {
                    throw CustomError(ErrorName.FAILED,'Owner Name does not exist');
                }
            }

            const vessel = new Vessel({
                subscriber: subscriberId,
                name: name,
                typeOfVessel: typeOfVessel,
                imoNumber: imoNumber,
                isActive: isActive,
                companyName: companyName,
                ownerId: ownerId ?? null,
                ownerName: ownerName ?? null,
                address: address ?? null,
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
            await NotificationHelper.createNotificationhelper({
                subscriber: subscriberId,
                titleValue: `New Vessel Created: ${vessel.name}`,
                messageValue: `Vessel: ${vessel.name} has been added to SeaVerse by ${userInfo?.firstName} ${userInfo?.lastName ?? ""}.`,
                notificationType: NotificationType.VESSEL_CREATED,
                notifyAllAdmin: true,
                status: "SENT",
                icon: notificationiconEnum.SUCCESS,
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
            const { name, typeOfVessel, imoNumber, isActive, companyName, ownerId, address } = input;

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

            let ownerName;
            if (ownerId) {
                const existingOwner = await Owner.findOne({ _id: ownerId });

                if (!existingOwner) throw CustomError(ErrorName.FAILED);

                if (address) {
                    existingOwner.address = address;
                    await existingOwner.save();
                }

                ownerName = existingOwner?.name;
            }

            vessel.name = name;
            vessel.typeOfVessel = typeOfVessel;
            vessel.imoNumber = imoNumber;
            vessel.isActive = isActive;
            vessel.companyName = companyName;
            vessel.ownerId = ownerId ?? vessel.ownerId;
            vessel.ownerName = ownerName ?? vessel.ownerName;
            vessel.subscriber = subscriberId;

            const updatedVessel = await vessel.save();

            if (updatedVessel) {
                if (isActive === false) {
                    await UserVessel.updateMany(
                        { vessel: vessel._id, isActive: true },
                        { $set: { vessel: null, isActive: false } }
                    );

                    await User.updateMany(
                        { currentVessel: vessel._id },
                        { $set: { vessel: null } }
                    );

                    await DeletedUser.updateMany(
                        { currentVessel: vessel._id },
                        { $set: { vessel: null } }
                    );

                }
            }

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
            await NotificationHelper.createNotificationhelper({
                subscriber: subscriberId,
                titleValue: `${vessel.name} Vessel Updated`,
                messageValue: `Vessel ${vessel.name} has been updated by ${userInfo?.firstName} ${userInfo?.lastName ?? ""}.`,
                notificationType: NotificationType.VESSEL_UPDATED,
                notifyAllAdmin: true,
                status: "SENT",
                icon: notificationiconEnum.SUCCESS,
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
            const result = await DbTransactionHelper.performDbTransaction(async (session) => {
                let vessel;
                const updatedVessels = [];
                for (let id of ids) {
                    vessel = await Vessel.findOne({ _id: id }).session(session);
                    if (!vessel) {
                        throw new CustomError(ErrorName.NOT_FOUND, 'Vessel not found.');
                    }

                    vessel.isActive = !vessel.isActive;
                    vessel.updatedBy = userId;

                    await vessel.save({ session });
                    updatedVessels.push({
                        id: vessel._id,
                        name: vessel.name,
                        isActive: vessel.isActive,
                    });


                    if (!vessel.isActive) {
                        await UserVessel.updateMany(
                            { vessel: vessel._id, isActive: true },
                            { $set: { vessel: null, isActive: false } },
                            { session }
                        );

                        await User.updateMany(
                            { currentVessel: vessel._id },
                            { $set: { currentVessel: null } },
                            { session }
                        );

                        await DeletedUser.updateMany(
                            { currentVessel: vessel._id },
                            { $set: { currentVessel: null } },
                            { session }
                        );
                    }
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

                if (updatedVessels.length > 0) {
                    const vesselNames = updatedVessels.map(v => v.name).join(", ");
                    const statusSummary = updatedVessels.map(v => `${v.name}: ${v.isActive ? 'Activated' : 'Deactivated'}`).join(", ");

                    await NotificationHelper.createNotificationhelper({
                        subscriber: subscriberId,
                        titleValue: `Vessel Status Updated Successfully`,
                        messageValue: `The following vessels have been updated: ${statusSummary} by ${userInfo?.firstName} ${userInfo?.lastName}.`,
                        notificationType: NotificationType.VESSEL_STATUS_UPDATE,
                        notifyAllAdmin: true,
                        affected: updatedVessels.map(v => ({
                            targetRef: "Vessel",
                            target: v.id,
                        })),
                        status: "SENT",
                        icon: notificationiconEnum.SUCCESS,
                        createdBy: userInfo,
                        session,
                    });

                   /*  await NotificationHelper.createNotificationhelper({
                        subscriber: subscriberId,
                        titleValue: `Your Vessels have been Updated`,
                        messageValue: `The vessels ${vesselNames} have been updated by ${userInfo?.firstName} ${userInfo?.lastName}.`,
                        notificationType: NotificationType.VESSEL_STATUS_UPDATE,
                        notifyAllAdmin: false,
                        affected: updatedVessels.map(v => ({
                            targetRef: "Vessel",
                            target: v.id,
                        })),
                        notifiers: updatedVessels.map(v => v.id),
                        employeeNotifiers: updatedVessels.map(v => v.id),
                        icon: notificationiconEnum.SUCCESS,
                        status: "SENT",
                        createdBy: userInfo,
                        session,
                    }); */

                    const assignedUsers = await User.find({ currentVessel: vessel._id }).session(session);
                    /*
                    for (let user of assignedUsers) {
                        const emailContent = vesselStatusUpdateEmail({
                            firstName: user.firstName,
                            vesselName: vesselNames,
                            vesselStatus: statusSummary,
                        });
                        await SendEmail({
                            receiverEmail: user.email,
                            subject: `Vessel Status Update: ${vesselNames}`,
                            htmlContent: emailContent,
                            session,
                        });
                    }
                    
                    const emailContentforAdmin = vesselStatusUpdateEmailAdmin({
                        firstName: userInfo?.firstName,
                        vesselName: vesselNames,
                        vesselStatus: statusSummary,
                    });
                    await SendEmail({
                        receiverEmail: userInfo?.email,
                        subject: `Vessel Status Update: ${vesselNames}`,
                        htmlContent: emailContentforAdmin,
                        session,
                    });
                    */
                    const userVesselIdsToNotify = updatedVessels.map(v => v.id);
                    const matchingUsers = await User.find({ currentVessel: { $in: userVesselIdsToNotify } }).select('_id').session(session);
                    if (matchingUsers.length > 0) {
                        const userObjectIds = matchingUsers.map(user => user._id);
                        await sendNotifications({
                            userIds: userObjectIds,
                            title: "Your Vessel Status has been Updated",
                            body: `The vessels ${vesselNames} have been updated by ${userInfo?.firstName} ${userInfo?.lastName}.`,
                            content: { type: "VESSEL_STATUS_UPDATE", vesselIds: userVesselIdsToNotify },
                            webLink: "",
                            session,
                        });
                    }
                }

                return {
                    success: true,
                    message: `Vessel ${vessel.isActive ? 'activated' : 'deactivated'} successfully.`
                };
            });

            return result;
        } catch (error) {
            throw new Error(error.message);
        }
    },
};