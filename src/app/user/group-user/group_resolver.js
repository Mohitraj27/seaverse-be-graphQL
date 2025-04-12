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
const { getCustomGroupUsers, getAutoSyncUsers, fetchUserFromAutoSyncedGroups } = require("../../training-registrations/training_registration_helper");
const NotificationType = require("../../notifications/notification_type.json");
const NotificationHelper = require("../../notifications/notification_helper");
const notificationiconEnum = require("../../notifications/notification_icon.json");
const xlsx = require('xlsx');
const path = require('path');
const Export = require('../exportUser/exportUser_model');
const AwsHelper = require("../../../util/aws_helper");
const { pipeline } = require("stream");
const { formatDate } = require("../../reports/reports_helper");
const { LearningPlan } = require('../../learning-plan/learning_plan_model');
const LearningPlanStatus = require('../../learning-plan/enumFields/learning_plan_status.json')
const targetAudience = require('../../learning-plan/enumFields/targetAudienceEnum.json');
const audienceSelection = require('../../learning-plan/enumFields/audienceSelectionEnum.json');
const typeOfConditionalCustomFieldEnum = require('../../learning-plan/enumFields/typeOfConditionalCustomField.json');
const groupTypes = require('../../../util/group_types.json');
const LearningPlanAssignment = require("../../learning-plan/assignedLearner/assignedLearnerModel");
const { enrollUsers } = require('../employee/employee_helper');
const { filterLearningPlans } = require("../employee/employee_helper");
const { OverallTrainingProgress } = require("../../training-registrations/overall-course-progress/overall_progress_model");
async function checkIfGroupMatchedInPlanConditionalFields(plan, customGroupId) {
    if (!plan?.conditionalCustomFields) return { matchFound: false, learningPlanId: [] };
    for (const field of plan?.conditionalCustomFields) {
        if (field.type_of_Field === typeOfConditionalCustomFieldEnum.GROUP && Array.isArray(field.groupIDs)) {
            for (const group of field.groupIDs) {
                if (group.groupType === groupTypes.custom && group.groupIDs.includes(customGroupId)) {
                    return { matchFound: true, learningPlanId: plan._id };
                }
            }
        }
    }
    return { matchFound: false, learningPlanId: [] };
}
async function checkIfGroupMatchedInPlanAutomaticFields(plan, customGroupId) {
    if (!plan?.groupIDs?.length) { return { matchFound: false, learningPlanId: [] }; }
    const match = plan.groupIDs.find((group) => group?.groupType === groupTypes.custom && Array.isArray(group.groupIDs) &&
        group.groupIDs.includes(customGroupId.toString()));
    return match ? { matchFound: true, learningPlanId: plan._id } : { matchFound: false, learningPlanId: [] };
}
async function autoenrollmentfromCustomGroup(learningPlans, customGroupId, userIdToAutoenroll, context) {

    const filteredPlans = await Promise.allSettled(
        learningPlans.map(async (plan) => {
            const usersToEnroll = [];
            if (plan?.targetAudience === targetAudience.EVERYONE_IN_ORGANIZATION && plan?.audienceSelection === audienceSelection.AUTOMATIC) {
                const { matchFound, learningPlanId } = await checkIfGroupMatchedInPlanConditionalFields(plan, customGroupId);
                if (matchFound) {
                    const userIds = userIdToAutoenroll.map(id => id.toString());
                    await LearningPlanAssignment.deleteMany({
                        learningPlanId: plan?._id,
                    });
                    const newAssignments = userIds.map(userId => ({
                        learningPlanId: plan?._id,
                        assignedLearnerId: userId,
                        isMannuallyAdded: false,
                        createdBy: context?.user?._id,
                        updatedBy: context?.user?._id
                    }));
                    if (newAssignments?.length > 0) {
                        const dataenrolled = await LearningPlanAssignment.insertMany(newAssignments, { ordered: false });
                    }
                    usersToEnroll.push(...userIds);
                }
            }
            if (plan?.targetAudience === targetAudience.GROUP_BASED && plan?.audienceSelection === audienceSelection.ALL_EMPLOYEES) {

                const { matchFound, learningPlanId } = await checkIfGroupMatchedInPlanAutomaticFields(plan, customGroupId);
                if (matchFound) {
                    const userIds = userIdToAutoenroll.map(id => id.toString());
                    await LearningPlanAssignment.deleteMany({
                        learningPlanId: plan?._id,
                    });

                    // 2. Create new assignments
                    const newAssignments = userIdToAutoenroll.map(userId => ({
                        learningPlanId: plan?._id,
                        assignedLearnerId: userId,
                        isMannuallyAdded: false,
                        createdBy: context.user.userId,
                        updatedBy: context.user.userId
                    }));
                    if (newAssignments?.length > 0) {
                        const insertedAssignments = await LearningPlanAssignment.insertMany(newAssignments, { ordered: false });
                    }
                    usersToEnroll.push(...userIdToAutoenroll);
                }
            }

            if (usersToEnroll?.length > 0) {
                const enrollData = {
                    trainings: plan?.selectCourses,
                    users: usersToEnroll,
                    type: "ENROLL",
                    learningPlan: plan?._id,
                };
                const data = await enrollUsers([enrollData]);
                return true;
            }
            return false;
        })
    );
}

