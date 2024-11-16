const { CustomError, ErrorName, AuthUser } = require("../../../util");
const { Training } = require('../../trainings/training_model');
const { TrainingProgress } = require('../../training-registrations/training-progress/training_progress_model');
const { TrainingModule } = require('../../trainings/training_modules/training_module_model');
const { TrainingContentBridge } = require('../../trainings/training_content_bridge/training_content_model');
const AwsHelper = require("../../../util/aws_helper");
const { getTheContent } = require("./content_zip_helper");

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

            const trainingModuleContentsFromTrainingProgress = await TrainingProgress.find({ user: userId, trainingModule: input.trainingModule })
                .populate('trainingModuleContent')
                .select('trainingModuleContent').lean();

            let trainingModuleContentsFromTrainingContent = [];
            if (trainingModuleContentsFromTrainingProgress.length === 0) {
                trainingModuleContentsFromTrainingContent = await TrainingContentBridge.find({
                    training: input.training,
                    trainingModule: input.trainingModule,
                    isDeleted: false
                }).populate('trainingContent').select('trainingContent').lean();
            }

            let getContent;
            if (trainingModuleContentsFromTrainingProgress.length > 0) {

                getContent = await getTheContent(trainingModuleContentsFromTrainingProgress, 'progressCollection');
                
            } else if (trainingModuleContentsFromTrainingContent.length > 0) {

                getContent = await getTheContent(trainingModuleContentsFromTrainingContent, 'contentCollection');

            }

            const zip = await AwsHelper.fetchFile(getContent);

            return {
                status: "01",
                zipUrl: zip
            }

        } catch (error) {
            throw Error(error.message);
        }
    }
}