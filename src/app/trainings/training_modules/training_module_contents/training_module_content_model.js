const { uuid } = require("uuidv4");
const { Schema, Model, ObjectId } = require("../../../../tools");
const { LocalisedDataSchema } = require("../../../../util/localised_data_schema");
const { QuizSchema } = require("../../../quizzes/quiz_content_model");
const training_helper = require("../../training_helper");

const trainingModuleContentSchema = new Schema(
    {
        UID: String,
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
        },
        contentType: {
            type: String,
            uppercase: true,
            required: true,
            enum: ["AUDIO", "VIDEO", "TEXT", "QUIZ", "PPT", "PDF", "SCORM", "FILES", "IMAGE"],
        },
        duration: String,
        contentStatus: {
            type: String,
            enum: ["DRAFT", "PUBLISHED", "RETIRED"],
            default: "DRAFT",
            required: true,
        },
        title: {
            type: [LocalisedDataSchema],
            required: true,
        },
        description: {
            type: [LocalisedDataSchema],
            required: false,
        },
        scorm: {
            courseId: String,
            launchUrl: String,
            registrationId: String,
            learnerId: String,
        },
        videos: [
            {
                lang: {
                    type: String,
                    lowercase: true,
                },
                url: {
                    type: String,
                    required: true,
                },
            },
        ],
        audios: [
            {
                lang: {
                    type: String,
                    lowercase: true,
                },
                url: {
                    type: String,
                    required: true,
                },
            },
        ],
        images: [
            {
                url: {
                    type: String,
                    required: true,
                },
            },
        ],
        thumbnail: {
            type: String,
            required: false,
        },
        text: [LocalisedDataSchema],
        files: [
            {
                url: {
                    type: String,
                    required: true,
                },
            },
        ],
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
        version: {
            type: Number,
            default: 1,
        },
        modifiedDate: {
            type: Date,
            default: Date.now,
        },
        isUpdated: {
            type: Boolean,
            default: false,
        },
        isMediaUpdated: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

trainingModuleContentSchema.index({ _id: 1, subscriber: 1 });

module.exports.TrainingModuleContent = Model("TrainingModuleContent", trainingModuleContentSchema);