module.exports.queries = {
    exportGroupToCSV: async ({ groupKind, groupId, autosyncInput }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId } = AuthUser(context);

        if (!role || role !== "ADMIN") {
            throw CustomError(ErrorName.FORBIDDEN);
        }
        const notifications = [];
        // const exportStartTime = new Date();

        try {
            /* ticket No SEAV-117
            const inProgressNotification = {
                subscriber: subscriberId,
                title: [{ lang: "en", value: `User Group Export In Progress` }],
                message: [
                    {
                        lang: "en",
                        value: `The export user process for selected users started at ${exportStartTime.toLocaleString()} by  ${userInfo?.firstName} ${userInfo?.lastName}.`,
                    },
                ],
                notificationType: NotificationType.EXPORT_IN_PROGRESS,
                notifyAdmin: true,
                notifiers: [],
                employeeNotifiers: [],
                affected:[],
                createdBy: userInfo,
                icon: notificationiconEnum.PROGRESS,
            };
            notifications.push(inProgressNotification);
            */
            // await NotificationHelper.createNotification(notifications);
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
                "Date Added (UTC)": formatDate(user?.createdAt),
                // "Date Deleted": "",
                "Last Login Date (UTC)": formatDate(user?.lastLoginAt),
                "User Status": user?.isRegistered ? "Registered" : "Unregistered",
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
                            value: `"User group Export" file is ready: `,
                        },
                    ],
                    notificationType: NotificationType.EXPORT_SUCCESSFUL,
                    notifyAdmin: true,
                    notifiers: [],
                    employeeNotifiers: [],
                    additionalInfo: [
                        {
                            infoType: "EXPORT_URL",
                            infoData: {
                                filePath: excelFilePath
                            }
                        }
                    ],
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
        try {
            const skip = pageInput?.skip ?? 0;
            const limit = pageInput?.limit ?? 200000;

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
                    let allAutosyncedGroups = await getAutoSyncedGroupsOnly(subscriberId);
                    // console.log('this is new grp',allAutosyncedGroups);
                    allAutosyncedGroups = allAutosyncedGroups.filter(group => group._id && group.groupName);

                    let filteredAutosyncedGroups = allAutosyncedGroups;
                    if (groupFilter?.search) {
                        filteredAutosyncedGroups = allAutosyncedGroups.filter(group =>
                            filterConditions.groupName.$regex.test(group.groupName)
                        );
                    }
                    const paginatedAutosyncedGroups = filteredAutosyncedGroups.slice(skip, skip + limit);
                    groups = paginatedAutosyncedGroups;
                    totalCount = filteredAutosyncedGroups.length || 0; 

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
                    totalCount = paginatedCustomGroups.length || 0;
                    break;

                default:
                    let allAutosynced = await getAutoSyncedGroupsOnly(subscriberId);
                    let allCustom = await getCustomGroupsOnly(groupFilter?.customGroupId, skip, limit);

                    let allGroups = [...allAutosynced, ...allCustom];
                    allGroups = allGroups.filter(group => group._id && group.groupName);

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
        }
        catch (error) {
            throw Error(error.message);
        }
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
        try {
            if (!userId) {
                throw CustomError(ErrorName.USER_ID_REQUIRED);
            }

            const existingUser = await User.findById(userId).populate({
                path: 'currentVessel',
                populate: {
                    path: 'typeOfVessel',
                },
            });

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

            const ownerName = await Vessel.find({ _id: existingUser.currentVessel }).select('ownerName -_id');
            const owner = ownerName[0]?.ownerName || null;
            let regStatusGroup;

            if (existingUser.isRegistered) {
                regStatusGroup = "Registered";
            } else {
                regStatusGroup = "Unregistered";
            }

            const subRoleIds = existingUser.subRoles;

            const subRoles = await SubRole.find({ _id: { $in: subRoleIds } });
            const subRoleNames = subRoles.map(subRole => subRole.name);

            const vesselName = existingUser?.currentVessel?.name;
            const vesselStatus = existingUser?.vesselStatus;
            const vesselType = existingUser?.currentVessel?.typeOfVessel?.name;

            let customGroupNames = null;
            const customGroups = await GroupMember.find({ member: userId, isDeleted: false }).select('group');
            const groupIds = customGroups.map(item => item.group);
            if (groupIds && groupIds.length > 0) {
                const customGroup = await Group.find({ _id: { $in: groupIds } });
                if (customGroup && customGroup.length > 0) {
                    customGroupNames = customGroup.map(group => group.groupName);
                }
            }
            if (existingUser && user && designation) {
                return {
                    designation: designationName ?? null,
                    role: roleName ?? null,
                    vessel: vesselName ?? null,
                    vesselStatus: vesselStatus ?? null,
                    vesselType: vesselType ?? null,
                    subRole: subRoleNames ?? null,
                    regStatus: regStatusGroup ?? null,
                    customGroups: customGroupNames ?? null,
                    owner: owner ?? null
                };
            }
        }
        catch (error) {
            throw new Error(error.message);
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
                const query = { _id: { $in: customGroupMembers.map(member => member._id) } };
                if (groupFilter && groupFilter.isRegistered !== undefined) {
                    query.isRegistered = groupFilter.isRegistered;
                }
                members = await User.find(query)
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
                                        pipeline: [
                                            { $match: { isDeleted: false, isRegistered: groupFilter?.isRegistered } },
                                        ]
                                    }
                                },
                                {
                                    $unwind: { path: '$memberDetails', preserveNullAndEmptyArrays: true }
                                },
                                {
                                    $match: { 'memberDetails.isRegistered': groupFilter?.isRegistered }
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
                        $unwind: { path: '$members', preserveNullAndEmptyArrays: false }
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


                const totalMembers = await GroupMember.countDocuments({ group: groupId, isDeleted: false, });
                members = groupData.slice(skip, skip + limit);
                totalCount = totalMembers;

            } else {
                autoSyncGroupMembers = await getAutoSyncUsersOfSingleGroup({ groupId: autosyncInput?.groupId, groupType: autosyncInput?.groupType });
                const query = { _id: { $in: autoSyncGroupMembers.map(member => member._id) } };
                if (groupFilter && groupFilter.isRegistered !== undefined) {
                    query.isRegistered = groupFilter.isRegistered;
                }
                members = await User.find(query)
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
            throw CustomError(error);
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

        let excludedMembers = [];
        let membersToInsert = [];

        const savedGroup = await DbTransactionHelper.performDbTransaction(async session => {

            let existingGroupMembers = [];
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
                let existingMemberIds = [];
                let newMembers = [];
                if (existingGroupMembers && existingGroupMembers.length > 0) {
                    existingMemberIds = existingGroupMembers?.map(member => member.toString());
                    const inputMembersString = uniqueInputMembers.map(member => member.toString());
                    if (existingMemberIds.length > 0) {
                        excludedMembers = existingMemberIds.filter(member => !inputMembersString?.includes(member.toString()));
                    }
                }
                newMembers = uniqueInputMembers.filter(member => !(existingMemberIds?.includes(member.toString())));
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

            let deletedGroups = [];
            let includeMemberDatas = [];

            if (input.groupType === "GROUP") {

                // If removed any autosynced group in custom group, find the users of that group.
                if (input.deleteMembersOrGroups && input.deleteMembersOrGroups.length > 0) {
                    deletedGroups = await GroupMember.find({ _id: { $in: input.deleteMembersOrGroups } });

                    if (deletedGroups.length > 0) {

                        let groupArray = [];

                        for (const group of deletedGroups) {
                            groupArray = [{ groupType: group?.groupType, groupId: group?.groupData }];
                        }

                        const excludedMemberDatas = await fetchUserFromAutoSyncedGroups(groupArray);

                        excludedMembers = excludedMemberDatas.map(user => user._id);

                    }
                }

                if (getDesignationIds.length > 0) {
                    await bulkInsertGroups(subscriberId, savedGroupName._id, "designation", getDesignationIds, session);
                    for (const designation of getDesignationIds) {
                        const getMembers = await fetchUserFromAutoSyncedGroups([{ groupType: "designation", groupId: designation.id }]);
                        includeMemberDatas.push(...getMembers);
                    }
                }

                if (subRoleIds.length > 0) {
                    await bulkInsertGroups(subscriberId, savedGroupName._id, "subRole", subRoleIds, session);
                    for (const subRole of subRoleIds) {
                        const getMembers = await fetchUserFromAutoSyncedGroups([{ groupType: "subRole", groupId: subRole.id }]);
                        includeMemberDatas.push(...getMembers);
                    }

                }

                if (vesselIds.length > 0) {
                    await bulkInsertGroups(subscriberId, savedGroupName._id, "vessel", vesselIds, session);
                    for (const vessel of vesselIds) {
                        const getMembers = await fetchUserFromAutoSyncedGroups([{ groupType: "vessel", groupId: vessel.id }]);
                        includeMemberDatas.push(...getMembers);
                    }

                }

                if (vesselTypeIds.length > 0) {
                    await bulkInsertGroups(subscriberId, savedGroupName._id, "vesselType", vesselTypeIds, session);
                    for (const vesselType of vesselTypeIds) {
                        const getMembers = await fetchUserFromAutoSyncedGroups([{ groupType: "vesselType", groupId: vesselType.id }]);
                        includeMemberDatas.push(...getMembers);
                    }

                }

                if (vesselStatusIds.length > 0) {
                    await bulkInsertGroups(subscriberId, savedGroupName._id, "vesselStatus", vesselStatusIds, session);
                    for (const vesselStatus of vesselStatusIds) {
                        const getMembers = await fetchUserFromAutoSyncedGroups([{ groupType: "vesselStatus", groupId: vesselStatus.id }]);
                        includeMemberDatas.push(...getMembers);
                    }
                }

                if (roleIds.length > 0) {
                    await bulkInsertGroups(subscriberId, savedGroupName._id, "role", roleIds, session);
                    for (const role of roleIds) {
                        const getMembers = await fetchUserFromAutoSyncedGroups([{ groupType: "role", groupId: role.id }]);
                        includeMemberDatas.push(...getMembers);
                    }
                }

                if (includeMemberDatas.length > 0) {
                    membersToInsert = includeMemberDatas.map(user => user._id);
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

        if (input?._id) {

            const groupIdInString = input?._id.toString();

            const learningPlans = await LearningPlan.find({
                status: LearningPlanStatus.ACTIVE,
                isDeleted: false,
                groupIDs: {
                    $elemMatch: {
                        groupIDs: Array.isArray(groupIdInString) ? { $in: groupIdInString } : groupIdInString
                    }
                },
            });

            if (excludedMembers.length > 0) {

                const removedLearnersID = excludedMembers;

                const removedLearnersIDToObject = removedLearnersID.map(id => ObjectId(id));

                const learningPlanIds = learningPlans.map(learningPlan => learningPlan._id);

                await LearningPlanAssignment.deleteMany({
                    learningPlanId: { $in: learningPlanIds },
                    assignedLearnerId: { $in: removedLearnersIDToObject },
                });

                const updatedOverallTrainingProgress = await OverallTrainingProgress.updateMany(
                    { user: { $in: removedLearnersIDToObject }, learningPlan: { $in: learningPlanIds }, isDeleted: { $ne: true } },
                    {
                        $pull: {
                            learningPlan: { $in: learningPlanIds },
                        }
                    }
                );

            }

            if (input?.groupType === "GROUP" && learningPlans?.length > 0) {
                await autoenrollmentfromCustomGroup(learningPlans, input?._id, membersToInsert, context);
            }
            if (input?.groupType === "MEMBER" && learningPlans?.length > 0) {
                await autoenrollmentfromCustomGroup(learningPlans, input?._id, input?.members, context);
            }
        }

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
