    const { Schema, Model, ObjectId, AggregatePaginate } = require("../../tools");

    const { LocalisedDataSchema } = require("../../util/localised_data_schema");

    const ApprovalStatus = require("./approval_status.json");
    const TrainingStatus = require("./enum_fields/training_status.json");
    const unlockOn = require("./enum_fields/unlockOn.json");
    const { FeedbackSchema } = require("../feedbacks/feedback_content_model");
    const CourseType = require("../../app/trainings/enum_fields/courseType.json");
    const trainingSchema = new Schema(
        {
            UID: String,
            subscriber: {
                type: ObjectId,
                ref: "Subscriber",
                required: true,
                index: true,
            },
            trainingCategories: [
                {
                    type: ObjectId,
                    ref: "TrainingCategory",
                },
            ],
            trainingSubCategories: [
                {
                    type: ObjectId,
                    ref: "TrainingSubCategory",
                },
            ],
            title: [LocalisedDataSchema],
            description: [LocalisedDataSchema],
            instructions: [LocalisedDataSchema],
            feedback: FeedbackSchema, 
            feedbackContent: {
                type: ObjectId,
                ref: "FeedbackContent",
            },
            userFeedback: {
                type: Boolean,
                default: false,
            },
            managerFeedback: {
                type: Boolean,
                default: false,
            },
            setFrequency: {
                type: Number,
            },
            enableEmailNotification: {
                type: Boolean,
                default: false,
            },
            setReminder: {
                type: Boolean,
                default: false,
            },
            setFrequencyDate: {
                type: Date,
                default: null
            },
            manadatoryModules: {
                type: Number,
            },
            images: [
                {
                    url: String,
                },
            ],
            scorm: {
                launchUrl: String,
                courseId: String,
                fileName: String,
                type: {
                    type: String,
                    enum: ["CLOUD", "LOCAL"],
                }
            },

            overview: {
                type: String,
                required: true,
            },
            targetAudienceId: {
                type: ObjectId,
                ref: "TargetAudience",
            },
            courseType: {
                type: String,
                uppercase: true,
                required: true,
            },
            ClassroomModule: {
                type: ObjectId,
                ref: "ClassroomModule",
                required: function(){
                    return this.courseType === CourseType.CLASSROOM;
                }
            },
            enableFreeFlow: { type: Boolean, default: false},
            unlockOn:{
                type: String,
                uppercase: true,
                default: unlockOn.NONE,
            },
            status: {
                type: String,
                uppercase: true,
                default: TrainingStatus.DRAFT,
                required: true,
            },
            courseLevel: {
                type: String,
                uppercase: true,
                required:true,  
            },
            isCertificate:{
                type : Boolean,
                required : true
            },
            price: Number,
            durationHours: { type: Number, required: true },
            certifications: [
                {
                    url: String,
                },
            ],
            bannerImage: [
                {
                    url: String,
                }
            ],
            certificateValidity: Number,
            courseId: { type: String, unique:true, required:true },
            skills:{ type: [String]},
            course_validity: { type: Date, default: null },
            hideCourseProgress: { type: Boolean, default: false },
            allowMultipleAttempts: Boolean,
            attemptFlexibility: {
                type: String,
                uppercase: true,
                required: function () {
                    return this.allowMultipleAttempts === true;
                },
                
            },
            attemptType: {
                type: String,
                uppercase: true,
                required: function () {
                    return this.allowMultipleAttempts === true;
                },
            },
            setLimitAttempt: {
                type: Number,
                required: function () {
                    return this.allowMultipleAttempts === true && this.attemptType === "LIMITED_ATTEMPT";
                },
            },
            disableFurtherAttemptsOnPass: {
                type: Boolean,
                required: function () {
                    return this.allowMultipleAttempts === true;
                },
            },
            lockModulesBetweenAttempts: {
                type: Boolean,
                required: function () {
                    return this.allowMultipleAttempts === true;
                },
            },
            setTimeLimitForModule: {
                type: Boolean,
                required: function () {
                    return this.allowMultipleAttempts === true;
                },
            },
            approvalStatus: {
                type: String,
                uppercase: true,
                default: ApprovalStatus.APPROVED,
            },
            authorName: {
                type: String,
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
            isDeleted: {
                type: Boolean,
                default: false,
            },
        },
        { timestamps: true }
    );

    trainingSchema.virtual("trainingModules", {
        ref: "TrainingModule",
        localField: "_id",
        foreignField: "training",
    });

    trainingSchema.virtual("trainingModuleContents", {
        ref: "TrainingModuleContent",
        localField: "_id",
        foreignField: "trainingModule",
    });

    trainingSchema.virtual("groupTrainingModule", {
        ref: "GroupTrainingModule",
        localField: "_id",
        foreignField: "trainingModules"
    })

    trainingSchema.index({ _id: 1, subscriber: 1 });

    trainingSchema.plugin(AggregatePaginate);

    module.exports.Training = Model("Training", trainingSchema);
