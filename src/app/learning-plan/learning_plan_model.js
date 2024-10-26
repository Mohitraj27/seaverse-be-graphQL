const { Schema, Model, ObjectId } = require("../../tools");
const  TargetAudience  =  require("./enumFields/targetAudienceEnum.json");
const  LearningPlanStatus  = require("./enumFields/learning_plan_status.json");
const audienceSelectionEnum = require("./enumFields/audienceSelectionEnum.json");
const conditionTypeEnum = require("./enumFields/conditionTypeEnum.json");
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
        designationIds: [{
            type: ObjectId,
            ref: "Designation",
        }],
        status: {
            type: String,
            default: LearningPlanStatus.DRAFT,  
            enum: Object.values(LearningPlanStatus)
        },
        groupIDs:[{
            type: [ObjectId],
            ref: "Group"
        }],
        audienceSelection: {
            type: String,
            required: true,
            enum: Object.values(audienceSelectionEnum)
        },
        conditionType: {
            type: String,
            enum: Object.values(conditionTypeEnum),
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    },
    { timestamps: true }
);
module.exports.LearningPlan = Model("LearningPlan", learningPlanSchema);