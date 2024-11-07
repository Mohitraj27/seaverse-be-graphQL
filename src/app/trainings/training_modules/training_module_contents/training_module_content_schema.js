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
        type featuredInCourses {
            courseCount: Int
            courseNames: [String]
        }
    `,
    queries: `
        getTrainingModuleContents(pageInput: PageInput, search: String, contentStatus: TrainingModuleContentStatus,recentlyModified: Boolean, contentType: TrainingModuleContentType): TrainingModuleContentList
        getTrainingModuleContent(id: ID!): TrainingModuleContent
        getFeaturedInCourses(id: ID!): featuredInCourses
    `,
    mutations: `
        uploadTrainingModuleContentSorm(input: TrainingModuleContentInput!,scorm: Upload!, thumbnail: Upload): TrainingModuleContent!
        uploadTrainingModuleContentImage(input: TrainingModuleContentInput!,image: Upload!, thumbnail: Upload): TrainingModuleContent!
        uploadTrainingModuleContentVideo(input: TrainingModuleContentInput!,video: Upload!, thumbnail: Upload): TrainingModuleContent!
        uploadTrainingModuleContentFiles(input: TrainingModuleContentInput!,file : Upload!, thumbnail: Upload): TrainingModuleContent!
        uploadTrainingModuleContentaudio(input: TrainingModuleContentInput!,audio: Upload!, thumbnail: Upload): TrainingModuleContent!
        updateTrainingModuleContentStatus(ids: [ID!], newStatus: TrainingModuleContentStatus!): UpdateStatusResult!
        deleteTrainingModuleContentByIDs(ids: [ID!]): DeleteResponse!
        createTrainingModuleContent(input: TrainingModuleContentInput!, thumbnail: Upload, scorm: Upload, image: Upload, video: Upload, audio: Upload, file: Upload): TrainingModuleContent!
        createTrainingModuleContentQuiz(input: TrainingModuleContentQuizInput!): TrainingModuleContent!
        updateTrainingModuleContent(input: TrainingModuleContentInput!, thumbnail: Upload, scorm: Upload, image: Upload, video: Upload, audio: Upload, file: Upload): UpdateContentResponse!
        updateTrainingModuleContentQuiz(input: TrainingModuleContentQuizInput!): UpdateContentQuizResponse!
         `,
};
