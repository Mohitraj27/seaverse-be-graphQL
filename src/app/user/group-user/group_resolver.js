const { Group, DeletedGroup } = require("./group_model");
const { GroupMember } = require("./group_member_model");
const { ObjectId } = require("../../../tools");
const { CustomError, ErrorName, AuthUser, Role, UploadHelper } = require("../../../util");
const LogHelper = require("../../logs/log_helper");
const Permission = require("../../user/sub-roles/permission.json");
const LogType = require("../../logs/log_type.json");
const { parseAsync } = require('json2csv');
const { parse } = require('csv-parse/sync');
const { Employee } = require("../employee/employee_model");
const { User } = require("../user_model");
const { Vessel } = require("../../vessle/vessel_model");
const { VesselType } = require("../../vessle/vessel-type/vessel_type_model");
const { UserVessel } = require("../user-vessel-bridge/userVessel_model");
const { Designation } = require("../../designations/designation_model");
const { SubRole } = require("../sub-roles/sub_role_model");
module.exports.queries = {
    exportGroupToCSV: async ({ groupId }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId } = AuthUser(context);
        const groupInfo = await Group.findOne({ _id: groupId, subscriber: subscriberId, isDeleted: false }).lean();
        const groupDetails = await GroupMember.find({
            group: groupId,
            subscriber: subscriberId,
            isDeleted: false,
        }).populate('member', 'email civilIdOrPassport firstName lastName role').lean();

        if (!groupDetails) {
            throw new CustomError(ErrorName.NOT_FOUND, 'Group not found');
        }

        try {
            const fields = [
                { label: 'ID', value: '_id' },
                { label: 'Email', value: 'email' },
                { label: 'Civil ID or Passport', value: 'civilIdOrPassport' },
                { label: 'First Name', value: 'firstName' },
                { label: 'Last Name', value: 'lastName' },
                { label: 'Role', value: 'role' }
            ];
            const membersData = groupDetails.map(group => group.member).flat();
            const csv = await parseAsync(membersData, { fields });
            const fileName = `${groupInfo.groupName.replace(/\s+/g, '_')}_export.csv`;
            return {
                message: 'CSV export successful',
                csvData: csv,
                fileName: fileName
            };
        } catch (error) {
            throw new CustomError(ErrorName.ERROR_IN_EXPORT_CSV_USER_GROUP);
        }
    },
    getGroups: async ({ pageInput, groupFilter, groupType }, context) => {

        if (!groupType || groupType === '') return CustomError(ErrorName.GROUP_TYPE_NOT_FOUND);

        const { subscriberId } = AuthUser(context);

        const skip = pageInput?.skip ?? 0;
        const limit = pageInput?.limit ?? 50;

        let filterConditions = {
            subscriber: subscriberId,
            isDeleted: { $ne: true },
            groupName: { $ne: null }
        };

        if (groupFilter?.search) {
            filterConditions = {
                ...filterConditions,
                groupName: {
                    $regex: ".*" + groupFilter.search + ".*",
                    $options: "i",
                },
            };
        }

        if (groupType === 'Autosyncedgroups') {

            const empDesignationGroups = await Employee.aggregate([
                {
                    $match: {
                        subscriber: subscriberId,
                        isDeleted: { $ne: true },
                        empDesignation: { $ne: null }
                    }
                },
                {
                    $lookup: {
                        from: 'designations',
                        localField: 'empDesignation',
                        foreignField: '_id',
                        as: 'designationDetails'
                    }
                },
                {
                    $unwind: '$designationDetails'
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'user',
                        foreignField: '_id',
                        as: 'userDetails'
                    }
                },
                {
                    $unwind: '$userDetails'
                },
                {
                    $match: {
                        'userDetails.firstName': { $ne: null },
                        'userDetails.email': { $ne: null }
                    }
                },
                {
                    $group: {
                        _id: '$empDesignation',
                        groupName: { $first: '$designationDetails.name' },
                        members: {
                            $push: {
                                _id: '$userDetails._id',
                                firstName: '$userDetails.firstName',
                                lastName: '$userDetails.lastName',
                                email: '$userDetails.email'
                            }
                        }
                    }
                },
                {
                    $addFields: {
                        memberCount: { $size: '$members' },
                        typeOfGroup: 'designation',
                        description: {
                            $concat: [
                                "All the members in ",
                                "$groupName",
                                " group which is based on designation."
                            ]
                        }
                    }
                },
                {
                    $match: {
                        members: { $ne: [] }
                    }
                },
            ]);

            const roleGroups = await User.aggregate([
                {
                    $match: {
                        subscriber: subscriberId,
                        isDeleted: { $ne: true },
                        role: { $ne: null },
                        firstName: { $ne: null },
                        email: { $ne: null }
                    }
                },
                {
                    $group: {
                        _id: '$role',
                        groupName: { $first: '$role' },
                        members: {
                            $push: {
                                _id: '$_id',
                                firstName: '$firstName',
                                lastName: '$lastName',
                                email: '$email'
                            }
                        }
                    }
                },
                {
                    $addFields: {
                        memberCount: { $size: '$members' },
                        typeOfGroup: 'role',
                        description: {
                            $concat: [
                                "All the members in ",
                                "$groupName",
                                " group which is based on role."
                            ]
                        }
                    }
                },
                {
                    $match: {
                        members: { $ne: [] }
                    }
                },
            ]);

            const registeredUserGroups = await User.aggregate([
                {
                    $match: {
                        subscriber: subscriberId,
                        isDeleted: { $ne: true },
                        isRegistered: true,
                        firstName: { $ne: null },
                        email: { $ne: null }
                    }
                },
                {
                    $group: {
                        _id: 'Registered Users',
                        groupName: { $first: 'Registered Users' },
                        members: {
                            $push: {
                                _id: '$_id',
                                firstName: '$firstName',
                                lastName: '$lastName',
                                email: '$email'
                            }
                        }
                    }
                },
                {
                    $addFields: {
                        memberCount: { $size: '$members' },
                        typeOfGroup: 'regStatus',
                        description: {
                            $concat: [
                                "All Registered users."
                            ]
                        }
                    }
                },
                {
                    $match: {
                        members: { $ne: [] }
                    }
                }
            ]);

            const unregisteredUserGroups = await User.aggregate([
                {
                    $match: {
                        subscriber: subscriberId,
                        isDeleted: { $ne: true },
                        isRegistered: false,
                        firstName: { $ne: null },
                        email: { $ne: null }
                    }
                },
                {
                    $group: {
                        _id: 'Unregistered Users',
                        groupName: { $first: 'Unregistered Users' },
                        members: {
                            $push: {
                                _id: '$_id',
                                firstName: '$firstName',
                                lastName: '$lastName',
                                email: '$email'
                            }
                        }
                    }
                },
                {
                    $addFields: {
                        memberCount: { $size: '$members' },
                        typeOfGroup: 'unRegStatus',
                        description: {
                            $concat: [
                                "All Unregistered users."
                            ]
                        }
                    }
                },
                {
                    $match: {
                        members: { $ne: [] }
                    }
                }
            ]);

            const subRoleGroups = await User.aggregate([
                {
                    $match: {
                        subscriber: subscriberId,
                        isDeleted: { $ne: true },
                        subRoles: { $ne: [] },
                        firstName: { $ne: null },
                        email: { $ne: null }
                    }
                },
                {
                    $unwind: '$subRoles'
                },
                {
                    $lookup: {
                        from: 'subroles',
                        localField: 'subRoles',
                        foreignField: '_id',
                        as: 'subRoleDetails'
                    }
                },
                {
                    $unwind: '$subRoleDetails'
                },
                {
                    $group: {
                        _id: '$subRoles',
                        groupName: { $first: '$subRoleDetails.name' },
                        members: {
                            $push: {
                                _id: '$_id',
                                firstName: '$firstName',
                                lastName: '$lastName',
                                email: '$email'
                            }
                        }
                    }
                },
                {
                    $addFields: {
                        memberCount: { $size: '$members' },
                        typeOfGroup: 'subRole',
                        description: {
                            $concat: [
                                "All the members in ",
                                "$groupName",
                                " group which is based on sub role."
                            ]
                        }
                    }
                },
                {
                    $match: {
                        members: { $ne: [] }
                    }
                },
            ]);

            const vesselGroups = await UserVessel.aggregate([
                {
                    $match: {
                        isActive: true
                    }
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'user',
                        foreignField: '_id',
                        as: 'userDetails'
                    }
                },
                {
                    $unwind: '$userDetails'
                },
                {
                    $lookup: {
                        from: 'vessels',
                        localField: 'vessel',
                        foreignField: '_id',
                        as: 'vesselDetails'
                    }
                },
                {
                    $unwind: '$vesselDetails'
                },
                {
                    $group: {
                        _id: '$vessel',
                        groupName: { $first: '$vesselDetails.name' },
                        members: {
                            $push: {
                                _id: '$userDetails._id',
                                firstName: '$userDetails.firstName',
                                lastName: '$userDetails.lastName',
                                email: '$userDetails.email',
                                vesselStatus: '$vesselStatus'
                            }
                        }
                    }
                },
                {
                    $addFields: {
                        memberCount: { $size: '$members' },
                        groupType: 'vessel',
                        description: {
                            $concat: [
                                "All the members in ",
                                "$groupName",
                                " group which is based on vessel."
                            ]
                        }
                    }
                },
                {
                    $match: {
                        members: { $ne: [] }
                    }
                },
            ]);

            const vesselStatusGroups = await UserVessel.aggregate([
                {
                    $match: {
                        isActive: true,
                    }
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'user',
                        foreignField: '_id',
                        as: 'userDetails'
                    }
                },
                {
                    $unwind: '$userDetails'
                },
                {
                    $group: {
                        _id: '$vesselStatus',
                        groupName: { $first: '$vesselStatus' },
                        members: {
                            $push: {
                                _id: '$userDetails._id',
                                firstName: '$userDetails.firstName',
                                lastName: '$userDetails.lastName',
                                email: '$userDetails.email'
                            }
                        }
                    }
                },
                {
                    $addFields: {
                        memberCount: { $size: '$members' },
                        typeOfGroup: 'vesselStatus',
                        description: {
                            $concat: [
                                "All the members in ",
                                '$groupName',
                                " group based on vessel status."
                            ]
                        }
                    }
                },
                {
                    $match: {
                        members: { $ne: [] }
                    }
                }
            ]);

            const vesselTypeGroups = await UserVessel.aggregate([
                {
                    $match: {
                        isActive: true,
                    }
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'user',
                        foreignField: '_id',
                        as: 'userDetails'
                    }
                },
                {
                    $unwind: '$userDetails'
                },
                {
                    $lookup: {
                        from: 'vessels',
                        localField: 'vessel',
                        foreignField: '_id',
                        as: 'vesselDetails',

                    }
                },
                {
                    $unwind: '$vesselDetails'
                },
                {
                    $lookup: {
                        from: 'vesseltypes',
                        localField: 'vesselDetails.typeOfVessel',
                        foreignField: '_id',
                        as: 'vesselTypeDetails'
                    }
                },
                {
                    $unwind: '$vesselTypeDetails'
                },
                {
                    $group: {
                        _id: '$vesselDetails.typeOfVessel',
                        groupName: { $first: '$vesselTypeDetails.name' },
                        members: {
                            $push: {
                                _id: '$userDetails._id',
                                firstName: '$userDetails.firstName',
                                lastName: '$userDetails.lastName',
                                email: '$userDetails.email'
                            }
                        }
                    }
                },
                {
                    $addFields: {
                        memberCount: { $size: '$members' },
                        typeOfGroup: 'vesselType',
                        description: {
                            $concat: [
                                "All the ",
                                "$groupName",
                                " members based on vessel type."
                            ]
                        }
                    }
                },
                {
                    $match: {
                        members: { $ne: [] }
                    }
                }
            ]);


            if (
                empDesignationGroups ||
                roleGroups ||
                vesselGroups ||
                subRoleGroups ||
                registeredUserGroups ||
                unregisteredUserGroups ||
                vesselStatusGroups ||
                vesselTypeGroups
            ) {
                const allGroups = [
                    ...empDesignationGroups,
                    ...roleGroups,
                    ...subRoleGroups,
                    ...vesselGroups,
                    ...registeredUserGroups,
                    ...unregisteredUserGroups,
                    ...vesselStatusGroups,
                    ...vesselTypeGroups
                ];

                const paginatedGroups = allGroups.slice(skip, skip + limit);

                return {
                    status: 'Success',
                    totalCount: paginatedGroups.length,
                    groups: paginatedGroups
                }

            }

        }

        if (groupType === "Customgroups") {

            const allGroups = await Group.aggregate([
                {
                    $match: filterConditions
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'members',
                        foreignField: '_id',
                        as: 'members'
                    }
                },
                {
                    $project: {
                        members: {
                            $filter: {
                                input: '$members',
                                as: 'member',
                                cond: {
                                    $and: [
                                        { $ne: ['$$member.firstName', null] },
                                        { $ne: ['$$member.email', null] }
                                    ]
                                }
                            }
                        },
                        groupName: 1,
                        createdAt: 1,
                    }
                },
                {
                    $sort: { createdAt: -1 }
                }
            ]).skip(skip).limit(limit).exec();

            return {
                status: 'Success',
                totalCount: allGroups.length,
                groups: allGroups
            };

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
            regStatusGroup = 'Registered';
        } else {
            regStatusGroup = 'Unregistered';
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
        const customGroups = await GroupMember.find({ member: userId, isActive: true }); ``
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
                customGroups: customGroupNames ?? null
            }
        }

    }
};

