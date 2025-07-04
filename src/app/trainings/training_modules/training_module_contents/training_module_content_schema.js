const ContentType = require("./content_type.json");
const ContentStatus = require("./content_status.json");
module.exports = {
    types: `
        enum TrainingModuleContentType {
            ${Object.keys(ContentType).join(" ")}
        }
        enum TrainingModuleContentStatus {
            ${Object.keys(ContentStatus).join(" ")}
        }
        type QuestionNew {
            _id: ID
            question: [LocalisedData]
            questionType: String
            choices: [AnswerChoice]
            answerKey: [String]
            allowMultipleAnswers: Boolean
            displayPosition: Int
            points: Int
            negativePoints: Int
            isActive: Boolean
        }
        type AnswerChoice {
            _id: ID
            question: ID
            choice: [LocalisedData]
        }
        type UserData {
            _id: ID
            firstName: String
            lastName: String
        }
        type QuizDetails {
            _id: ID!
            lang: String
            value: String
            choices: [AnswerChoice]
            answerKey: [String]
            allowMultipleAnswers: Boolean
            questionType: String
            points: Int
            negativePoints: Int
        }
        type TrainingModuleContent {
            _id: ID
            UID: String
            contentType: TrainingModuleContentType
            duration: String
            contentStatus: TrainingModuleContentStatus
            quiz: [QuestionNew]
            title: [LocalisedData]
            description: [LocalisedData]
            videos: [MultiMediaInfo]
            audios: [MultiMediaInfo]
            images: [MultiMediaInfo]
            text: [LocalisedData]
            files: [MultiMediaInfo]
            thumbnail: String
            percentageCriteria: Int
            totalQuestions: Int
            totalScore: Int
            randomiseQuestionOrder: Boolean
            randomiseAnswerOptionOrder: Boolean
            showCorrectAnswersToLearnerAfterQuiz: Boolean
            onlyLearnerPassTheQuiz: Boolean
            evenLearnerFailTheQuiz: Boolean
            displayPosition: Int
            isActive: Boolean
            updatedAt: String
            version: Int
            modifiedDate: String
            isUpdated: Boolean
            isDeleted: Boolean
            isPublished: Boolean
            createdBy: UserData
            updatedBy: UserData
            featuredInCourses: Int
            quizDetails: [QuizDetails]
            progressPercentage: String
            lastAccessedDuration: Float
            videoDuration: Float
            videoId: String
            playerSettings: [JSON]
            quizAttemptDetails: JSON
            quizAttempts: [String]
            status: String
            trainingModuleContentDetails: [TrainingModuleContent]
        }
        type TrainingModuleContentList {
            contents: [TrainingModuleContent]!
            totalCount: Int!
        }
         type InvalidUpdate {
            id: ID!
            reason: String!
        }
        type UpdateStatusResult {
            success: Boolean!
            message: String
            invalidUpdates: [InvalidUpdate]
            updatedContents: [TrainingModuleContent]
        }
        type DeleteResponse {
            success: Boolean!
            message: String!
            invalidDeletes: [InvalidUpdate]
        }
              type UpdateContentResponse {
             success: Boolean!
             message: String!
             isUpdated: Boolean
            updatedContent: TrainingModuleContent
           }
        type UpdateContentQuizResponse {
            success: Boolean!
            message: String!
            updatedContent: TrainingModuleContent
        }
        input TrainingModuleContentInput {
            _id: ID
            UID: String
            contentType: TrainingModuleContentType
            duration: String
            contentStatus: TrainingModuleContentStatus
            quiz: QuizContentQuizInput @deprecated(reason: "uses quizContent")
            quizContent: ID
            title: [LocalisedDataInput]
            description: [LocalisedDataInput]
            videos: [MultiMediaInfoInput]
            audios: [MultiMediaInfoInput]
            images: [MultiMediaInfoInput]
            text: [LocalisedDataInput]
            files: [MultiMediaInfoInput]
            thumbnail: String
            displayPosition: Int
            isActive: Boolean
        }
        input TrainingModuleContentQuizInput {
            _id: ID
            UID: String
            title: [LocalisedDataInput]!
            description: [LocalisedDataInput]
            contentType: TrainingModuleContentType
            contentStatus: TrainingModuleContentStatus
            percentageCriteria: Int
            duration: String
            randomiseQuestionOrder: Boolean
            randomiseAnswerOptionOrder: Boolean
            showCorrectAnswersToLearnerAfterQuiz: Boolean
            onlyLearnerPassTheQuiz: Boolean
            evenLearnerFailTheQuiz: Boolean
            displayPosition: Int
            questions: [QuestionInput]
        }
        input QuestionInput {
            _id: ID
            question: [LocalisedDataInput]
            questionType: QuestionTypeEnum
            choices: [ChoiceInput]
            answerKey: [String]
            allowMultipleAnswers: Boolean
            displayPosition: Int
            points: Int
            negativePoints: Int
        }
        input ChoiceInput {
            _id: ID
            choice: [LocalisedDataInput]
        }
        input LocalInput {
            lang: Language!
            value: String!
        }
        enum useStatusInput {
            IN_USE
            NOT_IN_USE
        }
        type featuredInCourses {
            courseCount: Int
            courseNames: [String]
        }
        input VideoMetaInput {
            isDefault: Boolean!
            lang: String!
            title: String
            description: String
            index: Int
            duration: String
            isShowSubtitle: Boolean
            subtitles: [SubtitleInput]
        }
        input SubtitleInput {
            lang: String
            index: Int
        }

        type PresignedUrlResponse {
            url: String!
            key: String!
        }

    `,
    queries: `
        getTrainingModuleContents(pageInput: PageInput, search: String, contentStatus: TrainingModuleContentStatus,recentlyModified: Boolean, contentType: [TrainingModuleContentType], useStatus: useStatusInput): TrainingModuleContentList
        getTrainingModuleContent(id: ID!): TrainingModuleContent
        getFeaturedInCourses(id: ID!): featuredInCourses
        getPresignedUrl(fileName: String!, fileType: String!): PresignedUrlResponse

    `,
    mutations: `
        uploadTrainingModuleContentSorm(input: TrainingModuleContentInput!,scorm: Upload!, thumbnail: Upload): TrainingModuleContent!
        uploadTrainingModuleContentImage(input: TrainingModuleContentInput!,image: Upload!, thumbnail: Upload): TrainingModuleContent!
        uploadTrainingModuleContentVideo(input: TrainingModuleContentInput!,video: Upload!, thumbnail: Upload): TrainingModuleContent!
        uploadTrainingModuleContentFiles(input: TrainingModuleContentInput!,file : Upload!, thumbnail: Upload): TrainingModuleContent!
        uploadTrainingModuleContentaudio(input: TrainingModuleContentInput!,audio: Upload!, thumbnail: Upload): TrainingModuleContent!
        updateTrainingModuleContentStatus(ids: [ID!], currentStatus: TrainingModuleContentStatus, newStatus: TrainingModuleContentStatus): UpdateStatusResult!
        deleteTrainingModuleContentByIDs(ids: [ID!], currentStatus: TrainingModuleContentStatus): DeleteResponse!
        createTrainingModuleContent(input: TrainingModuleContentInput!, thumbnail: Upload, scorm: Upload, image: Upload,  videos: [Upload],subtitles: [Upload], videoMetas: [VideoMetaInput], audio: Upload, file: Upload): TrainingModuleContent!
        createTrainingModuleContentQuiz(input: TrainingModuleContentQuizInput!): TrainingModuleContent!
        updateTrainingModuleContent(input: TrainingModuleContentInput!, thumbnail: Upload, scorm: Upload, image: Upload, videos: [Upload],subtitles: [Upload], videoMetas: [VideoMetaInput],deletedVideos: [ID],deletedSubtitles: [ID], audio: Upload, file: Upload): UpdateContentResponse!
        updateTrainingModuleContentQuiz(input: TrainingModuleContentQuizInput!): UpdateContentQuizResponse!
        pushLatestContent(ids: [ID!]): creationRes!
         `,
};