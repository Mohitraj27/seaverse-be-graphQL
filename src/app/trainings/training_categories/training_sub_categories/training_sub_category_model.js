const { Schema, Model, ObjectId, AggregatePaginate } = require("../../../../tools");
const { LocalisedDataSchema } = require("../../../../util/localised_data_schema");

const trainingSubCategorySchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
        },
        category: {
            type: ObjectId,
            ref: "TrainingCategory",
        },
        name: [LocalisedDataSchema],
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
    },
    { timestamps: true }
);

trainingSubCategorySchema.index({ _id: 1, subscriber: 1, category: 1 });

module.exports.TrainingSubCategory = Model("TrainingSubCategory", trainingSubCategorySchema);
