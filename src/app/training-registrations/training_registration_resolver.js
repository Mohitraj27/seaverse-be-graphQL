const { ObjectId, Moment } = require("../../tools");
const {
    CustomError,
    ErrorName,
    AuthUser,
    Role,
    DbTransactionHelper,
    ParseDateTime,
} = require("../../util");

const { TrainingRegistration } = require("./training_registration_model");
const { TrainingProgress } = require("./training-progress/training_progress_model");
const { TrainingCertificate } = require("./training-certificates/training_certificate_model");
const { Employee } = require("../user/employee/employee_model");
const { Training } = require("../trainings/training_model");
const { Organization } = require("../organizations/organization_model");
const { Batch } = require("../batches/batch_model");

const SubRoleHelper = require("../user/sub-roles/sub_role_helper");
const TrainingRegistrationHelper = require("../training-registrations/training_registration_helper");
const TrainingRegistrationInvoiceHelper = require("../training-registrations/training-registration-invoices/training_registration_invoice_helper");
const TrainingProgressHelper = require("./training-progress/training_progress_helper");
const LogHelper = require("../logs/log_helper");
const EmployeeHelper = require("./../user/employee/employee_helper");
const { BatchHelper } = require("../batches/batch_helper");

const Permission = require("../user/sub-roles/permission.json");
const TrainingRegistrationStatus = require("./training_registration_status.json");
const LogType = require("../logs/log_type.json");
const BatchStatus = require("../batches/batch_status.json");

