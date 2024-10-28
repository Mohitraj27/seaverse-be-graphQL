const { LearningPlan } = require("./learning_plan_model");
const { CustomError } = require("../../util/error_helper");
const { ErrorName,AuthUser, Permission, SubRoleHelper,subscriberId,context } = require("../../util");
const { createLearningPlanHelper } = require("./learning_plan_helper");
const { fetchTotalTrainerStatisticsGraph } = require("../statistics/statistics_helper");
const LearningPlanStatus = require("./enumFields/learning_plan_status.json");
module.exports.mutations = {
    createLearningPlan: async ({ input }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
        try {
         const { subscriberId, userId,userInfo } = AuthUser(context);
         
        if (userInfo.role !== 'ADMIN') {
            throw  CustomError(ErrorName.UNAUTHORIZED, "Only Admins can create Learning Plans");
        }
        const result = await createLearningPlanHelper(input);
        if (!result.success) {
            throw  CustomError(ErrorName.LEARNING_PLAN_NOT_CREATED, result.errors[0]);
        }
        return result.learningPlan;
    } catch (error) {
        throw  CustomError(ErrorName.FAILED, error.message);
    }
},
    updateLearningPlanStatus: async ({ input }, context) => {
        const { learningPlanIDs, newStatus } = input;
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
        try {
            if (!Array.isArray(learningPlanIDs) || learningPlanIDs.length === 0) {
                throw CustomError(ErrorName.ARGUMENTS_REQUIRED,"Learning Plan IDs must be provided.");
            }
            if(newStatus === LearningPlanStatus.DRAFT){
                throw CustomError(ErrorName.INVALID_LEARNING_PLAN_STATUS_UPDATE,'Learning Plan Status Update Cannot be DRAFT');
            }
            const existingLearningPlans = await LearningPlan.find({
                _id: { $in: learningPlanIDs },
            });
            if (existingLearningPlans.length !== learningPlanIDs.length) {
                throw CustomError(ErrorName.INVALID_LEARNING_PLAN,"One or more provided Learning Plan IDs do not exist.");
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
}};
module.exports.queries = {
    getLearningPlans: async ({ filterInput }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
        try {
            const { subscriberId,userInfo } = AuthUser(context);
            if (userInfo.role !== 'ADMIN') {
                throw  CustomError(ErrorName.UNAUTHORIZED, "Only Admins can create Learning Plans");
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
            const learningPlan = await LearningPlan.find(queryConditions);
            return {
                learningPlans: learningPlan,
                totalCount: totalCount,
            }; 
        } catch (error) {
            throw  CustomError(ErrorName.FAILED, error.message);
        }
    },
};
