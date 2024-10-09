module.exports = {
    types: `
        type QuizAttemptQuestionAnswer {
            questionId: ID
            question: [LocalisedData]
            choices: [QuizContentQuizQuestionAnswersChoice]
            givenAnswer: [LocalisedData]
            correctAnswer: [LocalisedData]
            givenAnswerKey: String
            correctAnswerKey: String
            isCorrectAnswer: Boolean
        }
        type QuizAttemptAttempt {
            questionAnswers: [QuizAttemptQuestionAnswer]
            totalMark: Float
            acquiredMark: Float
            status: String
            attemptedAt: String
        }
        type QuizAttempt {
            _id: ID
            organization: Organization
            employee: Employee
            quizContent: QuizContent
            attempt: QuizAttemptAttempt
        }
        type QuizAttemptList {
            quizAttempts: [QuizAttempt]
            totalCount: Int
        }
        #############
        input QuizAttemptQuestionAnswerInput {
            questionId: ID!
            givenAnswerKey: String
        }
        input QuizAttemptFilterInput {
            search: String
            employee: ID
            quizContent: ID
            organization: ID
            dateFrom: String
            dateTo: String
        }
    `,
    queries: `
        getQuizAttempts(pageInput: PageInput, filterInput: QuizAttemptFilterInput): QuizAttemptList!
        getQuizAttempt(id: ID!): QuizAttempt!
    `,
    mutations: `
        addQuizAttempt(id: ID!, questionAnswers: [QuizAttemptQuestionAnswerInput!]!): QuizAttempt!
    `,
};
