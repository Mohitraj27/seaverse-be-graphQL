const { ObjectId } = require("../../../tools");
const { CustomError, ErrorName, AuthUser } = require("../../../util");
const { TrainingContentBridge } = require("../training_content_bridge/training_content_model");

const { TrainingModule } = require("./training_module_model");

module.exports = {
    createOrUpdateTrainingModule: async ({ input, session }, context) => {
        const { userId, subscriberId } = AuthUser(context);

        const trainingModuleContentUpdateData = [];
        const trainingModuleBulkOperations = input.trainingModules.map((module) => {

            const trainingModuleFilterConditions = {
                _id: module._id ?? ObjectId(),
                subscriber: subscriberId,
                training: module.training?._id ?? module.training,
            };

            const trainingModuleUpdateData = {};

            if (module.title) trainingModuleUpdateData.title = module.title;
            if (module.description) trainingModuleUpdateData.description = module.description;
            if (typeof module.isActive === "boolean") trainingModuleUpdateData.isActive = module.isActive;
            if (module.trainingModuleContents) trainingModuleContentUpdateData.push(...module.trainingModuleContents);

            return {
                updateOne: {
                    filter: trainingModuleFilterConditions,
                    update: {
                        ...trainingModuleFilterConditions,
                        ...trainingModuleUpdateData,
                        $setOnInsert: { createdBy: userId },
                        updatedBy: userId,
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
