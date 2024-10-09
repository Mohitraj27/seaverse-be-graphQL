 const { CustomError, ErrorName, AuthUser, DbTransactionHelper } = require("../../../../util");
const { GroupTrainingModule } = require("./group_training_module_model");
const SubRoleHelper = require("../../../user/sub-roles/sub_role_helper");
const Permission = require("../../../user/sub-roles/permission.json");

module.exports.mutations = {
    createOrUpdateGroupTrainingModule: async ({ input }, context) => {
        const { role, userPermissions } = AuthUser(context);

        if (!Object.keys(input).length) throw CustomError(ErrorName.ARGUMENTS_REQUIRED);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.CREATE_OR_UPDATE_GROUP_TRAINING,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        try {
            const { _id, subscriber, name, trainingModules, createdBy, updatedBy, isDeleted } = input;

            let groupTrainingModule;

            if (_id) {
                groupTrainingModule = await GroupTrainingModule.findById(_id);
                if (!groupTrainingModule) throw CustomError(ErrorName.NOT_FOUND);

                groupTrainingModule.subscriber = subscriber || groupTrainingModule.subscriber;
                groupTrainingModule.name = name || groupTrainingModule.name;
                groupTrainingModule.trainingModules = trainingModules || groupTrainingModule.trainingModules;
                groupTrainingModule.createdBy = createdBy || groupTrainingModule.createdBy;
                groupTrainingModule.updatedBy = updatedBy || groupTrainingModule.updatedBy;
                groupTrainingModule.isDeleted = isDeleted || groupTrainingModule.isDeleted;
            } else {
                groupTrainingModule = new GroupTrainingModule({
                    subscriber,
                    name,
                    trainingModules,
                    createdBy,
                    updatedBy,
                });
            }

            return await groupTrainingModule.save();
        } catch (error) {
            throw CustomError(ErrorName.INTERNAL_SERVER_ERROR, error.message);
        }
    },

    deleteGroupTrainingModule: async ({ id }, context) => {
        const { role, userPermissions } = AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.DELETE_GROUP_TRAINING,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        try {
            const result = await GroupTrainingModule.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
            if (!result) throw CustomError(ErrorName.NOT_FOUND);
            return true;
        } catch (error) {
            throw CustomError(ErrorName.INTERNAL_SERVER_ERROR, error.message);
        }
    }
};
