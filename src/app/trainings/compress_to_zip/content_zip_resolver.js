const { CustomError, ErrorName, AuthUser } = require("../../../util");
const { Training } = require('../../trainings/training_model');
const { TrainingProgress } = require('../../training-registrations/training-progress/training_progress_model');
const { TrainingModule } = require('../../trainings/training_modules/training_module_model');
const { TrainingContentBridge } = require('../../trainings/training_content_bridge/training_content_model');
const { OverallTrainingProgress } = require('../../training-registrations/overall-course-progress/overall_progress_model');
const AwsHelper = require("../../../util/aws_helper");
const { getTheContent } = require("./content_zip_helper");
const { TrainingModuleContent } = require("../training_modules/training_module_contents/training_module_content_model");

module.exports.queries = {

}
module.exports.mutations = {
    downloadZip: async ({ input }, context) => {

        const { userId } = AuthUser(context);

        try {

            if (!userId) throw CustomError(ErrorName.NOT_FOUND);

            if (!input.training || !input.trainingModule) throw CustomError(ErrorName.ARGUMENTS_REQUIRED);

            const existingTraining = await Training.findById(input.training, { isDeleted: false });

            if (!existingTraining) throw CustomError(ErrorName.NOT_FOUND, "Course not found");

            const existingTrainingModule = await TrainingModule.find({ _id: input.trainingModule, training: input.training });

            if (!existingTrainingModule) throw CustomError(ErrorName.NOT_FOUND, "Lesson not found");

            const trainingModuleContentsFromContentData = await OverallTrainingProgress.findOne({ user: userId, training: input.training });

            let trainingContentIds = [];

            trainingModuleContentsFromContentData?.contentData.map((content) => {

                if (content.moduleId.toString() === input.trainingModule.toString()) {
                    trainingContentIds.push(...content.contentIds);
                }
            });

            let trainingModuleContentsFromTrainingContent = [];

            let trainingContents = [];
            if (trainingContentIds.length > 0) {
                trainingContents = await TrainingModuleContent.find({ _id: { $in: trainingContentIds } });
            }

            if (trainingContentIds.length == 0) {

                trainingModuleContentsFromTrainingContent = await TrainingContentBridge.find({
                    training: input.training,
                    trainingModule: input.trainingModule,
                    isDeleted: false
                }).populate('trainingContent').lean();

            }

            let getContent;
            if (trainingContentIds.length > 0) {
                getContent = await getTheContent(trainingContents);
            } else if (trainingModuleContentsFromTrainingContent.length > 0) {

                const trainingContents = [];
                trainingModuleContentsFromTrainingContent.map((item) => {
                    return trainingContents.push(item.trainingContent);
                })

                getContent = await getTheContent(trainingContents, 'contentCollection');
            }

            if (!getContent) throw CustomError(ErrorName.SERVER_ERROR);

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