const {
    AuthUser,
    CustomError,
    ErrorName,
    Role,
    CurrentDateTime,
    DbTransactionHelper,
} = require("../../../../../util");

const { Question } = require("./question_model");

module.exports.mutations = {
    addQuestion: async ({ input }, context) => {
        const { userId, subscriberId } = AuthUser(context);
        console.log("input", input);
        try {
            const question = new Question({
                ...input,
                subscriber: subscriberId,
                createdBy: userId,
                updatedBy: userId,
            });
            await question.save();
            return question;
        } catch (error) {
            console.log("error", error);
            throw CustomError(ErrorName.FAILED, `${error.message}`);
        }
    },

    updateQuestion: async ({ input }, context) => {
        const { userId, subscriberId } = AuthUser(context);

        try {
            const question = await Question.findOne({
                _id: input._id,
                subscriber: subscriberId,
            });

            if (!question) throw CustomError(ErrorName.NOT_FOUND, "Question not found");

            question.set({
                ...input,
                updatedBy: userId,
            });
            await question.save();

            return question;
        } catch (error) {
            throw CustomError(ErrorName.FAILED, `${error.message}`);
        }
    },

    deleteQuestion: async ({ _id }, context) => {
        const { subscriberId } = AuthUser(context);

        const question = await Question.findOne({
            _id,
            subscriber: subscriberId,
        });

        if (!question) throw CustomError(ErrorName.NOT_FOUND);

        try {
            await question.delete();
            return true;
        } catch (error) {
            throw CustomError(ErrorName.FAILED);
        }
    },
};