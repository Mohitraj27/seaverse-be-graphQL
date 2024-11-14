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
const { CustomError, ErrorName, AuthUser, Role, UploadHelper } = require("../../../util");

module.exports = {
    getCustomGroups: async () => {

        const allGroups = await Group.aggregate([
            { $match: {} },
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
                                as: 'member'
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

        return allGroups;
    },

    getAutoSyncedGroups: async subscriberId => {
        groupType = "Autosyncedgroups";

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
                    role: { $ne: null },
                    firstName: { $ne: null },
                    email: { $ne: null },
                },
            },
            {
                $group: {
                    _id: "$role",
                    groupName: { $first: "$role" },
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
            subRoleGroups ||
            registeredUserGroups ||
            unregisteredUserGroups ||
            vesselStatusGroups ||
            vesselTypeGroups
        ) {
            allGroups = [
                ...empDesignationGroups,
                ...roleGroups,
                ...subRoleGroups,
                ...vesselGroups,
                ...registeredUserGroups,
                ...unregisteredUserGroups,
                ...vesselStatusGroups,
                ...vesselTypeGroups,
            ];
        }

        return allGroups;
    },
};
