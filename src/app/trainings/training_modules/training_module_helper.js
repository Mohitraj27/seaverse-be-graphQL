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
            if (module.displayPosition) trainingModuleUpdateData.displayPosition = module.displayPosition;
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

        let updateTrainingBridge;

        if (trainingModuleContentUpdateData.length > 0) {
            const trainingModuleIds = input.trainingModules.map(module => module._id);

            const existingContentBridges = await TrainingContentBridge.find(
                {
                    training: input.training,
                    trainingModule: { $in: trainingModuleIds },
                },
                { trainingModule: 1, trainingContent: 1, isDeleted: 1 }
            ).lean();

            const existingContentMap = new Map();
            existingContentBridges.forEach(doc => {
                const key = `${doc.trainingModule}_${doc.trainingContent}`;
                existingContentMap.set(key, doc);
            });

            const trainingContentBridgeBulkOperations = [];

            for (const module of input.trainingModules) {
                const moduleId = module._id;

                module.trainingModuleContents.forEach(contentId => {
                    const key = `${moduleId}_${contentId}`;
                    if (!existingContentMap.has(key)) {
                        trainingContentBridgeBulkOperations.push({
                            updateOne: {
                                filter: {
                                    training: input.training,
                                    trainingModule: moduleId,
                                    trainingContent: contentId,
                                },
                                update: {
                                    $setOnInsert: { isDeleted: false },
                                },
                                upsert: true,
                            },
                        });
                    } else {
                        trainingContentBridgeBulkOperations.push({
                            updateOne: {
                                filter: {
                                    training: input.training,
                                    trainingModule: moduleId,
                                    trainingContent: contentId,
                                },
                                update: { $set: { isDeleted: false } },
                            },
                        });
                    }
                });

                existingContentBridges.forEach(doc => {
                    const key = `${doc.trainingModule}_${doc.trainingContent}`;
                    if (doc.trainingModule.toString() === moduleId.toString() &&
                        !module.trainingModuleContents.includes(doc.trainingContent.toString()) &&
                        doc.isDeleted === false) {
                        trainingContentBridgeBulkOperations.push({
                            updateOne: {
                                filter: {
                                    training: input.training,
                                    trainingModule: moduleId,
                                    trainingContent: doc.trainingContent,
                                },
                                update: { $set: { isDeleted: true } },
                            },
                        });
                    }
                });
            }

            updateTrainingBridge = await TrainingContentBridge.bulkWrite(trainingContentBridgeBulkOperations);
        }

        const result = await TrainingModule.bulkWrite(trainingModuleBulkOperations, {
            session,
            setDefaultsOnInsert: true,
            runValidators: true,
        });

        if (!result) {
            throw CustomError(ErrorName.FAILED);
        }

        const upsertedIds = Object.values(result.upserted).map(upsert => upsert._id);

        const updatedModules = await TrainingModule.updateMany(
            { _id: { $in: upsertedIds } },
            { $set: { trainingModuleContents: updateTrainingBridge.upsertedIds } },
            { session, lean: true }
        );

        return updatedModules;
    }
};
