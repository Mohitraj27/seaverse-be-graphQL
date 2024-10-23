const { mutations } = require("../training_module_content_schema");

module.exports = {
    types: `
        type Question {
            _id: ID
            question: [LocalisedData]
            questionType: String
            choices: [QuestionChoice]
            answerKey: [String]
            allowMultipleAnswers: Boolean
            displayPosition: Int
            points: Int
            negativePoints: Int
            isActive: Boolean
        }
        type QuestionList {
            questions: [Question]!
            totalCount: Int!
        }
        type QuestionChoice {
            key: String
            value: [LocalisedData]
        }
        enum QuestionTypeEnum {
            MULTIPLE_CHOICE_QUESTION
            TRUE_OR_FALSE
            FILL_IN_THE_BLANK
        }
        input AddQuestionInput {
            _id: ID
            question: [LocalisedDataInput]
            questionType: QuestionTypeEnum
            choices: [String]
            answerKey: String
            allowMultipleAnswers: Boolean
            displayPosition: Int
            points: Int
            negativePoints: Int
        }
        input QuestionFilterInput {
            search: String
            questionType: String
        }
    `,
    mutations: `
        addQuestion(input: AddQuestionInput!): Question!
        updateQuestion(id: ID!, question: AddQuestionInput!): Question!
        deleteQuestion(id: ID!): DeleteResponse!
    `,
}