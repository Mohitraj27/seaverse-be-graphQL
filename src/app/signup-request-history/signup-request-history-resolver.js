const HistorySignupRequest = require('./signup-request-history-model');
const { CustomError } = require('../../util/error_helper');
const { AuthUser, ErrorName } = require('../../util');
const sortingFieldJSONData = require('../signup-request/sortingField.json');
const { decrypt, encrypt } = require('../../util/encryption_helper');
module.exports.queries = {
    getHistorySignupRequest: async ({ id, search, filterInput, pageInput }, context) => {
        const { subscriberId } = AuthUser(context);
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
        try {
            const skip = pageInput?.skip || 0;
            const limit = pageInput?.limit || 100;
            const sortingField = pageInput?.sortingField || sortingFieldJSONData?.requestDate;
            const sortingOrder = pageInput?.sortingOrder || -1;
            const signupStatus = filterInput?.signupStatus.trim() || null;
            if (id) {
                const item = await HistorySignupRequest.findById(id);
                if (!item) throw CustomError(ErrorName.SIGNUP_REQUEST_DATA_NOT_FOUND, 'Signup request data not found');
                return {
                    items: [item]
                };
            }
            let query = { isDeleted: false };

            let encryptedSearch = search ? encrypt(search?.trim()?.toLowerCase()) : '';

            if (search) {
                const searchTerm = search?.trim()?.toLowerCase();
                const searchConditions = [
                    { email: { $regex: encryptedSearch, $options: 'i' } },
                    { firstName: { $regex: encryptedSearch, $options: 'i' } },
                    { lastName: { $regex: encryptedSearch, $options: 'i' } }
                ];

                // Check if search contains space (indicating full name search)
                if (searchTerm.includes(' ')) {
                    const nameParts = searchTerm.split(' ').filter(part => part.trim());

                    if (nameParts.length >= 2) {
                        const firstName = nameParts[0];
                        const lastName = nameParts.slice(1).join(' '); // Handle multiple last names

                        // Add firstName + lastName combination searches
                        searchConditions.push(
                            // Exact firstName + exact lastName
                            {
                                $and: [
                                    { firstName: { $regex: encrypt(firstName), $options: 'i' } },
                                    { lastName: { $regex: encrypt(lastName), $options: 'i' } }
                                ]
                            },
                            // firstName prefix + lastName prefix
                            {
                                $and: [
                                    { firstName: { $regex: `^${encrypt(firstName)}`, $options: 'i' } },
                                    { lastName: { $regex: `^${encrypt(lastName)}`, $options: 'i' } }
                                ]
                            }
                        );
                    }
                }

                query.$or = searchConditions;
            }

            if (signupStatus) {
                query.signupStatus = signupStatus;
            }
            const sortObj = {};
            if (sortingField === sortingFieldJSONData?.signupStatus) {
                sortObj[sortingField] = sortingOrder;
            } else {
                sortObj[sortingField] = sortingOrder;
            }

            const items = await HistorySignupRequest.find(query)
                .sort(sortObj)
                .skip(skip)
                .limit(limit);
            const totalCount = await HistorySignupRequest.countDocuments(query);
            const decryptedItems = items?.map(item => {
                const obj = item.toObject();
                return {
                    ...obj,
                    firstName: decrypt(obj?.firstName),
                    lastName: obj?.lastName ? decrypt(obj?.lastName) : '',
                    email: decrypt(obj?.email?.trim())
                };
            });
            return {
                items: decryptedItems,
                totalCount
            };
        } catch (error) {
            throw CustomError(ErrorName.FAILED_TO_FETCH_HISTORY_SIGNUP_REQUEST, error.message);
        }
    }
};

module.exports.mutations = {
    deleteRejectedUserRequests: async (_, context) => {
        const { userId } = AuthUser(context);
        if (!userId) throw CustomError(ErrorName.FORBIDDEN);
        try {
            const result = await HistorySignupRequest.deleteMany({
                signupStatus: 'REJECTED'
            });
            if (result.deletedCount === 0) {
                throw CustomError(ErrorName.SIGNUP_REQUEST_DATA_NOT_FOUND, 'No rejected signup requests found');
            }
            return {
                success: true,
                message: 'Deleted successfully'
            };
        } catch (error) {
            throw Error(error.message);
        }
    }
};