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



type QuizEvaluation {
    _id: ID!
    contentId: ID!
    trainingModuleId: ID!
    trainingId: ID!
    userId: ID!
    attended: Int!
    totalQuestions: Int!
    totalPoints: Int!
    acquiredMarks: Int!
    percentage: Float!
    skippedQuestions: Int!
}

input QuestionAnswerInput {
    questionId: ID!
    answer: [String!]!
}

type QuizEvaluationResult {
    _id: ID!
    contentId: ID!
    trainingModuleId: ID!
    trainingId: ID!
    userId: ID!
    attended: Int!
    totalQuestions: Int!
    totalPoints: Int!
    acquiredMarks: Int!
    percentage: Float!
    skippedQuestions: Int!
    attendedQuestions: [QuestionResult!]!
    createdAt: String!
    updatedAt: String!
    
}

type QuestionResult {
    givenAnswer: [String]
    correctAnswer: [String]
    _id: ID!
    questionId: ID!
    question: [LocalisedData!]!
    isCorrectAnswer: Boolean!
    points: Int!
    negativePoints: Int!
    isSkipped: Boolean!
    isPassed: Boolean!
}

    `,
    queries: `
        getQuizAttempts(pageInput: PageInput, filterInput: QuizAttemptFilterInput): QuizAttemptList!
        getQuizAttempt(id: ID!): QuizAttempt!
        getQuizEvaluation(id: ID!, contentId: ID!, userId: ID!): QuizEvaluationResult
    `,
    mutations: `
        addQuizAttempt(id: ID!, questionAnswers: [QuizAttemptQuestionAnswerInput!]!): QuizAttempt!
        quizEvaluation(contentId: ID!,trainingModuleId: ID!,trainingId: ID!, questionAnswers: [QuestionAnswerInput!]!): QuizEvaluation      `,
};
