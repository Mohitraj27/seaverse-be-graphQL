const { JwtHelper, CryptoHelper, Moment, PubSubHelper } = require("../../../tools");
const {
    SendEmail,
    EmailTemplate,
    CustomError,
    ErrorName,
    AuthUser,
    Role,
    DbTransactionHelper,
    UploadHelper,
    VesselStatus,
} = require("../../../util");
const { ObjectId } = require("../../../tools");

const { Employee } = require("./employee_model");
const { User, DeletedUser } = require("../../user/user_model");
const { Designation } = require("../../designations/designation_model");
const EmployeeHelper = require("./employee_helper");
const UserHelper = require("../user_helper");
const SubRoleHelper = require("../sub-roles/sub_role_helper");
const LogHelper = require("../../logs/log_helper");

const Permission = require("../sub-roles/permission");
const LogType = require("../../logs/log_type.json");
const fs = require("fs");
const { parse } = require("csv-parse");
const user = require("..");
const { Log } = require("../../logs/log_model");
const { Group } = require("../group-user/group_model");
const { GroupMember } = require("../group-user/group_member_model");
const { ImportLog } = require("../import-log/import_log_model");
const { Vessel } = require("../../vessle/vessel_model");
const { UserVessel } = require("../user-vessel-bridge/userVessel_model");
const {
    sendNotificationOn,
    generateRandomString,
} = require("../../user/user-profile/user_profile_helper");
const { v4: uuidv4 } = require("uuid");
const { SubRole } = require("../sub-roles/sub_role_model");
const { fork } = require("child_process");
const { sendEmail } = require("../../../util/aws_helper");
const { parseAsync } = require('json2csv');
const xlsx = require('xlsx');
const path = require('path');
const Export = require('../exportUser/exportUser_model');
const AwsHelper = require("../../../util/aws_helper");
const NotificationEvent = require("../../notifications/notification_event.json");

