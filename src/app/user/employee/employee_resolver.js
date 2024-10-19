const { JwtHelper, CryptoHelper } = require("../../../tools");
const {
    CustomError,
    ErrorName,
    AuthUser,
    Role,
    DbTransactionHelper,
    UploadHelper,
    VesselStatus,
} = require("../../../util");

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
const { sendNotificationOn } = require("../../user/user-profile/user_profile_helper");
const { v4: uuidv4 } = require('uuid')
const { ObjectId } = require("../../../tools");

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

        let filterConditions = {
            subscriber: subscriberId,
        };
        if (filterInput?.organization) {
            filterConditions.organization = filterInput?.organization;
        }

        if (filterInput?.regType && filterInput?.regType != 0) {
            filterConditions.regType = filterInput?.regType;
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
                    localField: "managerObjectId",
                    foreignField: "_id",
                    as: "managerObjectId",
                },
            },
            { $unwind: "$managerObjectId" },
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
                            $match: { superAdmin: { $ne: true } },
                        },
                    ],
                },
            },
            {
                $unwind: "$user",
            },
            {
                $match: {
                    "user.isDeleted": { $ne: true },
                    "user.role": { $in: ['ADMIN', 'EMPLOYEE', 'AUTHOR'] }
                }
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
            ...(filterInput?.role
                ? [
                    {
                        $match: {
                            "user.role": filterInput.role,
                        },
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
        ]);
        return result;

    },
    getDeleteRequests: async ({ pageInput, filterInput }, context) => {

        const { role, userPermissions } =
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

        const searchCriteria = filterInput?.search
            ? {
                $or: [
                    { firstName: { $regex: filterInput.search, $options: 'i' } },
                    { lastName: { $regex: filterInput.search, $options: 'i' } },
                    { email: { $regex: filterInput.search, $options: 'i' } },
                ],
            }
            : {};

        const result = await User.find({ deleteRequest: true, ...searchCriteria })
            .skip(skip)
            .limit(limit)
            .sort({ deleteRequestDate: -1 });

        if (!result) {
            return { totalCount: 0 }
        }

        const totalCount = await User.countDocuments({ deleteRequest: true });

        return {
            users: result,
            totalCount
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
                { _id: { $in: input.users }, superAdmin: false, role: "ADMIN" },
                { $set: { role: "EMPLOYEE" } }
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

        const rejectDeleteRequest = await User.updateMany({ _id: { $in: input.users } }, {
            $set: {
                deleteRequest: false,
                deleteRequestDate: null,
            },
        });

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
                            email: user.email
                        },
                        action: "rejected",
                        message: `Admin ${userInfo.firstName} ${userInfo.lastName} has rejected your delete request.`,
                        createdBy: userInfo
                    });
                }
                else {
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
                            email: user.email
                        },
                        action: "approved",
                        message: `Admin ${userInfo.firstName} ${userInfo.lastName} has approved your delete request.`,
                        createdBy: userInfo
                    });
                } else {
                    console.error(`User with ID ${userId} not found`)
                }
            }
            return "Successfully deleted";
        } else {
            throw CustomError(ErrorName.ERROR_DELETING_USER);
        }
    }
}

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

            if (!saveCSV) throw CustomError(ErrorName.FAILED, 'Failed to upload CSV file');

            const users = [];
            const errors = [];

            let emails = new Set();
            let empIds = new Set();

            const existingDesignations = await Designation.find({ isDeleted: false }).lean();
            const designationNames = existingDesignations.map(designation => designation.name);

            const vessels = await Vessel.find({ isDeleted: false, isActive: true }).select('imoNumber').lean();
            const imoNumbers = vessels.map(vessel => vessel.imoNumber);

            const vesselStatus = [VesselStatus.ONBOARDED, VesselStatus.ONSHORE, VesselStatus.ASSIGNED];

            await new Promise((resolve, reject) => {
                const stream = createReadStream();
                const parser = parse({ columns: true, trim: true });
                stream.pipe(parser);

                let rowIndex = 0;

                parser.on("data", async (row) => {
                    try {
                        const validationErrors = await validateUserRow(row, { empIds, emails, designationNames, imoNumbers, vesselStatus }, rowIndex);

                        if (validationErrors.length > 0) {

                            const createImportLog = await ImportLog.create({
                                subscriber: subscriberId,
                                uploadedBy: userId,
                                fileName: newFileName,
                                filePath: saveCSV,
                                importStatus: "FAILED",
                                description: `${validationErrors[0]}`
                            })
                            if (!createImportLog) throw CustomError(ErrorName.FAILED, 'Failed to create import log');
                            errors.push(`${validationErrors[0]}`);
                            throw CustomError(
                                ErrorName.VALIDATION_ERROR,
                                `${validationErrors[0]}`
                            )
                        } else {
                            const formatedData = mapCSVRowToUser(row);
                            users.push(formatedData);
                        }
                    } catch (err) {
                        errors.push(`${err.message}`);
                    }
                    rowIndex++;
                });

                parser.on("end", resolve);
                parser.on("error", reject);
            });

            if (errors.length > 0) {

                const createImportLog = await ImportLog.create({
                    subscriber: subscriberId,
                    uploadedBy: userId,
                    fileName: newFileName,
                    filePath: saveCSV,
                    importStatus: "FAILED",
                    description: `${errors[0]}`
                })

                if (!createImportLog) throw CustomError(ErrorName.FAILED, 'Failed to create import log');

                throw CustomError(
                    ErrorName.VALIDATION_ERROR,
                    `${errors[0]}`
                );

            }

            const existingUsers = await User.find({
                $or: [
                    { civilIdOrPassport: { $in: Array.from(empIds) } },
                    { email: { $in: Array.from(emails) } }
                ]
            }).lean();

            const existingEmailsInDB = existingUsers.map(user => user.email);

            const existingEmpIdsInDB = existingUsers.map(user => ({
                [user.civilIdOrPassport]: user.email
            }));

            const updates = [];
            const inserts = [];

            let userIndex = 0;

            const existingVessels = await Vessel.find({ isDeleted: false, isActive: true }).lean();

            const vesselMap = new Map(
                existingVessels.map(vessel => [
                    vessel.imoNumber,
                    { id: vessel._id }
                ])
            );

            for (const user of users) {

                const existingEmpIdsMap = existingEmpIdsInDB.find(empObj => empObj[user.civilIdOrPassport]);

                if (existingEmpIdsMap) {

                    const email = existingEmpIdsMap[user.civilIdOrPassport];

                    if (email !== user.email && existingEmailsInDB.includes(user.email)) {

                        errors.push(errors.push(`Email: ${user.email} in row ${userIndex + 1} is already present!`));
                        break;

                    } else {

                        console.log(vesselMap.get(user.imoNumber).id);


                        updates.push({
                            updateOne: {
                                filter: { civilIdOrPassport: user.civilIdOrPassport },
                                update: {
                                    $set: {
                                        firstName: user.firstName,
                                        lastName: user.lastName,
                                        email: user.email,
                                        vesselStatus: user.vesselStatus,
                                        currentVessel: ObjectId(vesselMap.get(user.imoNumber).id),
                                    },
                                },
                                upsert: true,
                            },
                        });

                    }

                } else {

                    if (existingEmailsInDB.includes(user.email)) {

                        errors.push(errors.push(`Email: ${user.email} in row ${userIndex + 1} is already present!`));
                        break;

                    } else {

                        inserts.push({
                            civilIdOrPassport: user.civilIdOrPassport,
                            firstName: user.firstName,
                            lastName: user.lastName,
                            email: user.email,
                            vesselStatus: user.vesselStatus,
                            currentVessel: ObjectId(vesselMap.get(user.imoNumber).id),
                            password: await CryptoHelper.hash(process.env.USER_DUMMY_PASSWORD, 10),
                        });

                    }
                }
                userIndex++;
            };

            if (errors.length > 0) {

                const createImportLog = await ImportLog.create({
                    subscriber: subscriberId,
                    uploadedBy: userId,
                    fileName: newFileName,
                    filePath: saveCSV,
                    importStatus: "FAILED",
                    description: `${errors[0]}`
                })

                if (!createImportLog) throw CustomError(ErrorName.FAILED, 'Failed to create import log');


                throw CustomError(
                    ErrorName.VALIDATION_ERROR,
                    `${errors[0]}`
                );

            }

            let bulkInsertUsers;
            let bulkUpdateUsers;

            let insertedUsers;
            let updatedUsers;


            const saveEmployees = await DbTransactionHelper.performDbTransaction(async session => {

                bulkInsertUsers = await User.insertMany(inserts, { session: session });

                insertedUsers = await User.find({ email: { $in: inserts.map(u => u.email) } }).session(session);

                bulkUpdateUsers = await User.bulkWrite(updates, { session: session });
                const upIds = bulkUpdateUsers.result.upserted;
                const updatedIds = upIds.map(item => item._id);
                updatedUsers = await User.find({ _id: { $in: updatedIds } }).session(session);

                const designationMap = new Map(
                    existingDesignations.map(designation => [
                        designation.name,
                        { id: designation._id }
                    ])
                );

                const bulkId = uuidv4();
                const allUpdatedUsers = [...insertedUsers, ...updatedUsers];

                if (allUpdatedUsers.length > 0) {

                    const userVesselsInsert = allUpdatedUsers.map(user => {

                        const originalUserData = users.find(u => u.civilIdOrPassport === user.civilIdOrPassport);
                        return {
                            updateOne: {
                                filter: { user: user },
                                update: {
                                    $set: {
                                        user: user,
                                        vessel: vesselMap.get(originalUserData.imoNumber).id,
                                        isActive: true,
                                    }
                                },
                                upsert: true
                            }
                        };

                    })


                    await UserVessel.bulkWrite(userVesselsInsert, { session });


                    const employeesToInsert = allUpdatedUsers.map(user => {
                        const originalUserData = users.find(u => u.civilIdOrPassport === user.civilIdOrPassport);
                        // invitationList.push({
                        //     userData: user
                        // });
                        return {
                            updateOne: {
                                filter: { user: user },
                                update: {
                                    $set: {
                                        user: user,
                                        subscriber: subscriberId,
                                        empDesignation: designationMap.get(originalUserData.designation).id,
                                        bulkId: bulkId,
                                        regType: 2
                                    }
                                },
                                upsert: true
                            }
                        };
                    });

                    await Employee.bulkWrite(employeesToInsert, { session });

                    const newEmployees = await Employee.find({ UID: { $exists: false } }).session(session).lean();

                    const uidUpdates = await Promise.all(newEmployees.map(async (employee) => {
                        const UID = await EmployeeHelper.generateEmployeeUID({ subscriberId, session });
                        return {
                            updateOne: {
                                filter: { _id: employee._id },
                                update: { UID },
                                upsert: false
                            }
                        };
                    }));

                    await Employee.bulkWrite(uidUpdates, { session });

                } else {

                    const createImportLog = await ImportLog.create({
                        subscriber: subscriberId,
                        uploadedBy: userId,
                        fileName: newFileName,
                        filePath: saveCSV,
                        importStatus: "FAILED",
                        description: `No new data created/updated`
                    })

                    if (!createImportLog) throw CustomError(ErrorName.FAILED, 'Failed to create import log');

                    throw CustomError(
                        ErrorName.VALIDATION_ERROR,
                        `No new data created/updated`
                    );
                }


            });


            const createImportLog = await ImportLog.create({
                subscriber: subscriberId,
                uploadedBy: userId,
                fileName: newFileName,
                filePath: saveCSV,
                importStatus: "SUCCESS",
                description: `New data(s) created/updated`
            })

            if (!createImportLog) throw CustomError(ErrorName.FAILED, 'Failed to create import log');

            return {
                count: insertedUsers.length + updatedUsers.length,
            };

        } catch (error) {
            throw CustomError(ErrorName.FAILED, `${error.message}`);
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

        if (!input.empDesignation ||
            !input.user.firstName ||
            !input.user.email ||
            !input.user.civilIdOrPassport ||
            !input.user.currentVessel ||
            !input.user.vesselStatus ||
            typeof input.user.isRegistered !== 'boolean') throw CustomError(ErrorName.ARGUMENTS_REQUIRED);

        const existingUser = await User.findOne({ email: input.user.email });


        if (existingUser) throw CustomError(ErrorName.USER_ALREADY_EXIST);

        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

        const notificationList = [];
        const courseInvitationList = [];
        const invitationList = [];
        let savedBatch;

        const savedEmployees = await DbTransactionHelper.performDbTransaction(async session => {

            const savedEmployees = [];

            input.user.password = input.user.password ? await CryptoHelper.hash(input.user.password, 10) : await CryptoHelper.hash(process.env.USER_DUMMY_PASSWORD, 10);

            const existingDesignation = await Designation.findById(input.empDesignation);
            if (!existingDesignation) throw new CustomError(ErrorName.INVALID_DESIGNATION);

            let userRole = Role.LEARNER;

            const savedUser = await User.create({
                subscriber: subscriberId,
                ...input.user,
                role: userRole,
                isRegistered: input.user.isRegistered,
                UID: await EmployeeHelper.generateUserUID({ session })
            })

            if (!savedUser) throw CustomError(ErrorName.FAILED);

            let employeeUpdate = {
                subscriber: subscriberId,
                user: savedUser,
                branch: input.branch,
                organization: input.organization,
                empDesignation: input.empDesignation,
                designation: existingDesignation.name
            };

            const savedEmployee = await Employee.create({ ...employeeUpdate, UID: await EmployeeHelper.generateEmployeeUID({ subscriberId, session }) });

            if (!savedEmployee) throw CustomError(ErrorName.FAILED);

            let userVesselUpdate = {
                user: savedUser,
                vessel: input.user.currentVessel,
                vesselStatus: input.user.vesselStatus
            }

            const savedUserVessel = await UserVessel.create(userVesselUpdate);

            if (!savedUserVessel) throw CustomError(ErrorName.FAILED);

            invitationList.push({
                userData: savedUser
            });

            savedEmployees.push({ ...savedEmployee, user: savedUser });

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
            message: "User created successfully",
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
};

const emails = new Set();
async function validateUserRow(row, { empIds, emails, designationNames, imoNumbers, vesselStatus }, rowIndex) {

    const errors = [];

    if (!row["FirstName"]) errors.push(`First Name is missing in row ${rowIndex + 1}`);

    if (!row["Email"]) errors.push(`Email is missing in row ${rowIndex + 1}`);
    else if (emails.has(row["Email"])) {
        errors.push(`Duplicate Email found in row ${rowIndex + 1} as ${row["Email"]}`);
    } else {
        emails.add(row["Email"]);
    }

    if (!row["EmployeeID"]) errors.push(`Employee ID is missing in row ${rowIndex + 1}`);
    else if (empIds.has(row["EmployeeID"])) {
        errors.push(`Duplicate Email found in row ${rowIndex + 1} as ${row["EmployeeID"]}`);
    } else {
        empIds.add(row["EmployeeID"]);
    }

    if (!row["EmployeeID"]) errors.push(`EmployeeID is missing in row ${rowIndex + 1}`);

    if (!row["Designation"]) errors.push(`Designation is missing in row ${rowIndex + 1}`);
    if (!designationNames.includes(row["Designation"])) errors.push(`Invalid Designation in row ${rowIndex + 1} as ${row["Designation"]}`);

    if (!row["VesselIMONumber"]) errors.push(`IMO Number is missing in row ${rowIndex + 1}`);
    else if (!imoNumbers.includes(row["VesselIMONumber"])) errors.push(`Invalid IMO Number in row ${rowIndex + 1} as ${row["VesselIMONumber"]}`);

    if (!row["Status"]) errors.push(`Status is missing in row ${rowIndex + 1}`);
    else if (!vesselStatus.includes(row["Status"])) errors.push(`Invalid Status in row ${rowIndex + 1} as ${row["Status"]}`);

    return errors;
}

function mapCSVRowToUser(row) {
    const mandatoryFields = [
        "FirstName",
        "Email",
        "Designation",
        "EmployeeID",
        "VesselIMONumber",
        "Status"
    ];

    Object.keys(row).forEach(key => {
        if (!mandatoryFields.includes(key)) {
            const fieldName = key;
            let fieldValue = row[key];
        }
    });

    const result = {
        firstName: row["FirstName"],
        lastName: row["LastName"] ?? "",
        email: row["Email"],
        designation: row["Designation"],
        civilIdOrPassport: row["EmployeeID"],
        imoNumber: row["VesselIMONumber"],
        vesselStatus: row["Status"],
        imoNumber: row["VesselIMONumber"],
    };

    return result;
}
