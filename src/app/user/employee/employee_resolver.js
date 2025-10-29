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
    SqliteEmailHelper,
    dummyPassword,
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
    sendNodeEmailBulk,
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
const { LearningPlan } = require("../../learning-plan/learning_plan_model");
const { Notification } = require("../../notifications/notification_model");

const NotificationType = require("../../notifications/notification_type.json");
const NotificationHelper = require("../../notifications/notification_helper");
const notificationiconEnum = require("../../notifications/notification_icon.json");
const { roleUpdateNotifyLearner, roleUpdateNotifyAdmin } = require("../../email-template/roleUpdate");
const { Unregistered_Status } = require("../../email-template/Unregistered_status");
const { registered_status, registered_statusforAdmin } = require("../../email-template/Registered_Status");
const { sendNotifications } = require("../../../util/firebase_helper");
const Roles = require("../../../util/role.json");
const { sendWelcomeEmailsToLearner, sendEmailToLearner } = require("../../email-template/sendWelcomeEmail");
const { filterLearningPlans } = require("../employee/employee_helper");
const createNewEmployeeEmailTemplate = require("../../email-template/createEmployee");
const mongoose = require("mongoose");
const { DynamicData } = require("./employee_dynamicData_model");
const { last, get, filter } = require("lodash");
const { DeleteRequestHistory } = require("./delete_request_history_model");
const aws_helper = require("../../../util/aws_helper");
const { DeleteRequestApproved } = require("../../email-template/DeleteRequestApproved");
const { DeleteRequestRejected } = require("../../email-template/DeleteRequestRejected");
const signupRequestModel = require("../../signup-request/signup-request-model");
const { generateFileNameTimestamp } = require("../../reports/reports_helper");
const LearningPlanStatus = require('../../learning-plan/enumFields/learning_plan_status.json');
const LearningPlanAssignment = require('../../learning-plan/assignedLearner/assignedLearnerModel');
const { OverallTrainingProgress } = require('../../training-registrations/overall-course-progress/overall_progress_model');
const targetAudienceEnum = require('../../learning-plan/enumFields/targetAudienceEnum.json');
const audienceSelectionEnum = require('../../learning-plan/enumFields/audienceSelectionEnum.json');
const groupTypes = require('../../../util/group_types.json');
const { enrollUsers } = require('./employee_helper')
const operationTypeRoleEnum = require('./operationType.json');
const { processFilters } = require('./user_exportCSV_filter');

// const { setupQueues, publishToQueue, publishToExchange, publishMessagesOneByOne } = require('./rabbitMq_service');
// const { EXCHANGES } = require('../../../util/rabbitmq_helper');
const { ImportJob } = require("./import_job_model");

const { decrypt, encrypt } = require("../../../util/encryption_helper");
const { client, indexDocumenttoElasticSearch, getDocumentfromElasticSearch, updateByQueryToElasticSearch, searchEmployeesFromElastic } = require('../../../util/elastic_helper');
const { toUpperCaseFirstLetter } = require("../../../util/string_helper");
// const csvImportQueue = require("../../queues/csv_import_queue");
// const { JOB_NAMES } = require("../../queues/queue.enum");

const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');

const sqsClient = new SQSClient({
    region: process.env.SQS_AWS_REGION,
    credentials: {
        accessKeyId: process.env.SQS_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.SQS_AWS_SECRET_ACCESS_KEY,
    },
});

const CSV_IMPORT_QUEUE_URL = process.env.SQS_CSV_IMPORT_QUEUE_URL;

async function fetchVesselUsersByStatus(vesselStatus, vesselType, vesselObjectId) {
    const userVesselFilter = {
        isActive: true,
    };
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
async function autoenrollRoleBasedLP(learningPlans, userIdsToSend, roles, operationType, userInfo, context) {
    const filterLearningPlans = await Promise.allSettled(learningPlans.map(async (plan) => {
        const usersToEnroll = [];
        if (plan?.targetAudience === targetAudienceEnum?.GROUP_BASED && plan?.audienceSelection === audienceSelectionEnum?.ALL_EMPLOYEES) {
            const group = plan.groupIDs.find(group => group.groupType === groupTypes.role);
            if (operationType === operationTypeRoleEnum.ASSIGN_ROLE_AS_ADMIN) {
                if (group && Array.isArray(group.groupIDs) && group.groupIDs.some(roleId => roles.includes(roleId.toString()))) {
                    const assignments = userIdsToSend.map(userId => ({
                        learningPlanId: new mongoose.Types.ObjectId(plan?._id),
                        assignedLearnerId: new mongoose.Types.ObjectId(userId),
                        isMannuallyAdded: false,
                        createdBy: userInfo?._id,
                        updatedBy: userInfo?._id
                    }));
                    if (assignments?.length > 0) {
                        const dataenrolled = await LearningPlanAssignment.insertMany(assignments, { ordered: false });
                    }
                    usersToEnroll.push(...userIdsToSend);
                }
            }
            if (operationType === operationTypeRoleEnum.REMOVE_AS_ADMIN) {
                if (group && Array.isArray(group.groupIDs) && group.groupIDs.some(roleId => roles.includes(roleId.toString()))) {
                    const findLearnerIds = await LearningPlanAssignment.find({ learningPlanId: new mongoose.Types.ObjectId(plan?._id), assignedLearnerId: { $in: userIdsToSend } });
                    if (findLearnerIds?.length > 0) {
                        const dataenrolled = await LearningPlanAssignment.deleteMany({ learningPlanId: new mongoose.Types.ObjectId(plan?._id), assignedLearnerId: { $in: userIdsToSend } });
                        const updateResult = await OverallTrainingProgress.updateMany(
                            {
                                user: { $in: userIdsToSend.map(id => new mongoose.Types.ObjectId(id)) },
                                learningPlan: { $elemMatch: { $eq: new mongoose.Types.ObjectId(plan?._id) } }
                            },
                            {
                                $pull: { learningPlan: new mongoose.Types.ObjectId(plan?._id) }
                            }
                        );
                    }
                    //  usersToEnroll.push(...userIdsToSend);
                }
            }

        }
        if (usersToEnroll?.length > 0) {
            const enrollData = {
                trainings: plan?.selectCourses,
                users: usersToEnroll,
                type: "ENROLL",
                learningPlan: plan?._id,
            };
            const datagoingtoenrollUsers = await enrollUsers([enrollData], context);
            return true;
        }
        return false;
    }));

}
function formatDateWithSuffix(date) {
    /*  
     const day = date.getDate();
     const suffix = (day % 10 === 1 && day !== 11) ? 'st' :
         (day % 10 === 2 && day !== 12) ? 'nd' :
             (day % 10 === 3 && day !== 13) ? 'rd' : 'th';
 
     const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
     const month = monthNames[date.getMonth()];
     const year = date.getFullYear();
 
     return `${day}${suffix} ${month} ${year}`; 
     */

    if (date) {
        const formattedDate = new Date(date);
        return formattedDate.toLocaleString('en-GB', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZone: 'UTC',
        });
    }

    return null;
}

function mapElasticToOldAPI(elasticResults) {
    return {
        totalCount: elasticResults.total,
        totalEmployees: elasticResults.total,
        employees: elasticResults.employees.map(async(emp) => {
            const avatarUrl = emp.avatar ? await AwsHelper.fetchFile(emp.avatar) : null;
            return {
                user: {
                    _id: emp.userId || null,
                    firstName: emp.firstName || null,
                    lastName: emp.lastName || null,
                    civilIdOrPassport: emp.civilIdOrPassport || null,
                    email: emp.email || null,
                    role: emp.role || null,
                    lastLoginAt: new Date(emp.lastLoginAt).getTime() || null,
                    isRegistered: emp.isRegistered || false,
                    vesselStatus: emp.vesselStatus || null,
                    subRoles: emp.subRoles || [],
                    isResetPasswordDialog: emp.isResetPasswordDialog || false,
                    avatar: avatarUrl|| null,
                    __typename: "User",
                },
                empDesignation: emp.empDesignation
                    ? {
                        _id: emp.empDesignation,
                        name: emp.designation || null,
                        __typename: "Designation",
                    }
                    : null,
                userVessels: emp.vesselName
                    ? {
                        _id: emp.vesselId || null,
                        vesselStatus: emp.vesselStatus || null,
                        vesselDetails: {
                            _id: emp.vesselId || null,
                            name: emp.vesselName || null,
                            isActive: emp.vesselIsActive || false,
                            typeOfVesselDetails: {
                                _id: emp.tyepOfVesselId || null,  // note typo? "tyepOfVesselId"
                                name: emp.typeOfVesselName || null,
                                __typename: "TypeOfVesselDetails",
                            },
                            __typename: "VesselDetails",
                        },
                        __typename: "userVessels",
                    }
                    : null,
                __typename: "Employee",
            };
        }),
        __typename: "EmployeeList",
    };
}


