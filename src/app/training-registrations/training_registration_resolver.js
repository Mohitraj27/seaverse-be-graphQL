const { ObjectId, Moment, Validator } = require("../../tools");
const {
    CustomError,
    ErrorName,
    AuthUser,
    Role,
    DbTransactionHelper,
    ParseDateTime,
    courseStatus,
    UploadHelper,
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
const { create } = require("lodash");
const { OverallTrainingProgress } = require("./overall-course-progress/overall_progress_model");
const XLSX = require('xlsx');
const path = require('path');
const aws_helper = require("../../util/aws_helper");

module.exports.queries = {
    getTrainingRegistrations: async ({ input }, context) => {

        const { subscriberId } = AuthUser(context);
        if (!input.training) throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Training ID is required");

        let filterConditions = { subscriber: subscriberId, training: input.training, isEnrolled: input.isEnrolled };

        const results = await OverallTrainingProgress.aggregate([
            {
                $match: {
                    training: input.training,
                    isEnrolled: input.isEnrolled
                }
            },
            {
                $lookup: {
                    from: 'learningplans',
                    localField: 'learningPlan',
                    foreignField: '_id',
                    as: 'learningPlanInfo'
                }
            },
            {
                $unwind: {
                    path: '$learningPlanInfo',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'user',
                    foreignField: '_id',
                    as: 'userInfo'
                }
            },
            {
                $unwind: {
                    path: '$userInfo',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $match: input?.search
                    ? {
                        $or: [
                            { 'userInfo.firstName': { $regex: input.search, $options: 'i' } },
                            { 'userInfo.lastName': { $regex: input.search, $options: 'i' } },
                        ]
                    }
                    : {}
            },
            {
                $group: {
                    _id: {
                        learningPlanId: "$learningPlan",
                        learningPlanName: { $ifNull: ["$learningPlanInfo.title", "NIL"] }
                    },
                    users: {
                        $push: {
                            id: "$userInfo._id",
                            firstName: "$userInfo.firstName",
                            lastName: "$userInfo.lastName",
                            status: "$status"
                        }
                    }
                }
            },
            {
                $sort: { '_id.learningPlanName': 1 }
            }
        ]);

        const formattedResults = results.map(group => ({
            learningPlanName: group._id.learningPlanName,
            users: group.users
        }));

        if (!formattedResults) throw CustomError(ErrorName.FAILED);
        return formattedResults;

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
    myCourses: async ({ filterInput = {} }, context) => {
        const { userId, subscriberId } = AuthUser(context);
        try {
            let filterConditions = {
                user: ObjectId(userId),
            }

            if (filterInput?.search) {
                filterConditions = {
                    ...filterConditions,
                    $or: [
                        { "training.title.value": { $regex: filterInput.search, $options: "i" } },
                    ],
                };
            }

            if (filterInput?.status) {
                filterConditions = {
                    ...filterConditions,
                    status: filterInput.status,
                };
            }

            const courses = await OverallTrainingProgress.aggregate([
                {
                    $lookup: {
                        from: "trainings",
                        localField: "training",
                        foreignField: "_id",
                        as: "training",
                    },
                },
                { $match: filterConditions },
                { $unwind: { path: "$training", preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: "trainingmodules",
                        let: { trainingId: "$training._id" },
                        pipeline: [
                            { $match: { $expr: { $eq: ["$training", "$$trainingId"] } } },
                        ],
                        as: "trainingModules",
                    },
                },
                { $addFields: { moduleCount: { $size: "$trainingModules" } } },
                {
                    $lookup: {
                        from: "trainingprogresses",
                        let: { moduleIds: "$trainingModules._id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $in: ["$trainingModule", "$$moduleIds"] },
                                },
                            },
                            {
                                $lookup: {
                                    from: "trainingmodulecontents",
                                    localField: "trainingModuleContent",
                                    foreignField: "_id",
                                    as: "trainingModuleContentDetails",
                                },
                            },
                            {
                                $project: {
                                    durationsInSeconds: {
                                        $map: {
                                            input: "$trainingModuleContentDetails",
                                            as: "content",
                                            in: {
                                                $let: {
                                                    vars: {
                                                        parts: { $split: ["$$content.duration", ":"] },
                                                    },
                                                    in: {
                                                        $add: [
                                                            { $multiply: [{ $toInt: { $arrayElemAt: ["$$parts", 0] } }, 3600] },
                                                            { $multiply: [{ $toInt: { $arrayElemAt: ["$$parts", 1] } }, 60] },
                                                            { $toInt: { $arrayElemAt: ["$$parts", 2] } },
                                                        ],
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                            {
                                $addFields: {
                                    duration: { $sum: "$durationsInSeconds" },
                                },
                            },
                        ],
                        as: "trainingProgresses",
                    },
                },
                {
                    $lookup: {
                        from: "trainingcontentbridges",
                        let: { moduleIds: "$trainingModules._id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $in: ["$trainingModule", "$$moduleIds"] },
                                },
                            },
                            {
                                $lookup: {
                                    from: "trainingmodulecontents",
                                    localField: "trainingContent",
                                    foreignField: "_id",
                                    as: "trainingModuleContentDetails",
                                },
                            },
                            {
                                $project: {
                                    durationsInSeconds: {
                                        $map: {
                                            input: "$trainingModuleContentDetails",
                                            as: "content",
                                            in: {
                                                $let: {
                                                    vars: {
                                                        parts: { $split: ["$$content.duration", ":"] },
                                                    },
                                                    in: {
                                                        $add: [
                                                            { $multiply: [{ $toInt: { $arrayElemAt: ["$$parts", 0] } }, 3600] },
                                                            { $multiply: [{ $toInt: { $arrayElemAt: ["$$parts", 1] } }, 60] },
                                                            { $toInt: { $arrayElemAt: ["$$parts", 2] } },
                                                        ],
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                            {
                                $addFields: {
                                    duration: { $sum: "$durationsInSeconds" },
                                },
                            },
                        ],
                        as: "trainingContentsFallback",
                    },
                },
                {
                    $addFields: {
                        totalDuration: {
                            $cond: {
                                if: { $gt: [{ $size: "$trainingProgresses" }, 0] },
                                then: { $sum: "$trainingProgresses.duration" },
                                else: { $sum: "$trainingContentsFallback.duration" },
                            },
                        },
                    },
                }
            ]);

            return {
                status: true,
                message: "My Courses fetched successfully",
                courses: courses,
            }
        } catch (error) {
            throw CustomError(ErrorName.FAILED, error.message);
        }
    },
    getSingleCourseDetails: async ({ input }, context) => {

        const { userId, subscriberId } = AuthUser(context);

        try {

            if (!input) {
                throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Pass the training ID");
            }

            const trainingDetails = await OverallTrainingProgress.aggregate([
                { $match: { _id: input } },
                {
                    $lookup: {
                        from: "trainings",
                        localField: "training",
                        foreignField: "_id",
                        as: "training",
                    },
                },
                { $unwind: "$training" },
                {
                    $lookup: {
                        from: "trainingmodules",
                        localField: "training._id",
                        foreignField: "training",
                        as: "trainingModules",
                    },
                },
                {
                    $lookup: {
                        from: "trainingprogresses",
                        let: { moduleIds: "$trainingModules._id" },
                        pipeline: [
                            { $match: { $expr: { $in: ["$trainingModule", "$$moduleIds"] } } },
                            {
                                $lookup: {
                                    from: "trainingmodulecontents",
                                    localField: "trainingModuleContent",
                                    foreignField: "_id",
                                    as: "trainingModuleContentDetails",
                                },
                            },
                            {
                                $unwind: {
                                    path: "$trainingModuleContentDetails",
                                    preserveNullAndEmptyArrays: true,
                                },
                            },
                            {
                                $lookup: {
                                    from: "quizzes",
                                    localField: "trainingModuleContentDetails.quiz",
                                    foreignField: "_id",
                                    as: "trainingModuleContentDetails.quizDetails",
                                },
                            },
                            {
                                $group: {
                                    _id: "$_id",
                                    trainingModuleContent: { $first: "$trainingModuleContent" },
                                    trainingModule: { $first: "$trainingModule" },
                                    trainingModuleContentDetails: { $push: "$trainingModuleContentDetails" },
                                },
                            },
                        ],
                        as: "trainingProgresses",
                    },
                },
                {
                    $lookup: {
                        from: "trainingcontentbridges",
                        let: { moduleIds: "$trainingModules._id" },
                        pipeline: [
                            { $match: { $expr: { $in: ["$trainingModule", "$$moduleIds"] } } },
                            {
                                $lookup: {
                                    from: "trainingmodulecontents",
                                    localField: "trainingContent",
                                    foreignField: "_id",
                                    as: "trainingModuleContentDetails",
                                },
                            },
                            {
                                $unwind: {
                                    path: "$trainingModuleContentDetails",
                                    preserveNullAndEmptyArrays: true,
                                },
                            },
                            {
                                $lookup: {
                                    from: "quizzes",
                                    localField: "trainingModuleContentDetails.quiz",
                                    foreignField: "_id",
                                    as: "trainingModuleContentDetails.quizDetails",
                                },
                            },
                            {
                                $group: {
                                    _id: "$_id",
                                    trainingContent: { $first: "$trainingContent" },
                                    trainingModule: { $first: "$trainingModule" },
                                    trainingModuleContentDetails: { $push: "$trainingModuleContentDetails" },
                                },
                            },
                        ],
                        as: "trainingContentsFallback",
                    },
                },
                {
                    $addFields: {
                        trainingModules: {
                            $map: {
                                input: "$trainingModules",
                                as: "module",
                                in: {
                                    $mergeObjects: [
                                        "$$module",
                                        {
                                            trainingModuleContents: {
                                                $cond: {
                                                    if: {
                                                        $eq: [
                                                            {
                                                                $size: {
                                                                    $filter: {
                                                                        input: "$trainingProgresses",
                                                                        as: "progress",
                                                                        cond: { $eq: ["$$progress.trainingModule", "$$module._id"] },
                                                                    },
                                                                },
                                                            },
                                                            0,
                                                        ],
                                                    },
                                                    then: {
                                                        $filter: {
                                                            input: "$trainingContentsFallback",
                                                            as: "content",
                                                            cond: { $eq: ["$$content.trainingModule", "$$module._id"] },
                                                        },
                                                    },
                                                    else: {
                                                        $filter: {
                                                            input: "$trainingProgresses",
                                                            as: "progress",
                                                            cond: { $eq: ["$$progress.trainingModule", "$$module._id"] },
                                                        },
                                                    },
                                                },
                                            },
                                        },
                                    ],
                                },
                            },
                        },
                    },
                },
                {
                    $project: {
                        trainingProgresses: 0,
                        trainingContentsFallback: 0,
                    },
                },
            ]);
            
            if (trainingDetails.length === 0) {
                throw CustomError(ErrorName.NOT_FOUND, "Course not found!");
            }

            const processedTrainingDetails = trainingDetails.map((trainingDetail) => {

                const moduleCount = trainingDetail.trainingModules.length;

                const totalDuration = trainingDetail.trainingModules.reduce((acc, module) => {

                    const moduleDurationInSeconds = module.trainingModuleContents.reduce((moduleAcc, content) => {
                        if (content.trainingModuleContentDetails && content.trainingModuleContentDetails.length > 0) {
                            content.trainingModuleContentDetails.forEach((detail) => {

                                const durationParts = (detail.duration || "00:00:00").split(":");
                                const hours = parseInt(durationParts[0], 10) || 0;
                                const minutes = parseInt(durationParts[1], 10) || 0;
                                const seconds = parseInt(durationParts[2], 10) || 0;

                                moduleAcc += (hours * 3600) + (minutes * 60) + seconds;
                            });
                        }
                        return moduleAcc;
                    }, 0);

                    acc += moduleDurationInSeconds;
                    return acc;
                }, 0);

                return {
                    ...trainingDetail,
                    totalDuration,
                    moduleCount
                };
            });

            return {
                status: true,
                message: "Course details fetched successfully",
                course: processedTrainingDetails[0]
            }


        } catch (error) {
            throw Error(error.message);
        }
    }
};

module.exports.mutations = {
    createTrainingRegistration: async ({ input }, context) => {
        return TrainingRegistrationHelper.createTrainingRegistration(input, context);
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
            const unregEmails = [];
            const invalidEmails = [];
            const alreadyEnrolledEmails = [];
            const notEnrolledEmails = [];

            for (let email of input.users) {
                if (!Validator.isEmail(email)) {
                    invalidEmails.push(email);
                }
            }
            if (!input.users) {
                throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Pass all the required fields!");
            }

            let existingTraining = null;
            if (input.training) {
                existingTraining = await OverallTrainingProgress.find({ training: input.training });
            }

            const inputUsers = await User.find({ email: { $in: input.users } });

            if (inputUsers.length === 0) {
                throw CustomError(ErrorName.NOT_FOUND, "No users found with the provided email addresses");
            }

            const users = Array.from(
                new Map(inputUsers.map(user => [user._id.toString(), user])).values()
            );


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

                const remainingEmails = input.users.filter(email => !errorEmails.includes(email));

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
            throw Error(error.message);
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
