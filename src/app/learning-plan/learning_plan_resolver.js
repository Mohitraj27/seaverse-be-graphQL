const { LearningPlan } = require("./learning_plan_model");
const { CustomError } = require("../../util/error_helper");
const { ErrorName,AuthUser, Permission, SubRoleHelper,subscriberId,context } = require("../../util");
const { createLearningPlanHelper } = require("./learning_plan_helper");
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
}};
