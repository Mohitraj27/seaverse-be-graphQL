const { ObjectId } = require("../../tools");
const { CustomError, ErrorName, AuthUser, Role } = require("../../util");

const { Branch } = require("./branch_model");

const SubRoleHelper = require("../user/sub-roles/sub_role_helper");
const LogHelper = require("../logs/log_helper");

const Permission = require("../user/sub-roles/permission.json");
const LogType = require("../logs/log_type.json");

module.exports.queries = {
    getBranches: async ({ pageInput, filterInput }, context) => {
        const { subscriberId } = AuthUser(context);

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50;
        let filterConditions = { subscriber: subscriberId, isDeleted: { $ne: true } };

        if (context.platform !== Role.ADMIN) filterConditions.isActive = true;

        if (filterInput?.search) {
            // TODO: testing some optimization on search?
            filterConditions = {
                ...filterConditions,
                $and: [
                    {
                        $text: {
                            $search: filterInput.search,
                        },
                    },
                    {
                        "name.value": {
                            $regex: ".*" + filterInput.search + ".*",
                            $options: "i",
                        },
                    },
                ],
            };
        }

        return Branch.aggregatePaginate(
            Branch.aggregate([
                {
                    $match: filterConditions,
                },
            ]),
            {
                offset: skip,
                limit,
                sort: { createdAt: "descending" },
                customLabels: {
                    docs: "branches",
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
    createOrUpdateBranch: async ({ input }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            input._id &&
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [Permission.UPDATE_BRANCH, Permission.ENABLE_DISABLE_BRANCH],
                requiredAll: false,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        } else if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.CREATE_BRANCH,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const branchFilterConditions = {
            _id: input._id ?? ObjectId(),
            subscriber: subscriberId,
        };

        const branchUpdateData = {};

        if (input.name) branchUpdateData.name = input.name;
        if (typeof input.isActive === "boolean") branchUpdateData.isActive = input.isActive;

        const savedBranch = await Branch.findOneAndUpdate(
            branchFilterConditions,
            {
                ...branchFilterConditions,
                ...branchUpdateData,
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

        if (!savedBranch) throw CustomError(ErrorName.FAILED);

        //region notification & logging
        LogHelper.logActivity({
            subscriber: subscriberId,
            logType: LogType.BRANCH_LOG,
            operation: input._id ? "UPDATE" : "CREATE",
            ipInfo: context.ipInfo,
            affected: [
                {
                    targetRef: "Branch",
                    target: savedBranch._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "BRANCH_INFO",
                    infoData: JSON.stringify(input),
                },
            ],
            createdBy: userInfo,
        });
        //endregion

        return savedBranch;
    },
    deleteBranch: async ({ id }, context) => {
        const { role, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.DELETE_BRANCH,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const deletedBranch = await Branch.findOneAndDelete(
            { _id: id, subscriber: subscriberId },
            { lean: true }
        );

        // TODO: soft delete or not
        // const deletedBranch = await Branch.findOneAndUpdate(
        //     { _id: id, subscriber: subscriberId },
        //     { isDeleted: true },
        //     { upsert: true, new: true, lean: true }
        // );

        if (!deletedBranch) throw CustomError(ErrorName.FAILED);

        //region notification & logging
        LogHelper.logActivity({
            subscriber: subscriberId,
            logType: LogType.BRANCH_LOG,
            operation: "DELETE",
            ipInfo: context.ipInfo,
            affected: [
                {
                    targetRef: "Branch",
                    target: deletedBranch._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "BRANCH_INFO",
                    infoData: JSON.stringify(deletedBranch),
                },
            ],
            createdBy: userInfo,
        });
        //endregion

        return deletedBranch;
    },
};
