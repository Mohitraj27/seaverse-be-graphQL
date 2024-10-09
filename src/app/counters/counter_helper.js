const { CustomError, ErrorName } = require("../../util");

const { Counter } = require("./counter_model");

module.exports = {
    updateCounter: async ({
        modelName,
        subscriberId,
        filterConditions,
        session,
        throwError = true,
    }) => {
        const data = { ...filterConditions, modelName };

        if (subscriberId) {
            data.subscriber = subscriberId;
        }

        const savedCounter = await Counter.findOneAndUpdate(
            data,
            {
                $setOnInsert: data,
                $inc: { count: 1 },
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

        if (!savedCounter && throwError) throw CustomError(ErrorName.FAILED);
        return savedCounter;
    },
};