const bulkInsertGroupMembers = async (subscriberId, groupId, users) => {
    try {

        const groupMembers = users.map(user => ({
            subscriber: subscriberId,
            group: groupId,
            member: user._id,
        }));

        const result = await GroupMember.insertMany(groupMembers, { ordered: false });
        return result.length;

    } catch (error) {
        console.error(error)
        return 0;
    }
};

const bulkInsertGroups = async (subscriberId, groupId, groupType, groupData) => {
    try {

        const group = groupData.map(data => ({
            subscriber: subscriberId,
            group: groupId,
            groupType,
            groupData: data
        }));

        const result = await GroupMember.insertMany(group, { ordered: false });
        return result.length;

    } catch (error) {
        console.error(error)
        return 0;
    }
};

module.exports.mutations = {
    createOrUpdateGroup: async ({ id, input }, context) => {

        const { role, userId, userInfo, userPermissions, subscriberId } = AuthUser(context);

        if (!input.groupType) {
            throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Provide all the required fields");
        }
        
        if(!input.description) {
            throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Provide all the required fields");
        }

        if (!input.list && !input.members) {
            throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Provide all the required fields");
        }

        if (!input.groupName) {
            throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Provide all the required fields");
        }

        const groupFilterConditions = {
            _id: input._id ?? ObjectId(),
            subscriber: subscriberId,
            isDeleted: false
        };

        const existingGroup = await Group.findOne({
            groupName: { $regex: `^${input.groupName}$`, $options: "i" },
            subscriber: subscriberId
        }).lean().select("_id");

        if (
            existingGroup &&
            existingGroup?._id?.toString() !==
            groupFilterConditions._id?.toString()
        ) {
            throw CustomError(ErrorName.ALREADY_EXIST, "Group name already exist");
        }

        const groupUpdateData = {};

        if (input.groupName) groupUpdateData.groupName = input.groupName;
        if (input.groupAdmin) groupUpdateData.groupAdmin = input.groupAdmin;
        if (input.description) groupUpdateData.description = input.description;
        if (input.groupType) groupUpdateData.groupType = input.groupType;

        let getDesignationIds = [];
        let roleIds = [];
        let vesselIds = [];
        let vesselTypeIds = [];
        let vesselStatusIds = [];
        let subRoleIds = [];
        let regStatusIds = [];
        let unRegStatusIds = [];

        if (input.groupType === "GROUP") {

            for (list of input.list) {

                let typeOfGroup = list.groupType;

                switch (typeOfGroup) {
                    case "designation":
                        getDesignationIds.push(list.group);
                        break;
                    case "role":
                        roleIds.push(list.group);
                        break;
                    case "vessel":
                        vesselIds.push(list.group);
                        break;
                    case "vesselType":
                        vesselTypeIds.push(list.group);
                        break;
                    case "vesselStatus":
                        vesselStatusIds.push(list.group);
                        break;
                    case "subRole":
                        subRoleIds.push(list.group);
                        break;
                    case "regStatus":
                        regStatusIds.push(list.group);
                        break;
                    case "unRegStatus":
                        unRegStatusIds.push(list.group);
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
            }
        );

        if (savedGroupName) {

            const groupMemberFilterConditions = {
                group: savedGroupName._id,
                isDeleted: false
            };

            const groupMemberData = { group: savedGroupName._id, member: savedGroupName.groupAdmin };

            const savedGroupMember = await GroupMember.findOneAndUpdate(
                groupMemberFilterConditions,
                {
                    ...groupMemberFilterConditions,
                    ...groupMemberData,
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

            if (savedGroupName && input.members) {
                const memberCount = await bulkInsertGroupMembers(subscriberId, savedGroupName._id, input.members)
                await Group.updateOne(
                    { _id: savedGroupName._id },
                    {
                        $set: {
                            members: input.members,
                            memberCount: memberCount
                        }
                    }
                );
                savedGroupName.members = input.members;
            }

            if (savedGroupName && input.groupType === "GROUP") {

                if (getDesignationIds.length > 0) {
                    await bulkInsertGroups(subscriberId, savedGroupName._id, 'designation', getDesignationIds)
                }

                if (regStatusIds.length > 0) {
                    await bulkInsertGroups(subscriberId, savedGroupName._id, 'registered', regStatusIds)
                }

                if (unRegStatusIds.length > 0) {
                    await bulkInsertGroups(subscriberId, savedGroupName._id, 'unregistered', unRegStatusIds)
                }

                if (subRoleIds.length > 0) {
                    await bulkInsertGroups(subscriberId, savedGroupName._id, 'subRole', subRoleIds)
                }

                if (vesselIds.length > 0) {
                    await bulkInsertGroups(subscriberId, savedGroupName._id, 'vessel', vesselIds)
                }

                if (vesselTypeIds.length > 0) {
                    await bulkInsertGroups(subscriberId, savedGroupName._id, 'vesselType', vesselTypeIds)
                }

                if (vesselStatusIds.length > 0) {
                    await bulkInsertGroups(subscriberId, savedGroupName._id, 'vesselStatus', vesselStatusIds)
                }

                if (roleIds.length > 0) {
                    await bulkInsertGroups(subscriberId, savedGroupName._id, 'role', roleIds)
                }

            }

            const updatedGroup = await Group.findById(savedGroupName._id);

            return {
                message: input._id ? "Group updated successfully" : "Group created successfully",
                group: {
                    ...updatedGroup,
                },
            };

        }

        LogHelper.logActivity({
            subscriber: subscriberId,
            logType: LogType.GROUP_LOG,
            operation: input._id ? "UPDATE" : "CREATE",
            ipInfo: context.ipInfo,
            affected: [
                {
                    targetRef: "Group",
                    target: savedGroupName._id,
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
                ...updatedGroup,
                members: input.members
            },
        };
    },
    deleteGroup: async ({ ids }, context) => {

        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        let failedDeletions = [];

        const getGroups = await Group.find({ _id: { $in: ids }, subscriber: subscriberId, isManagerDefault: false });

        if (getGroups.length <= 0) {
            throw CustomError(ErrorName.NOT_FOUND, 'Groups not found');
        }

        const deletedGroups = getGroups.map(group => {
            const groupObject = group.toObject();
            groupObject.isDeleted = true;
            return new DeletedGroup(groupObject);
        });

        const deleteGroup = await DeletedGroup.insertMany(deletedGroups);

        if (deleteGroup.length > 0) {

            const deleteFromGroups = await Group.deleteMany({ _id: { $in: ids }, subscriber: subscriberId, isManagerDefault: false });

            if (deleteFromGroups) {

                return {
                    success: true,
                    message: `${deleteGroup.length} group(s) deleted successfully.`,
                    failedDeletions,
                };

            }

        } else {
            throw CustomError(ErrorName.NOT_FOUND, 'Groups not found');
        }
    }
};