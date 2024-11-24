const { Employee } = require("../employee/employee_model");
const { User } = require("../user_model");
const { Vessel } = require("../../vessle/vessel_model");
const { VesselType } = require("../../vessle/vessel-type/vessel_type_model");
const { UserVessel } = require("../user-vessel-bridge/userVessel_model");
const { Designation } = require("../../designations/designation_model");
const { SubRole } = require("../sub-roles/sub_role_model");
const { Group, DeletedGroup } = require("./group_model");
const { GroupMember } = require("./group_member_model");
const { ObjectId } = require("../../../tools");
const { CustomError, ErrorName, AuthUser, Role, UploadHelper, groupTypes } = require("../../../util");
const { getAutoSyncUsers, getCustomGroupUsers, fetchUserFromAutoSyncedGroups } = require("../../training-registrations/training_registration_helper");

const mergedGroupDetails = (allGroups, groupDetails) => {

    const groupDetailsMap = new Map(groupDetails.map(group => [group._id, group]));

    return allGroups.map(group => {

        if (groupDetailsMap.has(group._id)) {
            return groupDetailsMap.get(group._id);
        }

        return group;
    });
};
const calculateUniqueMemberCounts = (customGroups, groupData) => {
    const result = [];

    for (const customGroup of customGroups) {
        if (customGroup.groupType === "GROUP") {
            const uniqueUserIds = new Set();

            for (const member of customGroup.members) {
                const { groupType, groupData: groupId } = member;

                let relevantGroup = [];
                switch (groupType) {
                    case "designation":
                        relevantGroup = groupData.designationUsers;
                        break;
                    case "role":
                        relevantGroup = groupData.roleUsers;
                        break;
                    case "vessel":
                        relevantGroup = groupData.vesselUsers;
                        break;
                    case "vesselStatus":
                        relevantGroup = groupData.vesselStatusUsers;
                        break;
                    case "vesselType":
                        relevantGroup = groupData.vesselTypeUsers;
                        break;
                    default:
                        break;
                }
                
                const matchedGroup = relevantGroup.find(g => g.groupId == groupId);

                if (matchedGroup) {
                    matchedGroup.userIds.forEach(userId => uniqueUserIds.add(userId));
                }
            }

            result.push({
                _id: customGroup._id,
                groupName: customGroup.groupName,
                groupType: customGroup.groupType,
                description: customGroup.description,
                createdBy: customGroup.createdBy,
                memberCount: uniqueUserIds.size,
            });
        }
    }

    return result;
};
const getUserIdsInAutoSyncedGroups = async (groups, fromGetGroups) => {

    try {

        const designationUsers = await Employee.aggregate([
            {
                $group: {
                    _id: "$empDesignation",
                    userIds: { $push: "$user" }
                }
            },
            {
                $project: {
                    groupId: "$_id",
                    userIds: 1,
                    _id: 0
                }
            }
        ]);


        const roleUsers = await User.aggregate([
            {
                $group: {
                    _id: "$role",
                    userIds: { $push: "$_id" }
                }
            },
            {
                $project: {
                    groupId: "$_id",
                    userIds: 1,
                    _id: 0
                }
            }
        ]);

        const vesselUsers = await UserVessel.aggregate([
            {
                $group: {
                    _id: "$vessel",
                    userIds: { $push: "$user" }
                }
            },
            {
                $project: {
                    groupId: "$_id",
                    userIds: 1,
                    _id: 0
                }
            }
        ]);

        const vesselStatusUsers = await UserVessel.aggregate([
            {
                $group: {
                    _id: "$vesselStatus",
                    userIds: { $push: "$user" }
                }
            },
            {
                $project: {
                    groupId: "$_id",
                    userIds: 1,
                    _id: 0
                }
            }
        ]);

        const vesselTypeUsers = await UserVessel.aggregate([
            {
                $group: {
                    _id: "$vesselType",
                    userIds: { $push: "$user" }
                }
            },
            {
                $project: {
                    groupId: "$_id",
                    userIds: 1,
                    _id: 0
                }
            }
        ]);

        return {
            designationUsers,
            roleUsers,
            vesselUsers,
            vesselStatusUsers,
            vesselTypeUsers
        }

    } catch (error) {
        console.error(error);
    }

};

