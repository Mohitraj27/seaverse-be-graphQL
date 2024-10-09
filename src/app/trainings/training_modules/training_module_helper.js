const { ObjectId } = require("../../../tools");
const { CustomError, ErrorName, AuthUser } = require("../../../util");

const { TrainingModule } = require("./training_module_model");

module.exports = {
    createOrUpdateTrainingModule: async ({ input, session }, context) => {
        const { userId, subscriberId } = AuthUser(context);

        const trainingModuleFilterConditions = {
            _id: input._id ?? ObjectId(),
            subscriber: subscriberId,
            training: input.training?._id ?? input.training,
        };

        const trainingModuleUpdateData = {};

        if (input.title) trainingModuleUpdateData.title = input.title;
        if (input.description) trainingModuleUpdateData.description = input.description;
        if (input.displayPosition) trainingModuleUpdateData.displayPosition = input.displayPosition;
        if (typeof input.isActive === "boolean") trainingModuleUpdateData.isActive = input.isActive;

        const savedTrainingModule = await TrainingModule.findOneAndUpdate(
            trainingModuleFilterConditions,
            {
                ...trainingModuleFilterConditions,
                ...trainingModuleUpdateData,
                $setOnInsert: {
                    createdBy: userId,
                },
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
        );

        if (!savedTrainingModule) throw CustomError(ErrorName.FAILED);
        return savedTrainingModule;
    },
};
