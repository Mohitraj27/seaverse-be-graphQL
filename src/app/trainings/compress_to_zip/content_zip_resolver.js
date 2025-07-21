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

module.exports.queries = {

}
module.exports.mutations = {
    downloadZip: async ({ input }, context) => {

        const { userId } = AuthUser(context);

        try {

            if (!input.training) throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Training ID is required");

            const trainingModuleContentsFromContentData = await OverallTrainingProgress.findOne({ user: userId, training: input.training });

            let syncContentErrors = [];
            // add content data to overall training progress
            const overallTrainingProgress = await OverallTrainingProgress.findOne({ user: userId, training: input.training });
            if (!overallTrainingProgress) throw CustomError(ErrorName.COURSE_NOT_FOUND, "Course not found");
            const overallIdArray = [{ overallId: overallTrainingProgress?._id }];
            const fromDownload = true;
            if (overallIdArray.length > 0) await TrainingHelper.addDataToOverallTrainingProgress(overallIdArray, syncContentErrors, null, fromDownload);


            if (syncContentErrors.length > 0) throw CustomError(ErrorName.NOT_FOUND, syncContentErrors[0]);

            let trainingContentIds = [];

            trainingModuleContentsFromContentData?.contentData.map((content) => {
                trainingContentIds.push({ trainingContent: content.contentIds, trainingModule: content.trainingModule });
            });

            let trainingModuleContentsFromTrainingContent = [];

            // let trainingContents = [];
            const trainingContentsAndModules = [];
            if (trainingContentIds.length > 0) {

                const contentIdsOnly = trainingContentIds.map(item => item.trainingContent);
                const trainingContents = await TrainingModuleContent.find({ _id: { $in: contentIdsOnly } });

                trainingContentIds.map((item) => {
                    const trainingModuleContent = trainingContents.find(content => content._id.toString() === item.trainingContent.toString());
                    if (trainingModuleContent) {
                        trainingContentsAndModules.push({
                            trainingModule: item.trainingModule,
                            trainingContent: trainingModuleContent
                        });
                    }
                });

            }

            if (trainingContentIds.length == 0) {

                trainingModuleContentsFromTrainingContent = await TrainingContentBridge.find({
                    training: input.training,
                    // trainingModule: input.trainingModule,
                    isDeleted: false
                }).populate('trainingContent').lean();

            }
            const user = await User.findOne({ _id: userId }).lean();
            const userLanguages = user?.contentlanguages || [];
            let getContent;
            if (trainingContentIds.length > 0) {
                getContent = await getTheContent(trainingContentsAndModules, userLanguages);
            } else if (trainingModuleContentsFromTrainingContent.length > 0) {

                const groupedData = Object.values(
                    trainingModuleContentsFromTrainingContent.reduce((acc, item) => {

                        const moduleId = item.trainingModule.toString();
                        const contentId = item?.trainingContent || [];

                        if (!acc[moduleId]) {
                            acc[moduleId] = {
                                trainingModule: moduleId,
                                trainingContent: []
                            };
                        }

                        acc[moduleId].trainingContent.push(contentId);

                        return acc;
                    }, {})
                );

                getContent = await getTheContent(groupedData, userLanguages);

            }

            if (!getContent) throw CustomError(ErrorName.SERVER_ERROR);

            const metadata = await AwsHelper.fetchFile(getContent);

            return {
                status: "01",
                zipUrl: metadata
            }

        } catch (error) {
            throw CustomError(ErrorName.FAILED_TO_DOWNLOAD_ZIP, error.message);
        }
    }
}