async function fetchVesselUsersByStatus(vesselStatus, vesselType, vesselObjectId) {
    const userVesselFilter = {};
    if (vesselStatus && vesselStatus.length > 0) {
        userVesselFilter.vesselStatus = { $in: vesselStatus };
    }
    if (vesselType && vesselType.length > 0) {
        userVesselFilter.vesselType = { $in: vesselType };
    }
    if (vesselObjectId) {
        userVesselFilter.vesselObjectId = vesselObjectId;
    }
    const userVessels = await UserVessel.find(userVesselFilter).select("user");
    const userIds = userVessels.map(vessel => vessel.user);
    return userIds;
}
module.exports.queries = {
    getEmployeeNotInGroup: async ({ pageInput, filterInput, group }, context) => {
        const { role, userPermissions, subscriberId, isOrganizationManager, managingOrganization } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [
                    Permission.GET_EMPLOYEES,
                    Permission.CREATE_TRAINING_REGISTRATION,
                    Permission.GET_REGISTRATION_REPORTS,
                    Permission.GET_REVENUE_REPORTS,
                ],
                requiredAll: false,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50;

        let filterConditions = {
            subscriber: subscriberId,
        };

        const groupMembers = await GroupMember.find({ group: group }).select("member");
        const memberIds = groupMembers.map(gm => gm.member);
        const fetchResult = async pipeline => {
            return Employee.aggregatePaginate(Employee.aggregate(pipeline), {
                offset: skip,
                limit,
                sort: { createdAt: "descending" },
                customLabels: {
                    docs: "employees",
                    totalDocs: "totalCount",
                    offset: "skip",
                },
                pagination: limit !== 0,
                allowDiskUse: true,
            });
        };

        return await fetchResult([
            {
                $match: filterConditions,
            },
            {
                $lookup: {
                    from: "users",
                    localField: "user",
                    foreignField: "_id",
                    as: "user",
                },
            },
            {
                $unwind: "$user",
            },
            {
                $match: {
                    "user._id": { $nin: memberIds },
                },
            },
            ...(filterInput?.search
                ? [
                    {
                        $match: {
                            $or: [
                                {
                                    "user.firstName": {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    "user.lastName": {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    "user.civilIdOrPassport": {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    "user.email": {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    "user.companyEmail": {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    "user.phone.number": {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    employeeNo: {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                            ],
                        },
                    },
                ]
                : []),
        ]);
    },
    fetchSampleFile: async () => {


        try {

            const signedUrl = await AwsHelper.fetchFile("public/sample_doc.csv");
            return {
                success: true,
                message: "File fetched successfully",
                url: signedUrl,
            };
        } catch (error) {
            console.error("Error fetching file:", error);
            return {
                success: false,
                message: "Failed to fetch file",
                url: null,
            };
        }
    },

    getManagerList: async ({ pageInput, filterInput }, context) => {
        const { role, userPermissions, subscriberId, isOrganizationManager, managingOrganization } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [
                    Permission.GET_EMPLOYEES,
                    Permission.CREATE_TRAINING_REGISTRATION,
                    Permission.GET_REGISTRATION_REPORTS,
                    Permission.GET_REVENUE_REPORTS,
                ],
                requiredAll: false,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50;

        let filterConditions = {
            subscriber: subscriberId,
        };

        const fetchResult = async pipeline => {
            return Employee.aggregatePaginate(Employee.aggregate(pipeline), {
                offset: skip,
                limit,
                sort: { createdAt: "descending" },
                customLabels: {
                    docs: "employees",
                    totalDocs: "totalCount",
                    offset: "skip",
                },
                pagination: limit !== 0,
                allowDiskUse: true,
            });
        };

        const result = await fetchResult([
            {
                $lookup: {
                    from: "designations",
                    localField: "empDesignation",
                    foreignField: "_id",
                    as: "empDesignation",
                },
            },
            { $unwind: "$empDesignation" },
            {
                $match: {
                    "empDesignation.isManager": true,
                },
            },
            {
                $match: filterConditions,
            },
            {
                $lookup: {
                    from: "users",
                    localField: "user",
                    foreignField: "_id",
                    as: "user",
                },
            },
            {
                $unwind: "$user",
            },
            {
                $match: { "user.isDeleted": { $ne: true } },
            },
            ...(filterInput?.search
                ? [
                    {
                        $match: {
                            $or: [
                                {
                                    "user.firstName": {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    "user.lastName": {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    "user.civilIdOrPassport": {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    "user.email": {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    "user.companyEmail": {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    "user.phone.number": {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    employeeNo: {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                            ],
                        },
                    },
                ]
                : []),
        ]);

        result.employees = result.employees.filter(employee => {
            return employee.isDeleted === false;
        });

        return result;
    },
    getEmployeeProfiles: async ({ pageInput, filterInput }, context) => {
        if (context.platform !== Role.ADMIN) throw CustomError(ErrorName.FORBIDDEN);

        const { role, userPermissions, subscriberId, isOrganizationManager, managingOrganization } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [Permission.DOWNLOAD_PROFILE_CARD],
                requiredAll: false,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50;

        let filterConditions = { subscriber: subscriberId, isDeleted: { $ne: true } };

        if (filterInput?.organization) {
            filterConditions.organization = filterInput.organization;
        }

        const fetchResult = async pipeline => {
            return Employee.aggregatePaginate(Employee.aggregate(pipeline), {
                offset: skip,
                limit,
                sort: { createdAt: "descending" },
                customLabels: {
                    docs: "employees",
                    totalDocs: "totalCount",
                    offset: "skip",
                },
                pagination: limit !== 0,
                allowDiskUse: true,
            });
        };

        if (isOrganizationManager) {
            filterConditions.organization = managingOrganization;
        }

        return await fetchResult([
            {
                $lookup: {
                    from: "designations",
                    localField: "empDesignation",
                    foreignField: "_id",
                    as: "empDesignation",
                },
            },
            { $unwind: "$empDesignation" },
            {
                $match: filterConditions,
            },
            {
                $lookup: {
                    from: "users",
                    localField: "user",
                    foreignField: "_id",
                    as: "user",
                    pipeline: [
                        {
                            $match: { role: Role.EMPLOYEE },
                        },
                    ],
                },
            },
            {
                $unwind: "$user",
            },
            ...(filterInput?.search
                ? [
                    {
                        $match: {
                            $or: [
                                {
                                    "user.firstName": {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    "user.lastName": {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    "user.civilIdOrPassport": {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    "user.email": {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    "user.companyEmail": {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    "user.phone.number": {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    employeeNo: {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                            ],
                        },
                    },
                ]
                : []),
            {
                $lookup: {
                    from: "organizations",
                    localField: "organization",
                    foreignField: "_id",
                    as: "organizations",
                },
            },
            {
                $set: {
                    organization: { $first: "$organizations" },
                },
            },
            {
                $lookup: {
                    from: "trainingcertificates",
                    localField: "_id",
                    foreignField: "employee",
                    as: "trainingCertificates",
                    pipeline: [
                        { $match: { isDeleted: { $ne: true } } },
                        {
                            $lookup: {
                                from: "trainingregistrations",
                                localField: "trainingRegistration",
                                foreignField: "_id",
                                as: "trainingRegistration",
                            },
                        },
                        {
                            $unwind: { path: "$trainingRegistration" },
                        },
                        { $sort: { expiresAt: -1 } },
                    ],
                },
            },
        ]);
    },
    getEmployees: async ({ pageInput, filterInput }, context) => {
        const {
            role,
            userPermissions,
            subscriberId,
            employeeId,
            isOrganizationManager,
            managingOrganization,
        } = AuthUser(context);

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50;

        let startDate, endDate;
        let filterConditions = {
            subscriber: subscriberId,
        };
        if (filterInput?.organization) {
            filterConditions.organization = filterInput?.organization;
        }
        if (filterInput?.lastSeen) {
            const today = Moment();
            switch (filterInput.lastSeen) {
                case "TODAY":
                    startDate = today.startOf("day").toDate();
                    endDate = today.endOf("day").toDate();
                    break;
                case "YESTERDAY":
                    startDate = today.subtract(1, "day").startOf("day").toDate();
                    endDate = today;
                    break;
                case "LAST_7_DAYS":
                    startDate = today.subtract(7, "days").startOf("day").toDate();
                    endDate = Moment().toDate();
                    break;
                case "LAST_30_DAYS":
                    startDate = today.subtract(30, "days").startOf("day").toDate();
                    endDate = Moment().toDate();
                    break;
                case "LAST_3_MONTHS":
                    startDate = today.subtract(3, "months").startOf("day").toDate();
                    endDate = Moment().toDate();
                    break;
                case "LAST_6_MONTHS":
                    startDate = today.subtract(6, "months").startOf("day").toDate();
                    endDate = Moment().toDate();
                    break;
                case "LAST_YEAR":
                    startDate = today.subtract(1, "year").startOf("day").toDate();
                    endDate = Moment().toDate();
                    break;
                default:
                    break;
            }
        }
        if (filterInput?.regType && filterInput?.regType != 0) {
            filterConditions.regType = filterInput?.regType;
        }
        if (filterInput?.empDesignation && filterInput.empDesignation.length > 0) {
            filterConditions.empDesignation = { $in: filterInput.empDesignation };
        }
        if (filterInput?.vesselStatus && filterInput.vesselStatus.length > 0) {
            const userIdsByVesselStatus = await fetchVesselUsersByStatus(
                filterInput.vesselStatus,
                filterInput.vesselType,
                filterInput.vesselObjectId
            );
            if (userIdsByVesselStatus.length > 0) {
                filterConditions.user = { $in: userIdsByVesselStatus };
            }
        }
        const fetchResult = async pipeline => {
            return Employee.aggregatePaginate(Employee.aggregate(pipeline), {
                offset: skip,
                limit,
                sort: { createdAt: "descending" },
                customLabels: {
                    docs: "employees",
                    totalDocs: "totalCount",
                    offset: "skip",
                },
                pagination: limit !== 0,
                allowDiskUse: true,
            });
        };

        if (isOrganizationManager) {
            filterConditions.organization = managingOrganization;
        }

        const result = await fetchResult([
            {
                $match: filterConditions,
            },
            {
                $lookup: {
                    from: "designations",
                    localField: "empDesignation",
                    foreignField: "_id",
                    as: "empDesignation",
                },
            },
            { $unwind: "$empDesignation" },
            {
                $lookup: {
                    from: "users",
                    localField: "user",
                    foreignField: "_id",
                    as: "user",
                    pipeline: [
                        {
                            $match: { superAdmin: { $ne: true } },
                        },
                    ],
                },
            },
            {
                $unwind: "$user",
            },
            {
                $lookup: {
                    from: "subroles",
                    localField: "user.subRoles",
                    foreignField: "_id",
                    as: "user.subRoles",
                }
            },
            {
                $match: {
                    "user.isDeleted": { $ne: true },
                    "user.role": { $in: ["LEARNER"] },
                },
            },
            {
                $lookup: {
                    from: "vessels",
                    localField: "user.currentVessel",
                    foreignField: "_id",
                    as: "currentVessel",
                    pipeline: [
                        {
                            $match: {
                                name: { $exists: true, $ne: null },
                            },
                        },
                        {
                            $project: {
                                _id: 1,
                                name: 1,
                                typeOfVessel: 1,
                                imoNumber: 1,
                                isActive: 1,
                                createdAt: 1,
                                updatedAt: 1,
                            },
                        },
                        {
                            $lookup: {
                                from: "vesseltypes",
                                localField: "typeOfVessel",
                                foreignField: "_id",
                                as: "typeOfVessel",
                                pipeline: [
                                    {
                                        $match: {
                                            _id: { $ne: null },
                                        },
                                    },
                                    {
                                        $project: {
                                            _id: 1,
                                            name: 1,
                                            isActive: 1,
                                            createdAt: 1,
                                            updatedAt: 1,
                                        },
                                    },
                                ],
                            },
                        },
                        {
                            $unwind: {
                                path: "$typeOfVessel",
                                preserveNullAndEmptyArrays: true,
                            },
                        },
                    ],
                },
            },
            {
                $unwind: {
                    path: "$currentVessel",
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $match: {
                    "currentVessel.isActive": { $ne: false },
                },
            },
            ...(filterInput?.vesselName?.length > 0
                ? [
                    {
                        $match: {
                            "currentVessel.name": {
                                $in: filterInput.vesselName.map(
                                    name => new RegExp(".*" + name + ".*", "i")
                                ),
                            },
                        },
                    },
                ]
                : []),
            ...(filterInput?.vesselType?.length > 0
                ? [
                    {
                        $match: {
                            "currentVessel.typeOfVessel._id": {
                                $in: filterInput.vesselType.map(id => ObjectId(id)),
                            },
                        },
                    },
                ]
                : []),
            ...(filterInput?.search
                ? [
                    {
                        $match: {
                            $or: [
                                {
                                    "user.firstName": {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    "user.lastName": {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    "user.civilIdOrPassport": {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    "user.email": {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    "user.companyEmail": {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    "user.phone.number": {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    employeeNo: {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    "managerObjectId.firstName": {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    "managerObjectId.lastName": {
                                        $regex: ".*" + filterInput.search + ".*",
                                        $options: "i",
                                    },
                                },
                            ],
                        },
                    },
                ]
                : []),
            ...(filterInput?.role?.length > 0
                ? [
                    {
                        $match:
                            filterInput.role.includes("LEARNER") &&
                                filterInput.role.includes("ADMIN")
                                ? {}
                                : filterInput.role.includes("LEARNER")
                                    ? {
                                        "user.role": "LEARNER",
                                        "user.subRoles.name": { $ne: "ADMIN" },
                                    }
                                    : filterInput.role.includes("ADMIN")
                                        ? { "user.subRoles.name": "ADMIN" }
                                        : { "user.role": { $in: filterInput.role } },
                    },
                ]
                : []),
            ...(filterInput?.isRegistered !== undefined
                ? [
                    {
                        $match: {
                            "user.isRegistered": filterInput.isRegistered,
                        },
                    },
                ]
                : []),
            ...(filterInput?.lastSeen
                ? [
                    {
                        $match: {
                            "user.lastLoginAt": { $gte: startDate, $lte: endDate },
                        },
                    },
                ]
                : []),
        ]);
        return result;
    },
    getDeleteRequests: async ({ pageInput, filterInput }, context) => {
        const { role, userPermissions } = AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [
                    Permission.GET_EMPLOYEES,
                    Permission.CREATE_TRAINING_REGISTRATION,
                    Permission.GET_REGISTRATION_REPORTS,
                    Permission.GET_REVENUE_REPORTS,
                ],
                requiredAll: false,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50;

        const searchCriteria = filterInput?.search
            ? {
                $or: [
                    { firstName: { $regex: filterInput.search, $options: "i" } },
                    { lastName: { $regex: filterInput.search, $options: "i" } },
                    { email: { $regex: filterInput.search, $options: "i" } },
                ],
            }
            : {};

        const result = await User.find({ deleteRequest: true, ...searchCriteria })
            .skip(skip)
            .limit(limit)
            .sort({ deleteRequestDate: -1 });

        if (!result) {
            return { totalCount: 0 };
        }

        const totalCount = await User.countDocuments({ deleteRequest: true });

        return {
            users: result,
            totalCount,
        };
    },
    getImportLogs: async () => {
        const combinedLogs = await Log.aggregate([
            {
                $match: {
                    logType: "EMPLOYEE_LOG",
                    operation: { $in: ["CREATE", "DELETE"] },
                },
            },
            {
                $addFields: {
                    actionDate: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    users_added: {
                        $cond: [{ $eq: ["$operation", "CREATE"] }, 1, 0],
                    },
                    users_removed: {
                        $cond: [{ $eq: ["$operation", "DELETE"] }, 1, 0],
                    },
                    matchedDate: {
                        $cond: [
                            { $eq: ["$operation", "DELETE"] },
                            "$affected.target.createdAt",
                            "$createdAt",
                        ],
                    },
                },
            },
            {
                $group: {
                    _id: "$actionDate",
                    users_added: { $sum: "$users_added" },
                    users_removed: { $sum: "$users_removed" },
                },
            },
            {
                $addFields: {
                    total_user_count: {
                        $subtract: ["$users_added", "$users_removed"],
                    },
                },
            },
            {
                $addFields: {
                    total_user_count: {
                        $cond: {
                            if: { $lt: ["$total_user_count", 0] },
                            then: 0,
                            else: "$total_user_count",
                        },
                    },
                },
            },

            {
                $sort: { _id: -1 },
            },
        ]);
        return combinedLogs.map(log => ({
            date_of_import: log._id,
            users_added: log.users_added,
            users_removed: log.users_removed,
            total_user_count: log.total_user_count,
        }));
    },
    getCSVImportLogs: async (_, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [
                    Permission.CREATE_EMPLOYEE,
                    Permission.CREATE_TRAINING_REGISTRATION,
                ],
                requiredAll: false,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        try {
            const importLogs = await ImportLog.find().sort({ _id: -1 }).limit(12);

            if (importLogs.length > 0) {
                const result = [];

                importLogs.map(log => {
                    result.push({
                        id: log._id,
                        usersCount: log.usersCount,
                        fileName: log.fileName,
                        filePath: log.filePath,
                        importStatus: log.importStatus,
                        description: log.description,
                        createdAt: log.createdAt,
                    });
                });

                return result;
            }

            return [];

        } catch (error) {
            throw CustomError(ErrorName.FAILED, `${error}`);
        }
    },
    sendWelcomeMails: async ({ emailInput }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        const emails = emailInput.email;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        let messages = [];

        for (const email of emails) {
            if (!emailRegex.test(email)) {
                throw CustomError(ErrorName.INVALID_EMAIL, `Invalid email format: ${email}`);
            }

            let currentUserData = await User.findOne({ email: email });
            if (!currentUserData) {
                throw CustomError(ErrorName.NOT_FOUND, `No user data found for email: ${email}`);
            }
            let html = ``;
            if (currentUserData.isResetPasswordDialog) {
                html = `<div style="width: 600px; margin: 0 auto; text-align: center">
                <p>Welcome</p>
                <div style="font-weight: 400;font-size: 12px;font-family: sans-serif;color: #281166;margin: 20px;">Welcome.
                Get ready for a great career journey with our Learning Management System</div>
                <a href="${process.env.APP_URL}/login?isResetPasswordDialog=${currentUserData.isResetPasswordDialog}" target="_blank">
                    Click Here
                </a>
                </div>`;
            } else {
                const generatePassword = generateRandomString(10);
                currentUserData.password = await CryptoHelper.hash(generatePassword, 10);
                try {
                    await currentUserData.save();
                } catch {
                    throw CustomError(ErrorName.FAILED, "Failed to create new dummy password");
                }
                html = `<div style="width: 600px; margin: 0 auto; text-align: center">
                <p>Welcome</p>
                <div style="font-weight: 400;font-size: 12px;font-family: sans-serif;color: #281166;margin: 20px;">Welcome.
                Get ready for a great career journey with our Learning Management System</div>
                <h4>User Name: ${currentUserData.email}</h4>
                <h4>Temporary Password: ${generatePassword}</h4>
                <a href="${process.env.APP_URL}/login?isResetPasswordDialog=${currentUserData.isResetPasswordDialog}" target="_blank">
                    Click Here
                </a>
                </div>`;
            }
            try {
                await SendEmail({
                    receiverEmail: email,
                    subject: "Registration Invitation",
                    htmlContent: html,
                });
                messages.push(`Email sent successfully to ${email}`);
            } catch (error) {
                messages.push(`Unable to send Welcome mail to ${email}`);
            }
        }

        return messages;
    },
    validateEmailorEmployeeId: async ({ input }, context) => {
        const { role } = AuthUser(context);
        if (role !== "ADMIN") {
            throw new CustomError(ErrorName.FORBIDDEN);
        }
        try {
            const messages = [];
            if (!input.email && !input.civilIdOrPassport) {
                throw CustomError(ErrorName.VALIDATION_ERROR, "Either email or Employee No must be provided.");
            }
            if (input.email && input.civilIdOrPassport) {
                throw CustomError(ErrorName.VALIDATION_ERROR, "Only one of email or Employee No should be provided.");
            }
            if (input.email) {
                const emailExists = await User.findOne({ email: { $regex: `^${input.email}$`, $options: 'i' } });
                if (emailExists) {
                    messages.push("This email Id already exists in the system with another employee.");
                }
            } else if (input.civilIdOrPassport) {
                const empNoExists = await User.findOne({ civilIdOrPassport: { $regex: `^${input.civilIdOrPassport}$`, $options: 'i' } });
                if (empNoExists) {
                    messages.push("Another user already exists with this employee Id");
                }
            }
            if (messages.length > 0) {
                return {
                    status: false,
                    message: messages.join(" "),
                };
            }
            return {
                status: true,
                message: "The input value is available.",
            };
        } catch (error) {
            throw CustomError(ErrorName.FAILED, error.message);
        }
    }


};

const validateDeleteUserRow = row => {
    const errors = [];
    if (!row.firstName) errors.push("First Name is requried");
    if (!row.lastName) errors.push("Last Name is required");
    if (!row.Email) errors.push("Email is required");
    if (!row.Role) errors.push("Role is required");
    if (!row.EmpId) errors.push("EmpId is required");
    if (!row.Designation) errors.push("Designation is required");
    return errors;
};
const deleteEmployees = async ({ input }, context) => {
    const { role, userPermissions, subscriberId, isOrganizationManager, userInfo } =
        AuthUser(context);

    if (
        !SubRoleHelper.hasPermission({
            currentRole: role,
            currentPermissions: userPermissions,
            requiredPermission: Permission.DELETE_EMPLOYEE,
            restrictOrganizationManager: isOrganizationManager,
        })
    ) {
        throw CustomError(ErrorName.FORBIDDEN);
    }

    if (!input.file) throw CustomError(ErrorName.BULK_USER_FILE_UPLOAD);

    const { createReadStream, filename } = await input.file;
    if (!filename.endsWith(".csv")) throw CustomError(ErrorName.INVALID_FILE);

    const usersToDelete = [];
    const errors = [];

    await new Promise((resolve, reject) => {
        const stream = createReadStream();
        const parser = parse({ columns: true, trim: true });

        stream.pipe(parser);

        parser.on("data", row => {
            try {
                const validationErrors = validateDeleteUserRow(row);
                if (validationErrors.length > 0) {
                    errors.push(`Row ${usersToDelete.length + 1}: ${validationErrors.join(", ")}`);
                } else {
                    usersToDelete.push(row);
                }
            } catch (err) {
                errors.push(`Row ${usersToDelete.length + 1}: ${err.message}`);
            }
        });

        parser.on("end", resolve);
        parser.on("error", reject);
    });
    if (errors.length > 0) {
        return { errors, count: 0 };
    }
    const deletedUsers = await DbTransactionHelper.performDbTransaction(async session => {
        const results = [];

        for (let user of usersToDelete) {
            const deletedUser = await User.findOneAndDelete(
                { email: user.Email, subscriber: subscriberId },
                { lean: true, session }
            );

            if (!deletedUser) {
                errors.push(`User not found with Email: ${user.Email}`);
                continue;
            }

            const deletedEmployee = await Employee.findOneAndDelete(
                { user: deletedUser._id, subscriber: subscriberId },
                { lean: true, session }
            );

            if (!deletedEmployee) {
                errors.push(`Employee record not found for user: ${deletedUser._id}`);
                continue;
            }

            results.push({
                ...deletedEmployee,
                user: deletedUser,
            });

            EmployeeHelper.sendNotificationOnCRUD({
                subscriber: subscriberId,
                employee: deletedEmployee,
                action: "DELETED",
                createdBy: userInfo,
            });

            LogHelper.logActivity({
                subscriber: subscriberId,
                logType: LogType.EMPLOYEE_LOG,
                operation: "DELETE",
                ipInfo: context.ipInfo,
                affected: [{ targetRef: "Employee", target: deletedEmployee._id }],
                additionalInfo: [
                    {
                        infoType: "EMPLOYEE_INFO",
                        infoData: JSON.stringify(deletedEmployee),
                    },
                ],
                createdBy: userInfo,
            });
        }

        return results;
    });

    return {
        count: deletedUsers.length,
        errors,
    };
};

const changeRegisterEmployees = async ({ input }, context) => {
    const { userInfo, subscriberId } = AuthUser(context);

    if (input.users.length <= 0) {
        throw CustomError(ErrorName.VALIDATION_ERROR);
    }

    if (input.users.length === 1) {
        const user = await User.findOne({ _id: input.users[0], subscriber: subscriberId });
        if (input.type === "Registered" && user.isRegistered) {
            throw CustomError(ErrorName.EMPLOYEE_ALREADY_REGISTERED);
        } else if (input.type === "Unregistered" && !user.isRegistered) {
            throw CustomError(ErrorName.EMPLOYEE_ALREADY_UNREGISTERED);
        }
    }

    let registerStatus = false;

    if (input.type === "Registered") {
        registerStatus = true;
    } else if (input.type === "Unregistered") {
        registerStatus = false;
    } else {
        throw CustomError(ErrorName.VALIDATION_ERROR);
    }

    const updateUsers = await User.updateMany(
        { _id: { $in: input.users } },
        { isRegistered: registerStatus }
    );
    if (updateUsers) {
        if (updateUsers.nModified > 0) {
            return { count: updateUsers.nModified, success: true };
        } else {
            return { count: updateUsers.nModified, success: false };
        }
    } else {
        throw CustomError(ErrorName.ERROR_FETCHING_CONTENT);
    }
};

const manageRole = async ({ input }, context) => {
    const { userInfo, subscriberId } = AuthUser(context);

    if (input.users.length <= 0) {
        throw CustomError(ErrorName.VALIDATION_ERROR);
    }

    if (input.users.length === 1) {
        const user = await User.findOne({ _id: input.users[0], subscriber: subscriberId });
        if (input.change === "Assign" && user.role === input.assignType) {
            throw CustomError(ErrorName.ROLE_ALREADY_ASSIGNED);
        }
    }

    let updateUserRole;
    if (input.change === "Assign") {
        if (!input.assignType) throw CustomError(ErrorName.ASSIGNTYPE_ERROR);

        updateUserRole = await User.updateMany(
            { _id: { $in: input.users }, superAdmin: false },
            { $set: { role: input.assignType } }
        );
    } else if (input.change === "Remove") {
        if (!input.removeType) throw CustomError(ErrorName.REMOVETYPE_ERROR);

        if (input.removeType === "REMOVE_AS_AUTHOR") {
            updateUserRole = await User.updateMany(
                { _id: { $in: input.users }, superAdmin: false, role: "AUTHOR" },
                { $set: { role: "EMPLOYEE" } }
            );
        }

        if (input.removeType === "REMOVE_AS_ADMIN") {
            updateUserRole = await User.updateMany(
                { _id: { $in: input.users }, superAdmin: false, role: "LEARNER" },
                { $set: { subRoles: [] } }
            );
        }
    } else if (input.change === "Delete") {
        updateUserRole = await EmployeeHelper.deleteUsers(input.users);
    } else {
        throw CustomError(ErrorName.VALIDATION_ERROR);
    }

    if (updateUserRole) {
        if (updateUserRole.n > 0) {
            return { count: updateUserRole.n, success: true };
        } else {
            return { count: updateUserRole.n, success: false };
        }
    } else {
        throw CustomError(ErrorName.ERROR_FETCHING_CONTENT);
    }
};
const respondToDeleteRequest = async ({ input }, context) => {
    const { role, userPermissions, subscriberId, userInfo } = AuthUser(context);
    if (
        !SubRoleHelper.hasPermission({
            currentRole: role,
            currentPermissions: userPermissions,
            requiredPermission: [
                Permission.GET_EMPLOYEES,
                Permission.CREATE_TRAINING_REGISTRATION,
                Permission.GET_REGISTRATION_REPORTS,
                Permission.GET_REVENUE_REPORTS,
            ],
            requiredAll: false,
        })
    ) {
        throw CustomError(ErrorName.FORBIDDEN);
    }

    if (input.users.length <= 0) {
        throw CustomError(ErrorName.VALIDATION_ERROR);
    }

    if (input.type === "REJECT") {
        const rejectDeleteRequest = await User.updateMany(
            { _id: { $in: input.users } },
            {
                $set: {
                    deleteRequest: false,
                    deleteRequestDate: null,
                },
            }
        );

        if (rejectDeleteRequest.nModified > 0) {
            for (let userId of input.users) {
                const user = await User.findById(userId);
                if (user) {
                    await sendNotificationOn({
                        subscriber: subscriberId,
                        user: {
                            _id: userId,
                            firstName: user.firstName,
                            lastName: user.lastName,
                            civilIdOrPassport: user.civilIdOrPassport,
                            email: user.email,
                        },
                        action: "rejected",
                        message: `Admin ${userInfo.firstName} ${userInfo.lastName} has rejected your delete request.`,
                        createdBy: userInfo,
                    });
                } else {
                    console.error(`User with ID ${userId} not found`);
                }
            }
            return "Successfully rejected";
        } else {
            throw CustomError(ErrorName.ERROR_REJECTING_USER_REQUEST);
        }
    }
    if (input.type === "APPROVE") {
        let errors = [];
        const deleteUsers = await EmployeeHelper.deleteUsers(input.users, errors);
        if (errors.length > 0) {
            throw CustomError(ErrorName.ERROR_DELETING_USER, `${errors[0]}`);
        }
        if (deleteUsers) {
            for (let userId of input.users) {
                const user = await User.findById(userId);
                if (user) {
                    await sendNotificationOn({
                        subscriber: subscriberId,
                        user: {
                            _id: userId,
                            firstName: user.firstName,
                            lastName: user.lastName,
                            civilIdOrPassport: user.civilIdOrPassport,
                            email: user.email,
                        },
                        action: "approved",
                        message: `Admin ${userInfo.firstName} ${userInfo.lastName} has approved your delete request.`,
                        createdBy: userInfo,
                    });
                } else {
                    console.error(`User with ID ${userId} not found`);
                }
            }
            return "Successfully deleted";
        } else {
            throw CustomError(ErrorName.ERROR_DELETING_USER);
        }
    }
};

module.exports.mutations = {
    respondToDeleteRequest,
    manageRole,
    changeRegisterEmployees,
    createEmployees: async ({ input }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [
                    Permission.CREATE_EMPLOYEE,
                    Permission.CREATE_TRAINING_REGISTRATION,
                ],
                requiredAll: false,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

        try {
            const { subscriberId, userId } = AuthUser(context);

            if (!input.file) throw CustomError(ErrorName.BULK_USER_FILE_UPLOAD);
            const { createReadStream, filename } = await input.file;
            if (!filename.endsWith(".csv")) throw CustomError(ErrorName.INVALID_FILE);

            const newFileName = `csv_${Date.now()}`;

            const saveCSV = await UploadHelper.uploadCSV({
                data: input.file,
                folderName: "csv-content",
                fileName: newFileName,
                uploadType: UploadHelper.uploadType.bulkCSV,
            });

            if (!saveCSV) throw CustomError(ErrorName.FAILED, "Failed to upload CSV file");

            let users = [];

            const emails = new Set();
            const empIds = new Set();

            const existingDesignations = await Designation.find({ isDeleted: false }).lean();
            const designationNames = existingDesignations.map(designation => designation.name);

            const vessels = await Vessel.find({ isDeleted: false, isActive: true })
                .select("imoNumber")
                .lean();

            const imoNumbers = vessels.map(vessel => vessel.imoNumber);

            const vesselStatus = [
                VesselStatus.ONBOARDED,
                VesselStatus.ONSHORE,
                VesselStatus.ASSIGNED,
            ];

            const errors = await EmployeeHelper.bulkValidationHelper(
                createReadStream,
                empIds,
                emails,
                designationNames,
                imoNumbers,
                vesselStatus,
                users,
                userId,
                subscriberId,
                newFileName,
                saveCSV
            );

            const nonEmptyArray = errors.find(arr => arr.length > 0);
            if (nonEmptyArray) {
                throw CustomError(ErrorName.FAILED, `Validation failed with errors: ${nonEmptyArray}`);
            }

            const empIdsArray = Array.from(empIds);
            const emailsArray = Array.from(emails);

            const child = fork("./src/app/user/employee/csv_import_process.js");

            child.send({
                users,
                emailsArray,
                empIdsArray,
                subscriberId,
                userId,
                newFileName,
                saveCSV,
            });

            child.on("message", async message => {
                if (message.type === 'NOTIFICATION') {
                    await PubSubHelper.publish(NotificationEvent.ON_NOTIFICATION, message.data);
                }
                console.log("Message from child process:", message);
            });

            child.on("error", error => {
                console.error("Error in child process:", error);
            });

            return {
                status: "The bulk import is being processed in the background. You can continue working.",
            };
        } catch (error) {
            throw Error(error.message);
        }
    },

    createEmployee: async ({ input }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [
                    Permission.CREATE_EMPLOYEE,
                    Permission.CREATE_TRAINING_REGISTRATION,
                ],
                requiredAll: false,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        if (
            !input.empDesignation ||
            !input.user.firstName ||
            !input.user.email ||
            !input.user.civilIdOrPassport ||
            !input.user.currentVessel ||
            !input.user.vesselStatus ||
            typeof input.user.isRegistered !== "boolean"
        )
            throw CustomError(ErrorName.ARGUMENTS_REQUIRED);

        const existingUser = await User.findOne({ email: input.user.email });

        if (existingUser) throw CustomError(ErrorName.USER_ALREADY_EXIST);

        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

        const notificationList = [];
        const courseInvitationList = [];
        const invitationList = [];
        let savedBatch;

        const savedEmployees = await DbTransactionHelper.performDbTransaction(async session => {
            const savedEmployees = [];

            const generatePassword = generateRandomString(10);

            input.user.password = input.user.password
                ? await CryptoHelper.hash(input.user.password, 10)
                : await CryptoHelper.hash(generatePassword, 10);

            const existingDesignation = await Designation.findById(input.empDesignation);
            if (!existingDesignation) throw new CustomError(ErrorName.INVALID_DESIGNATION);

            let userRole = Role.LEARNER;

            const savedUser = await User.create({
                subscriber: subscriberId,
                ...input.user,
                role: userRole,
                isRegistered: input.user.isRegistered,
                UID: await EmployeeHelper.generateUserUID({ session }),
            });

            if (!savedUser) throw CustomError(ErrorName.FAILED);

            let employeeUpdate = {
                subscriber: subscriberId,
                user: savedUser,
                branch: input.branch,
                organization: input.organization,
                empDesignation: input.empDesignation,
                designation: existingDesignation.name,
            };

            const savedEmployee = await Employee.create({
                ...employeeUpdate,
                UID: await EmployeeHelper.generateEmployeeUID({ subscriberId, session }),
            });

            if (!savedEmployee) throw CustomError(ErrorName.FAILED);

            let userVesselUpdate = {
                user: savedUser,
                vessel: input.user.currentVessel,
                vesselStatus: input.user.vesselStatus,
            };

            const savedUserVessel = await UserVessel.create(userVesselUpdate);

            if (!savedUserVessel) throw CustomError(ErrorName.FAILED);

            invitationList.push({
                userData: savedUser,
            });

            savedEmployees.push({ ...savedEmployee, user: savedUser });

            const result = await sendEmail({
                receiverEmail: savedUser.email,
                subject: "Welcome",
                htmlContent: `<!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="UTF-8" />
                    <title>Welcome</title>
                </head>
                <body>
                    <div style="width: 600px; margin: 0 auto; text-align: center">
                        <p>Welcome</p>
                        <div style="font-weight: 400;font-size: 12px;font-family: sans-serif;color: #281166;margin: 20px;">Welcome.
            Get ready for a great career journey with our Learning Management System</div>
            <h4>User Name: ${savedUser.email}</h4>
            <h4>Temporary Password: ${generatePassword}</h4>
                        <a href="${process.env.APP_URL}/login?isResetPasswordDialog=${savedUser.isResetPasswordDialog}" target="_blank">
                            Click Here
                        </a>
                    </div>
                </body>
            </html>`,
            });

            return savedEmployees;
        });

        if (!savedEmployees) throw CustomError(ErrorName.FAILED);

        EmployeeHelper.sendEnrollmentNotification(notificationList);

        EmployeeHelper.sendNotificationOnCRUD({
            subscriber: subscriberId,
            employee: savedEmployees[0],
            createdBy: userInfo,
            action: "CREATED",
        });

        return {
            status: true,
            message: "User created successfully!",
        };
    },
    updateEmployee: async ({ id, input }, context) => {
        const {
            role,
            userId,
            userInfo,
            userPermissions,
            subscriberId,
            employeeId,
            isOrganizationManager,
        } = AuthUser(context);

        const employeeFilterConditions = { subscriber: subscriberId };

        if (context.platform === Role.ADMIN) {
            if (
                !SubRoleHelper.hasPermission({
                    currentRole: role,
                    currentPermissions: userPermissions,
                    requiredPermission: [
                        Permission.UPDATE_EMPLOYEE,
                        Permission.ENABLE_DISABLE_EMPLOYEE,
                    ],
                    requiredAll: false,
                    restrictOrganizationManager: isOrganizationManager,
                }) &&
                id.toString() !== employeeId.toString()
            ) {
                throw CustomError(ErrorName.FORBIDDEN);
            }
        } else {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const savedEmployee = await EmployeeHelper.updateEmployees(
            {
                id: id,
                input: input,
                userId: userId,
                subscriberId: subscriberId,
                role: role,
            },
            context
        );

        EmployeeHelper.sendNotificationOnCRUD({
            subscriber: subscriberId,
            employee: savedEmployee,
            createdBy: userInfo,
            action: "UPDATED",
        });

        return savedEmployee;
    },
    deleteEmployee: async ({ id }, context) => {
        const { role, userPermissions, userId, userInfo, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.DELETE_EMPLOYEE,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const deletedEmployee = await DbTransactionHelper.performDbTransaction(async session => {
            const deletedUser = await User.findOneAndDelete(
                { _id: id, subscriber: subscriberId },
                { lean: true, session }
            );

            if (!deletedUser) throw CustomError(ErrorName.NOT_FOUND);

            const deletedEmployee = await Employee.findOneAndDelete(
                { user: deletedUser._id, subscriber: subscriberId },
                { lean: true, session }
            );

            if (!deletedEmployee) throw CustomError(ErrorName.NOT_FOUND);

            return {
                ...deletedEmployee,
                user: deletedUser,
            };
        });

        if (!deletedEmployee) throw CustomError(ErrorName.FAILED);

        EmployeeHelper.sendNotificationOnCRUD({
            subscriber: subscriberId,
            employee: deletedEmployee,
            action: "DELETED",
            createdBy: userInfo,
        });

        LogHelper.logActivity({
            subscriber: subscriberId,
            logType: LogType.EMPLOYEE_LOG,
            operation: "DELETE",
            ipInfo: context.ipInfo,
            affected: [
                {
                    targetRef: "Employee",
                    target: deletedEmployee._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "EMPLOYEE_INFO",
                    infoData: JSON.stringify(deletedEmployee),
                },
            ],
            createdBy: userInfo,
        });

        return deletedEmployee;
    },
    deleteEmployees,
    importEmployees: async ({ inputs }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [
                    Permission.CREATE_EMPLOYEE,
                    Permission.CREATE_TRAINING_REGISTRATION,
                ],
                requiredAll: false,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

        if (!inputs?.length) throw CustomError(ErrorName.ARGUMENTS_REQUIRED);

        const invitationList = [];

        const savedEmployees = await DbTransactionHelper.performDbTransaction(async session => {
            const savedEmployees = [];

            for (const input of inputs) {
                const user = {
                    ...input.user,
                    password: process.env.USER_DUMMY_PASSWORD,
                };

                if (user.isOrganizationManager === true) {
                    user.managingOrganization = input.organization;
                }

                const savedUserRaw = await User.findOneAndUpdate(
                    { email: { $regex: new RegExp(`^${user.email}$`, "i") } },
                    {
                        $setOnInsert: {
                            subscriber: subscriberId,
                            ...user,
                            role: Role.EMPLOYEE,
                            isRegistered: false,
                        },
                    },
                    {
                        upsert: true,
                        new: true,
                        setDefaultsOnInsert: true,
                        runValidators: true,
                        lean: true,
                        rawResult: true,
                        session,
                    }
                );

                if (!savedUserRaw || !savedUserRaw.value) throw CustomError(ErrorName.FAILED);
                let savedUser = savedUserRaw.value;
                if (!savedUserRaw.lastErrorObject.updatedExisting) {
                    savedUser = await User.findByIdAndUpdate(
                        savedUser._id,
                        { UID: await EmployeeHelper.generateUserUID({ session }) },
                        {
                            upsert: false,
                            new: true,
                            lean: true,
                            session,
                        }
                    );
                }
                const employeeUpdate = {
                    $setOnInsert: {
                        subscriber: subscriberId,
                        user: savedUser._id,
                        organization: input.organization,
                        designation: input.designation,
                        managerName: input.managerName,
                        customField: input.customField,
                        rigNumber: input.rigNumber,
                        dob: input.dob,
                        gender: input.gender,
                        externalLinks: input.externalLinks,
                        bloodGroup: input.bloodGroup,
                        nationality: input.nationality,
                        department: input.department,
                    },
                };

                const savedEmployeeRaw = await Employee.findOneAndUpdate(
                    { user: savedUser._id },
                    employeeUpdate,
                    {
                        upsert: true,
                        new: true,
                        setDefaultsOnInsert: true,
                        runValidators: true,
                        lean: true,
                        rawResult: true,
                        session,
                    }
                );

                if (!savedEmployeeRaw || !savedEmployeeRaw.value)
                    throw CustomError(ErrorName.FAILED);
                let savedEmployee = savedEmployeeRaw.value;
                if (
                    savedEmployee.organization &&
                    input.organization &&
                    input.organization.toString() !== savedEmployee.organization.toString()
                ) {
                    throw CustomError(ErrorName.ORGANIZATION_MISMATCH_ERROR, [
                        {
                            employee: {
                                _id: savedEmployee._id,
                                user: { _id: savedUser._id, email: savedUser.email },
                            },
                        },
                    ]);
                }
                if (!savedEmployeeRaw.lastErrorObject.updatedExisting) {
                    savedEmployee = await Employee.findByIdAndUpdate(
                        savedEmployee._id,
                        {
                            UID: await EmployeeHelper.generateEmployeeUID({
                                subscriberId,
                                session,
                            }),
                        },
                        {
                            upsert: false,
                            new: true,
                            lean: true,
                            session,
                        }
                    );
                }

                if (!savedUserRaw.lastErrorObject.updatedExisting) {
                    const token = JwtHelper.sign(
                        {
                            id: savedUser._id,
                            email: savedUser.email,
                            role: savedUser.role,
                        },
                        process.env.APP_SECRET,
                        { expiresIn: "8h" }
                    );

                    if (token) {
                        const emailOrCivilIdOrPassport = savedUser.email
                            ? savedUser.email
                            : savedUser.civilIdOrPassport;

                        invitationList.push({
                            userData: savedUser,
                            token,
                            emailOrCivilIdOrPassport,
                        });
                    }
                }

                savedEmployees.push({ ...savedEmployee, user: savedUser });
            }

            return savedEmployees;
        });

        if (!savedEmployees) throw CustomError(ErrorName.FAILED);

        invitationList.forEach(obj => {
            EmployeeHelper.sendInvitationMail(obj);
        });

        return savedEmployees;
    },
    assignSubroleToLearners: async ({ input }, context) => {
        const {
            role,
            userId,
            primaryRole,
            userInfo,
            userPermissions,
            subscriberId,
            isOrganizationManager,
        } = AuthUser(context);
        if (!SubRoleHelper.hasPermission({ currentRole: role, primaryRole: primaryRole })) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
        try {
            const { users, subrole } = input;
            if (role !== "ADMIN" && primaryRole[0] !== "ADMIN") {
                throw new Error("Unauthorized: Only admins can assign subroles");
            }
            const validSubRole = await SubRole.findById(subrole);
            if (!validSubRole) {
                throw new Error("Invalid subrole");
            }
            const usersToUpdate = await User.find({ _id: { $in: users } });
            if (!usersToUpdate || usersToUpdate.length === 0) {
                throw new Error("No valid users found");
            }
            await Promise.all(
                usersToUpdate.map(async user => {
                    if (!user.subRoles) {
                        user.subRoles = [];
                    }
                    if (!user.subRoles.includes(subrole)) {
                        user.subRoles.push(subrole);
                    }
                    await user.save();
                })
            );
            return {
                success: true,
                message: "Subrole successfully assigned to all learners",
            };
        } catch (error) {
            return {
                success: false,
                message: `Error assigning subrole: ${error.message}`,
            };
        }
    },

    exportUserToCsv: async ({ input }, context) => {
        const { role, userId, subscriberId } = AuthUser(context);
        if (!role || role !== "ADMIN") {
            throw CustomError(ErrorName.FORBIDDEN);
        }
        try {
            const userIds = input.ids;
            const users = await User.find({ _id: { $in: userIds } }).lean();
            if (!users.length) {
                throw CustomError(ErrorName.USER_NOT_FOUND);
            }
            const vesselIds = users.filter(users => users.currentVessel).map(users => users.currentVessel);
            const vessels = vesselIds.length > 0 ? await Vessel.find({ _id: { $in: vesselIds } }).lean() : [];
            const vesselMap = vessels.reduce((acc, vessel) => {
                acc[vessel._id.toString()] = vessel.name;
                return acc;
            }, {});
            const userObjectIds = users.map(user => user._id);
            const employees = userObjectIds.length > 0 ? await Employee.find({ user: { $in: userObjectIds } }).lean() : [];
            const empDesignationIds = employees.map(employee => employee.empDesignation).filter(Boolean);
            const designations = empDesignationIds.length > 0 ? await Designation.find({ _id: { $in: empDesignationIds } }).lean() : [];
            const designationMap = designations.reduce((acc, designation) => {
                acc[designation._id.toString()] = designation.name;
                return acc;
            }, {});
            const data = users.map(user => {
                const employee = employees.find(emp => emp.user.toString() === user._id.toString());
                const empDesignation = employee && employee.empDesignation ? designationMap[employee.empDesignation.toString()] : " ";
                return {
                    "First Name": user.firstName,
                    "Last Name": user.lastName,
                    "Employee ID": user.civilIdOrPassport,
                    "Email": user.email,
                    "Last Login": user.lastLoginAt,
                    "Created At": user.createdAt,
                    "Vessel Status": user.vesselStatus,
                    "Current Vessel": user.currentVessel ? vesselMap[user.currentVessel.toString()] : " ",
                    "Employee Designation": empDesignation
                };
            });
            const workbook = xlsx.utils.book_new();
            const worksheet = xlsx.utils.json_to_sheet(data);
            xlsx.utils.book_append_sheet(workbook, worksheet, "Users");
            const excelBuffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
            const excelFilePath = await UploadHelper.uploadExcel({
                data: excelBuffer,
                folderName: "exports",
                fileName: `exported_users_${Date.now()}.xlsx`,
                uploadType: UploadHelper.uploadType.exportExcel,
            });
            if (excelFilePath) {
                const s3PresignedUrl = await AwsHelper.fetchFile(excelFilePath);
                const exportEntry = new Export({
                    filePath: s3PresignedUrl,
                    subscriberId: subscriberId,
                    createdBy: userId,
                    updatedBy: userId,
                    type_of_export: 'USER_EXPORT'
                });
                await exportEntry.save();
                return {
                    status: true,
                    message: "User Export successful",
                    filePath: s3PresignedUrl,
                    fileName: path.basename(excelFilePath)
                };
            } else {
                throw CustomError(ErrorName.UPLOAD_FAILED);
            }
        } catch (error) {
            throw new Error(error.message);
        }
    }

};
