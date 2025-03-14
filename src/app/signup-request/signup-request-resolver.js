const { CustomError } = require("../../util/error_helper");

const { ErrorName, AuthUser, Permission, SubRoleHelper, subscriberId, context } = require("../../util");
const SignupRequest = require("./signup-request-model");
const mongoose = require("mongoose");
const  HistorySignupRequest = require('../signup-request-history/signup-request-history-model');
const operationTypeEnum = require('./signup-request-operation.json')
const DbTransactionHelper = require('../../util/db_transaction_helper'); 
const signupStatus = require('./signup-status.json');
module.exports.queries = {
    getSignupRequest: async ({ id, search, pageInput }, context) => {
        const { subscriberId } = AuthUser(context);
        const skip = pageInput?.skip || 0;
        const limit = pageInput?.limit || 50;
        
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
        
        try {
            const pendingStatusCount = await SignupRequest.countDocuments({ 
                signupStatus: signupStatus.PENDING, 
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
    getUserSignupDetails: async ({ id }, context) => {
        const { subscriberId, userInfo } = AuthUser(context);
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
        try {
            const user = await SignupRequest.findOne({ userId: id, isDeleted: false });
            if (!user) throw CustomError(ErrorName.SIGNUP_REQUEST_DATA_NOT_FOUND,'Signup request data not found');
            return user;

        } catch (error) {
            throw CustomError(ErrorName.FAILED_TO_FETCH_SIGNUP_REQUEST, error.message);
        }
    }
};

module.exports.mutations = {
    processSignupRequestApproval: async ( { input }, context) => {
        const { subscriberId, userInfo } = AuthUser(context);
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

        try {
            const { userId, operationType, employeeId, designation, vesselName, vesselType, vesselStatus, isRegistered } = input;

            const processSignupRequestApproval = await DbTransactionHelper.performDbTransaction(async session => {

                if (!mongoose.Types.ObjectId.isValid(userId)) {
                    throw CustomError(ErrorName.INVALID_SIGNUP_REQUEST_ID, 'Invalid user ID');
                }

                const signupRequest = await SignupRequest.findOne({ userId, isDeleted: false });
                if (!signupRequest) {
                    throw CustomError(ErrorName.SIGNUP_REQUEST_DATA_NOT_FOUND, 'Signup request not found');
                }

                if (operationType === operationTypeEnum.APPROVED) {
                    signupRequest.signupStatus = signupStatus.APPROVED;

                    await HistorySignupRequest.create([{
                        firstName: signupRequest?.firstName,
                        lastName: signupRequest?.lastName,
                        email: signupRequest?.email,
                        employeeId,
                        userId: signupRequest?.userId,
                        requestDate: signupRequest?.requestDate,
                        signupStatus: signupStatus?.APPROVED,
                        country: signupRequest?.country,
                        decisionDate: new Date(),
                        vesselName,
                        vesselType,
                        vesselStatus,
                        isRegistered
                    }], { session });

                    await SignupRequest.deleteOne({ userId });

                    return {
                        status: true,
                        message: `Signup request for userId ${userId} has been APPROVED successfully.`
                    };

                } else if (operationType === operationTypeEnum.REJECTED) {
                    
                    signupRequest.signupStatus = signupStatus.REJECTED;

                   const historySignupRequest = await HistorySignupRequest.create([{
                        firstName: signupRequest?.firstName,
                        lastName: signupRequest?.lastName,
                        email: signupRequest?.email,
                        userId: signupRequest?.userId,
                        requestDate: signupRequest?.requestDate,
                        signupStatus: signupStatus?.REJECTED,
                        country: signupRequest?.country,
                        decisionDate: new Date()
                    }],{session});
                    await SignupRequest.deleteOne({ userId });

                    return {
                        status: true,
                        message: `Signup request for userId ${userId} has been REJECTED successfully.`
                    };

                } else {
                    throw CustomError(ErrorName.INVALID_OPERATION_TYPE, "Invalid operation type. Must be APPROVED or REJECTED.");
                }
            });

            return processSignupRequestApproval;

        } catch (error) {
            // Handle failure and return a failure response
            throw CustomError(ErrorName.FAILED_TO_PROCESS_SIGNUP_REQUEST, error.message);
        }
    }
}
