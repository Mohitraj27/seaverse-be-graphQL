module.exports = {
    types: `
        type QuizContentQuizQuestionAnswersChoice {
            key: String
            value: [LocalisedData]
        }
        type QuizContentQuizQuestionAnswers {
            _id: ID
            question: [LocalisedData]
            choices: [QuizContentQuizQuestionAnswersChoice]
            answerKey: String
            mark: Float
            displayPosition: Int
        }
        type QuizContentQuiz {
            """in minutes"""
            timeOut: Int
            """in percentage"""
            passMark: Float
            retryCount: Int
            questionAnswers: [QuizContentQuizQuestionAnswers]
            questionsDisplayedCount: Int
        }
        type QuizContent {
            _id: ID
            UID: String
            
            title: [LocalisedData]
            description: [LocalisedData]
            images: [MultiMediaInfo]
            quiz: QuizContentQuiz
            isPublic: Boolean
                        
            approvalStatus: String
            appliedAt: String
            approvedAt: String
            rejectedAt: String
            
            isActive: Boolean
            createdBy: User
            createdAt: String
        }
        type QuizContentList {
            quizContents: [QuizContent]
            totalCount: Int
        }
        #############
        input QuizContentQuizQuestionAnswersChoiceInput {
            key: String
            value: [LocalisedDataInput]
        }
        input QuizContentQuizQuestionAnswersInput {
            _id: ID
            question: [LocalisedDataInput]
            choices: [QuizContentQuizQuestionAnswersChoiceInput]
            answerKey: String
            mark: Float
            displayPosition: Int
        }
        input QuizContentQuizInput {
            """in minutes"""
            timeOut: Int
            """in percentage"""
            passMark: Float
            retryCount: Int
            questionAnswers: [QuizContentQuizQuestionAnswersInput]
            questionsDisplayedCount: Int
        }
        input QuizContentInput {
            _id: ID
            
            title: [LocalisedDataInput]
            description: [LocalisedDataInput]
            images: [MultiMediaInfoInput]
            quiz: QuizContentQuizInput
            isPublic: Boolean
            
            isActive: Boolean
        }
        input QuizContentFilterInput {
            search: String
            approvalStatus: ApprovalStatus
            isActive: Boolean
        }
    `,
    queries: `
        getQuizContents(pageInput: PageInput, filterInput: QuizContentFilterInput): QuizContentList!
        getQuizContent(id: ID!): QuizContent!
    `,
    mutations: `
        createOrUpdateQuizContent(input: QuizContentInput!): QuizContent!
        deleteQuizContent(id: ID!): QuizContent!
        updateQuizContentStatus(id: ID!, isActive: Boolean!): QuizContent!
        approveOrRejectQuizContent(id: ID!, approvalStatus: ApprovalStatus!): QuizContent!
        submitQuizContentForApproval(id: ID!): QuizContent!
    `,
};
