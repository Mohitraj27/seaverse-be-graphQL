const learningPlanStatus = require("./enumFields/learning_plan_status.json");
const targetAudienceEnum = require("./enumFields/targetAudienceEnum.json");
const audienceSelectionEnum = require("./enumFields/audienceSelectionEnum.json");  
const ConditionTypeEnum = require("./enumFields/conditionTypeEnum.json");
const typeOfConditionalCustomFieldEnum = require("./enumFields/typeOfConditionalCustomField.json");
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
        enum TypeOfConditionalCustomFieldEnum {
            ${Object.keys(typeOfConditionalCustomFieldEnum).join(" ")}
        }
        input ConditionalCustomFieldInput {
            type_of_Field: TypeOfConditionalCustomFieldEnum!
            valueOfField: [ID!]!  
            isOrIsNot: String!
        }
        type ConditionalCustomField {
            type_of_Field: TypeOfConditionalCustomFieldEnum!
            valueOfField: [ID!]!  
            isOrIsNot: String!
        }
        type LearningPlan {
            _id: ID
            title: String!
            targetAudience: TargetAudienceEnum
            groupIDs: [ID]
            userObjectIds: [ID]
            status: LearningPlanStatus!
            audienceSelection: AudienceSelectionEnum!
            conditionType: ConditionTypeEnum
            conditionalCustomFields:[ConditionalCustomField]
            createdAt: String
            updatedAt: String
        }
      
        input LearningPlanInput {
            title: String!
            targetAudience: TargetAudienceEnum
            groupIDs: [ID!]
            userObjectIds: [ID]
            status: LearningPlanStatus
            audienceSelection: AudienceSelectionEnum!
            conditionType: ConditionTypeEnum
            conditionalCustomFields:[ConditionalCustomFieldInput]
        }
    `,
    queries: `
        getLearningPlans: [LearningPlan]
    `,
    mutations: `
        createLearningPlan(input: LearningPlanInput!): LearningPlan!
    `,
};
