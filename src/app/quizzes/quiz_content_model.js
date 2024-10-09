const { Schema, Model, ObjectId, AggregatePaginate } = require("../../tools");
const { LocalisedDataSchema } = require("../../util/localised_data_schema");
const ApprovalStatus = require("../trainings/approval_status.json");

const quizSchema = {
    timeOut: Number, // minutes
    passMark: Number, // percentage
    retryCount: Number,
    questionAnswers: [
        {
            question: [LocalisedDataSchema],
            choices: [
                {
                    key: {
                        type: String,
                        lowercase: true,
                    },
                    value: [LocalisedDataSchema],
                },
            ],
            answerKey: {
                type: String,
                lowercase: true,
            },
            mark: Number,
            displayPosition: {
                type: Number,
                default: 0,
            },
        },
    ],
    questionsDisplayedCount: Number, // use this value to take random questions
};

const quizContentSchema = new Schema(
    {
        UID: String,
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
        },

        title: [LocalisedDataSchema],
        description: [LocalisedDataSchema],
        images: [{ url: String }],
        quiz: quizSchema,
        isPublic: {
            type: Boolean,
            default: true,
        },

        approvalStatus: {
            type: String,
            uppercase: true,
            default: ApprovalStatus.PREPARING,
        },
        appliedAt: Date,
        approvedAt: Date,
        rejectedAt: Date,

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
    },
    { timestamps: true }
);

quizContentSchema.index({ _id: 1, subscriber: 1 });

quizContentSchema.plugin(AggregatePaginate);

module.exports.QuizContent = Model("QuizContent", quizContentSchema);
module.exports.QuizSchema = quizSchema;
