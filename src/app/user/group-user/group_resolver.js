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
const NotificationType = require("../../notifications/notification_type.json");
const NotificationHelper = require("../../notifications/notification_helper");
const notificationiconEnum = require("../../notifications/notification_icon.json");

const xlsx = require('xlsx');
const path = require('path');
const Export = require('../exportUser/exportUser_model');
const AwsHelper = require("../../../util/aws_helper");
const { pipeline } = require("stream");

module.exports.queries = {
    exportGroupToCSV: async ({ groupKind, groupId, autosyncInput }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId } = AuthUser(context);

        if (!role || role !== "ADMIN") {
            throw CustomError(ErrorName.FORBIDDEN);
        }
        const notifications = [];
        const exportStartTime = new Date();

        try {
            const inProgressNotification = {
                subscriber: subscriberId,
                title: [{ lang: "en", value: `User Export In Progress` }],
                message: [
                    {
                        lang: "en",
                        value: `The export user process for selected users started at ${exportStartTime.toLocaleString()}.`,
                    },
                ],
                notificationType: NotificationType.EXPORT_IN_PROGRESS,
                notifyAdmin: true,
                notifiers: [],
                employeeNotifiers: [],
                createdBy: userInfo,
                icon: notificationiconEnum.SUCCESS,
            };
            notifications.push(inProgressNotification);
            await NotificationHelper.createNotification(notifications);
            let memberIds;
            let selectedGroup;
            let userDetails = [];

            if (groupKind === "CUSTOMGROUP") {
                selectedGroup = await Group.findOne({ _id: groupId, isDeleted: false })
                    .select('groupType createdAt')
                    .lean();

                if (!selectedGroup) throw CustomError(ErrorName.NOT_FOUND, "Custom Group not found");

                const customGroupMembers = await getCustomGroupUsers([
                    { groupId: selectedGroup._id, groupType: selectedGroup.groupType }
                ]);

                memberIds = customGroupMembers.map(member => member._id);
            } else {
                autoSyncGroupMembers = await getAutoSyncUsersOfSingleGroup({ groupId: autosyncInput.groupId, groupType: autosyncInput.groupType });
                memberIds = autoSyncGroupMembers.map(member => member._id);
            }

            if (memberIds.length > 0) {
                const users = await User.find({ _id: { $in: memberIds } })
                    .select('firstName lastName email isRegistered isActive lastLoginAt createdAt')
                    .lean();

                const employeeData = await Employee.find({ user: { $in: memberIds } })
                    .select('user empDesignation')
                    .populate({
                        path: 'empDesignation',
                        select: 'name',
                    })
                    .lean();

                const employeeMap = employeeData.reduce((map, emp) => {
                    map[emp.user.toString()] = emp.empDesignation ? emp.empDesignation.name : null;
                    return map;
                }, {});

                const userVesselData = await UserVessel.find({ user: { $in: memberIds }, isActive: true })
                    .select('user vessel')
                    .populate({
                        path: 'vessel',
                        select: 'typeOfVessel',
                        populate: {
                            path: 'typeOfVessel',
                            select: 'name',
                        },
                    })
                    .lean();

                const vesselTypeMap = userVesselData.reduce((map, uv) => {
                    map[uv.user.toString()] = uv.vessel?.typeOfVessel?.name || null;
                    return map;
                }, {});

                userDetails = users.map(user => ({
                    ...user,
                    designation: employeeMap[user._id.toString()] || null,
                    vesselType: vesselTypeMap[user._id.toString()] || null,
                    createdAt: groupKind === "CUSTOMGROUP" ? selectedGroup?.createdAt : user?.createdAt,
                }));
            }

            const data = userDetails.map(user => ({
                "First Name": user?.firstName,
                "Last Name": user?.lastName,
                "Email": user?.email,
                "Date Added": user?.createdAt,
                "Date Deleted": "",
                "Last Login Date": user?.lastLoginAt,
                "User State": user?.isRegistered ? "Registered" : "Unregistered",
                "Designation": user?.designation,
                "Type Of Vessel": user?.vesselType,
            }));

            const workbook = xlsx.utils.book_new();
            const worksheet = xlsx.utils.json_to_sheet(data);
            xlsx.utils.book_append_sheet(workbook, worksheet, "Group_Users");
            const excelBuffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
            const excelFilePath = await UploadHelper.uploadExcel({
                data: excelBuffer,
                folderName: "exports",
                fileName: `exported_group_users_${Date.now()}.xlsx`,
                uploadType: UploadHelper.uploadType.exportExcel,
            });
            if (excelFilePath) {
                const s3PresignedUrl = await AwsHelper.fetchFile(excelFilePath);
                const exportEntry = new Export({
                    filePath: s3PresignedUrl,
                    subscriberId: subscriberId,
                    createdBy: userId,
                    updatedBy: userId,
                    type_of_export: 'USER_GROUP_EXPORT'
                });
                await exportEntry.save();
                const successNotification = {
                    subscriber: subscriberId,
                    title: [{ lang: "en", value: `User Group Exported Successfully` }],
                    message: [
                        {
                            lang: "en",
                            value: `The export user process completed successfully. You can download the file from the link: ${s3PresignedUrl}.`,
                        },
                    ],
                    notificationType: NotificationType.EXPORT_SUCCESSFUL,
                    notifyAdmin: true,
                    notifiers: [],
                    employeeNotifiers: [],
                    affected: [{ targetRef: "Export", target: exportEntry._id }],
                    icon: notificationiconEnum.SUCCESS,
                    createdBy: userInfo,
                };
                notifications.push(successNotification);
                await NotificationHelper.createNotification([successNotification]);
                return {
                    status: true,
                    message: "User Group Exported successfully",
                    filePath: s3PresignedUrl,
                    fileName: path.basename(excelFilePath)
                };
            } else {
                throw CustomError(ErrorName.UPLOAD_FAILED);
            }
        } catch (error) {
            throw Error(error.message);
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

                const paginatedCustomGroups = filteredCustomGroups;
                groups = paginatedCustomGroups;
                totalCount = paginatedCustomGroups.length;
                break;

            default:
                const allAutosynced = await getAutoSyncedGroupsOnly(subscriberId);
                const allCustom = await getCustomGroupsOnly(groupFilter?.customGroupId, skip, limit);

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
                            { $match: { isDeleted: { $ne: true } } },
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

        let customGroupNames = null;
        const  customGroups = await GroupMember.find({ member: userId, isDeleted: false }).select('group');
        const groupIds = customGroups.map(item => item.group);
        if(groupIds && groupIds.length > 0){
            const customGroup = await Group.find({ _id: { $in: groupIds } });
            if(customGroup && customGroup.length > 0){
                customGroupNames = customGroup.map(group => group.groupName);
            }
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

        const { subscriberId, role } = AuthUser(context);

        if (role && role === Role.LEARNER) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const users = await User.aggregate([
            { $match: { isRegistered: true, isDeleted: false } },
            ...(search
                ? [
                    {
                        $match: {
                            $or: [
                                { firstName: { $regex: search, $options: 'i' } },
                                { lastName: { $regex: search, $options: 'i' } },
                            ],
                        },
                    },
                ]
                : []),
        ]);

        const autoSyncedGroups = await getAutoSyncedGroupsOnly(subscriberId);
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
                customGroupMembers = await getCustomGroupUsers([{ groupId: selectedGroup._id, groupType: selectedGroup.groupType }]);

                members = await User.find({ _id: { $in: customGroupMembers.map(member => member._id) } })
                    .select('_id firstName lastName email isRegistered')
                    .lean();

                totalCount = members.length;
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
                                    $match: { isDeleted: { $ne: true } }
                                },
                                {
                                    $lookup: {
                                        from: 'users',
                                        localField: 'member',
                                        foreignField: '_id',
                                        as: 'memberDetails',
                                        pipeline: [{ $match: { isDeleted: false } }]
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
                autoSyncGroupMembers = await getAutoSyncUsersOfSingleGroup({ groupId: autosyncInput.groupId, groupType: autosyncInput.groupType });
                members = await User.find({ _id: { $in: autoSyncGroupMembers.map(member => member._id) } })
                    .select('_id firstName lastName email isRegistered')
                    .lean();

                totalCount = members.length;
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
    },

    getGroupNames: async ({ groupId }, context) => {
        const { subscriberId } = AuthUser(context);

        if (!groupId) {
            throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Group Id is required");
        }

        const groupData = await GroupMember.find({ group: groupId, subscriber: subscriberId, isDeleted: { $ne: true } });

        return {
            status: true,
            groups: groupData,
        };
    },
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
                        isDeleted: false,
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
                let existingGroups = await GroupMember.find({ group: input._id, isDeleted: { $ne: true } }).select("member");
                existingGroupMembers = existingGroups.map(groupMember => groupMember.member) || [];
            }

            const groupUpdateData = {};

            if (input.groupName) groupUpdateData.groupName = input.groupName;
            if (input.groupAdmin) groupUpdateData.groupAdmin = input.groupAdmin;
            if (input.description) groupUpdateData.description = input.description;
            if (input.groupType) groupUpdateData.groupType = input.groupType;
            if (input.members && input.members.length === 0) {
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

        if (input.deleteMembersOrGroups && input.deleteMembersOrGroups.length > 0) {
            if (input.groupType === "GROUP") {
                await GroupMember.updateMany(
                    {
                        _id: { $in: input.deleteMembersOrGroups },
                        group: savedGroup._id
                    },
                    {
                        $set: {
                            isDeleted: true,
                        },
                    }
                );
            }

            if (input.groupType === "MEMBER") {
                await GroupMember.updateMany(
                    {
                        group: savedGroup._id,
                        member: { $in: input.deleteMembersOrGroups },
                    },
                    {
                        $set: {
                            isDeleted: true,
                        },
                    }
                );
                await Group.updateOne(
                    { _id: savedGroup._id },
                    {
                        $pull: {
                            members: { $in: input.deleteMembersOrGroups },
                        },
                        $inc: {
                            memberCount: -input.deleteMembersOrGroups.length,
                        },
                    }
                );
            }
        }

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
