const HistorySignupRequest = require('./signup-request-history-model');
const { CustomError } = require('../../util/error_helper');
const { AuthUser,ErrorName } = require('../../util');
module.exports.queries = {
    getHistorySignupRequest: async ({ id, search, pageInput },context) => {
        const { subscriberId } = AuthUser(context);
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
        try {
            const skip = pageInput?.skip || 0;
            const limit = pageInput?.limit || 50;

            if (id) {
                const item = await HistorySignupRequest.findById(id);
                if (!item) throw CustomError(ErrorName.SIGNUP_REQUEST_DATA_NOT_FOUND, 'Signup request data not found');
                return {
                    items: [item]
                };
            }
            let query = { isDeleted: false };

            if (search) {
                query.$or = [
                    { email: { $regex: search, $options: 'i' } },
                    { firstName: { $regex: search, $options: 'i' } },
                    { lastName: { $regex: search, $options: 'i' } }
                ];
            }


            const items = await HistorySignupRequest.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);

            return {
                items
            };
        } catch (error) {
            throw CustomError(ErrorName.FAILED_TO_FETCH_HISTORY_SIGNUP_REQUEST, error.message);
        }
    }
};