const { ObjectId, Moment, Validator } = require("../../tools");
const {
    CustomError,
    ErrorName,
    AuthUser,
    Role,
    DbTransactionHelper,
    ParseDateTime,
    courseStatus,
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
const { User } = require("../user/user_model");
const { sendEmail } = require("../../util/aws_helper");

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

        const { role, subscriberId, employeeId } = AuthUser(context);

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
    createTrainingRegistration: async ({ input }, context) => {

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

        try {

            if (!input.groups && !input.users) {
                throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Pass all the required fields!");
            }

            let existingTrainings = [];
            if (input.trainings && input.trainings.length > 0) {
                existingTrainings = await TrainingRegistration.find({ training: { $in: input.trainings } });
            }

            if (input.type === "ENROLL") {

                let autoSyncUsers, customGroups;
                let customGroupUsers = [];
                let allUsersFetched = [];

                if (input.groups) {

                    autoSyncUsers = await TrainingRegistrationHelper.getAutoSyncUsers(input.groups);

                    customGroups = input.groups.filter(group => group.groupType === 'custom');

                    if (customGroups && customGroups.length > 0) {
                        customGroupUsers = await TrainingRegistrationHelper.getCustomGroupUsers(customGroups);
                    }

                    allUsersFetched = [...autoSyncUsers, ...customGroupUsers];

                }

                const userIds = [];
                const emails = [];

                for (const user of input.users) {
                    if (ObjectId.isValid(user)) {
                        userIds.push(user);
                    } else {
                        emails.push(user);
                    }
                }

                const criteria = [];
                if (userIds.length) criteria.push({ _id: { $in: userIds } });
                if (emails.length) criteria.push({ email: { $in: emails } });

                const inputUsers = await User.find({ $or: criteria });

                allUsersFetched = [...allUsersFetched, ...inputUsers];

                const users = Array.from(
                    new Map(allUsersFetched.map(user => [user._id.toString(), user])).values()
                );

                if (users.length > 0) {

                    const verifiedUsers = await TrainingRegistrationHelper.enrolUserVerificationHelper(users, existingTrainings);

                    if (verifiedUsers.unRegEmails.length > 0) {
                        throw CustomError(ErrorName.EMPLOYEE_NOT_REGISTERED);
                    }

                    if (verifiedUsers.invalidEmails.length > 0) {
                        throw CustomError(ErrorName.INVALID_EMAIL);
                    }

                    if (verifiedUsers.alreadyEnrolledEmails.length > 0) {
                        throw CustomError(ErrorName.ALREADY_EXIST);
                    }

                }

                let userObjectIds = [];
                if (users.length > 0) {
                    userObjectIds = users.map(user => user._id);
                }

                const savedTrainingRegistration = await DbTransactionHelper.performDbTransaction(
                    async session => {

                        const batchUID = await BatchHelper.generateBatchUID({ subscriberId, session });

                        const existingTrainingCourses = await TrainingRegistration.find({ training: { $in: input.trainings } }).session(session);

                        const existingTrainingIds = existingTrainingCourses.map(t => t.training.toString());
                        const newTrainingIds = input.trainings.filter(id => !existingTrainingIds.includes(id.toString()));


                        const updateFields = { subscriber: subscriberId };
                        if (userObjectIds && userObjectIds.length > 0) {
                            updateFields.$addToSet = { ...updateFields.$addToSet, users: { $each: userObjectIds } };
                        }
                        if (input.groups && input.groups.length > 0) {
                            updateFields.$addToSet = { ...updateFields.$addToSet, groups: { $each: input.groups } };
                        }

                        let savedTrainingRegistration;

                        if (existingTrainingIds.length > 0) {
                            savedTrainingRegistration = await TrainingRegistration.updateMany(
                                { training: { $in: existingTrainingIds } },
                                updateFields,
                                { session }
                            );
                        }

                        const newRegistrations = newTrainingIds.map(trainingId => ({
                            ...updateFields,
                            training: trainingId,
                            users: userObjectIds || [],
                            groups: input.groups || []
                        }));

                        if (newRegistrations.length > 0) {
                            savedTrainingRegistration = await TrainingRegistration.insertMany(newRegistrations, { session });
                        }

                        let trainingProgressData;
                        if (savedTrainingRegistration) {
                            trainingProgressData = await TrainingRegistrationHelper.createTrainingProgressHelper(users, input.trainings);
                        }

                        if (!savedTrainingRegistration) throw CustomError(ErrorName.FAILED);
                        if (!trainingProgressData) throw CustomError(ErrorName.FAILED);

                        users.forEach(user => {
                            sendEmail({
                                receiverEmail: user.email,
                                subject: "Course Enrollment",
                                htmlContent:
                                    `<div div style="width: 600px; margin: 0 auto; text-align: center" >
                                        <p>Hello ${user.firstName}</p>
                                        <div style="font-weight: 400;font-size: 12px;font-family: sans-serif;color: #281166;margin: 20px;">You are assigned to a new course</div>
                                    </div > `
                            })
                        })

                        return savedTrainingRegistration;
                    }
                );

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

                EmployeeHelper.sendCourseInvitationMail({

                    userData: savedTrainingRegistration.employee.user,
                    trainingRegistrationId: savedTrainingRegistration._id,
                });

                return {
                    message: "Course enrollment successful!",
                };

            }

            if (input.type === "UNENROLL") {

                if (!input.users) {
                    throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Pass all the required fields!");
                }

                const userIds = [];
                const emails = [];

                for (const user of input.users) {
                    if (ObjectId.isValid(user)) {
                        userIds.push(user);
                    } else {
                        emails.push(user);
                    }
                }

                const criteria = [];
                if (userIds.length) criteria.push({ _id: { $in: userIds } });
                if (emails.length) criteria.push({ email: { $in: emails } });

                const inputUsers = await User.find({ $or: criteria });

                let userObjectIds = [];
                if (inputUsers.length > 0) {
                    userObjectIds = inputUsers.map(user => user._id);

                    const verifiedUsers = await TrainingRegistrationHelper.enrolUserVerificationHelper(inputUsers, existingTrainings);

                    if (verifiedUsers.unRegEmails.length > 0) {
                        throw CustomError(ErrorName.EMPLOYEE_NOT_REGISTERED);
                    }

                    if (verifiedUsers.invalidEmails.length > 0) {
                        throw CustomError(ErrorName.INVALID_EMAIL);
                    }

                    if (verifiedUsers.alreadyEnrolledEmails.length != userObjectIds.length) {
                        throw CustomError(ErrorName.EMPLOYEE_NOT_ENROLLED, "Selected employee is not enrolled before!");
                    }
                }

                const unenrollTrainingRegistration = await DbTransactionHelper.performDbTransaction(
                    async session => {

                        if (!existingTrainings) {
                            throw CustomError(ErrorName.NOT_FOUND, "Pass the training ID");
                        }

                        const userObjectIdStrings = userObjectIds.map(id => id.toString());
                        const updatedUsersInTraining = existingTrainings[0].users.filter(
                            userId => !userObjectIdStrings.includes(userId.toString())
                        );

                        existingTrainings[0].users = updatedUsersInTraining;
                        const updateTrainingRegistration = await existingTrainings[0].save({ session });

                        if (!updateTrainingRegistration) throw CustomError(ErrorName.FAILED);

                        const operations = userObjectIds.map(userId => ({
                            updateOne: {
                                filter: { user: userId, training: input.training },
                                update: { $set: { enroledStatus: false } },
                                upsert: true
                            }
                        }));

                        const unenrollUsers = await TrainingProgress.bulkWrite(operations, { session });

                        return updateTrainingRegistration;
                    }
                );

                return {
                    message: "Course unenrollment successful!",
                }

            }

        } catch (error) {
            throw CustomError(ErrorName.FAILED, error.message);
        }

    },
    verifyRegistrationEmails: async ({ input }, context) => {

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

        try {


            if (!input.users) {
                throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Pass all the required fields!");
            }

            let existingTraining = null;
            if (input.training) {
                existingTraining = await TrainingRegistration.findOne({ training: input.training });
            }

            const inputUsers = await User.find({ email: { $in: input.users } });

            const users = Array.from(
                new Map(inputUsers.map(user => [user._id.toString(), user])).values()
            );

            const unregEmails = [];
            const invalidEmails = [];
            const alreadyEnrolledEmails = [];
            const notEnrolledEmails = [];

            if (users.length > 0) {

                const verifiedUsers = await TrainingRegistrationHelper.enrolUserVerificationHelper(users, existingTraining);

                if (verifiedUsers.unRegEmails.length > 0) {
                    unregEmails.push(...verifiedUsers.unRegEmails);
                }

                if (verifiedUsers.invalidEmails.length > 0) {
                    invalidEmails.push(...verifiedUsers.invalidEmails);
                }

                if (input.type === "ENROLL") {

                    if (verifiedUsers.alreadyEnrolledEmails.length > 0) {
                        alreadyEnrolledEmails.push(...verifiedUsers.alreadyEnrolledEmails);
                    }

                }

                if (input.type === "UNENROLL") {

                    if (verifiedUsers.notEnrolledEmails.length > 0) {
                        notEnrolledEmails.push(...verifiedUsers.notEnrolledEmails);
                    }

                }

                if (input.type === "ENROLL") {
                    errorEmails = [...unregEmails, ...invalidEmails, ...alreadyEnrolledEmails];
                }

                if (input.type === "UNENROLL") {
                    errorEmails = [...unregEmails, ...invalidEmails, ...notEnrolledEmails];
                }

                const remainingEmails = errorEmails.filter(email => !input.users.includes(email));

                let status = false;
                if (remainingEmails.length === input.users.length) {
                    status = true;
                } else {
                    status = false;
                }

                return {
                    unregEmails,
                    invalidEmails,
                    alreadyEnrolledEmails,
                    notEnrolledEmails,
                    remainingEmails,
                    status
                }

            }

        } catch (error) {
            throw CustomError(ErrorName.FAILED, error.message);
        }

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

        if (!ObjectId.isValid(id)) throw CustomError(ErrorName.INVALID);

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
