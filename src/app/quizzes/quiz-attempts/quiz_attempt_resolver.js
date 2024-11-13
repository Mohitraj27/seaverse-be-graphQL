const { Moment } = require("../../../tools");
const { AuthUser, CustomError, ErrorName, CurrentDateTime, Role } = require("../../../util");

const { QuizContent } = require("../quiz_content_model");
const { QuizAttempt } = require("./quiz_attempt_model");
const { Employee } = require("../../user/employee/employee_model");

const SubRoleHelper = require("../../user/sub-roles/sub_role_helper");

const Permission = require("../../user/sub-roles/permission.json");
const {
    TrainingModuleContent,
} = require("../../trainings/training_modules/training_module_contents/training_module_content_model");
const { QuizEvaluation } = require("./quiz_evaluation_model");

module.exports.queries = {
    getQuizAttempts: async ({ pageInput, filterInput }, context) => {
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
                filterConditions["attempt.attemptedAt"] = {};

                if (filterInput.dateFrom)
                    filterConditions["attempt.attemptedAt"].$gte = Moment(filterInput.dateFrom)
                        .startOf("day")
                        .toDate();

                if (filterInput.dateTo)
                    filterConditions["attempt.attemptedAt"].$lte = Moment(filterInput.dateTo)
                        .endOf("day")
                        .toDate();
            }

            if (filterInput.employee) filterConditions.employee = filterInput.employee;
            if (filterInput.quizContent) filterConditions.quizContent = filterInput.quizContent;
            if (filterInput.organization) filterConditions.organization = filterInput.organization;
            if (filterInput.status) filterConditions.status = filterInput.status;
        }

        const fetchResult = async (pipeline, populations) => {
            if ((!filterInput || !Object.keys(filterInput).length) && populations) {
                return {
                    quizAttempts: await QuizAttempt.find(filterConditions)
                        .lean()
                        .sort({ createdAt: "descending" })
                        .skip(skip)
                        .limit(limit)
                        .populate(populations),
                    totalCount: await QuizAttempt.countDocuments(filterConditions),
                };
            }

            return QuizAttempt.aggregatePaginate(QuizAttempt.aggregate(pipeline), {
                offset: skip,
                limit,
                sort: { createdAt: "descending" },
                customLabels: {
                    docs: "quizAttempts",
                    totalDocs: "totalCount",
                    offset: "skip",
                },
                pagination: limit !== 0,
                allowDiskUse: true,
            });
        };

        if (context.platform === Role.EMPLOYEE && role === Role.EMPLOYEE) {
            filterConditions.employee = employeeId;

            const populations = [
                {
                    path: "quizContent",
                    select: "title description images quiz",
                },
            ];

            const pipeline = [
                {
                    $match: filterConditions,
                },
                {
                    $lookup: {
                        from: "quizcontents",
                        localField: "quizContent",
                        foreignField: "_id",
                        pipeline: [
                            {
                                $project: {
                                    title: true,
                                    description: true,
                                    images: true,
                                    quiz: true,
                                },
                            },
                        ],
                        as: "quizContent",
                    },
                },
                {
                    $set: {
                        quizContent: {
                            $first: "$quizContent",
                        },
                    },
                },
                ...(filterInput?.search
                    ? [
                          {
                              $match: {
                                  $or: [
                                      {
                                          "quizContent.title.value": {
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

            return await fetchResult(pipeline, populations);
        } else if (context.platform === Role.ADMIN) {
            if (
                !SubRoleHelper.hasPermission({
                    currentRole: role,
                    currentPermissions: userPermissions,
                    requiredPermission: [
                        Permission.GET_ASSESSMENT_ATTEMPTS,
                        Permission.GET_ASSESSMENT_REPORTS,
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
                    path: "quizContent",
                    select: "title images quiz",
                },
                { path: "organization", select: "name" },
                { path: "employee", select: "user", populate: "user" },
            ];

            const pipeline = [
                {
                    $match: filterConditions,
                },
                {
                    $lookup: {
                        from: "quizcontents",
                        localField: "quizContent",
                        foreignField: "_id",
                        pipeline: [
                            {
                                $project: {
                                    title: true,
                                    images: true,
                                    quiz: true,
                                },
                            },
                        ],
                        as: "quizContent",
                    },
                },
                {
                    $set: {
                        quizContent: {
                            $first: "$quizContent",
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
                                          "quizContent.title.value": {
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
            ];

            return await fetchResult(pipeline, populations);
        }

        throw CustomError(ErrorName.FORBIDDEN);
    },
    getQuizAttempt: async ({ id }, context) => {
        const { role, subscriberId, employeeId } = AuthUser(context);

        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

        const fetchResults = async filterConditions => {
            const existingTrainingRegistration = await QuizAttempt.findOne({
                _id: id,
                subscriber: subscriberId,
                ...filterConditions,
            })
                .lean()
                .populate({
                    path: "quizContent",
                    select: "-quiz.questionAnswers.answerKey",
                });

            if (!existingTrainingRegistration) throw CustomError(ErrorName.NOT_FOUND);
            return existingTrainingRegistration;
        };

        if (context.platform === Role.EMPLOYEE && role === Role.EMPLOYEE && employeeId) {
            return await fetchResults({ employee: employeeId });
        }

        throw CustomError(ErrorName.FORBIDDEN);
    },
    getQuizEvaluation: async ({ id, contentId, userId }, context) => {
        try {
            if (!id || !contentId || !userId) throw CustomError(ErrorName.BAD_REQUEST);
            const { role } = AuthUser(context);
            if (role !== Role.ADMIN || role === Role.LEARNER)
                throw CustomError(ErrorName.FORBIDDEN);
            const quizEvaluation = await QuizEvaluation.findOne({
                _id: id,
                contentId,
                userId,
            }).lean();
            if (!quizEvaluation) throw CustomError(ErrorName.NOT_FOUND);
            return quizEvaluation;
        } catch (error) {
            throw new Error(error.message);
        }
    },
};

module.exports.mutations = {
    addQuizAttempt: async ({ id, questionAnswers }, context) => {
        const { role, userId, subscriberId, employeeId } = AuthUser(context);

        if (role !== Role.EMPLOYEE || context.platform !== Role.EMPLOYEE)
            throw CustomError(ErrorName.FORBIDDEN);

        const existingEmployee = await Employee.findById(employeeId).lean();
        if (!existingEmployee) throw CustomError(ErrorName.NOT_FOUND);

        const existingQuizContent = await QuizContent.findById(id).lean();
        if (!existingQuizContent) throw CustomError(ErrorName.NOT_FOUND);

        const quizContent = existingQuizContent.quiz;

        let totalMark = 0;
        let acquiredMark = 0;

        const questionAnswersList = questionAnswers.map(item => {
            const existingQuestion = quizContent?.questionAnswers.find(
                x => x._id.toString() === item.questionId.toString()
            );

            totalMark += existingQuestion?.mark ?? 0;
            let isCorrectAnswer = false;
            const correctAnswerKey = existingQuestion?.answerKey;
            const givenAnswerKey = item.givenAnswerKey?.toLowerCase();

            if (existingQuestion && correctAnswerKey === givenAnswerKey) {
                acquiredMark += existingQuestion.mark ?? 0;
                isCorrectAnswer = true;
            }

            return {
                questionId: item.questionId,
                question: existingQuestion?.question,
                choices: existingQuestion?.choices,
                givenAnswer: existingQuestion?.choices?.find(
                    x => x.key === item.givenAnswerKey?.toLowerCase()
                )?.value,
                correctAnswer: existingQuestion?.choices?.find(
                    x => x.key === existingQuestion?.answerKey
                )?.value,
                givenAnswerKey,
                correctAnswerKey,
                isCorrectAnswer,
            };
        });

        const acquiredMarkPercentage = (acquiredMark / totalMark) * 100;
        const passMarkPercentage = quizContent?.passMark ?? 0;
        const quizStatus = acquiredMarkPercentage >= passMarkPercentage ? "PASSED" : "FAILED";

        const savedQuizAttempt = await new QuizAttempt({
            subscriber: subscriberId,
            organization: existingEmployee.organization,
            employee: employeeId,
            quizContent: id,
            attempt: {
                questionAnswers: questionAnswersList,
                totalMark,
                acquiredMark,
                status: quizStatus,
                attemptedAt: CurrentDateTime().utcDateTime,
            },
            createdBy: userId,
        }).save();

        if (!savedQuizAttempt) throw CustomError(ErrorName.NOT_FOUND);
        return savedQuizAttempt;
    },
    QuizEvaluation: async ({ contentId, questionAnswers }, context) => {
        try {
            console.log(questionAnswers, "qa");
            const { role, userId } = AuthUser(context);

            if (role !== Role.ADMIN) throw CustomError(ErrorName.FORBIDDEN);

            const filteredQuestionAnswers =
                questionAnswers?.filter(el => {
                    if (Array.isArray(el?.answer)) {
                        return el.answer.some(ans => ans && ans.trim() !== "");
                    }
                    return (
                        el?.answer &&
                        el.answer !== "" &&
                        el.answer !== null &&
                        el.answer !== undefined
                    );
                }) || [];

            const trainingModuleContent = await TrainingModuleContent.findById(contentId)
                .populate({
                    path: "quiz",
                    model: "Question",
                })
                .lean();

            if (!trainingModuleContent) throw CustomError(ErrorName.NOT_FOUND);

            let totalScore = 0;
            let acquiredScore = 0;
            const attemptedNumber = filteredQuestionAnswers.length;
            let skippedQuestions = 0;

            const questionResults = trainingModuleContent.quiz.map(question => {
                const userAnswer = filteredQuestionAnswers.find(
                    ans => ans.questionId.toString() === question._id.toString()
                );

                totalScore += question.points;

                if (!userAnswer || !userAnswer.answer || userAnswer.answer.length === 0) {
                    skippedQuestions += 1;

                    return {
                        questionId: question._id,
                        question: question.question,
                        givenAnswer: null,
                        correctAnswer: question.answerKey,
                        isCorrectAnswer: false,
                        points: question.points,
                        negativePoints: question.negativePoints,
                        isSkipped: true,
                    };
                }

                const isCorrectAnswer =
                    question.answerKey.every(correctAnswer =>
                        userAnswer.answer.includes(correctAnswer)
                    ) && userAnswer.answer.length === question.answerKey.length;

                if (isCorrectAnswer) {
                    acquiredScore += question.points;
                } else {
                    acquiredScore -= question.negativePoints;
                }

                return {
                    questionId: question._id,
                    question: question.question,
                    givenAnswer: userAnswer.answer,
                    correctAnswer: question.answerKey,
                    isCorrectAnswer,
                    points: question.points,
                    negativePoints: question.negativePoints,
                    isSkipped: false,
                };
            });

            const scorePercentage = totalScore
                ? Math.max((acquiredScore / totalScore) * 100, 0)
                : 0;

            const quizEvaluation = new QuizEvaluation({
                contentId,
                userId,
                attended: attemptedNumber,
                totalQuestions: trainingModuleContent.quiz.length,
                totalPoints: totalScore,
                acquiredMarks: acquiredScore,
                percentage: scorePercentage,
                skippedQuestions,
                attendedQuestions: questionResults,
            });

            await quizEvaluation.save();

            return quizEvaluation;
        } catch (error) {
            throw new Error(error.message);
        }
    },
};
