const { Group, DeletedGroup } = require("./group_model");
const { GroupMember } = require("./group_member_model");
const { ObjectId } = require("../../../tools");
const { CustomError, ErrorName, AuthUser, Role, UploadHelper, DbTransactionHelper } = require("../../../util");
const LogHelper = require("../../logs/log_helper");
const Permission = require("../../user/sub-roles/permission.json");
const LogType = require("../../logs/log_type.json");
const { parseAsync } = require("json2csv");
const { parse } = require("csv-parse/sync");
const { Employee } = require("../employee/employee_model");
const { User } = require("../user_model");
const { Vessel } = require("../../vessle/vessel_model");
const { VesselType } = require("../../vessle/vessel-type/vessel_type_model");
const { UserVessel } = require("../user-vessel-bridge/userVessel_model");
const { Designation } = require("../../designations/designation_model");
const { SubRole } = require("../sub-roles/sub_role_model");
const { getAutoSyncedGroups, getCustomGroups, getAutoSyncUsersOfSingleGroup, getAutoSyncedGroupsOnly, getCustomGroupsOnly } = require("./group_helper");
const error_helper = require("../../../util/error_helper");
const { getCustomGroupUsers, getAutoSyncUsers } = require("../../training-registrations/training_registration_helper");
module.exports.queries = {
    exportGroupToCSV: async ({ groupId }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId } = AuthUser(context);
        const groupInfo = await Group.findOne({
            _id: groupId,
            subscriber: subscriberId,
            isDeleted: false,
        }).lean();
        const groupDetails = await GroupMember.find({
            group: groupId,
            subscriber: subscriberId,
            isDeleted: false,
        })
            .populate("member", "email civilIdOrPassport firstName lastName role")
            .lean();

        if (!groupDetails) {
            throw new CustomError(ErrorName.NOT_FOUND, "Group not found");
        }

        try {
            const fields = [
                { label: "ID", value: "_id" },
                { label: "Email", value: "email" },
                { label: "Civil ID or Passport", value: "civilIdOrPassport" },
                { label: "First Name", value: "firstName" },
                { label: "Last Name", value: "lastName" },
                { label: "Role", value: "role" },
            ];
            const membersData = groupDetails.map(group => group.member).flat();
            const csv = await parseAsync(membersData, { fields });
            const fileName = `${groupInfo.groupName.replace(/\s+/g, "_")}_export.csv`;
            return {
                message: "CSV export successful",
                csvData: csv,
                fileName: fileName,
            };
        } catch (error) {
            throw new CustomError(ErrorName.ERROR_IN_EXPORT_CSV_USER_GROUP);
        }
    },
    getGroups: async ({ pageInput, groupFilter, groupType }, context) => {
        if (!groupType) groupType = "all";

        const { subscriberId } = AuthUser(context);

        const skip = pageInput?.skip ?? 0;
        const limit = pageInput?.limit ?? 50;

        let filterConditions = {
            subscriber: subscriberId,
            isDeleted: { $ne: true },
            groupName: { $ne: null },
        };

        if (groupFilter?.search) {
            const searchRegex = new RegExp(groupFilter.search, "i");
            filterConditions.groupName = {
                $regex: searchRegex,
            };
        }

        let groups = [];
        let totalCount = 0;

        switch (groupType) {
            case "Autosyncedgroups":
                const allAutosyncedGroups = await getAutoSyncedGroupsOnly(subscriberId);

                let filteredAutosyncedGroups = allAutosyncedGroups;
                if (groupFilter?.search) {
                    filteredAutosyncedGroups = allAutosyncedGroups.filter(group =>
                        filterConditions.groupName.$regex.test(group.groupName)
                    );
                }
                const paginatedAutosyncedGroups = filteredAutosyncedGroups.slice(skip, skip + limit);
                groups = paginatedAutosyncedGroups;
                totalCount = filteredAutosyncedGroups.length;
                break;

            case "Customgroups":
                if (groupFilter && !groupFilter.customGroupId) {
                    groupFilter.customGroupId = null;
                }

                const allCustomGroups = await getCustomGroupsOnly(groupFilter?.customGroupId, skip, limit);

                let filteredCustomGroups = allCustomGroups;
                if (groupFilter?.search) {
                    filteredCustomGroups = allCustomGroups.filter(group =>
                        filterConditions.groupName.$regex.test(group.groupName)
                    );
                }

                const paginatedCustomGroups = filteredCustomGroups.slice(skip, skip + limit);
                groups = paginatedCustomGroups;
                totalCount = paginatedCustomGroups.length;
                break;

            default:
                const allAutosynced = await getAutoSyncedGroupsOnly(subscriberId);
                const allCustom = await getCustomGroupsOnly(groupFilter?.customGroupId,skip,limit);

                const allGroups = [...allAutosynced, ...allCustom];

                let filteredGroups = allGroups;
                if (groupFilter?.search) {
                    filteredGroups = allGroups.filter(group =>
                        filterConditions.groupName.$regex.test(group.groupName)
                    );
                }
                const paginatedGroups = filteredGroups.slice(skip, skip + limit);
                groups = paginatedGroups;
                totalCount = paginatedGroups.length;
                break;
        }

        return {
            status: "Success",
            totalCount,
            groups,
        };
    },
    getSingleAutoSyncGroupUsers: async ({ input }, context) => {
        const { subscriberId } = AuthUser(context);
        try {
            const res = await getAutoSyncUsersOfSingleGroup(input);

            if (res) {
                return {
                    groupName: input.groupName,
                    groupType: input.groupType,
                    groupId: input.groupId,
                    members: res
                };
            } else {
                throw CustomError(ErrorName.NOT_FOUND, "Group not found");
            }

        } catch (error) {
            throw Error(error.message);
        }
    },
    getSingleGroup: async ({ groupId }, context) => {

        const { subscriberId } = AuthUser(context);

        try {

            const group = await Group.aggregate([
                { $match: { _id: groupId } },
                {
                    $lookup: {
                        from: 'groupmembers',
                        localField: '_id',
                        foreignField: 'group',
                        as: 'members',
                        pipeline: [
                            { $match: { isDeleted: false } },
                            {
                                $lookup: {
                                    from: 'users',
                                    localField: 'member',
                                    foreignField: '_id',
                                    as: 'memberDetails'
                                }
                            },
                            {
                                $unwind: {
                                    path: '$memberDetails',
                                    preserveNullAndEmptyArrays: true
                                }
                            }
                        ]
                    }
                }
            ]);

            if (!group) {
                throw new CustomError(ErrorName.NOT_FOUND, "Group not found");
            }

            return group[0];

        } catch (error) {
            throw Error(error.message);
        }

    },
    getGroupsOfUser: async ({ userId }, context) => {
        const { isAuthenticated, role, userId: loggedInUserId } = AuthUser(context);

        if (!userId) {
            throw CustomError(ErrorName.USER_ID_REQUIRED);
        }

        const existingUser = await User.findById(userId);

        if (!existingUser) {
            throw CustomError(ErrorName.USER_NOT_FOUND);
        }

        const user = await Employee.findOne({ user: userId });

        if (!user) {
            throw CustomError(ErrorName.USER_NOT_FOUND);
        }

        const designation = await Designation.findById(user.empDesignation);

        if (!designation) {
            throw CustomError(ErrorName.NOT_FOUND);
        }

        const designationName = designation.name;

        const roleName = existingUser.role;

        let regStatusGroup;

        if (existingUser.isRegistered) {
            regStatusGroup = "Registered";
        } else {
            regStatusGroup = "Unregistered";
        }

        const subRoleIds = existingUser.subRoles;

        const subRoles = await SubRole.find({ _id: { $in: subRoleIds } });
        const subRoleNames = subRoles.map(subRole => subRole.name);

        let vesseldetail, vesselName, vesselStatus, vesselTypeName;
        const vessel = await UserVessel.findOne({ user: userId, isActive: true });

        if (vessel !== null) {
            vesseldetail = await Vessel.findById(vessel.vessel);
            vesselName = vesseldetail.name;
            vesselStatus = vessel.vesselStatus;
            const vesselType = await VesselType.findById(vesseldetail.typeOfVessel);
            vesselTypeName = vesselType.name;
        }

        let customGroupNames, customGroup;
        const customGroups = await GroupMember.find({ member: userId, isActive: true });
        ``;
        if (customGroups !== null) {
            customGroup = Group.find({ _id: { $in: customGroups.group } });
            customGroupNames = customGroup.map(group => group.groupName);
        }

        if (existingUser && user && designation) {
            return {
                designation: designationName ?? null,
                role: roleName ?? null,
                vessel: vesselName ?? null,
                vesselStatus: vesselStatus ?? null,
                vesselType: vesselTypeName ?? null,
                subRole: subRoleNames ?? null,
                regStatus: regStatusGroup ?? null,
                customGroups: customGroupNames ?? null,
            };
        }
    },
    getUsersAndAutoSyncedGroups: async ({ search }, context) => {
        const { subscriberId } = AuthUser(context);

        const users = await User.aggregate([
            { $match: { subscriber: subscriberId, isDeleted: false } },
            ...(search
                ? [
                    {
                        $match: { firstName: { $regex: search, $options: 'i' } },
                    },
                ]
                : []),
        ]);

        const autoSyncedGroups = await getAutoSyncedGroups(subscriberId);
        let filteredAutoSyncedGroups = autoSyncedGroups;

        if (search) {
            const regex = new RegExp(search, 'i');
            filteredAutoSyncedGroups = autoSyncedGroups.filter(group =>
                group.groupName && regex.test(group.groupName)
            );
        }

        return {
            users: users,
            autoSyncedGroups: filteredAutoSyncedGroups,
        };

    },
    getAllGroupMembers: async ({ groupKind, groupId, pageInput, autosyncInput, groupFilter }, context) => {
        const { subscriberId } = AuthUser(context);

        const skip = pageInput?.skip ?? 0;
        const limit = pageInput?.limit ?? 50;

        try {
            let members;
            let totalCount;

            if (groupKind === "CUSTOMGROUP") {
                const selectedGroup = await Group.findOne({ _id: groupId }).select('groupType').lean();
                if (!selectedGroup) throw CustomError(ErrorName.NOT_FOUND);
                members = await getCustomGroupUsers([{ groupId: selectedGroup._id, groupType: selectedGroup.groupType }]);
            } else if (groupKind === "MEMBER") {
                const groupData = await Group.aggregate([
                    {
                        $match: { _id: ObjectId(groupId) }
                    },
                    {
                        $lookup: {
                            from: 'groupmembers',
                            localField: '_id',
                            foreignField: 'group',
                            as: 'members',
                            pipeline: [
                                {
                                    $lookup: {
                                        from: 'users',
                                        localField: 'member',
                                        foreignField: '_id',
                                        as: 'memberDetails'
                                    }
                                },
                                {
                                    $unwind: { path: '$memberDetails', preserveNullAndEmptyArrays: true }
                                },
                                {
                                    $project: {
                                        'memberDetails._id': 1,
                                        'memberDetails.firstName': 1,
                                        'memberDetails.lastName': 1,
                                        'memberDetails.email': 1,
                                        'memberDetails.isRegistered': 1
                                    }
                                }
                            ]
                        }
                    },

                    {
                        $unwind: { path: '$members', preserveNullAndEmptyArrays: true }
                    },
                    {
                        $project: {
                            _id: '$members.memberDetails._id',
                            firstName: '$members.memberDetails.firstName',
                            lastName: '$members.memberDetails.lastName',
                            email: '$members.memberDetails.email',
                            isRegistered: '$members.memberDetails.isRegistered'
                        }
                    },
                ]);


                const totalMembers = await GroupMember.countDocuments({ group: groupId, isDeleted: false });
                members = groupData.slice(skip, skip + limit);
                totalCount = totalMembers;

            } else {
                members = await getAutoSyncUsersOfSingleGroup({ groupId: autosyncInput.groupId, groupType: autosyncInput.groupType });
            }

            paginatedMembers = members.slice(skip, skip + limit);
            return {
                status: "Success",
                totalCount: members.length,
                members: paginatedMembers,
            };
        } catch (error) {
            console.error('Error fetching group members:', error);
            throw new Error('Error fetching group members');
        }
    }
};

