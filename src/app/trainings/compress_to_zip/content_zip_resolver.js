const { CustomError, ErrorName, AuthUser } = require("../../../util");
const { Training } = require('../../trainings/training_model');
const { TrainingProgress } = require('../../training-registrations/training-progress/training_progress_model');
const { TrainingModule } = require('../../trainings/training_modules/training_module_model')

module.exports.queries = {

}
module.exports.mutations = {
    downloadZip: async ({ input }, context) => {

        const { userId, subscriberId } = AuthUser(context);

        try {

            if (!subscriberId || !userId) throw CustomError(ErrorName.NOT_FOUND);
            if (!input.training || !input.trainingModule) throw CustomError(ErrorName.ARGUMENTS_REQUIRED);

            const existingTraining = await Training.findById(input.training, { isDeleted: false });

            if (!existingTraining) throw CustomError(ErrorName.NOT_FOUND, "Course not found");

            const existingTrainingModule = await TrainingModule.find({ _id: input.trainingModule, training: input.training });

            if (!existingTrainingModule) throw CustomError(ErrorName.NOT_FOUND, "Lesson not found");

            const trainingModuleContents = await TrainingProgress.find({ user: userId, trainingModule: input.trainingModule })
                .populate('trainingModuleContent')
                .select('trainingModuleContent').lean();

            if (!trainingModuleContents) throw CustomError(ErrorName.NOT_FOUND, "Content not found");

            console.log(trainingModuleContents);

        } catch (error) {
            throw Error(error.message);
        }
    }
}