const learningPlanStatus = require("./enumFields/learning_plan_status.json");
const targetAudienceEnum = require("./enumFields/targetAudienceEnum.json");
const audienceSelectionEnum = require("./enumFields/audienceSelectionEnum.json");  
const ConditionTypeEnum = require("./enumFields/conditionTypeEnum.json");
module.exports = {
    types: `
        enum LearningPlanStatus {
             ${Object.keys(learningPlanStatus).join(" ")}
        }
        enum TargetAudienceEnum {
            ${Object.keys(targetAudienceEnum).join(" ")}
        }
        enum AudienceSelectionEnum {
            ${Object.keys(audienceSelectionEnum).join(" ")}
        }
        enum ConditionTypeEnum {
            ${Object.keys(ConditionTypeEnum).join(" ")}
        }
        type LearningPlan {
            _id: ID
            title: String!
            targetAudience: TargetAudienceEnum
            groupIDs: [ID]
            status: LearningPlanStatus!
            audienceSelection: AudienceSelectionEnum!
            conditionType: ConditionTypeEnum
            createdAt: String
            updatedAt: String
        }
      
        input LearningPlanInput {
            title: String!
            targetAudience: TargetAudienceEnum
            groupIDs: [ID!]
            status: LearningPlanStatus
            audienceSelection: AudienceSelectionEnum!
            conditionType: ConditionTypeEnum
        }
    `,
    queries: `
        getLearningPlans: [LearningPlan]
    `,
    mutations: `
        createLearningPlan(input: LearningPlanInput!): LearningPlan!
    `,
};