module.exports.queries = {
    getDeleteAndSignUpRequestCounts: async (_, context) => {
        const { role, userPermissions, subscriberId } = AuthUser(context);
        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [
                    Permission.GET_EMPLOYEES,
                ],
                requiredAll: false,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }
        const deleteRequestCount = await User.countDocuments({ deleteRequest: true });
        const signUpRequestCount = await signupRequestModel.countDocuments();
        return {
            deleteRequestCount,
            signUpRequestCount,
        };
    },
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

        const groupMembers = await GroupMember.find({ group: group, isDeleted: { $ne: true } }).select("member");
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
            const signedUrl = await AwsHelper.fetchFile("public/bulk_import_csv.csv");
            return {
                success: true,
                message: "File fetched successfully",
                url: signedUrl,
            };
        } catch (error) {
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
    getEmployees: async ({ pageInput, filterInput, sortInput }, context) => {
        const {
            role,
            userPermissions,
            subscriberId,
            primaryRole,
            employeeId,
            isOrganizationManager,
            managingOrganization,
        } = AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                primaryRole: primaryRole,
                requiredPermission: [
                    Permission.GET_EMPLOYEES,
                ],
                requiredAll: false,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }
        try {
            const skip = pageInput?.skip ?? 0,
                limit = pageInput?.limit ?? 50;

            let startDate, endDate;
            let filterConditions = {
                // subscriber: subscriberId,
            };

            const sortingStage = [];
            const sortOrder = sortInput?.sortOrder ?? 1;

            const sortOrderMap = {
                "1": "asc",
                "-1": "desc",
            };

            const fieldMapping = {
                "FIRST_NAME": "user.firstName",
                "DESIGNATION": "empDesignation.name",
                "STATUS": "user.vesselStatus",
                "USER_ROLE": "user.role",
                "LAST_SEEN": "user.lastLoginAt",
                "VESSEL_TYPE": "userVessels.vesselDetails.typeOfVesselDetails.name",
            };

            const esFieldMapping = {
                "FIRST_NAME": "firstName.keyword",
                "DESIGNATION": "designation.keyword",
                "STATUS": "vesselStatus.keyword",
                "USER_ROLE": "role.keyword",
                "LAST_SEEN": "lastLoginAt",
                "VESSEL_TYPE": "typeOfVesselName.keyword",
            };

            const field = sortInput?.field ?? "FIRST_NAME";
            const fieldPath = fieldMapping[field];
            const sortElasticField = esFieldMapping[field] || "user.firstName.keyword";
            const sortElasticOrder = sortOrderMap[String(sortInput?.sortOrder)] || "asc";

            if (field === "FIRST_NAME" || field === "DESIGNATION" || field === "VESSEL_TYPE") {

                sortingStage.push({
                    $addFields: {
                        [`lowercase${field}`]: { $toLower: `$${fieldPath}` }
                    }
                });
                sortingStage.push({
                    $sort: {
                        [`lowercase${field}`]: sortOrder
                    }
                });
            } else if (fieldPath) {
                sortingStage.push({
                    $sort: {
                        [fieldPath]: sortOrder
                    }
                });
            } else {

                sortingStage.push({
                    $addFields: {
                        lowercaseFirstname: { $toLower: "$user.firstName" }
                    }
                });
                sortingStage.push({
                    $sort: {
                        lowercaseFirstname: 1
                    }
                });
            }


            if (filterInput?.lastSeen) {
                const today = Moment();
                switch (filterInput.lastSeen) {
                    case "TODAY":
                        startDate = Moment().startOf("day").toDate();
                        endDate = Moment().endOf("day").toDate();
                        break;
                    case "YESTERDAY":
                        startDate = Moment().subtract(1, "day").startOf("day").toDate();
                        endDate = Moment().subtract(1, "day").endOf("day").toDate();
                        break;
                    case "LAST_7_DAYS":
                        startDate = Moment().subtract(7, "days").startOf("day").toDate();
                        endDate = Moment().endOf("day").toDate();
                        break;
                    case "LAST_30_DAYS":
                        startDate = Moment().subtract(30, "days").startOf("day").toDate();
                        endDate = Moment().endOf("day").toDate();
                        break;
                    case "LAST_3_MONTHS":
                        startDate = Moment().subtract(3, "months").startOf("day").toDate();
                        endDate = Moment().endOf("day").toDate();
                        break;
                    case "LAST_6_MONTHS":
                        startDate = Moment().subtract(6, "months").startOf("day").toDate();
                        endDate = Moment().endOf("day").toDate();
                        break;
                    case "LAST_YEAR":
                        startDate = Moment().subtract(1, "year").startOf("day").toDate();
                        endDate = Moment().endOf("day").toDate();
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
            const fetchResult = async pipeline => {
                const empData = await Employee.aggregate(pipeline);
                const empCount = empData.length;
                const result = await Employee.aggregatePaginate(Employee.aggregate(pipeline), {
                    offset: skip,
                    limit,
                    customLabels: {
                        docs: "employees",
                        totalDocs: "totalCount",
                        offset: "skip",
                    },
                    pagination: limit !== 0,
                });

                return {
                    ...result,
                    totalCount: empCount ?? 0,
                }
            };

            let sanitizedSearch;
            if (filterInput?.search) {
                sanitizedSearch = filterInput.search;
            }
            // const results = await fetchResult([
            //     {
            //         $match: filterConditions,
            //     },
            //     {
            //         $lookup: {
            //             from: "designations",
            //             localField: "empDesignation",
            //             foreignField: "_id",
            //             as: "empDesignation",
            //         },
            //     },
            //     {
            //         $unwind: {
            //             path: "$empDesignation",
            //             preserveNullAndEmptyArrays: true
            //         },
            //     },
            //     {
            //         $lookup: {
            //             from: "users",
            //             localField: "user",
            //             foreignField: "_id",
            //             as: "user",
            //         },
            //     },
            //     {
            //         $unwind: "$user",
            //     },
            //     {
            //         $match: {
            //             "user.isDeleted": { $ne: true },
            //             "user.role": { $in: ["LEARNER", "ADMIN"] },
            //             "user.isSignupAdminAprroved": { $ne: false },
            //             ...(filterInput?.vesselStatus?.length > 0 && {
            //                 "user.vesselStatus": { $in: filterInput.vesselStatus },
            //             }),
            //         },
            //     },
            //     ...(filterInput?.search
            //         ? [
            //             {
            //                 $match: {
            //                     $or: [
            //                         {
            //                             $expr: {
            //                                 $regexMatch: {
            //                                     input: { $concat: [{ $ifNull: ["$user.firstName", ""] }, " ", { $ifNull: ["$user.lastName", ""] }] },
            //                                     regex: ".*" + sanitizedSearch + ".*",
            //                                     options: "i",
            //                                 },
            //                             },
            //                         },
            //                         {
            //                             "user.email": {
            //                                 $regex: ".*" + sanitizedSearch + ".*",
            //                                 $options: "i",
            //                             },
            //                         },
            //                         {
            //                             "user.civilIdOrPassport": {
            //                                 $regex: ".*" + sanitizedSearch + ".*",
            //                                 $options: "i",
            //                             },
            //                         }
            //                     ],
            //                 },
            //             },
            //         ]
            //         : []),
            //     ...(filterInput?.isRegistered !== undefined
            //         ? [
            //             {
            //                 $match: {
            //                     "user.isRegistered": filterInput.isRegistered,
            //                 },
            //             },
            //         ]
            //         : []),
            //     ...(filterInput?.country !== undefined
            //         ? [
            //             {
            //                 $match: {
            //                     "user.country": { $in: filterInput?.country },
            //                 },
            //             },
            //         ]
            //         : []),
            //     ...(filterInput?.lastSeen
            //         ? [
            //             {
            //                 $match: {
            //                     "user.lastLoginAt": { $gte: startDate, $lte: endDate },
            //                     "user.isResetPasswordDialog": { $ne: false },
            //                 },
            //             },
            //         ]
            //         : []),
            //     {
            //         $lookup: {
            //             from: "subroles",
            //             localField: "user.subRoles",
            //             foreignField: "_id",
            //             as: "user.subRoles",
            //         }
            //     },

            //     {
            //         $lookup: {
            //             from: "uservessels",
            //             localField: "user._id",
            //             foreignField: "user",
            //             as: "userVessels",
            //             pipeline: [
            //                 {
            //                     $match: {
            //                         isActive: true,
            //                     },
            //                 },
            //                 {
            //                     $lookup: {
            //                         from: "vessels",
            //                         localField: "vessel",
            //                         foreignField: "_id",
            //                         as: "vesselDetails",
            //                         pipeline: [
            //                             {
            //                                 $match: {
            //                                     name: { $exists: true, $ne: null },
            //                                 },
            //                             },
            //                             {
            //                                 $project: {
            //                                     _id: 1,
            //                                     name: 1,
            //                                     typeOfVessel: 1,
            //                                     imoNumber: 1,
            //                                     isActive: 1,

            //                                 },
            //                             },
            //                             {
            //                                 $lookup: {
            //                                     from: "vesseltypes",
            //                                     localField: "typeOfVessel",
            //                                     foreignField: "_id",
            //                                     as: "typeOfVesselDetails",
            //                                     pipeline: [
            //                                         {
            //                                             $match: {
            //                                                 _id: { $ne: null },
            //                                             },
            //                                         },
            //                                         {
            //                                             $project: {
            //                                                 _id: 1,
            //                                                 name: 1,
            //                                                 isActive: 1,

            //                                             },
            //                                         },
            //                                     ],
            //                                 },
            //                             },
            //                             {
            //                                 $unwind: {
            //                                     path: "$typeOfVesselDetails",
            //                                     preserveNullAndEmptyArrays: true,
            //                                 },
            //                             },
            //                         ],
            //                     },
            //                 },
            //                 {
            //                     $unwind: {
            //                         path: "$vesselDetails",
            //                         preserveNullAndEmptyArrays: true,
            //                     },
            //                 },
            //                 {
            //                     $sort: {
            //                         updatedAt: -1,
            //                     },
            //                 },
            //                 {
            //                     $limit: 1,
            //                 },
            //             ],
            //         },
            //     },
            //     {
            //         $unwind: {
            //             path: "$userVessels",
            //             preserveNullAndEmptyArrays: true,
            //         },
            //     },
            //     {
            //         $addFields: {
            //             latestUpdatedAt: {
            //                 $max: ["$updatedAt", "$user.updatedAt"],
            //             },
            //         },
            //     },
            //     {
            //         $sort: {
            //             latestUpdatedAt: -1,
            //         },
            //     },
            //     {
            //         $sort: {
            //             "user.firstName": 1
            //         }
            //     },
            //     ...(filterInput?.vesselName?.length > 0
            //         ? [
            //             {
            //                 $match: {
            //                     "userVessels.vesselDetails._id": {
            //                         $in: filterInput.vesselName.map(
            //                             id => ObjectId(id)
            //                         ),
            //                     },
            //                 },
            //             },
            //         ]
            //         : []),
            //     ...(filterInput?.vesselType?.length > 0
            //         ? [
            //             {
            //                 $match: {
            //                     "userVessels.vesselDetails.typeOfVesselDetails._id": {
            //                         $in: filterInput.vesselType.map(id => ObjectId(id)),
            //                     },
            //                 },
            //             },
            //         ]
            //         : []),
            //     ...(filterInput?.search
            //         ? [
            //             {
            //                 $match: {
            //                     $or: [
            //                         {
            //                             $expr: {
            //                                 $regexMatch: {
            //                                     input: { $concat: [{ $ifNull: ["$user.firstName", ""] }, " ", { $ifNull: ["$user.lastName", ""] }] },
            //                                     regex: ".*" + sanitizedSearch + ".*",
            //                                     options: "i",
            //                                 },
            //                             },
            //                         },
            //                         {
            //                             "user.email": {
            //                                 $regex: ".*" + sanitizedSearch + ".*",
            //                                 $options: "i",
            //                             },
            //                         },
            //                         {
            //                             "user.civilIdOrPassport": {
            //                                 $regex: ".*" + sanitizedSearch + ".*",
            //                                 $options: "i",
            //                             },
            //                         },
            //                         /* {
            //                             "user.companyEmail": {
            //                                 $regex: ".*" + sanitizedSearch + ".*",
            //                                 $options: "i",
            //                             },
            //                         },
            //                         {
            //                             "user.phone.number": {
            //                                 $regex: ".*" + sanitizedSearch + ".*",
            //                                 $options: "i",
            //                             },
            //                         },
            //                         {
            //                             employeeNo: {
            //                                 $regex: ".*" + sanitizedSearch + ".*",
            //                                 $options: "i",
            //                             },
            //                         },
            //                         {
            //                             "userVessels.vesselDetails.name": {
            //                                 $regex: ".*" + sanitizedSearch + ".*",
            //                                 $options: "i",
            //                             },
            //                         },
            //                         {
            //                             "empDesignation.name": {
            //                                 $regex: ".*" + sanitizedSearch + ".*",
            //                                 $options: "i",
            //                             },
            //                         }, */
            //                     ],
            //                 },
            //             },
            //         ]
            //         : []),
            //     ...(filterInput?.role?.length > 0
            //         ? [
            //             // commented out as Every Admin is Leaner, Bug by astitva 13/5/25
            //             //  {
            //             //     $match:
            //             //         filterInput.role.includes("LEARNER") &&
            //             //             filterInput.role.includes("ADMIN")
            //             //             ? {}
            //             //             : filterInput.role.includes("LEARNER")
            //             //                 ? {
            //             //                     "user.role": "LEARNER",
            //             //                     "user.subRoles.name": { $ne: "ADMIN" },
            //             //                 }
            //             //                 : filterInput.role.includes("ADMIN")
            //             //                     ? { "user.subRoles.name": "ADMIN" }
            //             //                     : { "user.role": { $in: filterInput.role } },
            //             // },
            //             {
            //                 $match:
            //                     filterInput.role.includes("LEARNER")
            //                         ? {}
            //                         : filterInput.role.includes("ADMIN")
            //                             ? { "user.subRoles.name": "ADMIN" }
            //                             : { "user.role": { $in: filterInput.role } },
            //             },
            //         ]
            //         : []),
            //     ...(filterInput?.isRegistered !== undefined
            //         ? [
            //             {
            //                 $match: {
            //                     "user.isRegistered": filterInput.isRegistered,
            //                 },
            //             },
            //         ]
            //         : []),
            //     /*
            // ...(filterInput?.lastSeen
            //     ? [
            //         {
            //             $match: {
            //                 "user.lastLoginAt": { $gte: startDate, $lte: endDate },
            //                 "user.isResetPasswordDialog": { $ne: false },
            //             },
            //         },
            //     ]
            //     : []),
            //     */
            //     ...(filterInput?.showInvited ? [
            //         { $match: { "user.isResetPasswordDialog": !filterInput.showInvited } }
            //     ] : []),
            //     ...sortingStage,
            // ]);
            // if (results.employees?.length > 0) {
            //     results.employees = results.employees.map(employee => {

            //         if (employee.user) {
            //             if (employee.user.firstName) {
            //                 employee.user.firstName = decrypt(employee.user.firstName);
            //             }

            //             if (employee.user.lastName) {
            //                 employee.user.lastName = decrypt(employee.user.lastName);
            //             }

            //             if (employee.user.email) {
            //                 employee.user.email = decrypt(employee.user.email);
            //             }
            //         }

            //         return employee;
            //     });
            // }

            const filterClauses = [];
            if (filterInput?.empDesignation) {
                filterClauses.push({
                    term: { empDesignation: filterInput.empDesignation?.[0] } // multiple values using 'terms'
                });
            }
            // const getUsers = await client.search({
            //     index: "users",
            //     from: parseInt(skip, 10),
            //     size: parseInt(limit, 10),
            //     body: {
            //         query: {
            //             bool: {
            //                 must: filterInput?.search?.trim()
            //                     ? [
            //                         {
            //                             multi_match: {
            //                                 query: encrypt(filterInput.search),
            //                                 type: "phrase_prefix",
            //                                 fields: [
            //                                     "firstName",
            //                                     "lastName",
            //                                     "email",
            //                                     "civilIdOrPassport",
            //                                 ],
            //                             },
            //                         },
            //                     ]
            //                     : [{ match_all: {} }],
            //                 ...(filterClauses.length > 0 && { filter: filterClauses })
            //             },
            //         },
            //     },
            // });


            let subRoleAdminId = null;
            if (filterInput?.role?.includes("ADMIN")) {
                subRoleAdminId = await SubRole.findOne({
                    name: "ADMIN"
                }).select("_id").lean();
                if (subRoleAdminId) {
                    subRoleAdminId = subRoleAdminId._id;
                }
            }

            const elasticResults = await searchEmployeesFromElastic({
                indexName: "users",
                filterInput: filterInput,
                subRoleAdminId: subRoleAdminId,
                lastSeenStart: startDate,
                lastSeenEnd: endDate,
                sortField: sortElasticField,
                sortOrder: sortElasticOrder,
                skip: skip,
                limit: limit,
            });

            // console.log("Elastic Results:", elasticResults);

            if (elasticResults?.employees?.length > 0) {
                elasticResults.employees = elasticResults?.employees.map(employee => {

                    if (employee) {
                        if (employee?.firstName) {
                            employee.firstName = decrypt(employee?.firstName);
                        }

                        if (employee?.lastName) {
                            employee.lastName = decrypt(employee?.lastName);
                        }

                        if (employee?.email) {
                            employee.email = decrypt(employee?.email);
                        }

                        if (employee?.civilIdOrPassport) {
                            employee.civilIdOrPassport = decrypt(employee?.civilIdOrPassport);
                        }
                    }

                    return employee;
                });
            }

            const formattedResponse = mapElasticToOldAPI(elasticResults);

            // console.log("Formatted Response:", formattedResponse);

            return {
                employees: formattedResponse?.employees,
                totalCount: formattedResponse?.employees?.length ?? 0,
                totalEmployees: formattedResponse?.totalCount ?? 0
            }
            /*
        const optimizedPipeline = [
            // Initial match on subscriber
            { $match: filterConditions },

            // Lookup users with early filtering
            {
                $lookup: {
                    from: "users",
                    let: { userId: "$user" },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$userId"] }, isDeleted: false, isSignupAdminAprroved: { $ne: false }, role: { $in: ["LEARNER", "ADMIN"] } } },
                        { $project: { _id: 1, firstName: 1, lastName: 1, email: 1, role: 1, lastLoginAt: 1, vesselStatus: 1, subRoles: 1, isRegistered: 1, civilIdOrPassport: 1, directSignup: 1, isSignupAdminAprroved: 1, isResetPasswordDialog: 1 , currentVessel:1} }
                    ],
                    as: "user"
                }
            },
            { $unwind: "$user" },

            ...(filterInput?.search
                ? [
                    {
                        $match: {
                            $or: [
                                {
                                    $expr: {
                                        $regexMatch: {
                                            input: { $concat: [{ $ifNull: ["$user.firstName", ""] }, " ", { $ifNull: ["$user.lastName", ""] }] },
                                            regex: ".*" + sanitizedSearch + ".*",
                                            options: "i",
                                        },
                                    },
                                },
                                {
                                    "user.email": {
                                        $regex: ".*" + sanitizedSearch + ".*",
                                        $options: "i",
                                    },
                                },
                                {
                                    "user.civilIdOrPassport": {
                                        $regex: ".*" + sanitizedSearch + ".*",
                                        $options: "i",
                                    },
                                }
                            ],
                        },
                    },
                ]
                : []),
                { 
                    $unwind: {
                        path: "$user.currentVessel", 
                        preserveNullAndEmptyArrays: true
                    }
                },

                ...(filterInput?.vesselName?.length > 0 ? [
                    { 
                        $match: { 
                            "user.currentVessel": { 
                                $in: filterInput.vesselName 
                            } 
                        } 
                    }
                ] : []),
                { $unwind: "$user.currentVessel" , preserveNullAndEmptyArrays: true},
            ...(filterInput?.vesselStatus?.length > 0 ? [
                { $match: { "user.vesselStatus": { $in: filterInput.vesselStatus } } }
            ] : []),

            ...(filterInput?.isRegistered !== undefined ? [
                { $match: { "user.isRegistered": filterInput.isRegistered } }
            ] : []),

            ...(filterInput?.lastSeen ? [
                { $match: { "user.lastLoginAt": { $gte: startDate, $lte: endDate } } }
            ] : []),

            ...(filterInput?.showInvited ? [
                { $match: { "user.isResetPasswordDialog": !filterInput.showInvited } }
            ] : []),
            {
                $lookup: {
                    from: "designations",
                    localField: "empDesignation",
                    foreignField: "_id",
                    as: "empDesignation",
                    pipeline: [{ $project: { name: 1, _id: 1 } }]
                }
            },
            { $unwind: "$empDesignation" },

            // Handle search with text index

            // Lookup subroles
            {
                $lookup: {
                    from: "subroles",
                    localField: "user.subRoles",
                    foreignField: "_id",
                    as: "user.subRoles"
                }
            },
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


            // Lookup user vessels
            {
                $lookup: {
                    from: "uservessels",
                    localField: "user._id",
                    foreignField: "user",
                    as: "userVessels",
                    pipeline: [
                        { $match: { isActive: true } },
                        {
                            $lookup: {
                                from: "vessels",
                                localField: "vessel",
                                foreignField: "_id",
                                as: "vesselDetails",
                                pipeline: [
                                    { $match: { name: { $exists: true } } },
                                    { $project: { _id: 1, name: 1, vesselStatus: 1, typeOfVessel: 1, isActive: 1 } },
                                    {
                                        $lookup: {
                                            from: "vesseltypes",
                                            localField: "typeOfVessel",
                                            foreignField: "_id",
                                            as: "typeOfVesselDetails",
                                            pipeline: [
                                                { $match: { _id: { $ne: null } } },
                                                { $project: { _id: 1, name: 1 } }
                                            ]
                                        }
                                    },
                                    { $unwind: { path: "$typeOfVesselDetails", preserveNullAndEmptyArrays: true } }
                                ]
                            }
                        },
                        { $unwind: { path: "$vesselDetails", preserveNullAndEmptyArrays: true } },
                        { $sort: { updatedAt: -1 } },
                        { $limit: 1 }
                    ]
                }
            },
            { $unwind: { path: "$userVessels", preserveNullAndEmptyArrays: true } },

            // Add latest update time
            {
                $addFields: {
                    latestUpdatedAt: { $max: ["$updatedAt", "$user.updatedAt"] }
                }
            },
            {
                $project: {
                    _id: 1,
                    user: 1,
                    empDesignation: 1,
                    userVessels: 1,
                    latestUpdatedAt: 1
                }
            },
            {
                $skip: skip
            },
            {
                $limit: limit
            },
            // Apply sorting
            ...sortingStage,

            // Pagination with facet
            // {
            //     $facet: {
            //         metadata: [
            //             { $count: "total" },
            //             { $project: { total: 1 } }
            //         ],
            //         data: [
            //             { $skip: skip },
            //             { $limit: limit },
            //             {
            //                 $project: {
            //                     _id: 1,
            //                     user: 1,
            //                     empDesignation: 1,
            //                     userVessels: 1,
            //                     latestUpdatedAt: 1
            //                 }
            //             }
            //         ]
            //     }
            // }
        ];
            */
            // Execute the aggregation
            // const resultsw = await Employee.aggregate(results);
            // // const { metadata, data } = results[0] || { metadata: [], data: [] };
            // const totalCount = resultsw?.length ? resultsw?.length : 0;

            // return {
            //     employees: resultsw,
            //     totalCount,
            //     totalEmployees: totalCount
            // };
        } catch (error) {
            throw CustomError(ErrorName.FAILED_TO_FETCH_EMPLOYESS, error.message);
        }
    },
    getDeleteRequests: async ({ pageInput, search }, context) => {

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

        try {

            const skip = pageInput?.skip ?? 0,
                limit = pageInput?.limit ?? 50;

            const sortFieldValue = pageInput?.sortField || "deleteRequestDate";
            const sortOrderValue = pageInput?.sortOrder !== undefined ? pageInput?.sortOrder : -1;

            const searchInput = search?.trim();
            const searchRegex = new RegExp(searchInput, "i");
            let searchCriteria = { deleteRequest: true };

            if (searchInput) {
                const nameParts = searchInput.split(" ").filter(Boolean);

                const fullNameSearch =
                    nameParts.length > 1
                        ? {
                            $and: [
                                { firstName: { $regex: new RegExp(`^${nameParts[0]}`, "i") } },
                                { lastName: { $regex: new RegExp(`${nameParts.slice(1).join(" ")}`, "i") } }
                            ]
                        }
                        : {};

                searchCriteria = {
                    deleteRequest: true,
                    $or: [
                        { firstName: { $regex: searchRegex } },
                        { lastName: { $regex: searchRegex } },
                        { email: { $regex: searchRegex } },
                        ...(nameParts.length > 1 ? [fullNameSearch] : [])
                    ]
                };
            }

            const sortOptions = { [sortFieldValue]: sortOrderValue };

            const result = await User.find({ deleteRequest: true, ...searchCriteria })
                .skip(skip)
                .limit(limit)
                .sort(sortOptions)
                .lean();

            if (!result) {
                return { totalCount: 0 };
            }

            const userIds = result.map(user => user._id);

            const employees = await Employee.find({ user: { $in: userIds } })
                .populate({
                    path: "empDesignation",
                    select: "name"
                })
                .lean();

            const employeeMap = new Map(
                employees.map(emp => [emp.user.toString(), emp.empDesignation?.name || null])
            );

            const finalUsers = result.map(user => ({
                ...user,
                firstName: decrypt(user.firstName) || null,
                lastName: decrypt(user.lastName) || null,
                civilIdOrPassport: decrypt(user.civilIdOrPassport) || null,
                email: decrypt(user.email) || null,
                designation: employeeMap.get(user._id.toString()) || null
            }));

            const totalCount = await User.countDocuments({ deleteRequest: true });

            return {
                data: finalUsers,
                totalCount,
            };

        } catch (error) {
            console.log(error)
            throw Error(error);
        }

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
        try {
            const emails = emailInput.email;
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            let messages = [];
            const notifications = [];
            const emailData = [];
            await Promise.all(
                emails.map(async (email) => {
                    const decryptEmail = email;
                    if (!emailRegex.test(decryptEmail)) {
                        messages.push(`Invalid Email format: ${decryptEmail}`);
                        return;
                    }

                    let currentUserData = await User.findOne({ email: encrypt(email), isDeleted: false, isRegistered: true });
                    const fieldsToUpdate = ['firstName', 'lastName', 'email'];
                    fieldsToUpdate.forEach(field => {
                        if (currentUserData[field]) {
                            currentUserData[field] = decrypt(currentUserData[field]);
                        }
                    });

                    if (!currentUserData) {
                        throw CustomError(ErrorName.FAILED_TO_SENT_WELCOME_MAIL, `One or more User are Unregistered`);
                    }

                    let html = ``;
                    if (currentUserData.isResetPasswordDialog) {
                        const htmlContent = sendWelcomeEmailsToLearner({
                            firstName: currentUserData.firstName,
                            buttonLink: `${process.env.APP_URL}/login`,
                        });
                        html = htmlContent;
                        await SendEmail({
                            receiverEmail: currentUserData?.email,
                            subject: "Registration Invitation",
                            htmlContent: html,
                        });
                    } else {
                        let generatePassword

                        if (!currentUserData.dummyPassword) {
                            generatePassword = generateRandomString(10);
                            const dummyPasswordHash = await CryptoHelper.hash(generatePassword, 10);
                            currentUserData.dummyPassword = `${dummyPasswordHash}~~~${generatePassword}`;
                            currentUserData.password = dummyPasswordHash;
                            currentUserData.firstName = encrypt(currentUserData.firstName);
                            currentUserData.lastName = encrypt(currentUserData.lastName);
                            currentUserData.email = encrypt(currentUserData.email);
                        } else {
                            const parts = currentUserData.dummyPassword.split('~~~');
                            const newDummyPassword = parts[1];
                            generatePassword = newDummyPassword;
                            currentUserData.password = await CryptoHelper.hash(newDummyPassword, 10);
                            currentUserData.firstName = encrypt(currentUserData.firstName);
                            currentUserData.lastName = encrypt(currentUserData.lastName);
                            currentUserData.email = encrypt(currentUserData.email);
                        }

                        try {
                            await currentUserData.save();
                        } catch {
                            messages.push(`Failed to create new dummy password for ${email}`);
                            return;
                        }

                        emailData.push({
                            firstName: decrypt(currentUserData.firstName),
                            email: decrypt(currentUserData.email),
                            temp_password: generatePassword
                        });

                    }

                })
            );
            SqliteEmailHelper.insertSendWelcomeEmails(emailData);

            await EmployeeHelper.sendWelcomeEmailBulk();
            /*  if (notifications.length > 0) {
                 try {
                     // await NotificationHelper.createNotification(notifications);
                 } catch (error) {
                     messages.push(`Failed to create notifications.`);
                 }
             } */
            return messages;
        } catch (error) {
            throw CustomError(ErrorName.FAILED_TO_SENT_WELCOME_MAIL, `${error}`);
        }
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
                const emailExists = await User.findOne({ email: { $regex: `^${encrypt(input.email)}$`, $options: 'i' }, isDeleted: false });
                if (emailExists) {
                    messages.push("This email Id already exists in the system with another employee.");
                }
            } else if (input.civilIdOrPassport) {
                const empNoExists = await User.findOne({ civilIdOrPassport: { $regex: `^${encrypt(input.civilIdOrPassport)}$`, $options: 'i' }, isDeleted: false });
                if (empNoExists) {
                    messages.push("Employee Id already exists");
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
    },
    getDynamicData: async ({ userId }, context) => {
        const { role, userPermissions, subscriberId, isOrganizationManager, managingOrganization } =
            AuthUser(context);
        try {
            if (!userId) {
                throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "UserId is required");
            }

            const user = await User.findOne({ _id: userId, isDeleted: false, isRegistered: true });
            if (!user) {
                throw CustomError(ErrorName.USER_NOT_FOUND, "User not found or not Registered");
            }

            const dynamicDataRecord = await DynamicData.findOne({ userId });

            if (!dynamicDataRecord) {
                return {
                    status: false,
                    message: "No dynamic data found for this user",
                    data: null,
                };
            }

            return {
                status: true,
                message: "Data fetched successfully",
                data: dynamicDataRecord,
            };
        } catch (error) {
            return {
                status: false,
                message: error.message,
                data: null,
            };
        }
    },
    getDeleteHistory: async ({ pageInput, search, filterInput }, context) => {

        const { role, userPermissions, subscriberId, userInfo } = AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredAll: false,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        try {

            const skip = pageInput?.skip ?? 0,
                limit = pageInput?.limit ?? 50;

            const sortFieldValue = pageInput?.sortField || "createdAt";
            const sortOrderValue = pageInput?.sortOrder !== undefined ? pageInput?.sortOrder : -1;

            const searchInput = search?.trim();
            const searchRegex = new RegExp(encrypt(searchInput), "i");
            const requestStatus = filterInput?.deleteRequestStatus?.trim() || null;
            let searchCriteria;
            let requestStatusFilter;
            if (searchInput) {
                const nameParts = searchInput.split(" ").filter(Boolean);
                const firstNameSearch = encrypt(nameParts?.[0]?.trim()?.toLowerCase()) || '';
                const lastNameSearch = encrypt(nameParts?.slice(1)?.join(" ")) || '';
                const fullNameSearch =
                    nameParts.length > 1
                        ? {
                            $and: [
                                { firstName: { $regex: new RegExp(`^${firstNameSearch}`, "i") } },
                                { lastName: { $regex: new RegExp(`${lastNameSearch}`, "i") } }
                            ]
                        }
                        : {};

                searchCriteria = {
                    $or: [
                        { firstName: { $regex: searchRegex } },
                        { lastName: { $regex: searchRegex } },
                        { email: { $regex: searchRegex } },
                        ...(nameParts.length > 1 ? [fullNameSearch] : [])
                    ]
                };
            }

            const isApproveOrReject = requestStatus === "APPROVED" ? true : requestStatus === "REJECTED" ? false : null;
            if (isApproveOrReject != null) {
                requestStatusFilter = {
                    isDeleted: isApproveOrReject
                }
            }

            const sortOptions = { [sortFieldValue]: sortOrderValue };

            const result = await DeleteRequestHistory.find({ ...searchCriteria, ...requestStatusFilter })
                .skip(skip)
                .limit(limit)
                .sort(sortOptions);

            if (!result) {
                return { totalCount: 0 };
            }

            const decryptedResult = result?.map((item) => {
                return {
                    ...item.toObject(),
                    firstName: decrypt(item.firstName) || null,
                    lastName: item.lastName ? decrypt(item.lastName) : '' || null,
                    email: decrypt(item.email) || null
                }
            })

            const totalCount = await DeleteRequestHistory.countDocuments(requestStatusFilter);

            return {
                data: decryptedResult,
                totalCount,
            };

        } catch (error) {
            console.log(error);
            throw Error(error);
        }
    },
    getEmailsofUser: async ({ input }, context) => {
        const { userId } = input;

        try {
            if (!userId || !Array.isArray(userId) || userId.length === 0) {
                throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "UserId list is required");
            }
            const users = await User.find({ _id: { $in: userId }, isDeleted: false }).select('firstName lastName email').lean();
            const emailDetails = users?.map((user) => ({
                id: user._id,
                firstName: decrypt(user.firstName),
                lastName: user.lastName ? decrypt(user.lastName) : "",
                email: decrypt(user.email)
            }));

            return emailDetails;
        } catch (error) {
            throw CustomError(ErrorName.FAILED_TO_FETCH_EMAIL, `${error}`);
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
                icons: notificationiconEnum.SUCCESS,
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
    try {
        const users = await User.find({ _id: { $in: input.users } });

        if (users.length === 0) {
            throw CustomError(ErrorName.VALIDATION_ERROR);
        }
        const learningPlans = await LearningPlan.find({ isDeleted: false, status: LearningPlanStatus.ACTIVE });
        let updateUsers;
        const employeeDesignations = await Employee.find(
            { user: { $in: input?.users } }
        ).select('user empDesignation -_id');

        const designationMap = {};
        employeeDesignations.forEach(emp => {
            designationMap[emp?.user?.toString()] = emp.empDesignation;
        });

        const userVesselIds = users.filter(u => u.currentVessel).map(u => u.currentVessel);
        const vessels = await Vessel.find(
            { _id: { $in: userVesselIds }, isDeleted: false, isActive: true }
        ).select('typeOfVessel ownerName');

        const vesselTypeMap = {};
        vessels.forEach(v => {
            vesselTypeMap[v._id.toString()] = {
                typeOfVessel: v.typeOfVessel,
                ownerName: v.ownerName
            };
        });

        const conditions = users.map(user => ({
            designationID: designationMap[user?._id?.toString()] || null,
            vesselID: user?.currentVessel || null,
            vesselTypeID: user?.currentVessel ? vesselTypeMap[user?.currentVessel?.toString()]?.vesselType || null : null,
            owner: user?.currentVessel ? vesselTypeMap[user?.currentVessel?.toString()]?.ownerName || null : null,
            currentStatus: user?.vesselStatus || null,
            email: user?.email,
            _id: user?._id
        }));
        if (input.type === "Registered") {
            const alreadyRegisteredUsers = users.filter((user) => user.isRegistered);
            if (alreadyRegisteredUsers?.length > 0) {
                throw CustomError(ErrorName.EMPLOYEE_ALREADY_REGISTERED);
            }

            updateUsers = await User.updateMany(
                { _id: { $in: input.users } },
                { isRegistered: true }
            );

            try {
                await updateByQueryToElasticSearch('users', "ctx._source.isRegistered = true", {
                    terms: {
                        userId: input.users  // input.users is an array of IDs
                    }
                });
            } catch (error) {
                throw error;
            }
            /* const emailContentforAdmin = registered_statusforAdmin(
                {
                    adminfirstName: userInfo.firstName,
                    userfirstName: users[0].firstName
                }
            );
            await SendEmail({
                receiverEmail: userInfo.email,
                subject: `User Status Update: ${input.type}`,
                htmlContent: emailContentforAdmin,
            }); */
            if (learningPlans?.length > 0) {
                const filteredPlans = await filterLearningPlans(learningPlans, conditions, context);
            }
/* 
            await NotificationHelper.createNotificationhelper({
                subscriber: subscriberId,
                titleValue: `Registered Successfully`,
                messageValue: `You're now successfully registered.`,
                notificationType: NotificationType.EMPLOYEE_UPDATED,
                notifyAllAdmin: false,
                isNotificatonForAdmin: false,
                notifiers: input?.users ?? [],
                status: "SUCCESS",
                icon: notificationiconEnum.SUCCESS,
                createdBy: userInfo,
            });
 */
        } else if (input.type === "Unregistered") {
            const alreadyUnregisteredUsers = users.filter((user) => !user.isRegistered);
            if (alreadyUnregisteredUsers.length > 0) {
                throw CustomError(ErrorName.EMPLOYEE_ALREADY_UNREGISTERED);
            }

            const subRoleAdminId = await SubRole.findOne({ name: Roles.ADMIN, primaryRole: Roles.ADMIN }).select("_id");
            updateUsers = await User.updateMany(
                { _id: { $in: input.users } },
                {
                    $set: { isRegistered: false, lastUnregisteredAt: new Date() },
                }
            );

            try {
                await updateByQueryToElasticSearch('users', "ctx._source.isRegistered = false", {
                    terms: {
                        userId: input.users  // input.users is an array of IDs
                    }
                });
            } catch (error) {
                throw error;
            }
            /* Removed Unregistered User Autoenerollment
            if(learningPlans?.length > 0){
                const filteredPlans = await filterLearningPlans(learningPlans, conditions, context);
            }      
            */
        }
        if (updateUsers) {
            if (updateUsers.nModified > 0) {
                const users = await User.find({
                    _id: { $in: input.users },
                    subscriber: subscriberId,
                }).select('firstName lastName email isRegistered');
                const notificationsData = users.map(user => ({
                    subscriber: subscriberId,
                    employee: { user },
                    updatedBy: userInfo,
                    type: input.type,
                }));
                // await EmployeeHelper.notifyEmployeeStatusChange(notificationsData);
/* 
                for (const user of users) {
                    const emailContent =
                        input.type === "Registered"
                            ? registered_status({ firstName: decrypt(user.firstName) })
                            : Unregistered_Status({ firstName: decrypt(user.firstName) });
                    const subjectMessage = input.type === "Registered" ? "You're Now Registered!" : "SeaVerse Account Access Restricted";
                    console.log("user email: ", user.email,decrypt(user?.email));
                    await SendEmail({
                        receiverEmail: decrypt(user?.email),
                        subject: subjectMessage,
                        htmlContent: emailContent,
                    });
                }
 */
                
                return { count: updateUsers.nModified, success: true };
            } else {
                return { count: updateUsers.nModified, success: false };
            }
        } else {
            throw CustomError(ErrorName.FAILED_TO_CHANGE_REGISTER_STATUS, "Failed to change Register Status");
        }
    } catch (error) {
        console.log(error);
        throw CustomError(ErrorName.FAILED_TO_CHANGE_REGISTER_STATUS, error.message);
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
    let operationType;
    let notificationMessage = "";
    let affectedUsers = [];
    const learningPlans = await LearningPlan.find({ isDeleted: false, status: LearningPlanStatus.ACTIVE });
    if (input.change === "Assign") {
        if (!input.assignType) throw CustomError(ErrorName.ASSIGNTYPE_ERROR);

        updateUserRole = await User.updateMany(
            { _id: { $in: input.users }, superAdmin: false },
            { $set: { role: input.assignType } }
        );
        operationType = `Assigned role ${input.assignType}`;
        notificationMessage = `Your role has been updated to ${input.assignType} by ${decrypt(userInfo?.firstName)} ${userInfo?.lastName ? decrypt(userInfo?.lastName) : ''}.`;
    } else if (input.change === "Remove") {
        if (!input.removeType) throw CustomError(ErrorName.REMOVETYPE_ERROR);

        // if (input.removeType === operationTypeRoleEnum.REMOVE_AS_AUTHOR) {
        //     updateUserRole = await User.updateMany(
        //         { _id: { $in: input.users }, superAdmin: false, role: "AUTHOR" },
        //         { $set: { role: "EMPLOYEE" } }
        //     );
        //     if (updateUserRole?.nModified > 0) {
        //         const DbTransactionHelper = await autoenrollRoleBasedLP(learningPlans, input.users, Roles.AUTHOR, operationTypeRoleEnum.REMOVE_AS_AUTHOR, userInfo,context);
        //     }
        //     operationType = "Removed role as AUTHOR";
        //     notificationMessage = `Your role has been changed to EMPLOYEE by ${userInfo?.firstName} ${userInfo?.lastName}.`;
        // }

        if (input.removeType === operationTypeRoleEnum.REMOVE_AS_ADMIN) {
            updateUserRole = await User.updateMany(
                { _id: { $in: input.users }, superAdmin: false, role: "LEARNER" },
                { $set: { subRoles: [], roleAssignmentDate: null } }
            );

            console.log("input.users", input.users);
            try {
                await updateByQueryToElasticSearch(
                    'users',
                    `
                    ctx._source.subRoles = [];
                    ctx._source.roleAssignmentDate = null;
                `,
                    {
                        bool: {
                            must: [
                                { terms: { userId: input.users } },
                                { term: { superAdmin: false } },
                                { term: { "role.keyword": "LEARNER" } }
                            ]
                        }
                    }
                );
            } catch (error) {
                throw error;
            }

            const registeredUsers = await User.find({ _id: { $in: input.users }, isRegistered: true });
            if (updateUserRole?.nModified > 0 && registeredUsers?.length > 0) {

                const learningPlans = await LearningPlan.find({ isDeleted: false, status: LearningPlanStatus.ACTIVE });

                const userIds = input?.users;

                console.log(userIds, "userIds");

                const userConditions = await Employee.find({
                    'user': { $in: userIds },
                    'isDeleted': false
                })
                    .populate({
                        path: 'empDesignation',
                        select: '_id',
                    })
                    .populate({
                        path: 'user',
                        select: '_id email currentVessel vesselStatus vesselType isDeleted',
                        match: { 'isDeleted': false },
                        populate: [
                            {
                                path: 'currentVessel',
                                select: '_id vesselStatus ownerName typeOfVessel isDeleted',
                                match: { 'isDeleted': false }
                            },
                            {
                                path: 'subRoles',
                                select: 'name'
                            }
                        ]
                    })
                    .then((employees) => {
                        const result = employees.map(employee => ({
                            designationID: employee.empDesignation ? employee.empDesignation._id : null,
                            vesselID: employee.user && employee.user.currentVessel ? employee.user.currentVessel._id : null,
                            vesselTypeID: employee.user && employee.user.currentVessel ? employee.user.currentVessel.typeOfVessel : null,
                            currentStatus: employee.user && employee.user.vesselStatus ? employee.user.vesselStatus : null,
                            owner: employee.user && employee.user.currentVessel ? employee.user.currentVessel.ownerName : null,
                            email: employee.user ? employee.user.email : null,
                            role: ['LEARNER', ...employee.user?.subRoles?.map(role => role?.name)] || ['LEARNER'],
                            _id: employee?.user?._id
                        }));
                        return result;

                    })
                    .catch((error) => {
                        console.error(error);
                    });

                console.log(userConditions, "userConditions");

                await filterLearningPlans(learningPlans, userConditions, context);
                // const dta = await autoenrollRoleBasedLP(learningPlans, registeredUsers.map(user => user._id), Roles.ADMIN, operationTypeRoleEnum.REMOVE_AS_ADMIN, userInfo, context);
            }
            operationType = "Removed Roles for LEARNER";
            notificationMessage = `Your Roles have been removed by ${decrypt(userInfo?.firstName)} ${userInfo?.lastName ? decrypt(userInfo?.lastName) : ''}.`;
        }
    } else if (input.change === "Delete") {
        // updateUserRole = await EmployeeHelper.deleteUsers(input.users);
        updateUserRole = await EmployeeHelper.softDeleteUsers(input.users);
        operationType = "Deleted users";
        notificationMessage = `Your account has been deleted by ${decrypt(userInfo?.firstName)} ${userInfo?.lastName ? decrypt(userInfo?.lastName) : ''}.`;
    } else {
        throw CustomError(ErrorName.VALIDATION_ERROR);
    }

    if (updateUserRole) {
        if (updateUserRole.n > 0 && (input.change !== "Delete") && (input.removeType !== operationTypeRoleEnum.REMOVE_AS_ADMIN)) {
            affectedUsers = await User.find({ _id: { $in: input.users } }, "firstName lastName email");

            const adminNotification = {
                subscriber: subscriberId,
                title: [{ lang: "en", value: `Role Management Operation Successful` }],
                message: [
                    {
                        lang: "en",
                        value: `${decrypt(userInfo.firstName)} ${userInfo.lastName ? decrypt(userInfo.lastName) : ''} has successfully performed the operation: ${operationType} on ${updateUserRole.n} users.`,
                    },
                ],
                notificationType: NotificationType.ROLE_MANAGEMENT,
                notifyAllAdmin: true,
                isNotificatonForAdmin: true,
                notifiers: [],
                employeeNotifiers: [],
                affected: affectedUsers.map(user => ({
                    targetRef: "User",
                    target: user._id,
                })),
                status: "SENT",
                icon: notificationiconEnum.SUCCESS,
                createdBy: userInfo,
            };
            /* Ticket No SEAV-91
            const userNotifications = affectedUsers.map(user => ({
                subscriber: subscriberId,
                title: [{ lang: "en", value: "Role Management Update" }],
                message: [
                    {
                        lang: "en",
                        value: notificationMessage,
                    },
                ],
                notificationType: NotificationType.ROLE_MANAGEMENT,
                notifyAllAdmin: false,
                notifiers: [user._id],
                employeeNotifiers: [user._id],
                affected: [
                    {
                        targetRef: "User",
                        target: user._id,
                    },
                ],
                status: "SENT",
                icon: notificationiconEnum.INFO,
                createdBy: userInfo,
            }));

            await NotificationHelper.createNotification([adminNotification, ...userNotifications]);
            */
            // await NotificationHelper.createNotification([adminNotification]);
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

    try {


        const getUsers = await User.find({ _id: { $in: input.users } }).populate("subRoles", "name").lean();



        if (input.type === "REJECT") {

            const userHistoryData = getUsers.map(user => ({
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                isDeleted: false,
                civilIdOrPassport: user.civilIdOrPassport,
                lastLoginAt: user.lastLoginAt,
                reasonForDelete: user.reasonForDelete,
                directSignup: user.directSignup,
                deleteRequestDate: user.deleteRequestDate,
                decisionDate: new Date(),
                isRegistered: user?.isRegistered
            }));

            const rejectDeleteRequest = await User.updateMany(
                { _id: { $in: input.users } },
                {
                    $set: {
                        deleteRequest: false,
                        deleteRequestDate: null,
                        reasonForDelete: null,
                    },
                }
            );

            try {
                await updateByQueryToElasticSearch(
                    "users",
                    `
                        ctx._source.deleteRequest = false;
                        ctx._source.deleteRequestDate = null;
                        ctx._source.reasonForDelete = null;
                    `,
                    {
                        terms: {
                            userId: input.users,
                        },
                    }
                );

            } catch (error) {
                console.error("Error updating delete request in Elasticsearch:", error);
                throw CustomError(ErrorName.FAILED, "Failed to update delete request in Elasticsearch");

            }

            if (rejectDeleteRequest.nModified > 0) {

                const history = await DeleteRequestHistory.find();

                const updateDeleteRequestHistory = await DeleteRequestHistory.insertMany(userHistoryData);

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
                            message: `Admin ${decrypt(userInfo.firstName)} ${userInfo.lastName ? decrypt(userInfo.lastName) : ''} has rejected your delete request.`,
                            createdBy: userInfo,
                            icon: notificationiconEnum.DELETE_REQUEST
                        });
                    } else {
                        console.error(`User with ID ${userId} not found`);
                    }

                    if (updateDeleteRequestHistory) {
                        const sendmailforApproval = await aws_helper.sendEmail({
                            receiverEmail: decrypt(userHistoryData?.[0]?.email),
                            subject: 'Delete request REJECTED',
                            htmlContent: DeleteRequestRejected({
                                firstName: decrypt(userHistoryData?.[0]?.firstName),
                            })
                        });

                        if (!sendmailforApproval) {
                            throw CustomError(ErrorName.FAILED_TO_SEND_APPROVAL_EMAIL, 'Failed to send approval email');
                        }
                    }
                }

                return "Successfully rejected";
            } else {
                throw CustomError(ErrorName.ERROR_REJECTING_USER_REQUEST);
            }
        }

        if (input.type === "APPROVE") {

            // if (!getUsers || getUsers?.length === 0) {
            //     throw CustomError(ErrorName.USER_NOT_FOUND, "Users not found");
            // }

            const isAdmin = user => user.subRoles?.some(role => role.name === "ADMIN");

            const adminsNotBeingDeleted = await User.find({
                _id: { $nin: input?.users },
                isDeleted: false
            })
                .populate("subRoles", "name")
                .lean();

            const remainingAdmins = adminsNotBeingDeleted.filter(isAdmin);
            console.log("remainingAdmins", remainingAdmins.length)
            if (remainingAdmins.length === 0) {
                console.log("At least one admin must remain in the system.");
                throw CustomError(ErrorName.FAILED_TO_DELETE_LAST_ADMIN, "At least one admin must remain in the system.");
            }

            const userHistoryData = getUsers.map(user => ({
                firstName: user?.firstName,
                lastName: user?.lastName,
                email: user?.email,
                isDeleted: true,
                civilIdOrPassport: user?.civilIdOrPassport,
                lastLoginAt: user?.lastLoginAt,
                reasonForDelete: user?.reasonForDelete,
                directSignup: user?.directSignup,
                deleteRequestDate: user?.deleteRequestDate,
                decisionDate: new Date(),
                isRegistered: false
            }));

            let errors = [];
            // const deleteUsers = await EmployeeHelper.deleteUsers(input.users, errors);
            // Soft delete users keeping only the first name, last name and course details
            const deleteUsers = await EmployeeHelper.deleteUsersAfterGDPR(input.users, errors);

            if (errors.length > 0) {
                throw CustomError(ErrorName.ERROR_DELETING_USER, `${errors[0]}`);
            }

            if (deleteUsers) {

                const updateDeleteRequestHistory = await DeleteRequestHistory.insertMany(userHistoryData);

                if (updateDeleteRequestHistory) {
                    if (userHistoryData.length === 1) {
                        const sendmailforApproval = await aws_helper.sendEmail({
                            receiverEmail: decrypt(userHistoryData[0]?.email),
                            subject: 'Delete request APPROVED',
                            htmlContent: DeleteRequestApproved({
                                firstName: decrypt(userHistoryData[0]?.firstName),
                            })
                        });
                        if (!sendmailforApproval) {
                            throw CustomError(ErrorName.FAILED_TO_SEND_APPROVAL_EMAIL, 'Failed to send approval email');
                        }
                    } else {
                        console.log("Multiple users deletion was not part of the initial implementation, so no email will be sent.");
                    }

                }

                return "Successfully deleted";
            } else {
                throw CustomError(ErrorName.ERROR_DELETING_USER);
            }
        }

    } catch (error) {
        throw CustomError(ErrorName.FAILED, error.message);
    }
};

const checkUserRegType = async (userIds, regType) => {
    if (!userIds || userIds.length === 0) {
        return;
    }
    const employeeRecords = await Employee.find({ user: { $in: userIds } }, 'regType user');
    if (!employeeRecords.length) {
        throw CustomError(ErrorName.NOT_FOUND, "No employees found for provided userObjectIds.");
    }

    const regTypes = new Set(employeeRecords.map(emp => emp.regType));

    if (![0, 1, 2].includes(regType)) {
        throw CustomError(ErrorName.INVALID_REG_TYPE, "Invalid regType provided.");
    }
    if (regType === 0) {
        const invalidUser = employeeRecords.find(emp => ![1, 2].includes(emp.regType));
        if (invalidUser) {
            throw CustomError(ErrorName.INVALID_REG_TYPE, "When regType is 0, all selected users must have regType 1 or 2.");
        }
    }
    else {
        const invalidUser = employeeRecords.find(emp => emp.regType !== regType);
        if (invalidUser) {
            throw CustomError(
                ErrorName.INVALID_REG_TYPE,
                `When regType is ${regType}, all selected users must have regType ${regType}.`
            );
        }
    }
};

const clearApprovedDeletionRequestHistory = async (_, context) => {
    try {
        const { userId } = AuthUser(context);
        if (!userId) {
            throw CustomError(ErrorName.FORBIDDEN);
        }
        const result = await DeleteRequestHistory.deleteMany({ isDeleted: true });
        if (result.deletedCount === 0) {
            throw CustomError(ErrorName.NOT_FOUND, "No deletion requests found to clear.");
        }
        return {
            status: true,
            message: `${result.deletedCount} deletion requests cleared successfully.`,
        };
    } catch (error) {
        throw Error(error.message);
    }
}


module.exports.mutations = {
    clearApprovedDeletionRequestHistory,
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
            if (!filename.endsWith(".csv")) throw CustomError(ErrorName.INVALID_FILE, "Failed to upload the CSV file. Please check the format and try again.");

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
            const existingEmployees = await User.find({ isDeleted: false }).lean();
            const dbEmails = existingEmployees.map(employee => employee.email.toLowerCase());
            const dbemployeeIds = existingEmployees.map(employee => employee.civilIdOrPassport);

            const vessels = await Vessel.find({ isDeleted: false, isActive: true })
                .select("imoNumber")
                .lean();

            const imoNumbers = vessels.map(vessel => vessel.imoNumber);

            const vesselStatus = [
                VesselStatus.ONBOARDED,
                VesselStatus.ONSHORE,
                VesselStatus.ASSIGNED,
            ];

            const countriesListed = [
                'afghanistan', 'albania', 'algeria', 'andorra', 'angola', 'antigua and barbuda', 'argentina', 'armenia', 'australia', 'austria',
                'azerbaijan', 'bahamas', 'bahrain', 'bangladesh', 'barbados', 'belarus', 'belgium', 'belize', 'benin', 'bhutan',
                'bolivia', 'bosnia and herzegovina', 'botswana', 'brazil', 'brunei', 'bulgaria', 'burkina faso', 'burundi', 'cabo verde', 'cambodia',
                'cameroon', 'canada', 'central african republic', 'chad', 'chile', 'china', 'colombia', 'comoros', 'congo', 'congo (democratic republic)',
                'costa rica', 'croatia', 'cuba', 'cyprus', 'czech republic', 'denmark', 'djibouti', 'dominica', 'dominican republic', 'east timor',
                'ecuador', 'egypt', 'el salvador', 'equatorial guinea', 'eritrea', 'estonia', 'eswatini', 'ethiopia', 'fiji', 'finland',
                'france', 'gabon', 'gambia', 'georgia', 'germany', 'ghana', 'greece', 'grenada', 'guatemala', 'guinea', 'guinea-bissau',
                'guyana', 'haiti', 'honduras', 'hungary', 'iceland', 'india', 'indonesia', 'iran', 'iraq', 'ireland',
                'israel', 'italy', 'ivory coast', 'jamaica', 'japan', 'jordan', 'kazakhstan', 'kenya', 'kiribati', 'north korea', 'south korea', 'kuwait', 'kyrgyzstan', 'laos', 'latvia', 'lebanon', 'lesotho', 'liberia', 'libya', 'liechtenstein',
                'lithuania', 'luxembourg', 'madagascar', 'malawi', 'malaysia', 'maldives', 'mali', 'malta', 'marshall islands', 'mauritania',
                'mauritius', 'mexico', 'micronesia', 'moldova', 'monaco', 'mongolia', 'montenegro', 'morocco', 'mozambique', 'myanmar',
                'namibia', 'nauru', 'nepal', 'netherlands', 'new zealand', 'nicaragua', 'niger', 'nigeria', 'north macedonia', 'norway',
                'oman', 'pakistan', 'palau', 'palestine', 'panama', 'papua new guinea', 'paraguay', 'peru', 'philippines', 'poland', 'portugal',
                'qatar', 'romania', 'russia', 'rwanda', 'saint kitts and nevis', 'saint lucia', 'saint vincent and the grenadines', 'samoa', 'san marino', 'sao tome and principe',
                'saudi arabia', 'senegal', 'serbia', 'seychelles', 'sierra leone', 'singapore', 'slovakia', 'slovenia', 'solomon islands', 'somalia',
                'south africa', 'south sudan', 'spain', 'sri lanka', 'sudan', 'suriname', 'sweden', 'switzerland', 'syria', 'taiwan',
                'tajikistan', 'tanzania', 'thailand', 'togo', 'tonga', 'trinidad and tobago', 'tunisia', 'turkmenistan', 'turkey', 'tuvalu',
                'uganda', 'ukraine', 'united arab emirates', 'united kingdom', 'united states', 'uruguay', 'uzbekistan', 'vanuatu', 'vatican city',
                'venezuela', 'vietnam', 'yemen', 'zambia', 'zimbabwe'
            ];


            const errors = await EmployeeHelper.bulkValidationHelper(
                createReadStream,
                empIds,
                emails,
                dbemployeeIds,
                dbEmails,
                designationNames,
                imoNumbers,
                vesselStatus,
                users,
                userId,
                subscriberId,
                newFileName,
                countriesListed,
                saveCSV
            );


            const nonEmptyArray = errors.find(arr => arr.length > 0);
            if (nonEmptyArray) {

                const failedNotification = {
                    subscriber: subscriberId,
                    title: [{ lang: "en", value: `Bulk Import Failed!` }],
                    message: [
                        {
                            lang: "en",
                            value: `${nonEmptyArray}`,
                        },
                    ],
                    notificationType: NotificationType.BULK_IMPORT_FAILED,
                    notifyAllAdmin: false,
                    isNotificatonForAdmin: true,
                    notifiers: [userId],
                    employeeNotifiers: [],
                    icon: notificationiconEnum.ERROR,
                    createdBy: userInfo,
                };
                await NotificationHelper.createNotification([failedNotification]);

                const createImportLog = await ImportLog.create({
                    subscriber: subscriberId,
                    uploadedBy: userId,
                    fileName: newFileName,
                    filePath: { url: saveCSV },
                    importStatus: "FAILED",
                    description: `${nonEmptyArray}`,
                })

                if (!createImportLog) throw CustomError(ErrorName.FAILED, 'Failed to create import log');

                throw CustomError(ErrorName.FAILED, `${nonEmptyArray}`);
            }

            async function publishCsvImportJob(jobData) {
                try {
                    if (!jobData || !jobData.jobId) {
                        throw new Error('Invalid job data: missing jobId');
                    }

                    const params = {
                        QueueUrl: CSV_IMPORT_QUEUE_URL,
                        MessageBody: JSON.stringify(jobData),
                    };

                    // 👉 If FIFO queue:
                    // if (process.env.SQS_QUEUE_TYPE === 'FIFO') {
                    //     params.MessageGroupId = 'csv-import'; // Required for FIFO
                    //     params.MessageDeduplicationId = `${jobData.jobId}-${Date.now()}`; // Ensure unique
                    // }
                    
                    const data = await sqsClient.send(new SendMessageCommand(params));

                    console.log(`📋 Job sent to SQS: ${data.MessageId}`);
                    return { id: data.MessageId };
                } catch (error) {
                    console.error('❌ Failed to send job to SQS:', error);
                    throw error;
                }
            }

            async function publishCsvImportInBatches(users, emails, empIds, subscriberId, userId, userInfo, newFileName, saveCSV, context) {
                const empIdsArray = Array.from(empIds);
                const emailsArray = Array.from(emails);
                const jobId = uuidv4();


                const batchSize = 200;
                const totalUsers = users.length;
                const batchCount = Math.ceil(totalUsers / batchSize);

                await ImportJob.create({
                    jobId,
                    subscriber: subscriberId,
                    uploadedBy: userId,
                    fileName: newFileName,
                    filePath: { url: saveCSV },
                    importStatus: "PROCESSING",
                    totalRecords: users.length,
                    expectedBatches: batchCount,
                    processedBatches: {
                        insertedCount: 0,
                        updatedCount: 0
                    },
                    description: "Processing CSV import"
                });

                console.log(`🚀 Publishing ${totalUsers} users in ${batchCount} batches`);

                for (let i = 0; i < batchCount; i++) {
                    const start = i * batchSize;
                    const end = Math.min(start + batchSize, totalUsers);

                    const batchUsers = users.slice(start, end);
                    const batchEmails = emailsArray.slice(start, end);
                    const batchEmpIds = empIdsArray.slice(start, end);

                    try {
                        await publishCsvImportJob({
                            jobId,
                            users: batchUsers,
                            emailsArray: batchEmails,
                            empIdsArray: batchEmpIds,
                            // MessageGroupId: 'csv-import', // Required for FIFO queues
                            // MessageDeduplicationId: `${jobId}-${i}-${Date.now()}`, // Ensure
                            subscriberId,
                            userId,
                            userInfo,
                            newFileName,
                            saveCSV,
                            context,
                            timestamp: new Date().toISOString()
                        });

                        console.log(`✅ Batch ${i + 1}/${batchCount} sent with ${batchUsers.length} users`);
                    } catch (err) {
                        console.error(`❌ Failed to publish batch ${i + 1}:`, err);
                        throw err;
                    }
                }

                return jobId;
            }

            await publishCsvImportInBatches(users, emails, empIds, subscriberId, userId, userInfo, newFileName, saveCSV, context);

            return {
                status: "The bulk import is being processed in the background. You can continue working.",
            };

            // const child = fork("./src/app/user/employee/csv_import_process.js");

            // child.send({
            //     users,
            //     emailsArray,
            //     empIdsArray,
            //     subscriberId,
            //     userId,
            //     newFileName,
            //     saveCSV,
            //     context
            // });

            // child.on("message", async message => {
            //     if (message.type === 'NOTIFICATION') {
            //         // since we are sending it to the child process the date format changes so we need to convert it before sending in ws
            //         const notification = message?.data?.onNotification;

            //         if (notification?.createdAt) {
            //             notification.createdAt = new Date(notification.createdAt).getTime().toString();
            //         }

            //         if (notification?.updatedAt) {
            //             notification.updatedAt = new Date(notification.updatedAt).getTime().toString();
            //         }
            //         await PubSubHelper.publish(NotificationEvent.ON_NOTIFICATION, message.data);
            //     }

            //     if (message.type === 'EMAIL') {

            //         SqliteEmailHelper.insertEmails(message.data.email);
            //         const emails = SqliteEmailHelper.fetchEmailBatch();

            //         await sendNodeEmailBulk({ subject: message.data.subject });

            //     }
            // });

            // child.on("error", error => {
            //     console.error("Error in child process:", error);
            // });

            // return {
            //     status: "The bulk import is being processed in the background. You can continue working.",
            // };

        } catch (error) {
            console.log(error);
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
            typeof input.user.isRegistered !== "boolean"
        )
            throw CustomError(ErrorName.ARGUMENTS_REQUIRED);

        const existingUser = await User.findOne({ email: input.user.email });

        if (existingUser) throw CustomError(ErrorName.USER_ALREADY_EXIST);

        const existingDeletedUser = await DeletedUser.find({ email: input.user.email, civilIdOrPassport: input.user.civilIdOrPassport });

        if (existingDeletedUser.length > 0) {

            const existingDeletedUserIds = existingDeletedUser.map(user => user._id);

            let errors = [];
            const restoreUser = await EmployeeHelper.restoreUsers(existingDeletedUserIds, errors);

            if (errors.length > 0) {
                throw CustomError(ErrorName.FAILED, `${errors[0]}`);
            }

            return {
                status: true,
                message: "User restored successfully!",
            };

        }

        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

        const notificationList = [];
        const courseInvitationList = [];
        const invitationList = [];
        let savedBatch;

        const savedEmployees = await DbTransactionHelper.performDbTransaction(async session => {
            const savedEmployees = [];

            let userPasswordInfo = {};
            let generatePassword = input?.user?.password || generateRandomString(10);
            const dummyPasswordHash = await CryptoHelper.hash(generatePassword, 10);

            userPasswordInfo.dummyPassword = `${dummyPasswordHash}~~~${generatePassword}`;
            userPasswordInfo.password = dummyPasswordHash;

            const existingDesignation = await Designation.findById(input.empDesignation);
            if (!existingDesignation) throw new CustomError(ErrorName.INVALID_DESIGNATION);

            let userRole = Role.LEARNER;

            const savedUser = await User.create({
                subscriber: subscriberId,
                firstName: encrypt(input.user.firstName.toLowerCase()),
                lastName: input.user.lastName ? encrypt(input.user.lastName.toLowerCase()) : null,
                civilIdOrPassport: encrypt(input.user.civilIdOrPassport.toUpperCase()),
                isRegistered: input.user.isRegistered ?? true,
                currentVessel: input.user.currentVessel && input.user.currentVessel != "" ? ObjectId(input.user.currentVessel) : null,
                vesselStatus: input.user.vesselStatus && input.user.vesselStatus != "" ? input.user.vesselStatus : null,
                email: encrypt(input.user.email.toLowerCase()),
                role: userRole,
                ...userPasswordInfo,
                isSignupAdminAprroved: true,
                lastUnregisteredAt: input.user.isRegistered === false ? new Date() : null,
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

            let savedUserVessel;
            let vessel;

            if (input.user.currentVessel || input.user.vesselStatus) {

                let userVesselUpdate = {
                    user: savedUser,
                    vessel: input.user.currentVessel && input.user.currentVessel !== "" ? ObjectId(input.user.currentVessel) : null,
                    vesselStatus: input.user.vesselStatus && input.user.vesselStatus !== "" ? input.user.vesselStatus : null,
                };

                savedUserVessel = await UserVessel.create(userVesselUpdate);

                if (!savedUserVessel) throw CustomError(ErrorName.FAILED);
                vessel = await Vessel.findById(savedUserVessel.vessel).populate("typeOfVessel", "_id name");
            }

            // invitationList.push({
            //     userData: savedUser,
            // });

            savedEmployees.push({ ...savedEmployee, user: savedUser });
            const learningPlans = await LearningPlan.find({ isDeleted: false, status: 'ACTIVE' });

            if (savedUser.isRegistered === true && learningPlans?.length > 0) {

                const conditions = [{
                    designationID: input.empDesignation,
                    vesselID: savedUserVessel?.vessel ?? null,
                    vesselTypeID: vessel?.typeOfVessel?._id ?? null,
                    owner: vessel?.ownerName ?? null,
                    currentStatus: savedUserVessel?.vesselStatus ?? null,
                    email: savedUser.email,
                    _id: savedUser._id,
                    role: 'LEARNER',
                }];

                const filteredPlans = await filterLearningPlans(learningPlans, conditions, context, session);

            }
            // Below  matchedLearningPlans is for testing purpose to check which matches the LP
            // const matchedLearningPlans = filteredPlans.map(plan => {
            //     return {
            //         learningPlanID: plan._id,
            //         learningPlanName: plan.title,
            //         employeeID: savedUser._id,
            //         email: savedUser.email,
            //         designationID: input.empDesignation,
            //         vesselID: savedUserVessel?.vessel,
            //         vesselTypeID: vessel?.typeOfVessel?._id,
            //         currentStatus: savedUserVessel?.vesselStatus
            //     };
            // });

            if (savedUser?.isRegistered === true && savedUser?.isEmailNotification) {
                const decryptedEmail = decrypt(savedUser.email);
                const decryptedFirstName = decrypt(savedUser.firstName);

                const emailContentforNewEmployee = createNewEmployeeEmailTemplate({
                    firstName: decryptedFirstName,
                    email: decryptedEmail,
                    templategeneratePassword: generatePassword,
                });

                function isValidEmail(email) {
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    return emailRegex.test(email);
                }

                if (isValidEmail(decryptedEmail)) {
                    await AwsHelper.sendEmail({ receiverEmail: decryptedEmail, subject: "Welcome to Seaverse!", htmlContent: emailContentforNewEmployee })
                }
            }
            try {
                const userVesselsDetails = await Vessel.find({ _id: savedEmployee.user?.currentVessel, isDeleted: false, isActive: true }).populate('typeOfVessel', '_id name');
                console.log('this is userVesselsDetails', userVesselsDetails);
                const document = {
                    employeeId: savedEmployee._id?.toString(),
                    UID: savedEmployee.UID,
                    designation: savedEmployee.designation,
                    empDesignation: savedEmployee.empDesignation?.toString(),
                    bulkId: savedEmployee.bulkId,
                    regType: savedEmployee.regType,
                    isActive: savedEmployee.isActive,
                    isDeleted: savedEmployee.isDeleted,
                    subscriber: savedEmployee.subscriber?.toString(),
                    createdAt: savedEmployee.createdAt,
                    updatedAt: savedEmployee.updatedAt,

                    // Nested user fields
                    userId: savedEmployee.user?._id?.toString(),
                    firstName: savedEmployee.user?.firstName,
                    lastName: savedEmployee.user?.lastName,
                    email: savedEmployee.user?.email,
                    civilIdOrPassport: savedEmployee.user?.civilIdOrPassport,
                    languagePreference: savedEmployee.user?.languagePreference,
                    role: savedEmployee.user?.role,
                    subRoles: savedEmployee.user?.subRoles,
                    isVerified: savedEmployee.user?.isVerified,
                    isRegistered: savedEmployee.user?.isRegistered,
                    superAdmin: savedEmployee.user?.superAdmin,
                    deleteRequest: savedEmployee.user?.deleteRequest,
                    isDeleted_user: savedEmployee.user?.isDeleted,
                    directSignup: savedEmployee.user?.directSignup,
                    contentlanguages: savedEmployee.user?.contentlanguages,
                    currentVessel: savedEmployee.user?.currentVessel?.toString(),
                    vesselStatus: savedEmployee.user?.vesselStatus,
                    isEmailNotification: savedEmployee.user?.isEmailNotification,
                    isPushNotification: savedEmployee.user?.isPushNotification,
                    lastLoginAt: savedEmployee.user?.lastLoginAt,
                    isSignupAdminAprroved: savedEmployee.user?.isSignupAdminAprroved,
                    userCreatedAt: savedEmployee.user?.createdAt,
                    userUpdatedAt: savedEmployee.user?.updatedAt,
                    vesselName: userVesselsDetails[0]?.name,
                    vesselId: userVesselsDetails[0]?._id,
                    vesselIsDeleted: userVesselsDetails[0]?.isDeleted,
                    vesselIsActive: userVesselsDetails[0]?.isActive,
                    typeOfVesselName: userVesselsDetails[0]?.typeOfVessel?.name,
                    tyepOfVesselId: userVesselsDetails[0]?.typeOfVessel?._id,
                    isResetPasswordDialog: savedEmployee.user?.isResetPasswordDialog,
                    enrolledCourses: 0,
                    averageCourseProgress: 0.0,
                    indexedAt: new Date(),
                };

                try {
                    await indexDocumenttoElasticSearch("users", savedEmployee?._id, document);
                } catch (error) {
                    throw CustomError(ErrorName.INDEX_DOC_ELASTIC_SEARCH, `Elastic Insert Error (users): ${error}`)
                }
            } catch (err) {
                console.error("Elasticsearch indexing error:", err);
            }
            return savedEmployees;
        });

        if (!savedEmployees) throw CustomError(ErrorName.FAILED);

        // EmployeeHelper.sendEnrollmentNotification(notificationList);

        // Jira Ticket SEAV-55
        /*
        EmployeeHelper.sendNotificationOnCRUD({
            subscriber: subscriberId,
            employee: savedEmployees?.[0],
            createdBy: userInfo,
            action: "CREATED",
        });
        */

        return {
            status: true,
            message: "User created successfully!",
        };
    },
    updateEmployee: async ({ id, input }, context, session) => {

        const {
            role,
            userId,
            userInfo,
            userPermissions,
            subscriberId,
            employeeId,
            isOrganizationManager,
        } = AuthUser(context);

        try {

            const employeeFilterConditions = { subscriber: subscriberId };

            // if (context.platform === Role.ADMIN) {
            //     if (
            //         !SubRoleHelper.hasPermission({
            //             currentRole: role,
            //             currentPermissions: userPermissions,
            //             requiredPermission: [
            //                 Permission.UPDATE_EMPLOYEE,
            //                 Permission.ENABLE_DISABLE_EMPLOYEE,
            //             ],
            //             requiredAll: false,
            //             restrictOrganizationManager: isOrganizationManager,
            //         }) &&
            //         id.toString() !== employeeId.toString()
            //     ) {
            //         throw CustomError(ErrorName.FORBIDDEN);
            //     }
            // } else {
            //     throw CustomError(ErrorName.FORBIDDEN);
            // }


            const currentEmployee = await User.findById(id);

            if (!currentEmployee) {
                throw CustomError(ErrorName.USER_NOT_FOUND);
            }
            const savedEmployee = await EmployeeHelper.updateEmployees(
                {
                    id: id,
                    input: input,
                    userId: userId,
                    subscriberId: subscriberId,
                    role: role,
                    userInfo: userInfo,
                },
                context,
                session
            );
            const updatedFields = Object.keys(input).reduce((changes, key) => {
                if (currentEmployee[key] !== input[key]) {
                    changes[key] = {
                        oldValue: currentEmployee[key],
                        newValue: input[key],
                    };
                }
                return changes;
            }, {});

             await NotificationHelper.createNotificationhelper({
                 subscriber: subscriberId,
                 titleValue: `Profile Updated Successfully`,
                 messageValue: `Your profile details have been successfully updated on Seaverse.`,
                 notificationType: NotificationType.EMPLOYEE_UPDATED,
                 notifyAllAdmin: false,
                 isNotificatonForAdmin: false,
                 notifiers: [id],
                 status: "SUCCESS",
                 icon: notificationiconEnum.SUCCESS,
                 createdBy: userInfo,
             });

            return savedEmployee;

        } catch (error) {
            throw CustomError(ErrorName.FAILED, error.message);
        }

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

        const notificationsData = [
            {
                subscriber: subscriberId,
                deletedEmployee: deletedEmployee,
                createdBy: userInfo,
            },
        ];
        await EmployeeHelper.sendDeleteNotification(notificationsData);

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

            try {
                await User.updateMany(
                    { _id: { $in: users } },
                    { $addToSet: { subRoles: subrole }, $set: { roleAssignmentDate: new Date() } },
                );

                console.log("Users updated with subrole:", users, subrole);
            } catch (error) {
                throw error
            }

            try {
                await updateByQueryToElasticSearch(
                    'users',
                    `
                    if (!ctx._source.subRoles.contains(params.subrole)) {
                    ctx._source.subRoles.add(params.subrole);
                    }
                    ctx._source.roleAssignmentDate = params.currentDate;
                `,
                    {
                        terms: {
                            userId: users
                        }
                    },
                    {
                        subrole,
                        currentDate: new Date().toISOString()
                    }
                );
            } catch (error) {
                throw error
            }

            const usersToUpdate = await User.find({ _id: { $in: users } });

            if (!usersToUpdate.length) {
                throw new Error("No valid users found");
            }

            const resetPasswordHtml = roleUpdateNotifyLearner(usersToUpdate);
            await AwsHelper.sendEmail({
                receiverEmail: decrypt(usersToUpdate[0].email),
                subject: "Your Role Updated",
                htmlContent: resetPasswordHtml,
            });

            const emailContentForAdmin = roleUpdateNotifyAdmin({
                firstName: decrypt(userInfo?.firstName),
                usersUpdated: usersToUpdate?.map(user => ({ user: decrypt(user.firstName) })),
            });

            await SendEmail({
                receiverEmail: decrypt(userInfo?.email),
                subject: "User Role Updated",
                htmlContent: emailContentForAdmin,
            });

            const assignedUserNames = usersToUpdate?.map(user => decrypt(user?.firstName)).join(", ");
            const adminNotificationMessage = `${decrypt(userInfo?.firstName)} ${userInfo?.lastName ? decrypt(userInfo?.lastName) : ''} has assigned the Role "${validSubRole?.name}" successfully to ${assignedUserNames}.`;
            const adminNotification = {
                subscriber: subscriberId,
                title: [{ lang: "en", value: "Role Assigned Successfully" }],
                message: [
                    {
                        lang: "en",
                        value: adminNotificationMessage,
                    },
                ],
                notificationType: NotificationType.ROLE_MANAGEMENT,
                notifyAllAdmin: true,
                isNotificatonForAdmin: true,
                notifiers: [userId],
                employeeNotifiers: [],
                affected: users.map(user => ({
                    targetRef: "User",
                    target: user._id,
                })),
                status: 'SENT',
                icon: notificationiconEnum.SUCCESS,
                createdBy: userInfo,
            };

            const userNotifications = usersToUpdate.map(user => ({
                subscriber: subscriberId,
                title: [{ lang: "en", value: "Role Assigned Successfully" }],
                message: [
                    {
                        lang: "en",
                        value: `You have been assigned to the Role "${validSubRole.name}" by ${decrypt(userInfo?.firstName)} ${userInfo?.lastName ? decrypt(userInfo?.lastName) : ''}.`,
                    },
                ],
                notificationType: NotificationType.ROLE_MANAGEMENT,
                notifyAllAdmin: false,
                notifiers: [user._id],
                employeeNotifiers: [user._id],
                affected: [
                    {
                        targetRef: "User",
                        target: user._id,
                    },
                ],
                status: 'SENT',
                icon: notificationiconEnum.SUCCESS,
                createdBy: userInfo,
            }));

            await NotificationHelper.createNotification([adminNotification]);//...userNotifications

            /* const userIdsToSend = usersToUpdate.map(user => user._id);
            for (const userId of userIdsToSend) {
                await sendNotifications({
                    userIds: userId,
                    title: "Role Assigned Successfully",
                    body: `You have been assigned the Role "${validSubRole.name}".`,
                    content: `You have been assigned the Role "${validSubRole.name}".`,
                    webLink: "",
                });
            } */
            const sendOnlyRegisteredUsers = usersToUpdate.filter(user => user.isRegistered === true);

            if (validSubRole.name === Roles.ADMIN && sendOnlyRegisteredUsers?.length > 0) {
                const learningPlans = await LearningPlan.find({ isDeleted: false, status: LearningPlanStatus.ACTIVE });

                const userIds = users;

                const userConditions = await Employee.find({
                    'user': { $in: userIds },
                    'isDeleted': false
                })
                    .populate({
                        path: 'empDesignation',
                        select: '_id',
                    })
                    .populate({
                        path: 'user',
                        select: '_id email currentVessel vesselStatus vesselType isDeleted',
                        match: { 'isDeleted': false },
                        populate: [
                            {
                                path: 'currentVessel',
                                select: '_id vesselStatus ownerName typeOfVessel isDeleted',
                                match: { 'isDeleted': false }
                            },
                            {
                                path: 'subRoles',
                                select: 'name'
                            }
                        ]
                    })
                    .then((employees) => {
                        const result = employees.map(employee => ({
                            designationID: employee.empDesignation ? employee.empDesignation._id : null,
                            vesselID: employee.user && employee.user.currentVessel ? employee.user.currentVessel._id : null,
                            vesselTypeID: employee.user && employee.user.currentVessel ? employee.user.currentVessel.typeOfVessel : null,
                            currentStatus: employee.user && employee.user.vesselStatus ? employee.user.vesselStatus : null,
                            owner: employee.user && employee.user.currentVessel ? employee.user.currentVessel.ownerName : null,
                            email: employee.user ? employee.user.email : null,
                            role: ['LEARNER', ...employee.user?.subRoles?.map(role => role?.name)] || ['LEARNER'],
                            _id: employee?.user?._id
                        }));
                        return result;

                    })
                    .catch((error) => {
                        console.error(error);
                    });

                await filterLearningPlans(learningPlans, userConditions, context);
                // await autoenrollRoleBasedLP(learningPlans, sendOnlyRegisteredUsers?.map(user => user._id), Roles.ADMIN, operationTypeRoleEnum.ASSIGN_ROLE_AS_ADMIN, userInfo,context);
            }

            return {
                success: true,
                message: "Role successfully assigned to all learners",
            };
        } catch (error) {
            return {
                success: false,
                message: `Error assigning Role: ${error.message}`,
            };
        }
    },

    exportUserToCsv: async ({ userObjectIds }, context) => {
        const { role, userId, subscriberId, userInfo } = AuthUser(context);
        if (!role || role !== Role.ADMIN) {
            throw CustomError(ErrorName.FORBIDDEN);
        }
        const hardcodedFields = [
            'First Name*',
            'Last Name',
            'User ID*',
            'Email*',
            'Employee Designation*',
            'Current Vessel',
            'Vessel IMO Number',
            'Vessel Status',
            'Last Login',
            'Created At',
            'User Roles',
            'Vessel Type',
            'User Status'
        ];
        try {
            if (userObjectIds?.regType === undefined || userObjectIds?.regType === null) {
                throw CustomError(ErrorName.REGTYPE_REQUIRED, "regType is required.");
            }
            const notifications = [];
            // const exportStartTime = new Date();
            /* Ticket Number : SEAV-117
            const inProgressNotification = {
                subscriber: subscriberId,
                title: [{ lang: "en", value: `User Export In Progress` }],
                message: [
                    {
                        lang: "en",
                        value: `The export user process for selected users started at ${exportStartTime.toLocaleString()} by  ${decrypt(userInfo?.firstName)} ${userInfo?.lastName}.`,
                    },
                ],
                notificationType: NotificationType.EXPORT_IN_PROGRESS,
                notifyAllAdmin: true,
                notifiers: [],
                employeeNotifiers: [],
                createdBy: userInfo,
                icon: notificationiconEnum.PROGRESS,
            };
            notifications.push(inProgressNotification);
            await NotificationHelper.createNotification(notifications);
            */
            const regType = userObjectIds?.regType;
            if (![0, 1, 2].includes(regType)) {
                throw CustomError(ErrorName.INVALID_REG_TYPE, "Invalid regType provided. Must be 0, 1, or 2.");
            }
            let employeeQuery = {};
            if (regType === 0) {
                employeeQuery = { regType: { $in: [1, 2] } };
            } else {
                employeeQuery = { regType: regType };
            }

            let userIds = [];
            if (userObjectIds?.ids && userObjectIds.ids.length > 0) {
                await checkUserRegType(userObjectIds.ids, regType);
                userIds = userObjectIds.ids.map(id => mongoose.Types.ObjectId(id));
            } else {
                const employees = await Employee.find(employeeQuery).select('user');
                userIds = employees.map(emp => emp.user);
            }
            const initialMatchStage = {
                $match: {
                    _id: { $in: userIds },
                    isDeleted: false
                }
            };
            if (userObjectIds?.filterInput) {
                await processFilters(userObjectIds.filterInput, initialMatchStage);
            }
            const pipeline = [
                initialMatchStage,
                {
                    $lookup: {
                        from: 'employees',
                        localField: '_id',
                        foreignField: 'user',
                        as: 'employeeDetails',
                    },
                },
                { $unwind: { path: '$employeeDetails', preserveNullAndEmptyArrays: true } },
                {
                    $match: {
                        'employeeDetails.regType': regType === 0 ? { $in: [1, 2] } : regType
                    }
                },
                {
                    $lookup: {
                        from: 'vessels',
                        localField: 'currentVessel',
                        foreignField: '_id',
                        as: 'vesselDetails',
                    },
                },
                { $unwind: { path: '$vesselDetails', preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: 'designations',
                        localField: 'employeeDetails.empDesignation',
                        foreignField: '_id',
                        as: 'designationDetails',
                    },
                },
                { $unwind: { path: '$designationDetails', preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: 'uservessels',
                        localField: '_id',
                        foreignField: 'user',
                        as: 'typeOfVesselDetails',
                        pipeline: [
                            {
                                $lookup: {
                                    from: 'vessels',
                                    localField: 'vessel',
                                    foreignField: '_id',
                                    as: 'vesselDetails',
                                },
                            },
                            { $unwind: { path: '$vesselDetails', preserveNullAndEmptyArrays: true } },
                            {
                                $lookup: {
                                    from: 'vesseltypes',
                                    localField: 'vesselDetails.typeOfVessel',
                                    foreignField: '_id',
                                    as: 'vesselTypes',
                                },
                            },
                            { $unwind: { path: '$vesselTypes', preserveNullAndEmptyArrays: true } },
                        ],
                    },
                },
                { $unwind: { path: '$typeOfVesselDetails', preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: 'subroles',
                        localField: 'subRoles',
                        foreignField: '_id',
                        as: 'subRoleDetails',
                    },
                },
                {
                    $group: {
                        _id: '$_id',
                        firstName: { $first: '$firstName' },
                        lastName: { $first: '$lastName' },
                        civilIdOrPassport: { $first: '$civilIdOrPassport' },
                        email: { $first: '$email' },
                        designationName: { $first: '$designationDetails.name' },
                        vesselName: {
                            $first: {
                                $cond: {
                                    if: { $eq: ['$vesselDetails.isActive', true] },
                                    then: '$vesselDetails.name',
                                    else: ' ',
                                },
                            },
                        },
                        vesselImoNumber: {
                            $first: {
                                $cond: {
                                    if: { $eq: ['$vesselDetails.isActive', true] },
                                    then: '$vesselDetails.imoNumber',
                                    else: ' ',
                                },
                            },
                        },
                        vesselStatus: { $first: '$vesselStatus' },
                        lastLoginAt: { $first: '$lastLoginAt' },
                        createdAt: { $first: '$createdAt' },
                        role: { $first: '$role' },
                        vesselType: { $first: '$typeOfVesselDetails.vesselTypes.name' },
                        isResetPasswordDialog: { $first: '$isResetPasswordDialog' },
                        isRegistered: { $first: '$isRegistered' },
                        subRoleDetails: { $first: '$subRoleDetails' },
                    },
                },
                {
                    $sort: { 'firstName': 1, 'lastName': 1 }
                }
            ];

            const projectStage = {
                $project: {
                    'First Name*': '$firstName',
                    'Last Name': '$lastName',
                    'User ID*': '$civilIdOrPassport',
                    'Email*': '$email',
                    'Employee Designation*': '$designationName',
                    'Current Vessel': '$vesselName',
                    'Last Login': {
                        $cond: {
                            if: { $eq: ['$lastLoginAt', null] },
                            then: ' ',
                            else: { $toDate: '$lastLoginAt' },
                        },
                    },
                    // 'User Roles': '$role',
                    'User Roles': {
                        $concat: [
                            '$role',
                            {
                                $cond: {
                                    if: {
                                        $and: [
                                            { $isArray: '$subRoleDetails' },
                                            { $gt: [{ $size: '$subRoleDetails' }, 0] }
                                        ]
                                    },
                                    then: {
                                        $concat: [
                                            '  ',
                                            {
                                                $reduce: {
                                                    input: '$subRoleDetails',
                                                    initialValue: '',
                                                    in: {
                                                        $concat: [
                                                            '$$value',
                                                            { $cond: [{ $eq: ['$$value', ''] }, '', ', '] },
                                                            '$$this.name'
                                                        ]
                                                    }
                                                }
                                            }
                                        ]
                                    },
                                    else: ' '
                                }
                            }
                        ]
                    },
                    'Vessel Type': '$vesselType',
                    'Vessel Status': {
                        $cond: {
                            if: { $eq: ['$vesselStatus', 'ONBOARDED'] },
                            then: 'ONBOARD',
                            else: '$vesselStatus'
                        }
                    },
                    'Vessel IMO Number': '$vesselImoNumber',
                    'Created At': {
                        $cond: {
                            if: { $eq: ['$createdAt', null] },
                            then: ' ',
                            else: { $toDate: '$createdAt' },
                        },
                    },
                    isResetPasswordDialog: 1,
                    'User Status': {
                        $cond: {
                            if: { $eq: ['$isRegistered', true] },
                            then: 'Active',
                            else: 'Inactive',
                        },
                    },

                },
            };
            pipeline.push(projectStage);


            const users = await User.aggregate(pipeline);
            if (users.length === 0) {
                throw CustomError(ErrorName.NOT_FOUND, "No users found matching the criteria.");
            }
            const data = users.map(user => {
                const rowData = {};
                const isResetPassword = user?.isResetPasswordDialog ?? true;
                hardcodedFields.forEach(field => {
                    if (field === 'isResetPasswordDialog') {
                        return;
                    }
                    if (field === 'Last Login' && user['Last Login'] !== 'N/A') {
                        rowData[field] = isResetPassword ? formatDateWithSuffix(new Date(user['Last Login'])) : "";
                    } else if (field === 'Created At' && user['Created At'] !== 'N/A') {
                        rowData[field] = formatDateWithSuffix(new Date(user['Created At']));
                    } else {
                        rowData[field] = user[field] || ' ';
                    }
                });
                return rowData;
            });

            /**  
                        @initial_requirement
                        //Old data to export user to csv
            
                        // const workbook = xlsx.utils.book_new();
                        const worksheet = xlsx.utils.json_to_sheet(data);
                        const csvData = xlsx.utils.sheet_to_csv(worksheet);
                        // xlsx.utils.book_append_sheet(workbook, worksheet, "Users");
                        // const excelBuffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
                        const csvBuffer = Buffer.from(csvData, 'utf-8');
                        const excelFilePath = await UploadHelper.uploadExcel({
                            data: csvBuffer,
                            folderName: "exports",
                            fileName: `exported_users_${Date.now()}.csv`,
                            uploadType: UploadHelper.uploadType.exportExcel,
                        });
              */

            /**
             * @description
             *  New change exporting to xlsx file since csv had issue opening user ids with leading zeros
             */
            const decryptedData = data?.map(user => {
                return {
                    ...user,
                    'First Name*': toUpperCaseFirstLetter(decrypt(user['First Name*'])),
                    'Last Name': toUpperCaseFirstLetter(decrypt(user['Last Name'])),
                    'Email*': decrypt(user['Email*']),
                    'User ID*': decrypt(user['User ID*']),
                };
            });
            console.log(decryptedData);
            const workbook = xlsx.utils.book_new();
            const worksheet = xlsx.utils.json_to_sheet(decryptedData);
            xlsx.utils.book_append_sheet(workbook, worksheet, "Users");
            const excelBuffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
            const excelFilePath = await UploadHelper.uploadExcel({
                data: excelBuffer,
                folderName: "exports",
                fileName: `exported_users_${await generateFileNameTimestamp()}.xlsx`,
                uploadType: UploadHelper.uploadType.exportExcel,
            });

            if (excelFilePath) {
                const s3PresignedUrl = await AwsHelper.fetchFile(excelFilePath);
                const urlObject = new URL(s3PresignedUrl);
                const extractedfilePath = urlObject.pathname;
                const exportEntry = new Export({
                    filePath: extractedfilePath,
                    subscriberId: subscriberId,
                    createdBy: userId,
                    updatedBy: userId,
                    type_of_export: 'USER_EXPORT'
                });
                await exportEntry.save();
                const successNotification = {
                    subscriber: subscriberId,
                    title: [{ lang: "en", value: `User Export Successful` }],
                    message: [
                        {
                            lang: "en",
                            // value: `The export user process completed successfully by ${decrypt(userInfo?.firstName)} ${userInfo.lastName ? decrypt(userInfo?.lastName) : ''}.`,
                            value: `"User Export" file is ready:`,
                        },
                    ],
                    notificationType: NotificationType.EXPORT_SUCCESSFUL,
                    notifyAllAdmin: false,
                    isNotificatonForAdmin: true,
                    notifiers: [userId],
                    additionalInfo: [
                        {
                            infoType: "EXPORT_URL",
                            infoData: {
                                filePath: excelFilePath
                            }
                        }
                    ],
                    employeeNotifiers: [],
                    affected: [{ targetRef: "Export", target: exportEntry._id }],
                    icon: notificationiconEnum.SUCCESS,
                    createdBy: userInfo,
                };
                // notifications.push(successNotification);
                await NotificationHelper.createNotification([successNotification]);
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
            throw CustomError(ErrorName.FAILED_TO_EXPORT_USERS_TO_CSV, error.message);
        }
    },
    exportUserDataForPowerBi: async ({ userObjectIds }, context) => {
        const { role, userId, subscriberId, userInfo } = AuthUser(context);
        if (!role || role !== Role.ADMIN) {
            throw CustomError(ErrorName.FORBIDDEN);
        }
        const hardcodedFields = [
            "First Name",
            "Last Name",
            "User ID",
            "Email",
            "Designation",
            "Vessel Name",
            "IMO Number",
            "Current Status",
            "Last Login",
            "Created At",
            "User Roles",
            "Vessel Type",
            "User Status",
            "User State",
        ];

        try {
            if (userObjectIds?.regType === undefined || userObjectIds?.regType === null) {
                throw CustomError(ErrorName.REGTYPE_REQUIRED, "regType is required.");
            }
            const notifications = [];
            
            const regType = userObjectIds?.regType;
            if (![0, 1, 2].includes(regType)) {
                throw CustomError(ErrorName.INVALID_REG_TYPE, "Invalid regType provided. Must be 0, 1, or 2.");
            }
            let employeeQuery = {};
            if (regType === 0) {
                employeeQuery = { regType: { $in: [1, 2] } };
            } else {
                employeeQuery = { regType: regType };
            }

            let userIds = [];
            if (userObjectIds?.ids && userObjectIds.ids.length > 0) {
                await checkUserRegType(userObjectIds.ids, regType);
                userIds = userObjectIds.ids.map(id => mongoose.Types.ObjectId(id));
            } else {
                const employees = await Employee.find(employeeQuery).select('user');
                userIds = employees.map(emp => emp.user);
            }
            const initialMatchStage = {
                $match: {
                    _id: { $in: userIds },
                    isDeleted: false
                }
            };
            if (userObjectIds?.filterInput) {
                await processFilters(userObjectIds.filterInput, initialMatchStage);
            }
            const pipeline = [
                initialMatchStage,
                {
                    $lookup: {
                        from: 'employees',
                        localField: '_id',
                        foreignField: 'user',
                        as: 'employeeDetails',
                    },
                },
                { $unwind: { path: '$employeeDetails', preserveNullAndEmptyArrays: true } },
                {
                    $match: {
                        'employeeDetails.regType': regType === 0 ? { $in: [1, 2] } : regType
                    }
                },
                {
                    $lookup: {
                        from: 'vessels',
                        localField: 'currentVessel',
                        foreignField: '_id',
                        as: 'vesselDetails',
                    },
                },
                { $unwind: { path: '$vesselDetails', preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: 'designations',
                        localField: 'employeeDetails.empDesignation',
                        foreignField: '_id',
                        as: 'designationDetails',
                    },
                },
                { $unwind: { path: '$designationDetails', preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: 'uservessels',
                        localField: '_id',
                        foreignField: 'user',
                        as: 'typeOfVesselDetails',
                        pipeline: [
                            {
                                $lookup: {
                                    from: 'vessels',
                                    localField: 'vessel',
                                    foreignField: '_id',
                                    as: 'vesselDetails',
                                },
                            },
                            { $unwind: { path: '$vesselDetails', preserveNullAndEmptyArrays: true } },
                            {
                                $lookup: {
                                    from: 'vesseltypes',
                                    localField: 'vesselDetails.typeOfVessel',
                                    foreignField: '_id',
                                    as: 'vesselTypes',
                                },
                            },
                            { $unwind: { path: '$vesselTypes', preserveNullAndEmptyArrays: true } },
                        ],
                    },
                },
                { $unwind: { path: '$typeOfVesselDetails', preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: 'subroles',
                        localField: 'subRoles',
                        foreignField: '_id',
                        as: 'subRoleDetails',
                    },
                },
                {
                    $group: {
                        _id: '$_id',
                        firstName: { $first: '$firstName' },
                        lastName: { $first: '$lastName' },
                        civilIdOrPassport: { $first: '$civilIdOrPassport' },
                        email: { $first: '$email' },
                        designationName: { $first: '$designationDetails.name' },
                        vesselName: {
                            $first: {
                                $cond: {
                                    if: { $eq: ['$vesselDetails.isActive', true] },
                                    then: '$vesselDetails.name',
                                    else: ' ',
                                },
                            },
                        },
                        vesselImoNumber: {
                            $first: {
                                $cond: {
                                    if: { $eq: ['$vesselDetails.isActive', true] },
                                    then: '$vesselDetails.imoNumber',
                                    else: ' ',
                                },
                            },
                        },
                        vesselStatus: { $first: '$vesselStatus' },
                        lastLoginAt: { $first: '$lastLoginAt' },
                        createdAt: { $first: '$createdAt' },
                        role: { $first: '$role' },
                        vesselType: { $first: '$typeOfVesselDetails.vesselTypes.name' },
                        isResetPasswordDialog: { $first: '$isResetPasswordDialog' },
                        isRegistered: { $first: '$isRegistered' },
                        subRoleDetails: { $first: '$subRoleDetails' },
                        isSignupAdminAprroved: { $first: '$isSignupAdminAprroved'},
                    },
                },
                {
                    $sort: { 'firstName': 1, 'lastName': 1 }
                }
            ];

            const projectStage = {
                $project: {
                    "First Name": "$firstName",
                    "Last Name": "$lastName",
                    "User ID": "$civilIdOrPassport",
                    Email: "$email",
                    Designation: "$designationName",
                    "Vessel Name": "$vesselName",
                    "IMO Number": "$vesselImoNumber",
                    "Current Status": {
                        $cond: {
                            if: { $eq: ["$vesselStatus", "ONBOARDED"] },
                            then: "ONBOARD",
                            else: "$vesselStatus",
                        },
                    },
                    "Last Login": {
                        $cond: {
                            if: { $eq: ["$lastLoginAt", null] },
                            then: " ",
                            else: { $toDate: "$lastLoginAt" },
                        },
                    },
                    "Created At": {
                        $cond: {
                            if: { $eq: ["$createdAt", null] },
                            then: " ",
                            else: { $toDate: "$createdAt" },
                        },
                    },
                    "User Roles": {
                        $concat: [
                            "$role",
                            {
                                $cond: {
                                    if: {
                                        $and: [
                                            { $isArray: "$subRoleDetails" },
                                            { $gt: [{ $size: "$subRoleDetails" }, 0] },
                                        ],
                                    },
                                    then: {
                                        $concat: [
                                            "  ",
                                            {
                                                $reduce: {
                                                    input: "$subRoleDetails",
                                                    initialValue: "",
                                                    in: {
                                                        $concat: [
                                                            "$$value",
                                                            {
                                                                $cond: [
                                                                    { $eq: ["$$value", ""] },
                                                                    "",
                                                                    ", ",
                                                                ],
                                                            },
                                                            "$$this.name",
                                                        ],
                                                    },
                                                },
                                            },
                                        ],
                                    },
                                    else: " ",
                                },
                            },
                        ],
                    },
                    "Vessel Type": "$vesselType",
                    "User Status": {
                        $cond: {
                            if: { $eq: ["$isSignupAdminAprroved", true] },
                            then: "Accepted",
                            else: "Not Accepted",
                        },
                    },
                    "User State": {
                        $cond: {
                            if: { $eq: ["$isRegistered", true] },
                            then: "Registered",
                            else: "Unregistered",
                        },
                    },
                },
            };

            pipeline.push(projectStage);


            const users = await User.aggregate(pipeline);
            if (users.length === 0) {
                throw CustomError(ErrorName.NOT_FOUND, "No users found matching the criteria.");
            }
            const data = users.map(user => {
                const rowData = {};
                const isResetPassword = user?.isResetPasswordDialog ?? true;
                hardcodedFields.forEach(field => {
                    if (field === 'isResetPasswordDialog') {
                        return;
                    }
                    if (field === 'Last Login' && user['Last Login'] !== 'N/A') {
                        rowData[field] = isResetPassword ? formatDateWithSuffix(new Date(user['Last Login'])) : "";
                    } else if (field === 'Created At' && user['Created At'] !== 'N/A') {
                        rowData[field] = formatDateWithSuffix(new Date(user['Created At']));
                    } else {
                        rowData[field] = user[field] || ' ';
                    }
                });
                return rowData;
            });

            /**  
                        @initial_requirement
                        //Old data to export user to csv
            
                        // const workbook = xlsx.utils.book_new();
                        const worksheet = xlsx.utils.json_to_sheet(data);
                        const csvData = xlsx.utils.sheet_to_csv(worksheet);
                        // xlsx.utils.book_append_sheet(workbook, worksheet, "Users");
                        // const excelBuffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
                        const csvBuffer = Buffer.from(csvData, 'utf-8');
                        const excelFilePath = await UploadHelper.uploadExcel({
                            data: csvBuffer,
                            folderName: "exports",
                            fileName: `exported_users_${Date.now()}.csv`,
                            uploadType: UploadHelper.uploadType.exportExcel,
                        });
              */

            /**
             * @description
             *  New change exporting to xlsx file since csv had issue opening user ids with leading zeros
             */
            const decryptedData = data.map(user => ({
                ...user,
                "First Name": toUpperCaseFirstLetter(decrypt(user["First Name"])),
                "Last Name": toUpperCaseFirstLetter(decrypt(user["Last Name"])),
                Email: decrypt(user["Email"]),
                "User ID": decrypt(user["User ID"]),
            }));

            console.log(decryptedData);
            const workbook = xlsx.utils.book_new();
            const worksheet = xlsx.utils.json_to_sheet(decryptedData);
            xlsx.utils.book_append_sheet(workbook, worksheet, "Users");
            const excelBuffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
            const excelFilePath = await UploadHelper.uploadExcel({
                data: excelBuffer,
                folderName: "exports",
                fileName: `exported_users_${await generateFileNameTimestamp()}.xlsx`,
                uploadType: UploadHelper.uploadType.exportExcel,
            });

            if (excelFilePath) {
                const s3PresignedUrl = await AwsHelper.fetchFile(excelFilePath);
                const urlObject = new URL(s3PresignedUrl);
                const extractedfilePath = urlObject.pathname;
                /* const exportEntry = new Export({
                    filePath: extractedfilePath,
                    subscriberId: subscriberId,
                    createdBy: userId,
                    updatedBy: userId,
                    type_of_export: 'USER_EXPORT'
                });
                await exportEntry.save();
                const successNotification = {
                    subscriber: subscriberId,
                    title: [{ lang: "en", value: `User Export Successful` }],
                    message: [
                        {
                            lang: "en",
                            // value: `The export user process completed successfully by ${decrypt(userInfo?.firstName)} ${userInfo.lastName ? decrypt(userInfo?.lastName) : ''}.`,
                            value: `"User Export" file is ready:`,
                        },
                    ],
                    notificationType: NotificationType.EXPORT_SUCCESSFUL,
                    notifyAllAdmin: false,
                    isNotificatonForAdmin: true,
                    notifiers: [userId],
                    additionalInfo: [
                        {
                            infoType: "EXPORT_URL",
                            infoData: {
                                filePath: excelFilePath
                            }
                        }
                    ],
                    employeeNotifiers: [],
                    affected: [{ targetRef: "Export", target: exportEntry._id }],
                    icon: notificationiconEnum.SUCCESS,
                    createdBy: userInfo,
                };
                // notifications.push(successNotification);
                await NotificationHelper.createNotification([successNotification]); */
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
            throw CustomError(ErrorName.FAILED_TO_EXPORT_USERS_TO_CSV, error.message);
        }
    },
    createOrUpdateDynamicData: async ({ input }, context) => {
        const { role, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);
        try {
            const { userId, jsonData } = input;

            if (!userId) {
                throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "UserId is required");
            }

            if (!jsonData || typeof jsonData !== "object") {
                throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "jsonData is required and should be an object");
            }

            const user = await User.findOne({ _id: userId, isDeleted: false, isRegistered: true });

            if (!user) {
                throw CustomError(ErrorName.USER_NOT_FOUND, "User not found or not Registered");
            }

            const existingRecord = await DynamicData.findOne({ userId });

            let savedData;

            if (existingRecord) {
                existingRecord.jsonData = jsonData;
                savedData = await existingRecord.save();
            } else {
                savedData = await DynamicData.create({
                    userId,
                    jsonData,
                });
            }

            return {
                status: true,
                message: existingRecord ? "Data updated successfully!" : "Data created successfully!",
                data: savedData,
            };

        } catch (error) {

            return {
                status: false,
                message: error.message || "An error occurred",
            };
        }
    }

};