const restructureGroupDataArray = groupDataArray => {
    return groupDataArray.map(groupData => {
        if (groupData.groupType === "MEMBER") {
            const memberDetails = groupData.members.map(member => member.member);
            groupData.members = [
                {
                    _id: groupData.members[0]?._id,
                    firstName: null,
                    lastName: null,
                    email: null,
                    groupType: null,
                    groupData: null,
                    member: memberDetails
                }
            ];
        }
        return groupData;
    });
}

module.exports = {
    getCustomGroupsOnly: async (id = null, skip, limit) => {
        let matchStage = {};

        if (id) {
            matchStage = { _id: ObjectId(id) };
        }

        let allGroups = await Group.aggregate([
            {
                $match: matchStage,
            },
            {
                $lookup: {
                    from: 'groupmembers',
                    localField: '_id',
                    foreignField: 'group',
                    as: 'members',
                    pipeline: [
                        { $match: { isDeleted: { $ne: true } } },
                        {
                            $project: {
                                groupType: 1,
                                groupData: 1,
                            },
                        },
                    ],
                },
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'createdBy',
                    foreignField: '_id',
                    as: 'createdBy',
                    pipeline: [
                        { $project: { _id: 1, firstName: 1, lastName: 1 } },
                    ],
                },
            },
            {
                $unwind: '$createdBy',
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'updatedBy',
                    foreignField: '_id',
                    as: 'updatedBy',
                    pipeline: [
                        { $project: { _id: 1 } },
                    ],
                },
            },
            {
                $project: {
                    _id: 1,
                    groupName: 1,
                    description: 1,
                    memberCount: 1,
                    groupType: 1,
                    createdBy: 1,
                    updatedBy: 1,
                    members: 1,
                },
            },
        ]);

        const groupUserIds = await getUserIdsInAutoSyncedGroups();

        const groupDetails = calculateUniqueMemberCounts(allGroups, groupUserIds);

        const mergedDetails = mergedGroupDetails(allGroups, groupDetails);

        return mergedDetails;
    },
    getCustomGroups: async (id = null) => {
        let matchStage = {};

        if (id) {
            matchStage = { _id: ObjectId(id) };
        }

        let allGroups = await Group.aggregate([
            {
                $match: matchStage
            },
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
                                as: 'member',
                                pipeline: [
                                    { $project: { _id: 1, firstName: 1, lastName: 1, email: 1, isRegistered: 1 } }
                                ]
                            }
                        },
                        {
                            $unwind: {
                                path: '$member',
                                preserveNullAndEmptyArrays: true
                            }
                        }
                    ]
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'createdBy',
                    foreignField: '_id',
                    as: 'createdBy',
                    pipeline: [
                        { $project: { _id: 1, firstName: 1, lastName: 1 } }
                    ]
                }
            },
            {
                $unwind: "$createdBy",
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'updatedBy',
                    foreignField: '_id',
                    as: 'updatedBy',
                    pipeline: [
                        { $project: { _id: 1, firstName: 1, lastName: 1 } }
                    ]
                }
            },
            {
                $unwind: "$updatedBy",
            },
        ]);

        const groupArray = allGroups
            .filter(group => group.groupType === "GROUP")
            .flatMap(group =>
                group.members.map(member => ({
                    groupType: member.groupType,
                    groupId: member.groupData,
                }))
            );

        let fromGetGroups = true;
        const membersData = await fetchUserFromAutoSyncedGroups(groupArray, fromGetGroups);
        allGroups.forEach(group => {
            if (group.groupType === "GROUP") {
                group.members.forEach(member => {
                    const membersInfo = membersData.find(
                        m => m.groupType === member.groupType && m.groupId === member.groupData
                    );
                    if (membersInfo) {
                        member.member = membersInfo.member;
                    }
                });
            }
        });

        allGroups = restructureGroupDataArray(allGroups);
        return allGroups;
    },
    getAutoSyncedGroupsOnly: async subscriberId => {
        const groupType = "Autosyncedgroups";

        const empDesignationGroups = await Employee.aggregate([
            {
                $match: {
                    subscriber: subscriberId,
                    isDeleted: { $ne: true },
                    empDesignation: { $ne: null },
                },
            },
            {
                $lookup: {
                    from: "designations",
                    localField: "empDesignation",
                    foreignField: "_id",
                    as: "designationDetails",
                },
            },
            {
                $unwind: "$designationDetails",
            },
            {
                $lookup: {
                    from: "users",
                    localField: "user",
                    foreignField: "_id",
                    as: "userDetails",
                },
            },
            {
                $unwind: "$userDetails",
            },
            {
                $match: {
                    "userDetails.firstName": { $ne: null },
                    "userDetails.email": { $ne: null },
                },
            },
            {
                $group: {
                    _id: "$empDesignation",
                    groupName: { $first: "$designationDetails.name" },
                    members: { $push: "$userDetails._id" },
                },
            },
            {
                $addFields: {
                    memberCount: { $size: "$members" },
                    groupType: "designation",
                    description: {
                        $concat: [
                            "All the members in ",
                            "$groupName",
                            " group which is based on designation.",
                        ],
                    },
                },
            },
            {
                $project: {
                    _id: 1,
                    groupName: 1,
                    memberCount: 1,
                    groupType: 1,
                    description: 1,
                },
            },
            {
                $match: {
                    memberCount: { $gt: 0 },
                },
            },
        ]);

        const roleGroups = await User.aggregate([
            {
                $match: {
                    subscriber: subscriberId,
                    isDeleted: { $ne: true },
                    firstName: { $ne: null },
                    email: { $ne: null },
                },
            },
            {
                $lookup: {
                    from: "subroles",
                    localField: "subRoles",
                    foreignField: "_id",
                    as: "subroleDetails",
                },
            },
            {
                $project: {
                    effectiveRole: {
                        $cond: {
                            if: {
                                $in: [
                                    "ADMIN",
                                    {
                                        $map: {
                                            input: "$subroleDetails",
                                            as: "subrole",
                                            in: "$$subrole.name",
                                        },
                                    },
                                ],
                            },
                            then: "ADMIN",
                            else: "$role",
                        },
                    },
                    firstName: 1,
                    lastName: 1,
                    email: 1,
                    _id: 1,
                },
            },
            {
                $group: {
                    _id: "$effectiveRole",
                    groupName: { $first: "$effectiveRole" },
                    members: {
                        $addToSet: {
                            _id: "$_id",
                            firstName: "$firstName",
                            lastName: "$lastName",
                            email: "$email",
                        },
                    },
                },
            },
            {
                $addFields: {
                    memberCount: { $size: "$members" },
                    groupType: "role",
                    description: {
                        $concat: [
                            "All the members in ",
                            "$groupName",
                            " group which is based on role.",
                        ],
                    },
                },
            },
            {
                $project: {
                    _id: 1,
                    groupName: 1,
                    memberCount: 1,
                    groupType: 1,
                    description: 1,
                },
            },
            {
                $match: {
                    memberCount: { $gt: 0 },
                },
            },
        ]);

        const vesselGroups = await UserVessel.aggregate([
            {
                $match: {
                    isActive: true,
                },
            },
            {
                $lookup: {
                    from: "users",
                    localField: "user",
                    foreignField: "_id",
                    as: "userDetails",
                },
            },
            {
                $unwind: "$userDetails",
            },
            {
                $lookup: {
                    from: "vessels",
                    localField: "vessel",
                    foreignField: "_id",
                    as: "vesselDetails",
                },
            },
            {
                $unwind: "$vesselDetails",
            },
            {
                $group: {
                    _id: "$vessel",
                    groupName: { $first: "$vesselDetails.name" },
                    members: {
                        $push: {
                            _id: "$userDetails._id",
                            firstName: "$userDetails.firstName",
                            lastName: "$userDetails.lastName",
                            email: "$userDetails.email",
                            vesselStatus: "$vesselStatus",
                        },
                    },
                },
            },
            {
                $addFields: {
                    memberCount: { $size: "$members" },
                    groupType: "vessel",
                    description: {
                        $concat: [
                            "All the members in ",
                            "$groupName",
                            " group which is based on vessel.",
                        ],
                    },
                },
            },
            {
                $project: {
                    _id: 1,
                    groupName: 1,
                    memberCount: 1,
                    groupType: 1,
                    description: 1,
                },
            },
            {
                $match: {
                    memberCount: { $gt: 0 },
                },
            },
        ]);

        const vesselStatusGroups = await UserVessel.aggregate([
            {
                $match: {
                    isActive: true,
                },
            },
            {
                $lookup: {
                    from: "users",
                    localField: "user",
                    foreignField: "_id",
                    as: "userDetails",
                },
            },
            {
                $unwind: "$userDetails",
            },
            {
                $group: {
                    _id: "$vesselStatus",
                    groupName: { $first: "$vesselStatus" },
                    members: {
                        $push: {
                            _id: "$userDetails._id",
                            firstName: "$userDetails.firstName",
                            lastName: "$userDetails.lastName",
                            email: "$userDetails.email",
                        },
                    },
                },
            },
            {
                $addFields: {
                    memberCount: { $size: "$members" },
                    groupType: "vesselStatus",
                    description: {
                        $concat: [
                            "All the members in ",
                            "$groupName",
                            " group based on vessel status.",
                        ],
                    },
                },
            },
            {
                $project: {
                    _id: 1,
                    groupName: 1,
                    memberCount: 1,
                    groupType: 1,
                    description: 1,
                },
            },
            {
                $match: {
                    memberCount: { $gt: 0 },
                },
            },
        ]);

        const vesselTypeGroups = await UserVessel.aggregate([
            {
                $match: {
                    isActive: true,
                },
            },
            {
                $lookup: {
                    from: "users",
                    localField: "user",
                    foreignField: "_id",
                    as: "userDetails",
                },
            },
            {
                $unwind: "$userDetails",
            },
            {
                $lookup: {
                    from: "vessels",
                    localField: "vessel",
                    foreignField: "_id",
                    as: "vesselDetails",
                },
            },
            {
                $unwind: "$vesselDetails",
            },
            {
                $lookup: {
                    from: "vesseltypes",
                    localField: "vesselDetails.typeOfVessel",
                    foreignField: "_id",
                    as: "vesselTypeDetails",
                },
            },
            {
                $unwind: "$vesselTypeDetails",
            },
            {
                $group: {
                    _id: "$vesselDetails.typeOfVessel",
                    groupName: { $first: "$vesselTypeDetails.name" },
                    members: {
                        $push: {
                            _id: "$userDetails._id",
                            firstName: "$userDetails.firstName",
                            lastName: "$userDetails.lastName",
                            email: "$userDetails.email",
                        },
                    },
                },
            },
            {
                $addFields: {
                    memberCount: { $size: "$members" },
                    groupType: "vesselType",
                    description: {
                        $concat: ["All the ", "$groupName", " members based on vessel type."],
                    },
                },
            },
            {
                $project: {
                    _id: 1,
                    groupName: 1,
                    memberCount: 1,
                    groupType: 1,
                    description: 1,
                },
            },
            {
                $match: {
                    memberCount: { $gt: 0 },
                },
            },
        ]);

        let allGroups = [];
        if (
            empDesignationGroups ||
            roleGroups ||
            vesselGroups ||
            vesselTypeGroups ||
            vesselStatusGroups
        ) {
            allGroups = [
                ...empDesignationGroups,
                ...roleGroups,
                ...vesselGroups,
                ...vesselTypeGroups,
                ...vesselStatusGroups,
            ];
        }

        return allGroups;
    },
    getAutoSyncedGroups: async subscriberId => {

        const empDesignationGroups = await Employee.aggregate([
            {
                $match: {
                    subscriber: subscriberId,
                    isDeleted: { $ne: true },
                    empDesignation: { $ne: null },
                },
            },
            {
                $lookup: {
                    from: "designations",
                    localField: "empDesignation",
                    foreignField: "_id",
                    as: "designationDetails",
                },
            },
            {
                $unwind: "$designationDetails",
            },
            {
                $lookup: {
                    from: "users",
                    localField: "user",
                    foreignField: "_id",
                    as: "userDetails",
                },
            },
            {
                $unwind: "$userDetails",
            },
            {
                $match: {
                    "userDetails.firstName": { $ne: null },
                    "userDetails.email": { $ne: null },
                },
            },
            {
                $group: {
                    _id: "$empDesignation",
                    groupName: { $first: "$designationDetails.name" },
                    members: {
                        $push: {
                            _id: "$userDetails._id",
                            firstName: "$userDetails.firstName",
                            lastName: "$userDetails.lastName",
                            email: "$userDetails.email",
                            isRegistered: "$userDetails.isRegistered",
                        },
                    },
                },
            },
            {
                $addFields: {
                    memberCount: { $size: "$members" },
                    groupType: "designation",
                    description: {
                        $concat: [
                            "All the members in ",
                            "$groupName",
                            " group which is based on designation.",
                        ],
                    },
                },
            },
            {
                $match: {
                    members: { $ne: [] },
                },
            },
        ]);

        const roleGroups = await User.aggregate([
            {
                $match: {
                    subscriber: subscriberId,
                    isDeleted: { $ne: true },
                    firstName: { $ne: null },
                    email: { $ne: null },
                },
            },
            {
                $lookup: {
                    from: "subroles",
                    localField: "subRoles",
                    foreignField: "_id",
                    as: "subroleDetails",
                },
            },
            {
                $project: {
                    effectiveRole: {
                        $cond: {
                            if: {
                                $in: [
                                    "ADMIN",
                                    {
                                        $map: {
                                            input: "$subroleDetails",
                                            as: "subrole",
                                            in: "$$subrole.name",
                                        },
                                    },
                                ],
                            },
                            then: "ADMIN",
                            else: "$role",
                        },
                    },
                    firstName: 1,
                    lastName: 1,
                    email: 1,
                    _id: 1,
                },
            },
            {
                $group: {
                    _id: "$effectiveRole",
                    groupName: { $first: "$effectiveRole" },
                    members: {
                        $addToSet: {
                            _id: "$_id",
                            firstName: "$firstName",
                            lastName: "$lastName",
                            email: "$email",
                        },
                    },
                },
            },
            {
                $addFields: {
                    memberCount: { $size: "$members" },
                    groupType: "role",
                    description: {
                        $concat: [
                            "All the members in ",
                            "$groupName",
                            " group which is based on role.",
                        ],
                    },
                },
            },
            {
                $match: {
                    members: { $ne: [] },
                },
            },
        ]);

        const registeredUserGroups = await User.aggregate([
            {
                $match: {
                    subscriber: subscriberId,
                    isDeleted: { $ne: true },
                    isRegistered: true,
                    firstName: { $ne: null },
                    email: { $ne: null },
                },
            },
            {
                $group: {
                    _id: "Registered Users",
                    groupName: { $first: "Registered Users" },
                    members: {
                        $push: {
                            _id: "$_id",
                            firstName: "$firstName",
                            lastName: "$lastName",
                            email: "$email",
                        },
                    },
                },
            },
            {
                $addFields: {
                    memberCount: { $size: "$members" },
                    groupType: "regStatus",
                    description: {
                        $concat: ["All Registered users."],
                    },
                },
            },
            {
                $match: {
                    members: { $ne: [] },
                },
            },
        ]);

        const unregisteredUserGroups = await User.aggregate([
            {
                $match: {
                    subscriber: subscriberId,
                    isDeleted: { $ne: true },
                    isRegistered: false,
                    firstName: { $ne: null },
                    email: { $ne: null },
                },
            },
            {
                $group: {
                    _id: "Unregistered Users",
                    groupName: { $first: "Unregistered Users" },
                    members: {
                        $push: {
                            _id: "$_id",
                            firstName: "$firstName",
                            lastName: "$lastName",
                            email: "$email",
                        },
                    },
                },
            },
            {
                $addFields: {
                    memberCount: { $size: "$members" },
                    groupType: "unRegStatus",
                    description: {
                        $concat: ["All Unregistered users."],
                    },
                },
            },
            {
                $match: {
                    members: { $ne: [] },
                },
            },
        ]);

        const subRoleGroups = await User.aggregate([
            {
                $match: {
                    subscriber: subscriberId,
                    isDeleted: { $ne: true },
                    subRoles: { $ne: [] },
                    firstName: { $ne: null },
                    email: { $ne: null },
                },
            },
            {
                $unwind: "$subRoles",
            },
            {
                $lookup: {
                    from: "subroles",
                    localField: "subRoles",
                    foreignField: "_id",
                    as: "subRoleDetails",
                },
            },
            {
                $unwind: "$subRoleDetails",
            },
            {
                $group: {
                    _id: "$subRoles",
                    groupName: { $first: "$subRoleDetails.name" },
                    members: {
                        $push: {
                            _id: "$_id",
                            firstName: "$firstName",
                            lastName: "$lastName",
                            email: "$email",
                        },
                    },
                },
            },
            {
                $addFields: {
                    memberCount: { $size: "$members" },
                    groupType: "subRole",
                    description: {
                        $concat: [
                            "All the members in ",
                            "$groupName",
                            " group which is based on sub role.",
                        ],
                    },
                },
            },
            {
                $match: {
                    members: { $ne: [] },
                },
            },
        ]);

        const vesselGroups = await UserVessel.aggregate([
            {
                $match: {
                    isActive: true,
                },
            },
            {
                $lookup: {
                    from: "users",
                    localField: "user",
                    foreignField: "_id",
                    as: "userDetails",
                },
            },
            {
                $unwind: "$userDetails",
            },
            {
                $lookup: {
                    from: "vessels",
                    localField: "vessel",
                    foreignField: "_id",
                    as: "vesselDetails",
                },
            },
            {
                $unwind: "$vesselDetails",
            },
            {
                $group: {
                    _id: "$vessel",
                    groupName: { $first: "$vesselDetails.name" },
                    members: {
                        $push: {
                            _id: "$userDetails._id",
                            firstName: "$userDetails.firstName",
                            lastName: "$userDetails.lastName",
                            email: "$userDetails.email",
                            vesselStatus: "$vesselStatus",
                        },
                    },
                },
            },
            {
                $addFields: {
                    memberCount: { $size: "$members" },
                    groupType: "vessel",
                    description: {
                        $concat: [
                            "All the members in ",
                            "$groupName",
                            " group which is based on vessel.",
                        ],
                    },
                },
            },
            {
                $match: {
                    members: { $ne: [] },
                },
            },
        ]);

        const vesselStatusGroups = await UserVessel.aggregate([
            {
                $match: {
                    isActive: true,
                },
            },
            {
                $lookup: {
                    from: "users",
                    localField: "user",
                    foreignField: "_id",
                    as: "userDetails",
                },
            },
            {
                $unwind: "$userDetails",
            },
            {
                $group: {
                    _id: "$vesselStatus",
                    groupName: { $first: "$vesselStatus" },
                    members: {
                        $push: {
                            _id: "$userDetails._id",
                            firstName: "$userDetails.firstName",
                            lastName: "$userDetails.lastName",
                            email: "$userDetails.email",
                        },
                    },
                },
            },
            {
                $addFields: {
                    memberCount: { $size: "$members" },
                    groupType: "vesselStatus",
                    description: {
                        $concat: [
                            "All the members in ",
                            "$groupName",
                            " group based on vessel status.",
                        ],
                    },
                },
            },
            {
                $match: {
                    members: { $ne: [] },
                },
            },
        ]);

        const vesselTypeGroups = await UserVessel.aggregate([
            {
                $match: {
                    isActive: true,
                },
            },
            {
                $lookup: {
                    from: "users",
                    localField: "user",
                    foreignField: "_id",
                    as: "userDetails",
                },
            },
            {
                $unwind: "$userDetails",
            },
            {
                $lookup: {
                    from: "vessels",
                    localField: "vessel",
                    foreignField: "_id",
                    as: "vesselDetails",
                },
            },
            {
                $unwind: "$vesselDetails",
            },
            {
                $lookup: {
                    from: "vesseltypes",
                    localField: "vesselDetails.typeOfVessel",
                    foreignField: "_id",
                    as: "vesselTypeDetails",
                },
            },
            {
                $unwind: "$vesselTypeDetails",
            },
            {
                $group: {
                    _id: "$vesselDetails.typeOfVessel",
                    groupName: { $first: "$vesselTypeDetails.name" },
                    members: {
                        $push: {
                            _id: "$userDetails._id",
                            firstName: "$userDetails.firstName",
                            lastName: "$userDetails.lastName",
                            email: "$userDetails.email",
                        },
                    },
                },
            },
            {
                $addFields: {
                    memberCount: { $size: "$members" },
                    groupType: "vesselType",
                    description: {
                        $concat: ["All the ", "$groupName", " members based on vessel type."],
                    },
                },
            },
            {
                $match: {
                    members: { $ne: [] },
                },
            },
        ]);


        let allGroups = [];
        if (
            empDesignationGroups ||
            roleGroups ||
            vesselGroups ||
            vesselTypeGroups
        ) {
            allGroups = [
                ...empDesignationGroups,
                ...roleGroups,
                ...vesselGroups,
                ...vesselTypeGroups,
            ];
        }

        return allGroups;
    },
    getAutoSyncUsersOfSingleGroup: async (group) => {

        const groupArray = [{ groupType: group.groupType, groupId: group.groupId }];

        const autoSyncedUsers = await fetchUserFromAutoSyncedGroups(groupArray);
        if (autoSyncedUsers && autoSyncedUsers.length > 0) {
            return autoSyncedUsers;
        } else {
            return [];
        }
    }
};
