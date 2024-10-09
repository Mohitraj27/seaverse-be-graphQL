const TrainingProgressHelper = require("./training_progress_helper");

module.exports.mutations = {
    updateTrainingProgress: async ({ input }, context) => {
        return TrainingProgressHelper.updateTrainingProgress({ input }, context);
    },
    updateScormTrainingProgress: async ({ input }, context) => {
        return TrainingProgressHelper.updateScormTrainingProgress({ input }, context);
    },
};