module.exports.queries = {
    getTrainingRegistrations: async ({ pageInput, filterInput }, context) => {
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

        let filterConditions = { subscriber: subscriberId };

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

            if (filterInput.batch) filterConditions.batch = filterInput.batch;
            if (filterInput.trainer) filterConditions.trainer = filterInput.trainer;
            if (filterInput.employee) filterConditions.employee = filterInput.employee;
            if (filterInput.training) filterConditions.training = filterInput.training;
            if (filterInput.organization) filterConditions.organization = filterInput.organization;
            if (filterInput.status) filterConditions.status = filterInput.status;
        }

        const fetchResult = async (pipeline, populations) => {
            if ((!filterInput || !Object.keys(filterInput).length) && populations) {
                return {
                    trainingRegistrations: await TrainingRegistration.find(filterConditions)
                        .lean()
                        .sort({ createdAt: "descending" })
                        .skip(skip)
                        .limit(limit)
                        .populate(populations),
                    totalCount: await TrainingRegistration.countDocuments(filterConditions),
                };
            }

            return TrainingRegistration.aggregatePaginate(
                TrainingRegistration.aggregate(pipeline),
                {
                    offset: skip,
                    limit,
                    sort: { createdAt: "descending" },
                    customLabels: {
                        docs: "trainingRegistrations",
                        totalDocs: "totalCount",
                        offset: "skip",
                    },
                    pagination: limit !== 0,
                    allowDiskUse: true,
                }
            );
        };

        if (context.platform === Role.EMPLOYEE && role === Role.EMPLOYEE) {
            filterConditions.employee = employeeId;

            const populations = [
                {
                    path: "training",
                    select: "title description images isActive trainingModules",
                    populate: {
                        path: "trainingModules",
                        select: "trainingModuleContents",
                        populate: { path: "trainingModuleContents", select: "title" },
                    },
                },
                { path: "trainingProgresses", select: "trainingModuleContent status" },
            ];

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
                            {
                                $lookup: {
                                    from: "trainingmodules",
                                    localField: "_id",
                                    foreignField: "training",
                                    pipeline: [
                                        {
                                            $lookup: {
                                                from: "trainingmodulecontents",
                                                localField: "_id",
                                                foreignField: "trainingModule",
                                                pipeline: [
                                                    {
                                                        $project: {
                                                            title: true,
                                                        },
                                                    },
                                                ],
                                                as: "trainingModuleContents",
                                            },
                                        },
                                        {
                                            $project: {
                                                trainingModuleContents: true,
                                            },
                                        },
                                    ],
                                    as: "trainingModules",
                                },
                            },
                            {
                                $project: {
                                    title: true,
                                    description: true,
                                    images: true,
                                    isActive: true,
                                    trainingModules: true,
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
                ...(filterInput?.search
                    ? [
                          {
                              $match: {
                                  $or: [
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
                                $project: {
                                    trainingModuleContent: true,
                                    status: true,
                                },
                            },
                        ],
                        as: "trainingProgresses",
                    },
                },
            ];

            return await fetchResult(pipeline, populations);
        } else if (context.platform === Role.ADMIN) {
            if (
                !SubRoleHelper.hasPermission({
                    currentRole: role,
                    currentPermissions: userPermissions,
                    requiredPermission: [
                        Permission.GET_TRAINING_REGISTRATIONS,
                        Permission.GET_REGISTRATION_REPORTS,
                    ],
                    requiredAll: false,
                })
            ) {
                throw CustomError(ErrorName.FORBIDDEN);
            }

            if (isOrganizationManager) {
                filterConditions.organization = managingOrganization;
            }

            // TODO: should limit to their related registrations or show all?
            // if (role === Role.EMPLOYEE) {
            //     filterConditions.$or = [
            //         ...filterConditions.$or,
            //         ...[{ trainer: employeeId, supervisor: employeeId }],
            //     ];
            // }

            const populations = [
                {
                    path: "training",
                    select: "title images trainingCategories",
                },
                { path: "invoice" },
                {
                    path: "trainer",
                    select: "user",
                    populate: { path: "user", select: "firstName lastName avatar" },
                },
                { path: "employee", select: "user", populate: "user" },
                { path: "organization", select: "name" },
                { path: "trainingCertificate" },
            ];

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
                        from: "trainingregistrationinvoices",
                        localField: "invoice",
                        foreignField: "_id",
                        as: "invoice",
                    },
                },
                {
                    $set: {
                        invoice: {
                            $first: "$invoice",
                        },
                    },
                },
                ...(filterInput?.invoiceStatus
                    ? [
                          {
                              $match: {
                                  "invoice.status": filterInput.invoiceStatus,
                              },
                          },
                      ]
                    : []),
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
                                          "employee.user.civilIdOrPassport": {
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
                        from: "organizations",
                        localField: "organization",
                        foreignField: "_id",
                        pipeline: [
                            {
                                $project: {
                                    name: true,
                                },
                            },
                        ],
                        as: "organization",
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
            ];

            return await fetchResult(pipeline, populations);
        }

        throw CustomError(ErrorName.FORBIDDEN);
    },
    getTrainingRegistration: async ({ id }, context) => {
        const { role, subscriberId, employeeId } = AuthUser(context);

        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

        const fetchResults = async filterConditions => {
            const existingTrainingRegistration = await TrainingRegistration.findOne({
                _id: id,
                subscriber: subscriberId,
                ...filterConditions,
                isActive: true,
            })
                .lean()
                .populate({
                    path: "training",
                    match: { isActive: true, isDeleted: { $ne: true } },
                    populate: {
                        path: "trainingModules",
                        match: { isActive: true, isDeleted: { $ne: true } },
                        options: { sort: { displayPosition: 1 } },
                        populate: {
                            path: "trainingModuleContents",
                            match: { isActive: true, isDeleted: { $ne: true } },
                            options: { sort: { displayPosition: 1 } },
                            select: "contentType duration quizContent title description displayPosition",
                            populate: {
                                path: "quizContent",
                                select: "title description",
                            },
                        },
                    },
                })
                .populate({
                    path: "trainingProgresses",
                    // select: "-quizAttempts.questionAnswers",//commented for print quiz attempt summary
                    populate: {
                        path: "trainingModuleContent",
                        select: "-quiz.questionAnswers.answerKey",
                        populate: {
                            path: "quizContent",
                            select: "-quiz.questionAnswers.answerKey",
                        },
                    },
                })
                .populate("trainingAttendance");

            if (!existingTrainingRegistration) throw CustomError(ErrorName.NOT_FOUND);
            return existingTrainingRegistration;
        };

        if (context.platform === Role.EMPLOYEE && role === Role.EMPLOYEE && employeeId) {
            return await fetchResults({ employee: employeeId });
        }

        throw CustomError(ErrorName.FORBIDDEN);
    },
    getAssignedTrainings: async ({ pageInput, filterInput }, context) => {
        // this query is meant for trainers to get all trainings they are assigned to

        const { role, subscriberId, employeeId } = AuthUser(context);

        //TODO: Authentication

        // can be grouped by organization or batch
        // to group by batch needed extra field in training registration

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50;

        const filterConditions = {
            subscriberId: subscriberId,
            trainer: employeeId,
        };

        return await TrainingRegistration.aggregatePaginate(
            TrainingRegistration.aggregate([
                {
                    $match: filterConditions,
                },
            ]),
            {
                offset: skip,
                limit,
                sort: { createdAt: "descending" },
                customLabels: {
                    docs: "trainingRegistrations",
                    totalDocs: "totalCount",
                    offset: "skip",
                },
                pagination: limit !== 0,
                allowDiskUse: true,
            }
        );
    },
};

