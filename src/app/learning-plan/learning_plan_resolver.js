const { LearningPlan } = require("./learning_plan_model");
const { CustomError } = require("../../util/error_helper");
const { ErrorName, AuthUser, Permission, SubRoleHelper, subscriberId, context } = require("../../util");
const { createLearningPlanHelper } = require("./learning_plan_helper");
const { fetchTotalTrainerStatisticsGraph } = require("../statistics/statistics_helper");
const LearningPlanStatus = require("./enumFields/learning_plan_status.json");
module.exports.mutations = {
    createLearningPlan: async ({ input }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
        try {
            const { subscriberId, userId, userInfo } = AuthUser(context);

            if (userInfo.role !== 'ADMIN') {
                throw CustomError(ErrorName.UNAUTHORIZED, "Only Admins can create Learning Plans");
            }
            const result = await createLearningPlanHelper(input);
            if (!result.success) {
                throw CustomError(ErrorName.LEARNING_PLAN_NOT_CREATED, result.errors[0]);
            }
            return result.learningPlan;
        } catch (error) {
            throw CustomError(ErrorName.FAILED, error.message);
        }
    },
    updateLearningPlanStatus: async ({ input }, context) => {
        const { learningPlanIDs, newStatus } = input;
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
        try {
            if (!Array.isArray(learningPlanIDs) || learningPlanIDs.length === 0) {
                throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Learning Plan IDs must be provided.");
            }
            if (newStatus === LearningPlanStatus.DRAFT) {
                throw CustomError(ErrorName.INVALID_LEARNING_PLAN_STATUS_UPDATE, 'Learning Plan Status Update Cannot be DRAFT');
            }
            const existingLearningPlans = await LearningPlan.find({
                _id: { $in: learningPlanIDs },
            });
            if (existingLearningPlans.length !== learningPlanIDs.length) {
                throw CustomError(ErrorName.INVALID_LEARNING_PLAN, "One or more provided Learning Plan IDs do not exist.");
            }
            const updatedLearningPlans = await LearningPlan.updateMany(
                { _id: { $in: learningPlanIDs } },
                { $set: { status: newStatus } },
                { new: true }
            );
            return {
                success: true,
                message: `Updated ${updatedLearningPlans.nModified} Learning Plans to status ${newStatus}.`,
                updatedLearningPlans: await LearningPlan.find({ _id: { $in: learningPlanIDs } }),
            };
        } catch (error) {
            throw CustomError(ErrorName.FAILED, error.message);
        }
    }
};
module.exports.queries = {
    getLearningPlans: async ({ filterInput }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
        try {
            const { subscriberId, userInfo } = AuthUser(context);
            if (userInfo.role !== 'ADMIN') {
                throw CustomError(ErrorName.UNAUTHORIZED, "Only Admins can create Learning Plans");
            }
            const queryConditions = {
                ...filterInput,
            };
            if (filterInput?.title) {
                queryConditions.title = { $regex: filterInput.title, $options: "i" };
            }

            if (filterInput?.status) {
                queryConditions.status = filterInput.status;
            }
            const totalCount = await LearningPlan.countDocuments(queryConditions);
            const learningPlans = await LearningPlan.aggregate([

                { $match: queryConditions },
                {
                    $lookup: {
                        from: "trainings",
                        localField: "selectCourses",
                        foreignField: "_id",
                        as: "courseDetails",
                        pipeline: [
                            {
                                $project: {
                                    _id: 1,
                                    UID: 1,
                                    trainingCategories: 1,
                                    trainingSubCategories: 1,
                                    title: 1,
                                    description: 1,
                                    instructions: 1,
                                    overview: 1,
                                    feedback: 1,
                                    feedbackContent: 1,
                                    images: 1,
                                    price: 1,
                                    durationHours: 1,
                                    certificateValidity: 1,
                                    targetAudienceId: 1,
                                    courseType: 1,
                                    enableFreeFlow: 1,
                                    unlockOn: 1,
                                    status: 1,
                                    trainingModuleContents: 1,
                                    courseId: 1,
                                    course_validity: 1,
                                    courseLevel: 1,
                                    hideCourseProgress: 1,
                                    allowMultipleAttempts: 1,
                                    attemptFlexibility: 1,
                                    attemptType: 1,
                                    setLimitAttempt: 1,
                                    disableFurtherAttemptsOnPass: 1,
                                    lockModulesBetweenAttempts: 1,
                                    setTimeLimitForModule: 1,
                                    approvalStatus: 1,
                                    certifications: 1,
                                    bannerImage: 1,
                                    appliedAt: 1,
                                    approvedAt: 1,
                                    rejectedAt: 1,
                                    isActive: 1,
                                    createdBy: 1,
                                    isDeleted: 1,
                                    createdAt: 1,
                                    trainingModules: 1,
                                    scorm: 1,
                                    groupTrainingModule: 1,
                                    skills: 1,
                                    userFeedback: 1,
                                    managerFeedback: 1,
                                    setFrequency: 1,
                                    enableEmailNotification: 1,
                                    setReminder: 1,
                                    setFrequencyDate: 1,
                                    manadatoryModules: 1,
                                    classroomModule: 1,
                                    authorName: 1,
                                    isOrdered: 1
                                },
                            },
                        ],
                    }
                },
                {
                    $addFields: {
                        selectCourses: {
                            $map: {
                                input: "$selectCourses",
                                as: "courseId",
                                in: {
                                    $let: {
                                        vars: {
                                            matchedCourse: {
                                                $arrayElemAt: [
                                                    {
                                                        $filter: {
                                                            input: "$courseDetails",
                                                            as: "course",
                                                            cond: { $eq: ["$$course._id", "$$courseId"] }
                                                        }
                                                    },
                                                    0
                                                ]
                                            }
                                        },
                                        in: {
                                            $mergeObjects: [
                                                { _id: "$$courseId" },
                                                "$$matchedCourse"
                                            ]
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
            ]);
            return {
                learningPlans: learningPlans,
                totalCount: totalCount,
            };
        } catch (error) {
            throw CustomError(ErrorName.FAILED, error.message);
        }
    },
};
