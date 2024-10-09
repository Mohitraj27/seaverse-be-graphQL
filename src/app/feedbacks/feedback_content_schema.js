module.exports = {
    types: `
        type FeedbackContentFeedbackQuestionAnswersChoice {
            key: String
            value: [LocalisedData]
            ratingValue: Float
        }
        type FeedbackContentFeedbackQuestionAnswers {
            _id: ID
            question: [LocalisedData]
            choices: [FeedbackContentFeedbackQuestionAnswersChoice]
            isDescriptive: Boolean
            displayPosition: Int
        }
        type FeedbackContentFeedback {
            questionAnswers: [FeedbackContentFeedbackQuestionAnswers]
        }
        type FeedbackContent {
            _id: ID
            feedback: FeedbackContentFeedback
            isActive: Boolean
        }
        type FeedbackContentList {
            feedbackContents: [FeedbackContent]
            totalCount: Int
        }
        type FeedbackAttemptQuestionAnswers {
            questionId: ID
            question: [LocalisedData]
            choices: [FeedbackContentFeedbackQuestionAnswersChoice]
            givenAnswer: [LocalisedData]
            givenRating: Float
            givenDescriptiveAnswer: String
            givenAnswerKey: String
            isDescriptive: Boolean
        }
        type FeedbackAttempt {
            questionAnswers: [FeedbackAttemptQuestionAnswers]
            attemptedAt: String
        }
        #############
        input FeedbackContentFeedbackQuestionAnswersChoiceInput {
            key: String
            value: [LocalisedDataInput]
            ratingValue: Float
        }
        input FeedbackContentFeedbackQuestionAnswersInput {
            _id: ID
            question: [LocalisedDataInput]
            choices: [FeedbackContentFeedbackQuestionAnswersChoiceInput]
            isDescriptive: Boolean
            displayPosition: Int
        }
        input FeedbackContentFeedbackInput {
            questionAnswers: [FeedbackContentFeedbackQuestionAnswersInput]
        }
        input FeedbackContentInput {
            _id: ID
            feedback: FeedbackContentFeedbackInput
            isActive: Boolean
        }
        input FeedbackAttemptQuestionAnswersInput {
            questionId: ID
            question: [LocalisedDataInput]
            choices: [FeedbackContentFeedbackQuestionAnswersChoiceInput]
            givenAnswer: [LocalisedDataInput]
            givenRating: Float
            givenDescriptiveAnswer: String
            givenAnswerKey: String
            isDescriptive: Boolean
        }
        input FeedbackAttemptInput {
            questionAnswers: [FeedbackAttemptQuestionAnswersInput]
        }
    `,
};