module.exports.mutations = {
    createTrainingRegistration: async ({ input, invoiceInput }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [Permission.CREATE_TRAINING_REGISTRATION],
                requiredAll: false,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

        const existingEmployee = await Employee.findById(input.employee)
            .lean()
            .select("organization");

        if (!existingEmployee) throw CustomError(ErrorName.NOT_FOUND);

        if (
            existingEmployee.organization &&
            input.organization &&
            input.organization?.toString() !== existingEmployee.organization?.toString()
        ) {
            throw CustomError(ErrorName.ORGANIZATION_MISMATCH_ERROR);
        }

        //region need for batch
        const existingTraining = await Training.findById(input.training).lean().select("title");
        if (existingTraining) input.trainingTitle = existingTraining.title;

        if (input.organization) {
            const existingOrganization = await Organization.findById(input.organization)
                .lean()
                .select("name");
            if (existingOrganization) input.organizationName = existingOrganization.name;
        }

        if (input.trainer) {
            const existingTrainer = await Employee.findById(input.trainer)
                .lean()
                .select("user")
                .populate({ path: "user", select: "firstName lastName" });
            if (existingTrainer)
                input.trainerName = `${existingTrainer.user?.firstName ?? ""} ${
                    existingTrainer.user?.lastName ?? ""
                }`.trim();
        }
        //endregion

        const savedTrainingRegistration = await DbTransactionHelper.performDbTransaction(
            async session => {
                const batchUID = await BatchHelper.generateBatchUID({ subscriberId, session });

                let savedBatch = await new Batch({
                    UID: batchUID,
                    subscriber: subscriberId,
                    organization: input.organization,
                    organizationName: input.organizationName,
                    training: input.training,
                    trainingTitle: input.trainingTitle,
                    trainingDuration: input.trainingDuration,
                    trainer: input.trainer,
                    trainerName: input.trainerName,
                    employees: [],
                    startDate: input.startDate,
                    endDate: input.endDate,
                    trainingMode: input.trainingMode,
                    status: BatchStatus.PENDING,
                    purchaseInfo: { status: BatchStatus.PENDING },
                    certificateInfo: { status: BatchStatus.PENDING },
                    invoiceInfo: { status: BatchStatus.PENDING },
                    paymentInfo: { status: BatchStatus.PENDING },
                    createdBy: userId,
                }).save({ session });

                if (!savedBatch) throw CustomError(ErrorName.FAILED);

                const savedTrainingRegistration = await new TrainingRegistration({
                    subscriber: subscriberId,
                    training: input.training,
                    batch: savedBatch._id,
                    batchNumber: savedBatch.UID,
                    trainingDuration: input.trainingDuration,
                    certificateValidity: input.certificateValidity,
                    organization: input.organization,
                    branch: input.branch,
                    employee: input.employee,
                    trainer: input.trainer,
                    status: TrainingRegistrationStatus.REGISTERED,
                    startDate: input.startDate,
                    endDate: input.endDate,
                    unitPrice: input.unitPrice,
                    customPrice: input.customPrice,
                    remarks: input.remarks,
                    // invoice: trainingRegistrationInvoice,
                    trainingMode: input.trainingMode,
                    createdBy: userId,
                })
                    .save({ session })
                    .then(t =>
                        t
                            .populate({
                                path: "employee",
                                populate: "user",
                            })
                            .execPopulate()
                    );

                if (!savedTrainingRegistration) throw CustomError(ErrorName.FAILED);

                //region push registration and employee to batch
                const employee = savedTrainingRegistration.employee;
                const employeeUser = savedTrainingRegistration.employee?.user;

                savedBatch.employees.push({
                    trainingRegistration: savedTrainingRegistration._id,
                    employee: input.employee,
                    employeeName: `${employeeUser?.firstName ?? ""} ${
                        employeeUser?.lastName ?? ""
                    }`.trim(),
                    employeeEmail: employeeUser?.email,
                    employeeCivilIdOrPassport: employeeUser?.civilIdOrPassport,
                    employeeRigNumber: employee?.rigNumber,
                    employeeDesignation: employee?.designation,
                });

                savedBatch = await savedBatch?.save({ session });
                if (!savedBatch) throw CustomError(ErrorName.FAILED);
                //endregion

                return savedTrainingRegistration;
            }
        );

        //region notification & logging
        EmployeeHelper.sendEnrollmentNotification([
            {
                subscriber: subscriberId,
                trainingRegistration: savedTrainingRegistration,
                createdBy: userInfo,
            },
        ]);

        LogHelper.logActivity({
            subscriber: subscriberId,
            logType: LogType.TRAINING_REGISTRATION_LOG,
            operation: "CREATE",
            ipInfo: context.ipInfo,
            affected: [
                {
                    targetRef: "TrainingRegistration",
                    target: savedTrainingRegistration._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "TRAINING_REGISTRATION_INFO",
                    infoData: JSON.stringify(input),
                },
            ],
            createdBy: userInfo,
        });
        //endregion

        EmployeeHelper.sendCourseInvitationMail({
            userData: savedTrainingRegistration.employee.user,
            trainingRegistrationId: savedTrainingRegistration._id,
        });

        return savedTrainingRegistration;
    },
    updateTrainingRegistration: async ({ id, input }, context) => {
        const { role, userId, userPermissions, isOrganizationManager } = AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [
                    Permission.UPDATE_TRAINING_REGISTRATION,
                    Permission.ENABLE_DISABLE_TRAINING_REGISTRATION,
                ],
                requiredAll: false,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        //TODO: Authentication
        if (!ObjectId.isValid(id)) throw CustomError(ErrorName.INVALID);

        const existingRegistration = await TrainingRegistration.findById(id);
        if (input.training) existingRegistration.training = input.training;
        if (input.organization) existingRegistration.organization = input.organization;
        if (input.branch) existingRegistration.branch = input.branch;
        if (input.supervisor) existingRegistration.supervisor = input.supervisor;

        if (input.status && input.status !== TrainingRegistrationStatus.COMPLETED) {
            existingRegistration.status = input.status;
        }

        if (input.trainingDuration) existingRegistration.trainingDuration = input.trainingDuration;

        if (input.certificateValidity)
            existingRegistration.certificateValidity = input.certificateValidity;

        if (input.startDate) {
            existingRegistration.startDate = input.startDate;

            if (existingRegistration.trainingDuration) {
                existingRegistration.endDate = ParseDateTime(existingRegistration.startDate)
                    ?.utcDateTimeObj.add({ days: existingRegistration.trainingDuration - 1 })
                    .format("YYYY-MM-DD");
            }
        }

        if (input.endDate) existingRegistration.endDate = input.endDate;

        if (typeof input.isActive === "boolean") existingRegistration.isActive;
        if (typeof input.isRegistered === "boolean") existingRegistration.isRegistered;

        // if (input.employeeAndTrainer) {
        //     if (input.employeeAndTrainer.forWhom === "EMPLOYEE") {
        //         existingRegistration.employee = input.employeeAndTrainer.employeeOrManager;
        //         if (existingRegistration.manager) existingRegistration.manager = undefined;
        //     } else if (input.employeeAndTrainer.forWhom === "MANAGER") {
        //         existingRegistration.manager = input.employeeAndTrainer.employeeOrManager;
        //         if (existingRegistration.employee) existingRegistration.employee = undefined;
        //     }
        //
        //     existingRegistration.forWhom = input.employeeAndTrainer.forWhom;
        // }

        existingRegistration.updatedBy = userId;

        const updatedRegistration = await existingRegistration.save();
        if (!updatedRegistration) throw CustomError(ErrorName.FAILED);

        if (input.status === TrainingRegistrationStatus.COMPLETED) {
            const savedTrainingRegistration = await TrainingProgressHelper.updateTrainingProgress(
                {
                    input: {
                        trainingRegistrationId: updatedRegistration._id,
                        trainingRegistrationStatus: TrainingRegistrationStatus.COMPLETED,
                    },
                    existingTrainingRegistration: existingRegistration,
                },
                context
            );

            updatedRegistration.status = savedTrainingRegistration.status;
        }

        return updatedRegistration;
    },
    deleteTrainingRegistration: async ({ id }, context) => {
        const { role, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.DELETE_TRAINING_REGISTRATION,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        //TODO: Authentication
        if (!ObjectId.isValid(id)) throw CustomError(ErrorName.INVALID);

        //TODO: delete the progresses and invoices associated with the registration?

        const deletedTrainingRegistration = await TrainingRegistration.findOneAndDelete(
            { _id: id, subscriber: subscriberId },
            { lean: true }
        )
            .populate({ path: "employee", populate: "user" })
            .populate("trainingProgresses");

        if (!deletedTrainingRegistration) throw CustomError(ErrorName.FAILED);

        await TrainingProgress.deleteMany(
            { subscriber: subscriberId, trainingRegistration: id },
            { lean: true }
        );

        const deletedTrainingCertificate = await TrainingCertificate.findOneAndDelete(
            { subscriber: subscriberId, trainingRegistration: id },
            { lean: true }
        );

        //region notification & logging
        TrainingRegistrationHelper.sendNotificationOnCRUD({
            subscriber: subscriberId,
            trainingRegistration: deletedTrainingRegistration,
            action: "DELETED",
            createdBy: userInfo,
        });

        LogHelper.logActivity({
            subscriber: subscriberId,
            logType: LogType.TRAINING_REGISTRATION_LOG,
            operation: "DELETE",
            ipInfo: context.ipInfo,
            affected: [
                {
                    targetRef: "TrainingRegistration",
                    target: deletedTrainingRegistration._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "TRAINING_REGISTRATION_INFO",
                    infoData: JSON.stringify(deletedTrainingRegistration),
                },
            ],
            createdBy: userInfo,
        });

        if (deletedTrainingCertificate) {
            LogHelper.logActivity({
                subscriber: subscriberId,
                logType: LogType.TRAINING_REGISTRATION_CERTIFICATE_LOG,
                operation: "DELETE",
                ipInfo: context.ipInfo,
                affected: [
                    {
                        targetRef: "TrainingCertificate",
                        target: deletedTrainingCertificate._id,
                    },
                ],
                additionalInfo: [
                    {
                        infoType: "TRAINING_REGISTRATION_CERTIFICATE_INFO",
                        infoData: JSON.stringify(deletedTrainingCertificate),
                    },
                ],
                createdBy: userInfo,
            });
        }
        //endregion

        return deletedTrainingRegistration;
    },
    updateTrainingRegistrationFeedback: async ({ id, input }, context) => {
        const { subscriberId, employeeId } = AuthUser(context);

        if (!Object.keys(input).length) throw CustomError(ErrorName.ARGUMENTS_REQUIRED);

        const savedTrainingRegistration = await TrainingRegistration.findOneAndUpdate(
            {
                _id: id,
                subscriber: subscriberId,
                employee: employeeId,
                feedback: null,
            },
            {
                feedback: input,
            },
            { upsert: false, new: true, lean: true }
        ).select("feedback");

        if (!savedTrainingRegistration) throw CustomError(ErrorName.FAILED);
        return savedTrainingRegistration;
    },
};
