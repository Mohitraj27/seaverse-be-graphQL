const { CustomError } = require("../../util/error_helper");

const { ErrorName, AuthUser, Permission, SubRoleHelper, subscriberId, context } = require("../../util");
const SignupRequest = require("./signup-request-model");
const mongoose = require("mongoose");

module.exports.queries = {
    getSignupRequest: async ({ id, search, pageInput }, context) => {
        const { subscriberId } = AuthUser(context);
        const skip = pageInput?.skip || 0;
        const limit = pageInput?.limit || 50;
        
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
        
        try {
            const pendingStatusCount = await SignupRequest.countDocuments({ 
                signupStatus: "PENDING", 
                isDeleted: false 
            });
            if (id) {
                if (typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
                    throw CustomError(ErrorName.INVALID_SIGNUP_REQUEST_ID,'Please pass the correct signup request id');
                }
                
                const item = await SignupRequest.findById(id);
                
                if (!item) throw CustomError(ErrorName.SIGNUP_REQUEST_DATA_NOT_FOUND,'Signup request data not found');
                
                return {
                    items: [item],
                    pendingStatusCount
                };
            }
            
            let query = { isDeleted: false };
            
            if (search) {
                query = {
                    ...query,
                    $or: [
                        { email: { $regex: search, $options: 'i' } },
                        { firstName: { $regex: search, $options: 'i' } },
                        { lastName: { $regex: search, $options: 'i' } }
                    ]
                };
            }
            
            
            const items = await SignupRequest.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);
                
            return {
                items,
                pendingStatusCount
            };
        } catch (error) {
            throw CustomError(ErrorName.FAILED_TO_FETCH_SIGNUP_REQUEST, error.message);
        }
    },
};