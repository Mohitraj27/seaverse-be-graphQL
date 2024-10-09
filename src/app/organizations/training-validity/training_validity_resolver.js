const { CustomError, ErrorName, AuthUser, DbTransactionHelper } = require("../../../util");

const { TrainingValidity } = require("./training_validity_model");

const SubRoleHelper = require("../../user/sub-roles/sub_role_helper");

const Permission = require("../../user/sub-roles/permission.json");

module.exports.mutations = {
    createOrUpdateTrainingValidities: async ({ inputs }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.UPDATE_ORGANIZATION,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const savedDocs = await DbTransactionHelper.performDbTransaction(async session => {
            let docs = [];

            for (const input of inputs) {
                const filterConditions = {
                    subscriber: subscriberId,
                    organization: input.organization,
                    training: input.training,
                };

                const savedDoc = await TrainingValidity.findOneAndUpdate(
                    filterConditions,
                    {
                        ...filterConditions,
                        certificateValidity: input.certificateValidity,
                        $setOnInsert: { createdBy: userId },
                        updatedBy: userId,
                    },
                    {
                        upsert: true,
                        new: true,
                        setDefaultsOnInsert: true,
                        runValidators: true,
                        lean: true,
                        session,
                    }
                ).populate({ path: "training", select: "title certificateValidity" });

                if (!savedDoc) throw CustomError(ErrorName.FAILED);
                docs.push(savedDoc);
            }

            return docs;
        });

        if (!savedDocs) throw CustomError(ErrorName.FAILED);
        return savedDocs;
    },
    deleteTrainingValidity: async ({ id }, context) => {
        const { role, userPermissions, subscriberId, isOrganizationManager } = AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.UPDATE_ORGANIZATION,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const deletedDoc = await TrainingValidity.findOneAndDelete(
            { _id: id, subscriber: subscriberId },
            { lean: true }
        ).select("_id");

        if (!deletedDoc) throw CustomError(ErrorName.FAILED);
        return deletedDoc;
    },
};
