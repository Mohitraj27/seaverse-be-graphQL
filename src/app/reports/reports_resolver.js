const { Moment } = require("../../tools");
const { CustomError, ErrorName, AuthUser, Role } = require("../../util");

const { TrainingRegistration } = require("../training-registrations/training_registration_model");
const { Training } = require("../trainings/training_model");
const { Employee } = require("../user/employee/employee_model");

const {
    TrainingRegistrationInvoice,
} = require("../training-registrations/training-registration-invoices/training_registration_invoice_model");

const SubRoleHelper = require("../user/sub-roles/sub_role_helper");

const Permission = require("../user/sub-roles/permission.json");

module.exports.queries = {
    getRevenueReports: async ({ pageInput, filterInput }, context) => {
        const { role, userPermissions, subscriberId, isOrganizationManager } = AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.GET_REVENUE_REPORTS,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50;

        let filterConditions = { subscriber: subscriberId };

        if (filterInput) {
            if (filterInput.dateFrom || filterInput.dateTo) {
                filterConditions.createdAt = {};

                if (filterInput.dateFrom)
                    filterConditions.createdAt.$gte = Moment(filterInput.dateFrom)
                        .startOf("day")
                        .toDate();

                if (filterInput.dateTo)
                    filterConditions.createdAt.$lte = Moment(filterInput.dateTo)
                        .endOf("day")
                        .toDate();
            }
        }

        const fetchResult = async pipeline => {
            return TrainingRegistrationInvoice.aggregatePaginate(
                TrainingRegistrationInvoice.aggregate(pipeline),
                {
                    offset: skip,
                    limit,
                    sort: { createdAt: "descending" },
                    customLabels: {
                        docs: "revenueReports",
                        totalDocs: "totalCount",
                        offset: "skip",
                    },
                    pagination: limit !== 0,
                    allowDiskUse: true,
                }
            );
        };

        if (context.platform === Role.ADMIN) {
            const pipeline = [
                {
                    $match: filterConditions,
                },
                {
                    $lookup: {
                        from: "trainingregistrationinvoices",
                        localField: "_id",
                        foreignField: "_id",
                        as: "trainingRegistrationInvoice",
                    },
                },
                {
                    $unwind: "$trainingRegistrationInvoice",
                },
                {
                    $lookup: {
                        from: "trainingregistrations",
                        localField: "_id",
                        foreignField: "invoice",
                        pipeline: [
                            {
                                $lookup: {
                                    from: "organizations",
                                    localField: "organization",
                                    foreignField: "_id",
                                    as: "organization",
                                },
                            },
                            {
                                $lookup: {
                                    from: "trainings",
                                    localField: "training",
                                    foreignField: "_id",
                                    as: "training",
                                },
                            },
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
                                                pipeline: [
                                                    {
                                                        $project: {
                                                            firstName: true,
                                                            lastName: true,
                                                            avatar: true,
                                                        },
                                                    },
                                                ],
                                                as: "user",
                                            },
                                        },
                                        {
                                            $project: {
                                                user: true,
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
                                    organization: {
                                        $first: "$organization",
                                    },
                                },
                            },
                            {
                                $set: {
                                    training: {
                                        $first: "$training",
                                    },
                                },
                            },
                            {
                                $set: {
                                    employee: {
                                        $first: "$employee",
                                    },
                                },
                            },
                        ],
                        as: "trainingRegistration",
                    },
                },
                {
                    $addFields: {
                        totalRegistrations: {
                            $size: "$trainingRegistration",
                        },
                        organization: {
                            $arrayElemAt: ["$trainingRegistration.organization", 0],
                        },
                        training: { $arrayElemAt: ["$trainingRegistration.training", 0] },
                        employee: { $arrayElemAt: ["$trainingRegistration.employee", 0] },
                    },
                },
                ...(filterInput?.organization
                    ? [
                          {
                              $match: {
                                  "organization._id": filterInput.organization,
                              },
                          },
                      ]
                    : []),
                ...(filterInput?.training
                    ? [
                          {
                              $match: {
                                  "training._id": filterInput.training,
                              },
                          },
                      ]
                    : []),
                ...(filterInput?.employee
                    ? [
                          {
                              $match: {
                                  "employee._id": filterInput.employee,
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
                                          "organization.name.value": {
                                              $regex: ".*" + filterInput.search + ".*",
                                              $options: "i",
                                          },
                                      },
                                      {
                                          "training.title.value": {
                                              $regex: ".*" + filterInput.search + ".*",
                                              $options: "i",
                                          },
                                      },
                                  ],
                              },
                          },
                      ]
                    : []),
            ];

            return await fetchResult(pipeline);
        }

        throw CustomError(ErrorName.FORBIDDEN);
    },
    getQuizReports: async ({ pageInput, filterInput }, context) => {
        const { role, userPermissions, subscriberId, isOrganizationManager, managingOrganization } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.GET_QUIZ_REPORTS,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50;

        let filterConditions = { subscriber: subscriberId };

        if (filterInput) {
            if (filterInput.employee) filterConditions.employee = filterInput.employee;
            if (filterInput.training) filterConditions.training = filterInput.training;
            if (filterInput.organization) filterConditions.organization = filterInput.organization;
        }

        const fetchResult = async pipeline => {
            return TrainingRegistration.aggregatePaginate(
                TrainingRegistration.aggregate(pipeline),
                {
                    offset: skip,
                    limit,
                    sort: { createdAt: "descending" },
                    customLabels: {
                        docs: "quizReports",
                        totalDocs: "totalCount",
                        offset: "skip",
                    },
                    pagination: limit !== 0,
                    allowDiskUse: true,
                }
            );
        };

        if (context.platform === Role.ADMIN) {
            if (isOrganizationManager) {
                filterConditions.organization = managingOrganization;
            }

            const pipeline = [
                {
                    $match: filterConditions,
                },
                {
                    $lookup: {
                        from: "trainings",
                        localField: "training",
                        foreignField: "_id",
                        pipeline: [
                            ...(filterInput?.trainingCategory
                                ? [
                                      {
                                          $match: {
                                              trainingCategories: filterInput.trainingCategory,
                                          },
                                      },
                                  ]
                                : []),
                            {
                                $project: {
                                    title: true,
                                    images: true,
                                    trainingCategories: true,
                                },
                            },
                        ],
                        as: "training",
                    },
                },
                {
                    $set: {
                        training: {
                            $first: "$training",
                        },
                    },
                },
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
                                    pipeline: [
                                        {
                                            $project: {
                                                firstName: true,
                                                lastName: true,
                                                avatar: true,
                                            },
                                        },
                                    ],
                                    as: "user",
                                },
                            },
                            {
                                $project: {
                                    user: true,
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
                ...(filterInput?.search
                    ? [
                          {
                              $match: {
                                  $or: [
                                      {
                                          "employee.user.firstName": {
                                              $regex: ".*" + filterInput.search + ".*",
                                              $options: "i",
                                          },
                                      },
                                      {
                                          "employee.user.lastName": {
                                              $regex: ".*" + filterInput.search + ".*",
                                              $options: "i",
                                          },
                                      },
                                      {
                                          "training.title.value": {
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
                        from: "trainingprogresses",
                        localField: "_id",
                        foreignField: "trainingRegistration",
                        pipeline: [
                            {
                                $lookup: {
                                    from: "trainingmodulecontents",
                                    localField: "trainingModuleContent",
                                    foreignField: "_id",
                                    pipeline: [
                                        {
                                            $project: {
                                                trainingModule: true,
                                                contentType: true,
                                                title: true,
                                                // quiz: true,
                                                quizContent: true,
                                            },
                                        },
                                        {
                                            $lookup: {
                                                from: "quizcontents",
                                                localField: "quizContent",
                                                foreignField: "_id",
                                                as: "quizContent",
                                            },
                                        },
                                        {
                                            $unwind: "$quizContent",
                                        },
                                        {
                                            $lookup: {
                                                from: "trainingmodules",
                                                localField: "trainingModule",
                                                foreignField: "_id",
                                                as: "trainingModule",
                                            },
                                        },
                                        {
                                            $unwind: "$trainingModule",
                                        },
                                    ],
                                    as: "trainingModuleContent",
                                },
                            },
                            {
                                $unwind: "$trainingModuleContent",
                            },
                            {
                                $project: {
                                    trainingModuleContent: true,
                                    quizAttempts: true,
                                },
                            },
                            {
                                $match: {
                                    $and: [
                                        {
                                            "trainingModuleContent.contentType": "QUIZ",
                                        },
                                        {
                                            "quizAttempts.0": { $exists: true },
                                        },
                                    ],
                                },
                            },
                            {
                                $set: {
                                    totalAttempts: {
                                        $size: "$quizAttempts",
                                    },
                                    quizAttempts: {
                                        $last: "$quizAttempts",
                                    },
                                },
                            },
                        ],
                        as: "trainingProgresses",
                    },
                },
                {
                    $unwind: "$trainingProgresses",
                },
                {
                    $project: {
                        employee: true,
                        trainingProgresses: true,
                    },
                },
            ];

            return await fetchResult(pipeline);
        }
    },
    getFeedbackReports: async ({ pageInput, filterInput }, context) => {
        const { role, userPermissions, subscriberId, isOrganizationManager, managingOrganization } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.GET_FEEDBACK_REPORTS,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50;

        let filterConditions = { subscriber: subscriberId, feedback: { $exists: true, $ne: null } };
        let trainingData = null;
        if (filterInput) {
            if (filterInput.dateFrom || filterInput.dateTo) {
                filterConditions.startDate = {};

                if (filterInput.dateFrom)
                    filterConditions.startDate.$gte = Moment(filterInput.dateFrom)
                        .startOf("day")
                        .toDate();

                if (filterInput.dateTo)
                    filterConditions.startDate.$lte = Moment(filterInput.dateTo)
                        .endOf("day")
                        .toDate();
            }
            if (filterInput.training) {
                filterConditions.training = filterInput.training;
                trainingData = await Training.findOne({
                    _id: filterInput.training,
                    subscriber: subscriberId,
                });
            }
            if (filterInput.organization) filterConditions.organization = filterInput.organization;
        }

        const fetchResult = async pipeline => {
            let feedbackReportsData = await TrainingRegistration.aggregatePaginate(
                TrainingRegistration.aggregate(pipeline),
                {
                    offset: skip,
                    limit,
                    sort: { startDate: "descending" },
                    customLabels: {
                        docs: "feedbackReports",
                        totalDocs: "totalCount",
                        offset: "skip",
                    },
                    pagination: limit !== 0,
                    allowDiskUse: true,
                }
            );
            feedbackReportsData.training = trainingData;

            return feedbackReportsData;
        };

        if (context.platform === Role.ADMIN) {
            if (isOrganizationManager) {
                filterConditions.organization = managingOrganization;
            }

            const pipeline = [
                {
                    $match: filterConditions,
                },
                {
                    $lookup: {
                        from: "employees",
                        localField: "trainer",
                        foreignField: "_id",
                        pipeline: [
                            {
                                $lookup: {
                                    from: "users",
                                    localField: "user",
                                    foreignField: "_id",
                                    pipeline: [
                                        {
                                            $project: {
                                                firstName: true,
                                                lastName: true,
                                                avatar: true,
                                            },
                                        },
                                    ],
                                    as: "user",
                                },
                            },
                            {
                                $project: {
                                    user: true,
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
                        as: "trainer",
                    },
                },
                {
                    $set: {
                        trainer: {
                            $first: "$trainer",
                        },
                    },
                },
                {
                    $lookup: {
                        from: "trainings",
                        localField: "training",
                        foreignField: "_id",
                        pipeline: [
                            {
                                $project: {
                                    trainingCategories: true,
                                },
                            },
                        ],
                        as: "training",
                    },
                },
                {
                    $set: {
                        training: {
                            $first: "$training",
                        },
                    },
                },
                ...(filterInput?.trainingCategory
                    ? [
                          {
                              $match: {
                                  "training.trainingCategories": filterInput.trainingCategory,
                              },
                          },
                      ]
                    : []),
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
                                    pipeline: [
                                        {
                                            $project: {
                                                firstName: true,
                                                lastName: true,
                                                avatar: true,
                                            },
                                        },
                                    ],
                                    as: "user",
                                },
                            },
                            {
                                $project: {
                                    user: true,
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
                ...(filterInput?.search
                    ? [
                          {
                              $match: {
                                  $or: [
                                      {
                                          "employee.user.firstName": {
                                              $regex: ".*" + filterInput.search + ".*",
                                              $options: "i",
                                          },
                                      },
                                      {
                                          "employee.user.lastName": {
                                              $regex: ".*" + filterInput.search + ".*",
                                              $options: "i",
                                          },
                                      },
                                      {
                                          "training.title.value": {
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
                    $project: {
                        employee: true,
                        trainer: true,
                        feedback: true,
                        startDate: true,
                    },
                },
            ];

            return await fetchResult(pipeline);
        }
    },
    getTrainingMatrixReports: async ({ pageInput, filterInput }, context) => {
        const { role, userPermissions, subscriberId, isOrganizationManager, managingOrganization } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.GET_TRAINING_MATRIX_REPORTS,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50;

        let filterConditions = { subscriber: subscriberId };

        if (filterInput) {
            if (filterInput.organization) filterConditions.organization = filterInput.organization;
        }

        const fetchResult = async pipeline => {
            return Employee.aggregatePaginate(Employee.aggregate(pipeline), {
                offset: skip,
                limit,
                sort: { createdAt: "descending" },
                customLabels: {
                    docs: "trainingMatrixReports",
                    totalDocs: "totalCount",
                    offset: "skip",
                },
                pagination: limit !== 0,
                allowDiskUse: true,
            });
        };

        if (context.platform === Role.ADMIN) {
            if (isOrganizationManager) {
                filterConditions.organization = managingOrganization;
            }

            const pipeline = [
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
                // {
                //     $set: {
                //         user: {
                //             $first: "$user",
                //         },
                //     },
                // },
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
                                  ],
                              },
                          },
                      ]
                    : []),
                {
                    $set: {
                        employee: "$$ROOT",
                    },
                },
                {
                    $lookup: {
                        from: "trainingregistrations",
                        localField: "_id",
                        foreignField: "employee",
                        pipeline: [
                            {
                                $lookup: {
                                    from: "trainingcertificates",
                                    localField: "_id",
                                    foreignField: "trainingRegistration",
                                    as: "trainingCertificate",
                                },
                            },
                            {
                                $set: {
                                    trainingCertificate: {
                                        $first: "$trainingCertificate",
                                    },
                                },
                            },
                        ],
                        as: "trainingRegistrations",
                    },
                },
                {
                    $set: {
                        trainingRegistrations: "$trainingRegistrations",
                    },
                },
            ];

            return await fetchResult(pipeline);
        }

        throw CustomError(ErrorName.FORBIDDEN);
    },
};
