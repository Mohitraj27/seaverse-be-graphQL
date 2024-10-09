const mongoose = require("mongoose");

const { CustomError, ErrorName } = require("./error_helper");

module.exports = {
    /**
     * Perform mongo transaction.
     * Note: have timeout of 60 seconds.
     */
    performDbTransaction: async transaction => {
        let result;
        const session = await mongoose.startSession();

        try {
            session.startTransaction();
            result = await transaction(session);
            await session.commitTransaction();
        } catch (e) {
            console.log(`db_transaction_helper.performDbTransaction:exception:${e.stack ?? e}`);
            if (session.inTransaction()) await session.abortTransaction();

            const errorObject = (() => {
                try {
                    return JSON.parse(e.message);
                } catch (e) {
                    return { error: e.message };
                }
            })();

            if (Object.keys(ErrorName).includes(errorObject?.error)) throw e;
            throw CustomError(ErrorName.FAILED);
        } finally {
            if (session.inTransaction()) await session.endSession();
        }

        return result;
    },
};
