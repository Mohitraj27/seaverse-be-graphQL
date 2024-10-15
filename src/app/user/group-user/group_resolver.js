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
                    $match: {
                        members: { $ne: [] }
                    }
                },
                {
                    $limit: limit
                },
                {
                    $skip: skip
                }
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
                    $match: {
                        members: { $ne: [] }
                    }
                },
                {
                    $limit: limit
                },
                {
                    $skip: skip
                }
            ]);

            if (empDesignationGroups || roleGroups) {

                return {
                    status: 'Success',
                    groups: [...empDesignationGroups, ...roleGroups]
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
            ]);

            return {
                status: 'Success',
                groups: allGroups
            };

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

module.exports.mutations = {
    createOrUpdateGroup: async ({ id, input }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId } =
            AuthUser(context);

        const groupFilterConditions = {
            _id: input._id ?? ObjectId(),
            subscriber: subscriberId,
            isDeleted: false
        };

        const groupUpdateData = {};

        if (input.groupName) {
            const existingGroup = await Group.findOne({
                groupName: { $regex: `^${input.groupName}$`, $options: "i" },
                subscriber: subscriberId
            })
                .lean()
                .select("_id");

            if (
                existingGroup &&
                existingGroup?._id?.toString() !==
                groupFilterConditions._id?.toString()
            ) {
                throw CustomError(ErrorName.ALREADY_EXIST);
            }
        }

        if (input.groupName) groupUpdateData.groupName = input.groupName;
        if (input.groupAdmin) groupUpdateData.groupAdmin = input.groupAdmin;
        if (input.description) groupUpdateData.description = input.description;
        if (input.isManager) groupUpdateData.isManager = input.isManager;
        if (input.isCustomGroup !== undefined) groupUpdateData.isCustomGroup = input.isCustomGroup;
        if (input.isAutoSynced !== undefined) groupUpdateData.isAutoSynced = input.isAutoSynced;

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
                member: savedGroupName.groupAdmin,
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
            const updatedGroup = await Group.findById(savedGroupName._id).populate('members groupAdmin').lean();
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

        try {

            const getGroups = await Group.find({ _id: { $in: ids }, subscriber: subscriberId, isManagerDefault: false });

            if (getGroups.length <= 0) {
                throw new CustomError(ErrorName.NOT_FOUND, 'Groups not found');
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
                throw new CustomError(ErrorName.NOT_FOUND, 'Groups not found');
            }

        } catch (error) {
            return {
                success: false,
                message: error.message
            };
        }
    }
};