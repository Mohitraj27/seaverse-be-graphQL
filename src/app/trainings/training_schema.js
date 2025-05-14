const ApprovalStatus = require("./approval_status.json");
const TrainingStatus = require("./enum_fields/training_status.json");
const UnlockOn = require("./enum_fields/unlockOn.json");
const AttemptFlexibility = require("./enum_fields/attemptFlexibility.json");
const CourseLevel = require("./enum_fields/courseLevel.json");
const AttemptType = require("./enum_fields/attemptType.json");
CourseType = {
    SELF_LEARNING: "SELF_LEARNING",
};
module.exports = {
    types: `
        enum ApprovalStatus {
            ${Object.keys(ApprovalStatus).join(" ")}
        }
        enum StatusType {
            ${Object.keys(TrainingStatus).join(" ")}
        }
        enum CourseType{
            ${Object.keys(CourseType).join(" ")}
        }
        enum UnlockOn {
            ${Object.keys(UnlockOn).join(" ")}
        }
        enum AttemptFlexibility {
            ${Object.keys(AttemptFlexibility).join(" ")}
        }
        enum AttemptType {
            ${Object.keys(AttemptType).join(" ")}
        }
        enum CourseLevel {
            ${Object.keys(CourseLevel).join(" ")}
        }
        type Training {
            _id: ID
            UID: String
            trainingCategories: [TrainingCategory]
            trainingSubCategories: [TrainingSubCategory]
            title: [LocalisedData]
            description: [LocalisedData]
            instructions: [LocalisedData]
            overview: String 
            feedback: FeedbackContentFeedback
            feedbackContent: FeedbackContent
            
            images: [MultiMediaInfo]
            price: Float
            """in days"""
            durationHours: String
            """in days"""
            certificateValidity: Int
            targetAudienceId: TargetAudience
            courseType: CourseType
            enableFreeFlow: Boolean
            unlockOn: UnlockOn
            status: StatusType
            trainingModuleContents:[String]
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
            bannerImage: MultiMediaInfo
            coverImage: MultiMediaInfo
            appliedAt: String
            approvedAt: String
            rejectedAt: String
            isActive: Boolean
            createdBy: User
            isDeleted: Boolean
            createdAt: String
            updatedAt: String
            trainingModules: [TrainingModule]
            scorm:Scorm
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
            isOrdered : Boolean
            isCertificate: Boolean
            courseTag: String
            countOfUsers: Int
            deletedDate: String
            migrationcoursesId: ID
            isFromMigration: Boolean  
} 
        type Scorm {
            type:String
            launchUrl:String
            courseId:String
            fileName:String

        }
        type TrainingList {
            trainings: [Training]
            totalCount: Int
        }
        type TargetAudience {
            userObjectId: [ID]
            groupUserObjectId: [ID]
            courseId: ID
            createdBy: User
            createdAt: String
        }
        type ClassroomModule {
            _id: ID
            title: [LocalisedData]!
            description: [LocalisedData]!
            classroomModuleImage: [MultiMediaInfo]
            details: [ClassroomModuleDetail]
            time: ClassroomModuleTime
            meetingRoomName: String
            Instructor: String
            seatLimit: Int
            courseId: ID!
            createdBy: User
        }
        type ClassroomModuleDetail {
            startDate: String
            endDate: String
        }

        type ClassroomModuleTime {
            startTime: String
            endTime: String
        }
        input TargetAudienceInput {
            userObjectId: [ID]
            groupUserObjectId: [ID]
        }
        input TrainingInput {
            _id: ID
            trainingCategories: [ID]
            trainingSubCategories: [ID]
            title: [LocalisedDataInput]
            description: [LocalisedDataInput]
            instructions: [LocalisedDataInput]
            overview: String
            """will deprecate soon"""
            feedback: FeedbackContentFeedbackInput
            feedbackContent: ID
            
            price: Float
            """in days"""
            durationHours: String
            """in days"""
            certificateValidity: Int
            targetAudienceId: TargetAudienceInput
            courseType: CourseType
            enableFreeFlow: Boolean
            unlockOn: UnlockOn
            status: StatusType
            courseId: String
            course_validity: String
            courseLevel: CourseLevel
            hideCourseProgress: Boolean
            allowMultipleAttempts: Boolean
            attemptFlexibility: AttemptFlexibility
            attemptType: AttemptType
            setLimitAttempt: Int
            certifications: [MultiMediaInfoInput]
            disableFurtherAttemptsOnPass: Boolean
            lockModulesBetweenAttempts: Boolean
            setTimeLimitForModule: Boolean
            isActive: Boolean
            trainingModules: [TrainingModuleInput]
            deletedTrainingModules: [ID]
            deletedTrainingModuleContents: [ID]
            scorm: MultiMediaInfoInput
            groupTrainingModule: [GroupTrainingModuleInput]
            skills: [String]
            userFeedback: Boolean 
            managerFeedback: Boolean  
            setFrequency: Int  
            enableEmailNotification: Boolean 
            setReminder: Boolean 
            setFrequencyDate: String 
            authorName: String 
            manadatoryModules: Int 
            classroomModule: ClassroomModuleInput
            isCertificate : Boolean
            isOrdered : Boolean
            bannerImageDelete: Boolean
            coverImageDelete: Boolean
            migrationcoursesId: ID
            isFromMigration:Boolean
        }
        input TrainingFilterInput {
            search: String
            isActive: Boolean
            status: StatusType
            dateFilter: Int
        }
        input ClassroomModuleInput {
            title: [LocalisedDataInput]!
            description: [LocalisedDataInput]!
            classroomModuleImage: [MultiMediaInfoInput]
            details: [ClassroomModuleDetailInput]
            time: ClassroomModuleTimeInput
            meetingRoomName: String
            Instructor: String
            seatLimit: Int
            courseId: ID
        }

        input ClassroomModuleDetailInput {
            startDate: String
            endDate: String
        }
        input ClassroomModuleTimeInput {
            startTime: String
            endTime: String
        }
         
        input UpdateTrainingStatusInput {
            id: ID!
            newStatus : StatusType
        }
        type creationRes {
            status: Int
            message: String
            trainingId: ID
            trainingName: String
        }
        input SyncOfflineDataInput {
            id: ID!
            offlineData: String
        }
        type offlineSyncRes {
            status: Int
            message: String
        }
        input UpdateContentDetailInput {
            contentId: ID!
            videoId: ID
            contentStatus: String
            duration: Float
            videoDuration: Float
            progressPercentage: Float
            playerSettings: JSON
            questionAnswers: [QuestionAnswerInput!]
        }
        input UpdateTrainingModuleInput {
            moduleId: ID!
            contentDetails: [UpdateContentDetailInput!]!
        }
        input UpdateTrainingProgressInput {
            overallId: ID!
            trainingModules: [UpdateTrainingModuleInput!]!
        }
        type startOverRes {
            status: Int
            message: String
        }
    `,
    queries: `
        getTrainings(pageInput: PageInput, filterInput: TrainingFilterInput): TrainingList!
        getTraining(id: ID!): Training!
    `,
    mutations: `
        createOrUpdateTraining(input: TrainingInput!, bannerImage: Upload, coverImage: Upload): creationRes!
        deleteTraining(id: ID!): Training!
        updateTrainingStatus(input: UpdateTrainingStatusInput!): creationRes!
        approveOrRejectTraining(id: ID!, approvalStatus: ApprovalStatus!): Training!
        submitTrainingForApproval(id: ID!): Training!
        syncOfflineDataAndUpdateProgress(input: [UpdateTrainingProgressInput!]!): offlineSyncRes!
        startOverTraining(overallId: ID!, user: ID): startOverRes!
    `,
};
