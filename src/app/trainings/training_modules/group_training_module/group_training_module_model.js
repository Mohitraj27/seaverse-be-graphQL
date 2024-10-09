const { Schema, Model, ObjectId } = require("../../../../tools");
const { LocalisedDataSchema } = require("../../../../util/localised_data_schema");

const groupTrainingModuleSchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
        },
        name: [LocalisedDataSchema],
        trainingModules: [
            {
                type: ObjectId,
                ref: "TrainingModule",
                required: true, 
            }
        ],
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
    },
    { timestamps: true }
);


groupTrainingModuleSchema.pre('validate', function (next) {
    if (this.trainingModules.length === 0) {
        return next(new Error('At least one training module is required.'));
    }
    next();
});

module.exports.GroupTrainingModule = Model("GroupTrainingModule", groupTrainingModuleSchema);
