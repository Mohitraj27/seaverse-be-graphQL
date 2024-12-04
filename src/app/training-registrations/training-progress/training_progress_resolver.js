const TrainingProgressHelper = require("./training_progress_helper");

module.exports.mutations = {
    initiateTrainingProgress: async ({ input }, context) => {

        const { role, userPermissions, userId, subscriberId, employeeId, isOrganizationManager } =
            AuthUser(context);

        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

        const getTrainingProgress = await TrainingProgress.findOne({
            training: input.training,
            user: userId
        })

        if (!getTrainingProgress) throw CustomError(ErrorName.NOT_FOUND);

        getTrainingProgress.status = 'inProgress';

        const trainingModules = await TrainingModule.find({ training: input.training }).lean();
        const trainingModuleContentUIDs = trainingModules.flatMap(module => module.trainingModuleContents);
        const latestTrainingModuleContentIDs = await TrainingModuleContent.aggregate([
            {
                $match: { UID: { $in: trainingModuleContentUIDs } },
            },
            {
                $sort: { UID: 1, version: -1 },
            },
            {
                $group: {
                    _id: "$UID",
                    latestContentId: { $first: "$_id" },
                },
            }
        ]);
        const latestContentObjectIDs = latestTrainingModuleContentIDs.map(content => content.latestContentId);
        getTrainingProgress.trainingModuleContent.push({ trainingModuleContentId: latestContentObjectIDs });
        const updatedTrainingProgress = await getTrainingProgress.save();

        return {
            message: "Training progress initiated successfully"
        };

    },
    updateTrainingProgress: async ({ input }, context) => {
        return TrainingProgressHelper.updateTrainingProgress({ input }, context);
    },
    updateScormTrainingProgress: async ({ input }, context) => {
        return TrainingProgressHelper.updateScormTrainingProgress({ input }, context);
    },
};
