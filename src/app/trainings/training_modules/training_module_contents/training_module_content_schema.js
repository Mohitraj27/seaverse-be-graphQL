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
        type TrainingModuleContent {
            _id: ID
            UID: String
            contentType: String
            duration: String
            contentStatus: TrainingModuleContentStatus
            quiz: QuizContentQuiz @deprecated(reason: "uses quizContent")
            quizContent: QuizContent
            title: [LocalisedData]
            description: [LocalisedData]
            videos: [MultiMediaInfo]
            audios: [MultiMediaInfo]
            images: [MultiMediaInfo]
            text: [LocalisedData]
            files: [MultiMediaInfo]
            thumbnail: String
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

        input TrainingMOduleContentStatusInput {
            title: String!
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
        input TrainingModuleContentInput {
            _id: ID
            UID: String
            contentType: TrainingModuleContentType!
            
            duration: String
            
            contentStatus: TrainingModuleContentStatus!
            quiz: QuizContentQuizInput @deprecated(reason: "uses quizContent")
            quizContent: ID
            
            title: [LocalisedDataInput]!
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
    `,
    queries: `
        getTrainingModuleContents(pageInput: PageInput, search: String, contentStatus: TrainingModuleContentStatus,recentlyModified: Boolean, contentType: TrainingModuleContentType): TrainingModuleContentList
        getTrainingModuleContent(id: ID!): TrainingModuleContent
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
        updateTrainingModuleContent(input: TrainingModuleContentInput!, thumbnail: Upload, scorm: Upload, image: Upload, video: Upload, audio: Upload, file: Upload): UpdateContentResponse!
         `,
};
