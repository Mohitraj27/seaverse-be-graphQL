const { ObjectId } = require("../../../tools");
const { CustomError, ErrorName, AuthUser } = require("../../../util");

const { SubRole } = require("./sub_role_model");

const SubRoleHelper = require("./sub_role_helper");
const LogHelper = require("../../logs/log_helper");

const Permission = require("./permission");
const OrganizationPermission = require("./organization_permission.json");
const LogType = require("../../logs/log_type.json");

module.exports.queries = {
    getSubRoles: async ({ pageInput }, context) => {
        const { subscriberId } = AuthUser(context);

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50;
        let filterConditions = { subscriber: subscriberId };

        const subRoleList = await SubRole.aggregatePaginate(
            SubRole.aggregate([
                {
                    $match: filterConditions,
                },
            ]),
            {
                offset: skip,
                limit,
                sort: { createdAt: "descending" },
                customLabels: {
                    docs: "subRoles",
                    totalDocs: "totalCount",
                    offset: "skip",
                },
                pagination: limit !== 0,
                allowDiskUse: true,
            }
        );

        return {
            assignablePermissions: Object.keys(Permission),
            assignableOrganizationPermissions: Object.keys(OrganizationPermission),
            ...subRoleList,
        };
    },
};

module.exports.mutations = {
    createOrUpdateSubRole: async ({ input }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            input._id &&
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [
                    Permission.UPDATE_SUB_ROLE,
                    Permission.ENABLE_DISABLE_SUB_ROLE,
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
                requiredPermission: Permission.CREATE_SUB_ROLE,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        let subRoleFilterConditions = {
            _id: input._id ?? ObjectId(),
            subscriber: subscriberId,
        };

        const isPredefinedRole = await SubRole.findOne({_id: input._id ?? ObjectId(), subscriber: subscriberId, isPredefined : true})

        const subRoleName = input.name?.toUpperCase();
        if (isPredefinedRole){
            const subRoleName = isPredefinedRole.name;
        }
        if (subRoleName === "TRAINER" || subRoleName === "ORGANIZATION_MANAGER") {
            subRoleFilterConditions = {
                subscriber: subscriberId,
                name: subRoleName,
            };
        }

        const subRoleUpdateData = {};

        if (input.name) subRoleUpdateData.name = input.name;
        if (input.permissions) subRoleUpdateData.permissions = input.permissions;
        if (input.description) subRoleUpdateData.description = input.description;
        if (!isPredefinedRole){
            if (typeof input.isActive === "boolean") subRoleUpdateData.isActive = input.isActive;
        }
        if (input.isDefault) subRoleUpdateData.isDefault = input.isDefault;
        if (input.primaryRole) subRoleUpdateData.primaryRole = input.primaryRole;
        const savedSubRole = await SubRole.findOneAndUpdate(
            subRoleFilterConditions,
            {
                ...subRoleFilterConditions,
                ...subRoleUpdateData,
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

        if (!savedSubRole) throw CustomError(ErrorName.FAILED);

        
        SubRoleHelper.sendNotificationOnCRUD({
            subscriber: subscriberId,
            subRole: savedSubRole,
            action: input._id ? "UPDATED" : "CREATED",
            createdBy: userInfo,
        });

        LogHelper.logActivity({
            subscriber: subscriberId,
            logType: LogType.SUB_ROLE_LOG,
            operation: input._id ? "UPDATE" : "CREATE",
            ipInfo: context.ipInfo,
            affected: [
                {
                    targetRef: "SubRole",
                    target: savedSubRole._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "SUB_ROLE_INFO",
                    infoData: JSON.stringify(input),
                },
            ],
            createdBy: userInfo,
        });
        

        return savedSubRole;
    },
    deleteSubRole: async ({ id }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.DELETE_SUB_ROLE,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const isPredefinedRole = await SubRole.findOne({_id: id, subscriber: subscriberId, isPredefined : true})

        if (isPredefinedRole) {
            throw CustomError(ErrorName.FORBIDDEN, "Predefined roles cannot be deleted.");
        }

        const deletedSubRole = await SubRole.findOneAndDelete(
            {
                _id: id,
                subscriber: subscriberId,
                name: { $nin: ["TRAINER", "ORGANIZATION_MANAGER"] },
            },
            { lean: true }
        );

        if (!deletedSubRole) throw CustomError(ErrorName.FAILED);

        SubRoleHelper.sendNotificationOnCRUD({
            subscriber: subscriberId,
            subRole: deletedSubRole,
            action: "DELETED",
            createdBy: userInfo,
        });

        LogHelper.logActivity({
            subscriber: subscriberId,
            logType: LogType.SUB_ROLE_LOG,
            operation: "DELETE",
            ipInfo: context.ipInfo,
            affected: [
                {
                    targetRef: "SubRole",
                    target: deletedSubRole._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "SUB_ROLE_INFO",
                    infoData: JSON.stringify(deletedSubRole),
                },
            ],
            createdBy: userInfo,
        });

        return deletedSubRole;
    },
};
