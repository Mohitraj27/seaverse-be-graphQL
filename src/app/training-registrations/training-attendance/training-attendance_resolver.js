const { CustomError, ErrorName, Role, AuthUser } = require("../../../util");
const { Moment } = require("../../../tools");

const { TrainingRegistration } = require("../training_registration_model");

const TrainingAttendanceHelper = require("./training_attendance_helper");
const SubRoleHelper = require("../../user/sub-roles/sub_role_helper");

const TrainingRegistrationStatus = require("../training_registration_status.json");
const Permission = require("../../user/sub-roles/permission");

module.exports.queries = {
    getTrainingRegistrationAttendances: async ({ pageInput, filterInput }, context) => {
        const { role, userPermissions, subscriberId, isOrganizationManager, managingOrganization } =
            AuthUser(context);

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50;

        let filterConditions = {
            subscriber: subscriberId,
            // $or: [
            //     { status: TrainingRegistrationStatus.REGISTERED },
            //     { status: TrainingRegistrationStatus.STARTED },
            // ],
        };

        if (filterInput) {
            if (filterInput.startDate) {
                filterConditions.startDate = {};

                filterConditions.startDate.$gte = Moment.utc(filterInput.startDate)
                    .startOf("day")
                    .toDate();

                filterConditions.startDate.$lte = Moment.utc(filterInput.startDate)
                    .endOf("day")
                    .toDate();
            }

            if (filterInput.batch) filterConditions.batch = filterInput.batch;
            if (filterInput.training) filterConditions.training = filterInput.training;
            if (filterInput.organization) filterConditions.organization = filterInput.organization;
            if (filterInput.trainer) filterConditions.trainer = filterInput.trainer;
        }

        const fetchResult = async pipeline => {
            return await TrainingRegistration.aggregatePaginate(
                TrainingRegistration.aggregate(pipeline),
                {
                    offset: skip,
                    limit,
                    sort: { startDate: "descending" },
                    customLabels: {
                        docs: "trainingRegistrationAttendance",
                        totalDocs: "totalCount",
                        offset: "skip",
                    },
                    pagination: limit !== 0,
                    allowDiskUse: true,
                }
            );
        };

        if (context.platform === Role.ADMIN) {
            if (
                !SubRoleHelper.hasPermission({
                    currentRole: role,
                    currentPermissions: userPermissions,
                    requiredPermission: [Permission.GET_TRAINING_REGISTRATION_ATTENDANCE],
                })
            ) {
                throw CustomError(ErrorName.FORBIDDEN);
            }

            if (isOrganizationManager) {
                filterConditions.organization = managingOrganization;
            }

            const pipeline = [
                {
                    $match: filterConditions,
                },
                // {
                //     $group: {
                //         _id: { employee: "$employee" },
                //         trainingRegistration: { $first: "$$ROOT" },
                //     },
                // },
                // { $replaceRoot: { newRoot: "$trainingRegistration" } },
                {
                    $lookup: {
                        from: "employees",
                        localField: "employee",
                        foreignField: "_id",
                        pipeline: [
                            {
                                $lookup: {
                                    from: "users",
                                    localField: "user",
                                    foreignField: "_id",
                                    as: "user",
                                },
                            },
                            {
                                $set: {
                                    user: {
                                        $first: "$user",
                                    },
                                },
                            },
                        ],
                        as: "employee",
                    },
                },
                {
                    $set: {
                        employee: {
                            $first: "$employee",
                        },
                    },
                },
            ];

            return await fetchResult(pipeline);
        }

        throw CustomError(ErrorName.FORBIDDEN);
    },
};

module.exports.mutations = {
    createOrUpdateTrainingAttendance: async ({ input }, context) => {
        //TODO: authentication and permission checking need to do with context.platform
        const { role, userPermissions, isOrganizationManager } = AuthUser(context);

        if (context.platform === Role.ADMIN) {
            if (
                !SubRoleHelper.hasPermission({
                    currentRole: role,
                    currentPermissions: userPermissions,
                    requiredPermission: Permission.UPDATE_TRAINING_REGISTRATION_ATTENDANCE,
                    restrictOrganizationManager: isOrganizationManager,
                })
            ) {
                throw CustomError(ErrorName.FORBIDDEN);
            }
        } else if (context.platform === Role.EMPLOYEE && role === Role.EMPLOYEE) {
            return await TrainingAttendanceHelper.createOrUpdateTrainingAttendance(
                { input },
                context
            );
        }

        throw CustomError(ErrorName.FORBIDDEN);
    },
};
