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
const { Employee } = require("../user/employee/employee_model");
const { LearningPlan } = require('../learning-plan/learning_plan_model');
const { Owner } = require("../vessle/owner/owner_model");
const LearningPlanStatus = require('../learning-plan/enumFields/learning_plan_status.json')
const targetAudienceEnum = require('../learning-plan/enumFields/targetAudienceEnum.json')
const typeOfConditionalCustomFieldEnum = require('../learning-plan/enumFields/typeOfConditionalCustomField.json');
const { filterLearningPlans } = require("../user/employee/employee_helper");
const { encrypt, decrypt } = require("../../util/encryption_helper");
const { updateByQueryToElasticSearch } = require('../../util/elastic_helper');

// Utility function to safely decrypt data
const safeDecrypt = (encryptedData, fieldName = 'field') => {
    if (!encryptedData) return '';

    // Check if data looks corrupted (too long or contains invalid patterns)
    if (encryptedData.length > 10000) {
        console.warn(`${fieldName} appears corrupted - too long: ${encryptedData.length} characters`);
        return '';
    }

    try {
        return decrypt(encryptedData);
    } catch (error) {
        console.warn(`Failed to decrypt ${fieldName}:`, error.message);
        return '';
    }
};

// Utility function to safely encrypt data
const safeEncrypt = (plainData, fieldName = 'field') => {
    if (!plainData || plainData.length === 0) return null;

    // Strict length validation
    if (plainData.length > 100) {
        throw new Error(`${fieldName} is too long: ${plainData.length} characters`);
    }

    try {
        return encrypt(plainData);
    } catch (error) {
        console.error(`Failed to encrypt ${fieldName}:`, error.message);
        throw new Error(`Failed to process ${fieldName}`);
    }
};
const checkVesselLinkedToActiveLearningPlan = async (vesselId, vesselTypeId) => {
    try {
        const result = await LearningPlan.aggregate([
            {
                $match: {
                    status: LearningPlanStatus.ACTIVE,
                    isDeleted: false,
                    $or: [
                        {
                            targetAudience: targetAudienceEnum.GROUP_BASED,
                            "groupIDs.groupType": "vessel",
                            "groupIDs.groupIDs": vesselId
                        },
                        {
                            targetAudience: targetAudienceEnum.GROUP_BASED,
                            "groupIDs.groupType": "vesselType",
                            "groupIDs.groupIDs": vesselTypeId
                        },
                        {
                            targetAudience: targetAudienceEnum.EVERYONE_IN_ORGANIZATION,
                            "conditionalCustomFields.type_of_Field": typeOfConditionalCustomFieldEnum.VESSEL,
                            "conditionalCustomFields.valueOfField": vesselId,
                            "conditionalCustomFields.isOrIsNot": "IS"
                        },
                        {
                            targetAudience: targetAudienceEnum.EVERYONE_IN_ORGANIZATION,
                            "conditionalCustomFields.type_of_Field": typeOfConditionalCustomFieldEnum.VESSEL_TYPE,
                            "conditionalCustomFields.valueOfField": vesselTypeId,
                            "conditionalCustomFields.isOrIsNot": "IS"
                        },
                        {
                            targetAudience: targetAudienceEnum.EVERYONE_IN_ORGANIZATION,
                            "conditionalCustomFields.type_of_Field": typeOfConditionalCustomFieldEnum.VESSEL,
                            "conditionalCustomFields.valueOfField": vesselId,
                            "conditionalCustomFields.isOrIsNot": "IS_NOT"
                        },
                        {
                            targetAudience: targetAudienceEnum.EVERYONE_IN_ORGANIZATION,
                            "conditionalCustomFields.type_of_Field": typeOfConditionalCustomFieldEnum.VESSEL_TYPE,
                            "conditionalCustomFields.valueOfField": vesselTypeId,
                            "conditionalCustomFields.isOrIsNot": "IS_NOT"
                        }
                    ]
                }
            },
            {
                $limit: 1
            },
            {
                $count: "count"
            }
        ]);
        return result.length > 0 && result[0].count > 0;
    } catch (error) {
        throw new Error('Failed to check vessel Learning Plan association', error);
    }
};
module.exports.queries = {
    getVessels: async ({ pageInput, filterInput, sortInput }, context) => {
        try {
            const { subscriberId } = AuthUser(context);

            const skip = pageInput?.skip ?? 0;
            const limit = pageInput?.limit ?? 700;

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

            let ownerNameIdsToMatch = null;
            if (filterInput?.ownerName?.length > 0) {
                const ownersWithNames = await Owner.find(
                    { subscriber: subscriberId, isDeleted: { $ne: true } },
                    { _id: 1, firstName: 1, lastName: 1 }
                );

                const matchedOwnerIds = ownersWithNames
                    .map(owner => {
                        const firstName = owner.firstName ? safeDecrypt(owner.firstName, 'owner firstName') : '';
                        const lastName = owner.lastName ? safeDecrypt(owner.lastName, 'owner lastName') : '';
                        const fullName = `${firstName} ${lastName}`.trim();
                        return { id: owner._id, ownerName: fullName };
                    })
                    .filter(owner => filterInput.ownerName.some(searchTerm =>
                        new RegExp(".*" + searchTerm + ".*", "i").test(owner.ownerName)
                    ))
                    .map(owner => owner.id);

                ownerNameIdsToMatch = matchedOwnerIds;
                filterConditions.ownerId = { $in: ownerNameIdsToMatch };
            }

            if (filterInput?.search) {
                const ownersWithNames = await Owner.find(
                    { subscriber: subscriberId, isDeleted: { $ne: true } },
                    { _id: 1, firstName: 1, lastName: 1 }
                );

                const matchedOwnerIds = ownersWithNames
                    .map(owner => {
                        const firstName = owner.firstName ? safeDecrypt(owner.firstName, 'owner firstName') : '';
                        const lastName = owner.lastName ? safeDecrypt(owner.lastName, 'owner lastName') : '';
                        const fullName = `${firstName} ${lastName}`.trim();
                        return { id: owner._id, ownerName: fullName };
                    })
                    .filter(owner => new RegExp(".*" + filterInput.search + ".*", "i").test(owner.ownerName))
                    .map(owner => owner.id);

                filterConditions.$or = [
                    { name: { $regex: ".*" + filterInput.search + ".*", $options: "i" } },
                    { imoNumber: { $regex: ".*" + filterInput.search + ".*", $options: "i" } },
                    { companyName: { $regex: ".*" + filterInput.search + ".*", $options: "i" } },
                    { ownerId: { $in: matchedOwnerIds } }
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
                            { $project: { _id: 1, name: 1, firstName: 1, lastName: 1, address: 1 } },
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

            if (sortInput?.sortField) {
                const sortFieldMap = {
                    name: "name",
                    companyName: "companyName",
                    ownerName: "owner.firstName",
                    vesselType: "typeOfVessel.name"
                };

                const field = sortFieldMap[sortInput.sortField];

                if (field) {
                    pipeline.push({
                        $sort: {
                            [field]: sortInput.sortOrder ?? 1,
                        },
                    });
                }
            } else {
                pipeline.push({ $sort: { updatedAt: -1 } });
            }

            const vessels = await Vessel.aggregatePaginate(
                Vessel.aggregate(pipeline),
                {
                    offset: skip,
                    limit,
                    customLabels: {
                        docs: "vessels",
                        totalDocs: "totalCount",
                        offset: "skip",
                    },
                    pagination: limit !== 0,
                    allowDiskUse: true,
                }
            );
            let decryptedVessels = vessels.vessels.map(vessel => {
                let ownerName = "";
                if (vessel.owner) {
                    const firstName = vessel.owner.firstName ? safeDecrypt(vessel.owner.firstName, 'owner firstName') : '';
                    const lastName = vessel.owner.lastName ? safeDecrypt(vessel.owner.lastName, 'owner lastName') : '';
                    const address = vessel.owner.address ? safeDecrypt(vessel.owner.address, 'owner address') : '';
                    const name = vessel.owner.name ? safeDecrypt(vessel.owner.name, 'owner name') : '';

                    ownerName = `${firstName} ${lastName}`.trim() || name;

                    // Update the owner object with all decrypted fields
                    vessel.owner = {
                        ...vessel.owner,
                        name: ownerName,
                        firstName: firstName,
                        lastName: lastName,
                        address: address
                    };
                }

                return {
                    ...vessel,
                    ownerName: ownerName,
                    address: vessel?.address ? safeDecrypt(vessel.address, 'vessel address') : "",
                }

            });

            return {
                vessels: decryptedVessels,
                totalCount: vessels?.totalCount || 0,
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
            // Get owner details if ownerId exists
            let ownerName = "";
            if (vessel.ownerId) {
                const owner = await Owner.findById(vessel.ownerId);
                if (owner) {
                    const firstName = owner.firstName ? safeDecrypt(owner.firstName, 'owner firstName') : '';
                    const lastName = owner.lastName ? safeDecrypt(owner.lastName, 'owner lastName') : '';
                    ownerName = `${firstName} ${lastName}`.trim();
                }
            }

            const decryptedVessels = {
                ...vessel.toObject(),
                ownerName: ownerName,
                address: vessel?.address ? safeDecrypt(vessel.address, 'vessel address') : vessel?.address,
            };
            return decryptedVessels;
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

            if (ownerId && ownerId !== '') {
                try {
                    const existingOwner = await Owner.findById(ownerId);
                    if (!existingOwner) throw CustomError(ErrorName.FAILED, 'Owner does not exist');

                    let needsUpdate = false;
                    const updateData = {};

                    // Handle name field construction with strict validation
                    if (!existingOwner.name && (existingOwner.firstName || existingOwner.lastName)) {
                        try {
                            let firstName = '';
                            let lastName = '';

                            if (existingOwner.firstName) {
                                if (existingOwner.firstName.length > 50) {
                                    firstName = safeDecrypt(existingOwner.firstName, 'owner firstName');
                                } else {
                                    firstName = existingOwner.firstName;
                                }
                            }

                            if (existingOwner.lastName) {
                                if (existingOwner.lastName.length > 50) {
                                    lastName = safeDecrypt(existingOwner.lastName, 'owner lastName');
                                } else {
                                    lastName = existingOwner.lastName;
                                }
                            }

                            const fullName = `${firstName} ${lastName}`.trim();
                            if (fullName && fullName.length < 50) {
                                updateData.name = safeEncrypt(fullName, 'owner name');
                                needsUpdate = true;
                            }
                        } catch (decryptError) {
                            console.error('Error processing owner name in createVessel:', decryptError.message);
                        }
                    }

                    if (address && address.length < 200) {
                        try {
                            updateData.address = safeEncrypt(address, 'owner address');
                            needsUpdate = true;
                        } catch (encryptError) {
                            console.error('Error encrypting address in createVessel:', encryptError.message);
                            throw CustomError(ErrorName.FAILED, 'Failed to process address data');
                        }
                    } else if (address && address.length >= 200) {
                        throw CustomError(ErrorName.FAILED, 'Address is too long');
                    }

                    if (needsUpdate) {
                        await Owner.updateOne({ _id: ownerId }, { $set: updateData });
                    }
                } catch (ownerError) {
                    console.error('Error updating owner in createVessel:', ownerError.message);
                    if (ownerError.message.includes('offset')) {
                        throw CustomError(ErrorName.FAILED, 'Owner data is corrupted. Please contact support.');
                    }
                    throw ownerError;
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
                address: address ? safeEncrypt(address, 'vessel address') : null,
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
                messageValue: `Vessel: "${vessel.name}" has been added to SeaVerse by ${safeDecrypt(userInfo?.firstName, 'user firstName')} ${userInfo?.lastName ? safeDecrypt(userInfo?.lastName, 'user lastName') : ''}.`,
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
            console.log(error)
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

            if (vessel.isActive === true && input.isActive === false) {
                const isLinkedToActiveLearningPlan = await checkVesselLinkedToActiveLearningPlan(
                    vessel._id.toString(),
                    vessel.typeOfVessel?.toString() || typeOfVessel?.toString()
                );
                if (isLinkedToActiveLearningPlan) {
                    throw CustomError(ErrorName.VESSEL_LINKED_TO_LEARNING_PLAN, 'This vessel is linked to an active Learning Plan and cannot be deactivated or deleted');
                }
            }

            const existingImoNumber = await Vessel.findOne({ _id: { $ne: vessel._id }, imoNumber: imoNumber });
            if (existingImoNumber) {
                throw new CustomError(ErrorName.ALREADY_EXIST, 'IMO number already exist.');
            }

            if (ownerId) {
                // Minimal owner validation to prevent buffer overflow
                const existingOwner = await Owner.findOne({ _id: ownerId }, { _id: 1 });
                if (!existingOwner) throw CustomError(ErrorName.FAILED, 'Owner does not exist');

                // Skip owner data updates to prevent buffer overflow
                console.log(`UpdateVessel: Owner ${ownerId} validated, skipping data updates to prevent buffer overflow`);
            }

            vessel.name = name;
            vessel.typeOfVessel = typeOfVessel;
            vessel.imoNumber = imoNumber;
            vessel.isActive = isActive;
            vessel.companyName = companyName;
            vessel.ownerId = ownerId ?? vessel.ownerId;
            vessel.subscriber = subscriberId;
            vessel.address = address ? encrypt(address) : ""
            console.log(ownerId,"owid")

            const update = {};
            if (address) {
                update.address = encrypt(address);
            }

            await Owner.findByIdAndUpdate(ownerId, update, { new: true });

            // Handle address encryption safely
            console.log(vessel.address,"address");
            // if (address !== undefined) {
            //     if (address && address.length > 0) {
            //         if (address.length > 200) {
            //             throw CustomError(ErrorName.FAILED, 'Address is too long');
            //         }
            //         try {
            //             vessel.address = safeEncrypt(address, 'address');
            //         } catch (encryptError) {
            //             console.error('Error encrypting address in updateVessel:', encryptError.message);
            //             throw CustomError(ErrorName.FAILED, 'Failed to process address data');
            //         }
            //     } else {
            //         vessel.address = null;
            //     }
            // }

            const updatedVessel = await vessel.save();
            console.log(updatedVessel,"uv")

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
            //AUTO ENROLLMENT
            const userIds = await User.find({ currentVessel: vessel._id }).select('_id').lean();
            const learningPlans = await LearningPlan.find({ isDeleted: false, status: 'ACTIVE' });
            const userConditions = await Employee.find({
                'user': { $in: userIds },
                'isDeleted': false
            })
                .populate({
                    path: 'empDesignation',
                    select: '_id',
                })
                .populate({
                    path: 'user',
                    select: '_id email currentVessel vesselStatus vesselType isDeleted',
                    match: { 'isDeleted': false },
                    populate: {
                        path: 'currentVessel',
                        select: '_id vesselStatus typeOfVessel isDeleted',
                        match: { 'isDeleted': false }
                    }
                })
                .then((employees) => {
                    const result = employees.map(employee => ({
                        designationID: employee.empDesignation ? employee.empDesignation._id : null,
                        vesselID: employee.user && employee.user.currentVessel ? employee.user.currentVessel._id : null,
                        vesselTypeID: employee.user && employee.user.currentVessel ? employee.user.currentVessel.typeOfVessel : null,
                        currentStatus: employee.user && employee.user.vesselStatus ? employee.user.vesselStatus : null,
                        owner: null, // Owner info will be fetched separately if needed
                        email: employee.user ? employee.user.email : null,
                        _id: employee?.user?._id
                    }));

                    return result;
                })
                .catch((error) => {
                    console.error(error);
                });

            if (learningPlans && learningPlans.length > 0 && userConditions && userConditions.length > 0) {
                await filterLearningPlans(learningPlans, userConditions, context);
            }


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
                messageValue: `Vessel "${vessel.name}" has been updated by ${safeDecrypt(userInfo?.firstName, 'user firstName')} ${userInfo?.lastName ? safeDecrypt(userInfo?.lastName, 'user lastName') : ''}`,
                notificationType: NotificationType.VESSEL_UPDATED,
                notifyAllAdmin: true,
                status: "SENT",
                icon: notificationiconEnum.SUCCESS,
                createdBy: userInfo,
            });
            if (userIds?.length > 0) {
                await Promise.all(
                    userIds.map(userId => updateByQueryToElasticSearch(
                        'users',
                        `
                            ctx._source.currentVessel = params.vesselId;
                            ctx._source.vesselId = params.vesselId;
                            ctx._source.vesselStatus = params.vesselStatus;
                            ctx._source.vesselName = params.vesselName;
                            ctx._source.vesselIsActive = params.vesselIsActive;
                            ctx._source.typeOfVesselName = params.typeOfVesselName;
                            ctx._source.tyepOfVesselId = params.tyepOfVesselId;
                        `,
                        {
                            term: {
                                userId: userId._id
                            }
                        },
                        {
                            vesselId: vesselData?._id ?? null,
                            vesselName: vesselData?.name ?? null,
                            vesselIsActive: vesselData?.isActive ?? null,
                            typeOfVesselName: vesselData?.typeOfVessel?.name ?? null,
                            tyepOfVesselId: vesselData?.typeOfVessel?._id ?? null
                        }
                    ))
                );
            }
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
                const vesselsToCheck = await Vessel.find({
                    _id: { $in: ids },
                    isActive: true
                }).populate('typeOfVessel');
                if (vesselsToCheck?.length > 0) {
                    const checkPromises = vesselsToCheck.map(vessel => {
                        const vesselTypeId = vessel.typeOfVessel?._id?.toString() || vessel.typeOfVessel?.toString();
                        return checkVesselLinkedToActiveLearningPlan(
                            vessel._id.toString(),
                            vesselTypeId
                        );
                    });
                    const results = await Promise.all(checkPromises);
                    const hasLinkedVessel = results.some(isLinked => isLinked === true);
                    if (hasLinkedVessel) {
                        throw CustomError(ErrorName.VESSEL_LINKED_TO_LEARNING_PLAN, 'One or more vessels are linked to active Learning Plans and cannot be deactivated or deleted');
                    }
                }
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

                        try {
                            await updateByQueryToElasticSearch(
                                "users",
                                `
                            ctx._source.currentVessel = params.currentVessel;
                            ctx._source.vesselName = params.vesselName;
                            ctx._source.vesselId = params.vesselId;
                            ctx._source.vesselIsDeleted = params.vesselIsDeleted;
                            ctx._source.vesselIsActive = params.vesselIsActive;
                            ctx._source.typeOfVesselName = params.typeOfVesselName;
                            ctx._source.tyepOfVesselId = params.tyepOfVesselId;
                            `,
                                {
                                    term: { currentVessel: vessel._id }
                                },
                                {
                                    currentVessel: null,
                                    vesselName: null,
                                    vesselId: null,
                                    vesselIsDeleted: null,
                                    vesselIsActive: null,
                                    typeOfVesselName: null,
                                    tyepOfVesselId: null,
                                }
                            );
                        } catch (error) {
                            throw new Error(error.message);
                        }

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
                    const statusSummary = updatedVessels.map(v => ` "${v.name}" : ${v.isActive ? 'Activated' : 'Deactivated'}`).join(", ");

                    await NotificationHelper.createNotificationhelper({
                        subscriber: subscriberId,
                        titleValue: `Vessel Status Updated Successfully`,
                        messageValue: `The following vessels have been updated: ${statusSummary} by ${safeDecrypt(userInfo?.firstName, 'user firstName')} ${userInfo?.lastName ? safeDecrypt(userInfo?.lastName, 'user lastName') : ''}`,
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