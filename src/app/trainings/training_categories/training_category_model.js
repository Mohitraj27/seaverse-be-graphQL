const { Schema, Model, ObjectId, AggregatePaginate } = require("../../../tools");
const { LocalisedDataSchema } = require("../../../util/localised_data_schema");

const trainingCategorySchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            index: true,
        },
        // TODO: need to verify working with categories and sub categories
        // parentCategory: {
        //     type: ObjectId,
        //     ref: "TrainingCategory",
        // },
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

trainingCategorySchema.virtual("subCategories", {
    ref: "TrainingSubCategory",
    localField: "_id",
    foreignField: "category",
});

trainingCategorySchema.index({ _id: 1, subscriber: 1 });

trainingCategorySchema.plugin(AggregatePaginate);

module.exports.TrainingCategory = Model("TrainingCategory", trainingCategorySchema);
