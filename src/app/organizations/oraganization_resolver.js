const { ObjectId } = require("../../tools");
const { CustomError, ErrorName, AuthUser, Role, UploadHelper } = require("../../util");

const { Organization } = require("./organization_model");
const { TrainingValidity } = require("./training-validity/training_validity_model");
const { Training } = require("../trainings/training_model");

const OrganizationHelper = require("./organization_helper");
const SubRoleHelper = require("../user/sub-roles/sub_role_helper");
const LogHelper = require("../logs/log_helper");

const Permission = require("../user/sub-roles/permission.json");
const LogType = require("../logs/log_type.json");

module.exports.queries = {
    getOrganizations: async ({ pageInput, filterInput }, context) => {
        const { subscriberId, isOrganizationManager, managingOrganization } = AuthUser(context);

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50;
        let filterConditions = { subscriber: subscriberId, isDeleted: { $ne: true } };

        if (context.platform === Role.ADMIN) {
            if (isOrganizationManager) {
                filterConditions._id = managingOrganization;
            }
        } else {
            filterConditions.isActive = true;
        }

        if (filterInput?.search) {
            filterConditions = {
                ...filterConditions,
                $and: [
                    {
                        "name.value": {
                            $regex: ".*" + filterInput.search + ".*",
                            $options: "i",
                        },
                    },
                ],
            };
        }

        return Organization.aggregatePaginate(
            Organization.aggregate([
                {
                    $match: filterConditions,
                },
                {
                    $lookup: {
                        from: "employees",
                        localField: "_id",
                        foreignField: "organization",
                        as: "employee",
                    },
                },
                { $addFields: { totalEmployees: { $size: "$employee" } } },
                {
                    $lookup: {
                        from: TrainingValidity.collection.name,
                        localField: "_id",
                        foreignField: "organization",
                        as: "trainingValidities",
                        pipeline: [
                            {
                                $lookup: {
                                    from: Training.collection.name,
                                    localField: "training",
                                    foreignField: "_id",
                                    pipeline: [
                                        {
                                            $project: {
                                                _id: true,
                                                title: true,
                                                certificateValidity: true,
                                            },
                                        },
                                    ],
                                    as: "training",
                                },
                            },
                            {
                                $set: {
                                    training: {
                                        $first: "$training",
                                    },
                                },
                            },
                        ],
                    },
                },
            ]),
            {
                offset: skip,
                limit,
                sort: { createdAt: "descending" },
                customLabels: {
                    docs: "organizations",
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
    createOrUpdateOrganization: async ({ id, input }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            input._id &&
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [
                    Permission.UPDATE_ORGANIZATION,
                    Permission.ENABLE_DISABLE_ORGANIZATION,
                ],
                requiredAll: false,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        } else if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.CREATE_ORGANIZATION,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const organizationFilterConditions = {
            _id: input._id ?? ObjectId(),
            subscriber: subscriberId,
        };

        const organizationUpdateData = {};

        if (input.name) {
            const existingOrganization = await Organization.findOne({
                $or: input.name.map(x => ({
                    "name.value": { $regex: x.value.trim(), $options: "i" },
                })),
            })
                .lean()
                .select("_id");

            if (
                existingOrganization &&
                existingOrganization?._id?.toString() !==
                    organizationFilterConditions._id?.toString()
            ) {
                throw CustomError(ErrorName.ALREADY_EXIST);
            }
        }

        if (input.name) organizationUpdateData.name = input.name;
        if (input.description) organizationUpdateData.description = input.description;
        if (input.email) organizationUpdateData.email = input.email;
        if (input.phone) organizationUpdateData.phone = input.phone;
        if (input.contactName) organizationUpdateData.contactName = input.contactName;
        if (typeof input.isActive === "boolean") organizationUpdateData.isActive = input.isActive;

        if (input.logo) {
            const savedLogo = await UploadHelper.uploadImage({
                data: input.logo,
                folderName: organizationFilterConditions._id,
                fileName: `logo_${organizationFilterConditions._id}_${Date.now()}`,
                uploadType: UploadHelper.uploadType.organizationImage,
            });

            if (savedLogo) organizationUpdateData.logo = savedLogo;
        }

        if (!input._id) {
            organizationUpdateData.UID = await OrganizationHelper.generateOrganizationUID({
                subscriberId,
            });
        }

        const savedOrganization = await Organization.findOneAndUpdate(
            organizationFilterConditions,
            {
                ...organizationFilterConditions,
                ...organizationUpdateData,
                $setOnInsert: {
                    createdBy: userId,
                },
                updatedBy: userId,
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true,
                runValidators: true,
                lean: true,
            }
        );

        if (!savedOrganization) throw CustomError(ErrorName.FAILED);
        OrganizationHelper.sendNotificationOnCRUD({
            subscriber: subscriberId,
            organization: savedOrganization,
            action: input._id ? "UPDATED" : "CREATED",
            createdBy: userInfo,
        });

        LogHelper.logActivity({
            subscriber: subscriberId,
            logType: LogType.ORGANIZATION_LOG,
            operation: input._id ? "UPDATE" : "CREATE",
            ipInfo: context.ipInfo,
            affected: [
                {
                    targetRef: "Organization",
                    target: savedOrganization._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "ORGANIZATION_INFO",
                    infoData: JSON.stringify(input),
                },
            ],
            createdBy: userInfo,
        });

        return savedOrganization;
    },
    deleteOrganization: async ({ id }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.DELETE_ORGANIZATION,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const deletedOrganization = await Organization.findOneAndDelete(
            { _id: id, subscriber: subscriberId },
            { lean: true }
        );

        if (!deletedOrganization) throw CustomError(ErrorName.FAILED);

        OrganizationHelper.sendNotificationOnCRUD({
            subscriber: subscriberId,
            organization: deletedOrganization,
            action: "DELETED",
            createdBy: userInfo,
        });

        LogHelper.logActivity({
            subscriber: subscriberId,
            logType: LogType.ORGANIZATION_LOG,
            operation: "DELETE",
            ipInfo: context.ipInfo,
            affected: [
                {
                    targetRef: "Organization",
                    target: deletedOrganization._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "ORGANIZATION_INFO",
                    infoData: JSON.stringify(deletedOrganization),
                },
            ],
            createdBy: userInfo,
        });

        return deletedOrganization;
    },
};