const bulkInsertGroupMembers = async (subscriberId, groupId, users, session) => {
    try {
        const groupMembers = users.map(user => ({
            subscriber: subscriberId,
            group: groupId,
            member: user._id,
        }));

        const result = await GroupMember.insertMany(groupMembers, {
            ordered: false,
            session
        });
        return result.length;
    } catch (error) {
        console.error(error);
        return 0;
    }
};

const bulkInsertGroups = async (subscriberId, groupId, groupType, groupData, session) => {
    try {
        const operations = groupData.map(data => ({
            updateOne: {
                filter: {
                    subscriber: subscriberId,
                    group: groupId,
                    groupType: groupType,
                    groupData: data.id,
                },
                update: {
                    $set: {
                        subscriber: subscriberId,
                        group: groupId,
                        groupType,
                        groupData: data.id,
                        groupName: data.groupName,
                    },
                },
                upsert: true,
            },
        }));

        const result = await GroupMember.bulkWrite(operations, { session });

        return result.upsertedCount + result.modifiedCount;
    } catch (error) {
        console.error('Error in bulkInsertGroups:', error);
        return 0;
    }
};

module.exports.mutations = {
    createOrUpdateGroup: async ({ id, input }, context) => {

        const { role, userId, userInfo, userPermissions, subscriberId } = AuthUser(context);

        if (!input.groupType) {
            throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Provide all the required fields");
        }

        if (!input.list && !input.members) {
            throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Provide all the required fields");
        }

        const groupFilterConditions = {
            _id: input._id ?? ObjectId(),
            subscriber: subscriberId,
            isDeleted: false,
        };

        const savedGroup = await DbTransactionHelper.performDbTransaction(async session => {

            let existingGroupMembers;
            let existingGroup;

            if (input._id) {
                existingGroup = await Group.findOne({
                    _id: input._id,
                    subscriber: subscriberId,
                })
                    .lean()
                    .select("_id");
            } else if (input.groupName) {
                existingGroup = await Group.findOne({
                    groupName: { $regex: `^${input.groupName}$`, $options: "i" },
                    subscriber: subscriberId,
                })
                    .lean()
                    .select("_id");
            }

            if (existingGroup && existingGroup?._id?.toString() !== groupFilterConditions._id?.toString()) {
                throw CustomError(ErrorName.ALREADY_EXIST, "Group name already exists");
            }

            if (existingGroup && input._id) {
                let existingGroups = await GroupMember.find({ group: input._id }).select("member");
                existingGroupMembers = existingGroups.map(groupMember => groupMember.member) || [];
            }

            const groupUpdateData = {};

            if (input.groupName) groupUpdateData.groupName = input.groupName;
            if (input.groupAdmin) groupUpdateData.groupAdmin = input.groupAdmin;
            if (input.description) groupUpdateData.description = input.description;
            if (input.groupType) groupUpdateData.groupType = input.groupType;
            if (input.members && input.members.length === 0) {
                // groupUpdateData.members = input.members;
                groupUpdateData.memberCount = input.members.length;
            }

            let getDesignationIds = [];
            let roleIds = [];
            let vesselIds = [];
            let vesselTypeIds = [];
            let vesselStatusIds = [];
            let subRoleIds = [];
            let regStatusIds = [];
            let unRegStatusIds = [];

            if (input.groupType === "GROUP") {
                for (let list of input.list) {
                    let typeOfGroup = list.groupType;

                    switch (typeOfGroup) {
                        case "designation":
                            getDesignationIds.push({ id: list.group, groupName: list.groupName });
                            break;
                        case "role":
                            roleIds.push({ id: list.group, groupName: list.groupName });
                            break;
                        case "vessel":
                            vesselIds.push({ id: list.group, groupName: list.groupName });
                            break;
                        case "vesselType":
                            vesselTypeIds.push({ id: list.group, groupName: list.groupName });
                            break;
                        case "vesselStatus":
                            vesselStatusIds.push({ id: list.group, groupName: list.groupName });
                            break;
                        case "subRole":
                            subRoleIds.push({ id: list.group, groupName: list.groupName });
                            break;
                        case "regStatus":
                            regStatusIds.push({ id: list.group, groupName: list.groupName });
                            break;
                        case "unRegStatus":
                            unRegStatusIds.push({ id: list.group, groupName: list.groupName });
                            break;
                        default:
                            console.log(`Unknown group type: ${typeOfGroup}`);
                    }
                }
            }

            const savedGroupName = await Group.findOneAndUpdate(
                groupFilterConditions,
                {
                    ...groupFilterConditions,
                    ...groupUpdateData,
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
                    session,
                }
            );

            if (!savedGroupName) throw CustomError(ErrorName.FAILED);

            if (input.members && input.members.length > 0) {
                const uniqueInputMembers = [...new Set(input.members)];
                const existingMemberIds = existingGroupMembers?.map(member => member.toString());
                const newMembers = uniqueInputMembers.filter(member => !(existingMemberIds?.includes(member.toString())));
                if (newMembers.length > 0) {
                    const memberCount = await bulkInsertGroupMembers(subscriberId, savedGroupName._id, newMembers, session);
                    if (memberCount > 0) {
                        await Group.updateOne(
                            { _id: savedGroupName._id },
                            {
                                $addToSet: {
                                    members: { $each: newMembers },
                                },
                                $inc: {
                                    memberCount: memberCount,
                                },
                                $set: {
                                    updatedAt: new Date(),
                                    updatedBy: subscriberId,
                                },
                            },
                            { session }
                        );
                    }
                }
            }

            if (input.groupType === "GROUP") {
                if (getDesignationIds.length > 0) {
                    await bulkInsertGroups(subscriberId, savedGroupName._id, "designation", getDesignationIds, session);
                }

                if (subRoleIds.length > 0) {
                    await bulkInsertGroups(subscriberId, savedGroupName._id, "subRole", subRoleIds, session);
                }

                if (vesselIds.length > 0) {
                    await bulkInsertGroups(subscriberId, savedGroupName._id, "vessel", vesselIds, session);
                }

                if (vesselTypeIds.length > 0) {
                    await bulkInsertGroups(subscriberId, savedGroupName._id, "vesselType", vesselTypeIds, session);
                }

                if (vesselStatusIds.length > 0) {
                    await bulkInsertGroups(subscriberId, savedGroupName._id, "vesselStatus", vesselStatusIds, session);
                }

                if (roleIds.length > 0) {
                    await bulkInsertGroups(subscriberId, savedGroupName._id, "role", roleIds, session);
                }
            }

            return savedGroupName;
        });

        LogHelper.logActivity({
            subscriber: subscriberId,
            logType: LogType.GROUP_LOG,
            operation: input._id ? "UPDATE" : "CREATE",
            ipInfo: context.ipInfo,
            affected: [
                {
                    targetRef: "Group",
                    target: savedGroup._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "GROUP_INFO",
                    infoData: JSON.stringify(input),
                },
            ],
            createdBy: userInfo,
        });

        return {
            message: input._id ? "Group updated successfully" : "Group created successfully",
            group: {
                ...savedGroup,
                members: input.members,
            },
        };
    },
    deleteGroup: async ({ ids }, context) => {

        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        let failedDeletions = [];

        const getGroups = await Group.find({
            _id: { $in: ids },
            subscriber: subscriberId,
            isManagerDefault: false,
        });

        if (getGroups.length <= 0) {
            throw CustomError(ErrorName.NOT_FOUND, "Groups not found");
        }

        const deletedGroups = getGroups.map(group => {
            const groupObject = group.toObject();
            groupObject.isDeleted = true;
            return new DeletedGroup(groupObject);
        });

        const deleteGroup = await DeletedGroup.insertMany(deletedGroups);

        if (deleteGroup.length > 0) {
            const deleteFromGroups = await Group.deleteMany({
                _id: { $in: ids },
                subscriber: subscriberId,
                isManagerDefault: false,
            });

            if (deleteFromGroups) {
                return {
                    success: true,
                    message: `${deleteGroup.length} group(s) deleted successfully.`,
                    failedDeletions,
                };
            }
        } else {
            throw CustomError(ErrorName.NOT_FOUND, "Groups not found");
        }
    },
};
