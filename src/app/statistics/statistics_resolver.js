const { ObjectId, Moment } = require("../../tools");
const {
    CustomError,
    ErrorName,
    AuthUser,
    Role,
    CurrentDateTime,
    ParseDateTime,
} = require("../../util");

const { TrainingRegistration } = require("../training-registrations/training_registration_model");
const { Organization } = require("../organizations/organization_model");

const StatisticsHelper = require("./statistics_helper");
const SubRoleHelper = require("../user/sub-roles/sub_role_helper");

const TrainingRegistrationStatus = require("../training-registrations/training_registration_status.json");
const GraphStatisticsType = require("./graph_statistics_type.json");
const ApprovalStatus = require("../trainings/approval_status.json");
const Permission = require("../user/sub-roles/permission.json");

module.exports.queries = {
    getTraineeStatistics: async ({ id }, context) => {
        const { role, subscriberId, employeeId } = AuthUser(context);

        const filterConditions = {};

        if (role === Role.EMPLOYEE && employeeId) {
            filterConditions.subscriber = subscriberId;
            filterConditions.employee = employeeId;
        } else if (role === Role.ADMIN && id) {
            filterConditions.subscriber = subscriberId;
            filterConditions.employee = ObjectId(id);
        }

        if (!Object.keys(filterConditions).length) throw CustomError(ErrorName.ARGUMENTS_REQUIRED);

        const currentDate = CurrentDateTime().kwtDateTimeObj; //TODO:confirm timezone

        const statistics = await TrainingRegistration.aggregate([
            { $match: filterConditions },
            {
                $facet: {
                    assignedCourses: [
                        {
                            $match: {
                                status: TrainingRegistrationStatus.REGISTERED,
                            },
                        },
                        {
                            $group: {
                                _id: "assignedCourses",
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    ongoingCourses: [
                        {
                            $match: { status: TrainingRegistrationStatus.STARTED },
                        },
                        {
                            $group: {
                                _id: "ongoingCourses",
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    completedCourses: [
                        {
                            $match: { status: TrainingRegistrationStatus.COMPLETED },
                        },
                        {
                            $group: {
                                _id: "completedCourses",
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    aboutDueCourses: [
                        {
                            $match: { status: { $ne: TrainingRegistrationStatus.COMPLETED } },
                        },
                        {
                            $project: {
                                dueWarningDate: {
                                    $dateSubtract: {
                                        startDate: "$endDate",
                                        unit: "day",
                                        amount: 5,
                                    },
                                },
                            },
                        },
                        {
                            $match: {
                                dueWarningDate: {
                                    $lte: currentDate.toDate(),
                                },
                            },
                        },
                        {
                            $group: {
                                _id: "aboutDueCourses",
                                count: { $sum: 1 },
                            },
                        },
                    ],
                },
            },
        ]);

        const stat = statistics[0];

        return {
            assignedCourses: stat.assignedCourses[0]?.count,
            ongoingCourses: stat.ongoingCourses[0]?.count,
            completedCourses: stat.completedCourses[0]?.count,
            aboutDueCourses: stat.aboutDueCourses[0]?.count,
        };
    },
    getSubscriberStatistics: async ({}, context) => {
        const { role, userPermissions, subscriberId, isOrganizationManager } = AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.GET_SUBSCRIBER_STATISTICS,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const filterConditions = { subscriber: subscriberId };

        const statistics = await TrainingRegistration.aggregate([
            {
                $match: filterConditions,
            },
            // {
            //     $project: {
            //         _id: 0,
            //         subscriber: 1,
            //     },
            // },
            {
                $facet: {
                    totalRegistrations: [
                        {
                            $group: {
                                _id: "totalRegistrations",
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    totalCompletions: [
                        {
                            $match: { status: TrainingRegistrationStatus.COMPLETED },
                        },
                        {
                            $group: {
                                _id: "totalCompletions",
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    totalTrainings: [
                        {
                            $group: {
                                _id: "$subscriber",
                            },
                        },
                        {
                            $lookup: {
                                from: "trainings",
                                localField: "_id",
                                foreignField: "subscriber",
                                as: "trainings",
                            },
                        },
                        {
                            $unwind: "$trainings",
                        },
                        {
                            $group: {
                                _id: "totalTrainings",
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    totalAvailableTrainings: [
                        {
                            $group: {
                                _id: "$subscriber",
                            },
                        },
                        {
                            $lookup: {
                                from: "trainings",
                                localField: "_id",
                                foreignField: "subscriber",
                                as: "trainings",
                            },
                        },
                        {
                            $unwind: "$trainings",
                        },
                        {
                            $match: {
                                "trainings.approvalStatus": ApprovalStatus.APPROVED,
                                "trainings.isActive": true,
                                "trainings.isDeleted": false,
                            },
                        },
                        {
                            $group: {
                                _id: "totalAvailableTrainings",
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    totalApprovalPendingTrainings: [
                        {
                            $group: {
                                _id: "$subscriber",
                            },
                        },
                        {
                            $lookup: {
                                from: "trainings",
                                localField: "_id",
                                foreignField: "subscriber",
                                as: "trainings",
                            },
                        },
                        {
                            $unwind: "$trainings",
                        },
                        {
                            $match: { "trainings.approvalStatus": ApprovalStatus.PENDING },
                        },
                        {
                            $group: {
                                _id: "totalApprovalPendingTrainings",
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    totalDisabledTrainings: [
                        {
                            $group: {
                                _id: "$subscriber",
                            },
                        },
                        {
                            $lookup: {
                                from: "trainings",
                                localField: "_id",
                                foreignField: "subscriber",
                                as: "trainings",
                            },
                        },
                        {
                            $unwind: "$trainings",
                        },
                        {
                            $match: { "trainings.isActive": false },
                        },
                        {
                            $group: {
                                _id: "totalDisabledTrainings",
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    totalRejectedTrainings: [
                        {
                            $group: {
                                _id: "$subscriber",
                            },
                        },
                        {
                            $lookup: {
                                from: "trainings",
                                localField: "_id",
                                foreignField: "subscriber",
                                as: "trainings",
                            },
                        },
                        {
                            $unwind: "$trainings",
                        },
                        {
                            $match: { "trainings.approvalStatus": ApprovalStatus.REJECTED },
                        },
                        {
                            $group: {
                                _id: "totalRejectedTrainings",
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    totalTrainers: [
                        {
                            $group: {
                                _id: "$subscriber",
                            },
                        },
                        {
                            $lookup: {
                                from: "users",
                                localField: "_id",
                                foreignField: "subscriber",
                                pipeline: [
                                    {
                                        $lookup: {
                                            from: "subroles",
                                            localField: "subRoles",
                                            foreignField: "_id",
                                            as: "subRoles",
                                        },
                                    },
                                    {
                                        $unwind: "$subRoles",
                                    },
                                    {
                                        $match: { "subRoles.name": "TRAINER" },
                                    },
                                ],
                                as: "users",
                            },
                        },
                        {
                            $unwind: "$users",
                        },
                        {
                            $group: {
                                _id: "totalTrainers",
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    totalEmployees: [
                        {
                            $group: {
                                _id: "$subscriber",
                            },
                        },
                        {
                            $lookup: {
                                from: "employees",
                                localField: "_id",
                                foreignField: "subscriber",
                                as: "employees",
                            },
                        },
                        {
                            $unwind: "$employees",
                        },
                        {
                            $group: {
                                _id: "totalEmployees",
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    totalRevenue: [
                        {
                            $group: {
                                _id: "$subscriber",
                            },
                        },
                        {
                            $lookup: {
                                from: "trainingregistrationinvoices",
                                localField: "_id",
                                foreignField: "subscriber",
                                as: "invoices",
                            },
                        },
                        {
                            $unwind: "$invoices",
                        },
                        {
                            $group: {
                                _id: "totalRevenue",
                                amount: { $sum: "$invoices.invoiceAmount" },
                            },
                        },
                    ],
                },
            },
        ]);

        const stat = statistics[0];

        return {
            totalRegistrations: stat.totalRegistrations[0]?.count,
            totalCompletions: stat.totalCompletions[0]?.count,
            totalTrainings: stat.totalTrainings[0]?.count,
            totalAvailableTrainings: stat.totalAvailableTrainings[0]?.count,
            totalApprovalPendingTrainings: stat.totalApprovalPendingTrainings[0]?.count,
            totalDisabledTrainings: stat.totalDisabledTrainings[0]?.count,
            totalRejectedTrainings: stat.totalRejectedTrainings[0]?.count,
            totalTrainers: stat.totalTrainers[0]?.count,
            totalEmployees: stat.totalEmployees[0]?.count,
            totalRevenue: stat.totalRevenue[0]?.amount,
            totalOrganizations: await Organization.countDocuments(),
        };
    },
    getGraphStatistics: async ({ type }, context) => {
        const { role, userPermissions, subscriberId, isOrganizationManager } = AuthUser(context);

        const timezone = context.timezone ?? "Asia/Kuwait";

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.GET_SUBSCRIBER_STATISTICS,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const filterConditions = { subscriber: subscriberId };

        if (type === GraphStatisticsType.REGISTRATION) {
            return StatisticsHelper.fetchTotalTrainingRegistrationStatisticsGraph({
                filterConditions,
                timezone,
            });
        } else if (type === GraphStatisticsType.TRAINING) {
            return StatisticsHelper.fetchTotalTrainingStatisticsGraph({
                filterConditions,
                timezone,
            });
        } else if (type === GraphStatisticsType.TRAINER) {
            return StatisticsHelper.fetchTotalTrainerStatisticsGraph({
                filterConditions,
                timezone,
            });
        } else if (type === GraphStatisticsType.EMPLOYEE) {
            return StatisticsHelper.fetchTotalEmployeesStatisticsGraph({
                filterConditions,
                timezone,
            });
        } else if (type === GraphStatisticsType.ORGANIZATION) {
            return StatisticsHelper.fetchTotalOrganizationStatisticsGraph({ timezone });
        } else if (type === GraphStatisticsType.REVENUE) {
            return StatisticsHelper.fetchTotalRevenueStatisticsGraph({
                filterConditions,
                timezone,
            });
        }
    },
};
