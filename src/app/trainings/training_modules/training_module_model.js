const { Schema, Model, ObjectId } = require("../../../tools");
const { LocalisedDataSchema } = require("../../../util/localised_data_schema");

const trainingModuleSchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
        },
        training: {
            type: ObjectId,
            ref: "Training",
            required: true,
            index: true,
        },
        title: [LocalisedDataSchema],
        description: [LocalisedDataSchema],
        displayPosition: {
            type: Number,
            default: 0,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        createdBy: {
            type: ObjectId,
            ref: "User",
        },
        updatedBy: {
            type: ObjectId,
            ref: "User",
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
        trainingModuleContents: [
            {
                type: ObjectId,
                ref: "TrainingModuleContent",
                required: true,
                index: true,
            }
        ],
    },
    { timestamps: true }
);

trainingModuleSchema.index({ _id: 1, subscriber: 1, training: 1 });

module.exports.TrainingModule = Model("TrainingModule", trainingModuleSchema);
