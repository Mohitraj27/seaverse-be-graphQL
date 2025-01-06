const { ObjectId } = require("../../../tools");
const { CustomError, ErrorName, AuthUser } = require("../../../util");
const { TrainingContentBridge } = require("../training_content_bridge/training_content_model");

const { TrainingModule } = require("./training_module_model");

module.exports = {
    createOrUpdateTrainingModule: async ({ input, session }, context) => {
        const { userId, subscriberId } = AuthUser(context);

        const trainingModuleContentUpdateData = [];
        const trainingId = input.training?._id;

        if (trainingId) {

            const fetchExistingTrainingModules = await TrainingModule.find({ subscriber: subscriberId, training: trainingId, isDeleted: { $ne: true } });

            if (fetchExistingTrainingModules.length > 0) {

                const trainingModulesToDelete = fetchExistingTrainingModules.filter((module) => {
                    return !input.trainingModules.some((inputModule) => inputModule._id && inputModule._id.toString() === module._id.toString());
                });

                const trainingModuleIds = trainingModulesToDelete.map((module) => module._id);

                if (trainingModulesToDelete.length > 0) {
                    const deleteTrainingModuleContentBridge = await TrainingContentBridge.updateMany(
                        { trainingModule: { $in: trainingModuleIds } },
                        { isDeleted: true },
                        { session }
                    );

                    const deleteTrainingModule = await TrainingModule.updateMany(
                        { _id: { $in: trainingModuleIds } },
                        { isDeleted: true },
                        { session }
                    );
                }
            }

        }

        const trainingModuleBulkOperations = input.trainingModules.map((module, index) => {

            const trainingModuleFilterConditions = {
                _id: module._id ?? ObjectId(),
                subscriber: subscriberId,
                
            };

            const trainingModuleUpdateData = {};

            if (module.title) trainingModuleUpdateData.title = module.title;
            if (module.description) trainingModuleUpdateData.description = module.description;
            if (typeof module.isActive === "boolean") trainingModuleUpdateData.isActive = module.isActive;
            if (module.trainingModuleContents) trainingModuleContentUpdateData.push(...module.trainingModuleContents);
            if (trainingId) trainingModuleUpdateData.training = trainingId;
            return {
                updateOne: {
                    filter: trainingModuleFilterConditions,
                    update: {
                        ...trainingModuleUpdateData,
                        $setOnInsert: { createdBy: userId },
                        updatedBy: userId,
                        order: index + 1,
                    },
                    upsert: true,
                },
            };

        });

        const updatedModules = await TrainingModule.bulkWrite(trainingModuleBulkOperations, {
            session,
            setDefaultsOnInsert: true,
            runValidators: true,
        });

        if (!updatedModules) {
            throw CustomError(ErrorName.FAILED);
        }
        

        return updatedModules;
    }
};
