const learningPlanStatus = require("./enumFields/learning_plan_status.json");
const targetAudienceEnum = require("./enumFields/targetAudienceEnum.json");
const audienceSelectionEnum = require("./enumFields/audienceSelectionEnum.json");
const ConditionTypeEnum = require("./enumFields/conditionTypeEnum.json");
const typeOfConditionalCustomFieldEnum = require("./enumFields/typeOfConditionalCustomField.json");
const groupTypeEnums = require("../../util/group_types.json");
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
        enum GroupTypeEnum {
            ${Object.keys(groupTypeEnums).join(" ")}
        }
        input ConditionalCustomFieldInput {
            type_of_Field: TypeOfConditionalCustomFieldEnum!
            valueOfField: [String!]!  
            isOrIsNot: String!
        }
        input GroupTypeInput {
            groupType: GroupTypeEnum!
            groupIDs: [String!]!
        }
        type ConditionalCustomField {
            type_of_Field: TypeOfConditionalCustomFieldEnum!
            valueOfField: [String!]!  
            isOrIsNot: String!
        }
        type LocalizedField {
            _id: ID
            lang: String
            value: String
        }

        type Feedback {
            questionAnswers: [QuestionAnswer]
        }
        type QuestionAnswer {
            question: String
            answer: String
        }
        type courseDetails {
            _id: ID!
            UID: String
            trainingCategories: [TrainingCategory]
            trainingSubCategories: [TrainingSubCategory]
            title: [LocalizedField]
            description: [LocalizedField]
            instructions: [LocalizedField]
            overview: String
            feedback: FeedbackContentFeedback
            feedbackContent: FeedbackContent
            images: [MultiMediaInfo]
            price: Float
            durationHours: Int
            certificateValidity: Int
            targetAudienceId: TargetAudience
            courseType: CourseType
            enableFreeFlow: Boolean
            unlockOn: UnlockOn
            status: StatusType
            trainingModuleContents: [TrainingModuleContent]
            courseId: String
            course_validity: String
            courseLevel: CourseLevel
            hideCourseProgress: Boolean
            allowMultipleAttempts: Boolean
            attemptFlexibility: AttemptFlexibility
            attemptType: AttemptType
            setLimitAttempt: Int
            disableFurtherAttemptsOnPass: Boolean
            lockModulesBetweenAttempts: Boolean
            setTimeLimitForModule: Boolean
            approvalStatus: String
            certifications: [MultiMediaInfo]
            bannerImage: [MultiMediaInfo]
            appliedAt: String
            approvedAt: String
            rejectedAt: String
            isActive: Boolean
            createdBy: User
            isDeleted: Boolean
            createdAt: String
            trainingModules: [TrainingModule]
            scorm: Scorm
            groupTrainingModule: [GroupTrainingModule]
            skills: [String]
            userFeedback: Boolean
            managerFeedback: Boolean
            setFrequency: Int
            enableEmailNotification: Boolean
            setReminder: Boolean
            setFrequencyDate: String
            manadatoryModules: Int
            classroomModule: ClassroomModule
            authorName: String
            isOrdered: Boolean
        }
        type LearningPlan {
            _id: ID
            title: String!
            selectCourses: [courseDetails!]!
            targetAudience: TargetAudienceEnum
            groupIDs: [ID]
            userObjectIds: [ID]
            status: LearningPlanStatus!
            audienceSelection: AudienceSelectionEnum!
            conditionType: ConditionTypeEnum
            conditionalCustomFields:[ConditionalCustomField]
            assignedLearnerIDs: [ID]
            isDeleted: Boolean
            createdBy: ID
            updatedBy: ID
            createdAt: String
            updatedAt: String
        }
        type DeleteLearningPlanResponse {
            success: Boolean!
            message: String
        }
        type LearningPlanResponse {
            learningPlans: [LearningPlan!]!
            totalCount: Int!
        }
        type LearningPlanStatusUpdateResponse {
            success: Boolean!
            message: String!
            updatedLearningPlans: [LearningPlan!]!
        }
        type GetUsersForLearningPlanResponse {
            userIds: [ID]
            count: Int
        }
        input UpdateLearningPlanStatusInput {
            learningPlanIDs: [ID!]!
            newStatus: LearningPlanStatus!
        }
        input LearningPlanFilterInput {
            title: String
            status: LearningPlanStatus
        }
        input LearningPlanInput {
            title: String
            targetAudience: TargetAudienceEnum
            selectCourses: [ID!]
            groupIDs: [GroupTypeInput!] 
            userObjectIds: [ID]
            status: LearningPlanStatus
            audienceSelection: AudienceSelectionEnum!
            conditionType: ConditionTypeEnum
            conditionalCustomFields:[ConditionalCustomFieldInput]
        }
        input UpdateLearningPlanInput {
            title: String
            targetAudience: TargetAudienceEnum
            selectCourses: [ID!]
            groupIDs: [GroupTypeInput!]
            userObjectIds: [ID]
            status: LearningPlanStatus
            audienceSelection: AudienceSelectionEnum
            conditionType: ConditionTypeEnum
            conditionalCustomFields: [ConditionalCustomFieldInput]
        }

        input GetUsersForLearningPlanInput {
            targetAudience: TargetAudienceEnum
            audienceSelection: AudienceSelectionEnum!
            conditionType: ConditionTypeEnum
            conditionalCustomFields:[ConditionalCustomFieldInput]
        }
    `,
    queries: `
        getLearningPlans(filterInput: LearningPlanFilterInput):LearningPlanResponse!
        getUsersForLearningPlan(input: GetUsersForLearningPlanInput!): GetUsersForLearningPlanResponse
    `,
    mutations: `
        createLearningPlan(input: LearningPlanInput!): LearningPlan!
        updateLearningPlanStatus(input: UpdateLearningPlanStatusInput!): LearningPlanStatusUpdateResponse!
        deleteLearningPlan(id: ID!): DeleteLearningPlanResponse!
        updateLearningPlan(id: ID!, input: UpdateLearningPlanInput!): LearningPlan! 
    `,
};
