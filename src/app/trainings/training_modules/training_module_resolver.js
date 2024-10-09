const { CustomError, ErrorName, AuthUser, Role, DbTransactionHelper } = require("../../../util");

const { TrainingModule } = require("./training_module_model");
const {
    TrainingModuleContent,
} = require("./training_module_contents/training_module_content_model");

const TrainingModuleHelper = require("./training_module_helper");
const SubRoleHelper = require("../../user/sub-roles/sub_role_helper");
const LogHelper = require("../../logs/log_helper");

const Permission = require("../../user/sub-roles/permission");

module.exports.mutations = {
    // createOrUpdateTrainingModule: async ({ input }, context) => {
    //     const { role, userPermissions } = AuthUser(context);
    //
    //     if (!Object.keys(input).length) throw CustomError(ErrorName.ARGUMENTS_REQUIRED);
    //
    //     if (
    //         !SubRoleHelper.hasPermission({
    //             currentRole: role,
    //             currentPermissions: userPermissions,
    //             requiredPermission: Permission.CREATE_OR_UPDATE_TRAINING,
    //         })
    //     ) {
    //         throw CustomError(ErrorName.FORBIDDEN);
    //     }
    //
    //     // TODO:QUESTION: limit manager to particular trainings or not?
    //     return await TrainingModuleHelper.createOrUpdateTrainingModule({ input }, context);
    // },
    // deleteTrainingModule: async ({ id }, context) => {
    //     const { role, userId, userPermissions, subscriberId } = AuthUser(context);
    //
    //     if (
    //         !SubRoleHelper.hasPermission({
    //             currentRole: role,
    //             currentPermissions: userPermissions,
    //             requiredPermission: Permission.DELETE_TRAINING,
    //         })
    //     ) {
    //         throw CustomError(ErrorName.FORBIDDEN);
    //     }
    //
    //     return await DbTransactionHelper.performDbTransaction(async session => {
    //         // TODO:QUESTION: change to soft delete or not?
    //         const deletedTrainingModule = await TrainingModule.findOneAndDelete(
    //             {
    //                 _id: id,
    //                 subscriber: subscriberId,
    //             },
    //             { lean: true, session }
    //         ).select("_id");
    //
    //         if (!deletedTrainingModule) throw CustomError(ErrorName.NOT_FOUND);
    //
    //         await TrainingModuleContent.deleteMany(
    //             {
    //                 subscriber: subscriberId,
    //                 trainingModule: id,
    //             },
    //             { lean: true, session }
    //         );
    //
    //         return deletedTrainingModule;
    //     });
    // },
    // updateTrainingModuleStatus: async ({ id, isActive }, context) => {
    //     const { role, userId, userPermissions, subscriberId } = AuthUser(context);
    //
    //     if (
    //         !SubRoleHelper.hasPermission({
    //             currentRole: role,
    //             currentPermissions: userPermissions,
    //             requiredPermission: Permission.CREATE_OR_UPDATE_TRAINING,
    //         })
    //     ) {
    //         throw CustomError(ErrorName.FORBIDDEN);
    //     }
    //
    //     const savedTrainingModule = await TrainingModule.findOneAndUpdate(
    //         {
    //             _id: id,
    //             subscriber: subscriberId,
    //         },
    //         { isActive },
    //         { new: true, lean: true }
    //     ).select("isActive");
    //
    //     if (!savedTrainingModule) throw CustomError(ErrorName.NOT_FOUND);
    //     return savedTrainingModule;
    // },
    // //TODO:FEAT: rearrange modules - update displayPosition
};
