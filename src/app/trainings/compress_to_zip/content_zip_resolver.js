const { CustomError, ErrorName, AuthUser } = require("../../../util");
const { Training } = require('../../trainings/training_model');
const { TrainingProgress } = require('../../training-registrations/training-progress/training_progress_model');
const { TrainingModule } = require('../../trainings/training_modules/training_module_model');
const { TrainingContentBridge } = require('../../trainings/training_content_bridge/training_content_model');
const { OverallTrainingProgress } = require('../../training-registrations/overall-course-progress/overall_progress_model');
const TrainingHelper = require("../training_helper");
const AwsHelper = require("../../../util/aws_helper");
const { getTheContent } = require("./content_zip_helper");
const { TrainingModuleContent } = require("../training_modules/training_module_contents/training_module_content_model");
const { User } = require("../../user/user_model");
const validateInputData = async (input, userId) => {
    if (!userId) throw CustomError(ErrorName.USER_NOT_FOUND, "User not found");

    if (!input.training || !input.trainingModule) throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Training and training module is required");

    const existingTraining = await Training.findById(input.training);

    if (!existingTraining) throw CustomError(ErrorName.COURSE_NOT_FOUND, "Course not found");

    const existingTrainingModule = await TrainingModule.find({ _id: input?.trainingModule, training: input?.training });

    if (!existingTrainingModule) throw CustomError(ErrorName.LESSON_NOT_FOUND, "Lesson not found");

}
module.exports.queries = {

}
module.exports.mutations = {
    downloadZip: async ({ input }, context) => {

        const { userId } = AuthUser(context);

        try {
            await validateInputData(input, userId);

            let syncContentErrors = [];

            //add content data to overall training progress
            
            const overallTrainingProgress = await OverallTrainingProgress.findOne({ user: userId, training: input.training });

            if (!overallTrainingProgress) throw CustomError(ErrorName.COURSE_NOT_FOUND, "Course not found");

            const overallIdArray = [{ overallId: overallTrainingProgress?._id }];

            const fromDownload = true;
            const overallProgressesWithContentData = await TrainingHelper.addDataToOverallTrainingProgress(overallIdArray, syncContentErrors, null, fromDownload);

            const singleOverallProgressWithContentData = overallProgressesWithContentData[0];

            let trainingContentIds = [];

            singleOverallProgressWithContentData?.contentData.map((content) => {

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
            const user = await User.findOne({ _id: userId }).lean();
            const userLanguages = user?.contentlanguages || [];
            let getContent;
            if (trainingContentIds.length > 0) {
                getContent = await getTheContent(trainingContents, userLanguages);
            } else if (trainingModuleContentsFromTrainingContent.length > 0) {
                /*
                const trainingContents = [];
                trainingModuleContentsFromTrainingContent.map((item) => {
                    return trainingContents.push(item.trainingContent);
                })

                getContent = await getTheContent(trainingContents, 'contentCollection');
                */
                const trainingContents = trainingModuleContentsFromTrainingContent.map(item => item.trainingContent);
                getContent = await getTheContent(trainingContents, userLanguages);
            }

            if (getContent.length == 0) {
                return {
                    status: "01",
                    zipUrl: null
                }
            }

            if (!getContent) throw CustomError(ErrorName.SERVER_ERROR);

            const zip = await AwsHelper.fetchFile(getContent);

            return {
                status: "01",
                zipUrl: zip
            }

        } catch (error) {
            throw CustomError(ErrorName.FAILED_TO_DOWNLOAD_ZIP, error.message);
        }
    }
}