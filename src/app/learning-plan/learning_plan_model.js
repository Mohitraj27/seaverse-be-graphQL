const { Schema, Model, ObjectId } = require("../../tools");
const  TargetAudience  =  require("./enumFields/targetAudienceEnum.json");
const  LearningPlanStatus  = require("./enumFields/learning_plan_status.json");
const audienceSelectionEnum = require("./enumFields/audienceSelectionEnum.json");
const conditionTypeEnum = require("./enumFields/conditionTypeEnum.json");
const typeOfConditionalCustomFieldEnum = require("./enumFields/typeOfConditionalCustomField.json");
const groupTypes = require("../../util/group_types.json");
const learningPlanSchema = new Schema(
    {
        title: {
            type: String,
            required: true,
        },
        targetAudience: {
            type: String,
            default: TargetAudience.EVERYONE_IN_ORGANIZATION,
        },
        status: {
            type: String,
            default: LearningPlanStatus.DRAFT,  
            enum: Object.values(LearningPlanStatus)
        },
        groupIDs:[{
            groupType: {
                type: String,
                required: true,
                enum: Object.values(groupTypes),
            },
            groupIDs: {
                type: Schema.Types.Mixed,
                required: true,
            }
        }
        ],
        audienceSelection: {
            type: String,
            required: true,
            enum: Object.values(audienceSelectionEnum)
        },
        conditionType: {
            type: String,
            enum: [...Object.values(conditionTypeEnum), null],
        },
        conditionalCustomFields: [
            {
                type_of_Field: {
                    type: String,
                    required: true,
                    enum: Object.values(typeOfConditionalCustomFieldEnum),
                },
                valueOfField: {
                    type: [String],
                },
                groupIDs:[{
                    groupType: {
                        type: String,
                        required: function(){
                            return this.type_of_Field === typeOfConditionalCustomFieldEnum.GROUP;
                        }
                    },
                    groupIDs: {
                        type: Schema.Types.Mixed,
                        required: function(){
                            return this.type_of_Field === typeOfConditionalCustomFieldEnum.GROUP;
                        }
                    }
                }
                ],
                isOrIsNot: {
                    type: String,
                    required: true,
                    enum: ['IS', 'IS_NOT'],
                },
            }
        ],
        userObjectIds: [{
            type: ObjectId,
            ref: "User"
        }],
        selectCourses:[{
            type: ObjectId,
            ref: "Training"
        }],
        assignedLearnerIDs: [{ 
            type: ObjectId, 
            ref: "User" 
        }],
        createdBy: {
            type: ObjectId,
            ref: "User",
            required: true,
        },
        updatedBy: {
            type: ObjectId,
            ref: "User",
            required: true,
        },
        isDeleted: {             
            type: Boolean,
            default: false
        },
        isUpdated: {          
            type: Boolean,
            default: false,
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    },
    { timestamps: true }
);
learningPlanSchema.pre('save', function (next) {
    const errors = [];
    if (this.audienceSelection === "ALL_EMPLOYEES" && (this.conditionType || this.conditionalCustomFields.length > 0)) {
        errors.push("Condition type and conditional custom fields should not be provided when audience selection is ALL_EMPLOYEES.");
    }
    if (this.audienceSelection === "AUTOMATIC" && (!this.conditionType || !this.conditionalCustomFields || this.conditionalCustomFields.length === 0)) {
        errors.push("Condition type and conditional custom fields are required when audience selection is AUTOMATIC.");
    }
    if (this.audienceSelection === "MANUAL" && (!this.userObjectIds || this.userObjectIds.length === 0)) {
        errors.push("A list of user ObjectIds is required for MANUAL audience selection.");
    }
    if (errors.length > 0) {
        return next(new Error(errors.join(" ")));
    }
    next();
});
module.exports.LearningPlan = Model("LearningPlan", learningPlanSchema);