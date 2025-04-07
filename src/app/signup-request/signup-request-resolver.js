const { CustomError } = require("../../util/error_helper");

const { ErrorName, AuthUser, Permission, SubRoleHelper, subscriberId, context } = require("../../util");
const SignupRequest = require("./signup-request-model");
const mongoose = require("mongoose");
const HistorySignupRequest = require('../signup-request-history/signup-request-history-model');
const operationTypeEnum = require('./signup-request-operation.json')
const DbTransactionHelper = require('../../util/db_transaction_helper');
const signupStatus = require('./signup-status.json');
const { User } = require("../user/user_model");
const { Designation } = require('../designations/designation_model');
const { Employee } = require('../user/employee/employee_model');
const { UserVessel } = require('../user/user-vessel-bridge/userVessel_model');
const sortingFieldJSONData = require('./sortingField.json')
const { rejectionEmailTemplate } = require('../email-template/SignupRequestRejected');
const { approvalEmailTemplate } = require('../email-template/SignupRequestApproved');
const aws_helper = require("../../util/aws_helper");
const { LearningPlan } = require('../learning-plan/learning_plan_model');
const { Vessel } = require('../vessle/vessel_model');
const { filterLearningPlans } = require("../user/employee/employee_helper");

module.exports.queries = {
    getSignupRequest: async ({ id, search, pageInput }, context) => {
        const { subscriberId } = AuthUser(context);
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
        try {
            const skip = pageInput?.skip || 0;
            const limit = pageInput?.limit || 100;
            const sortingFieldValue = pageInput?.sortingFieldValue || sortingFieldJSONData?.requestDate;
            const sortingOrder = pageInput?.sortingOrder || -1;
            const pendingStatusCount = await SignupRequest.countDocuments({
                signupStatus: signupStatus.PENDING,
                isDeleted: false
            });
            if (id) {
                if (typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
                    throw CustomError(ErrorName.INVALID_SIGNUP_REQUEST_ID, 'Please pass the correct signup request id');
                }

                const item = await SignupRequest.findById(id);

                if (!item) throw CustomError(ErrorName.SIGNUP_REQUEST_DATA_NOT_FOUND, 'Signup request data not found');

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
            const sortObj = {};
            sortObj[sortingFieldValue] = sortingOrder;

            const items = await SignupRequest.find(query)
                .sort(sortObj)
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
            if (!user) throw CustomError(ErrorName.SIGNUP_REQUEST_DATA_NOT_FOUND, 'Signup request data not found');
            return user;

        } catch (error) {
            throw CustomError(ErrorName.FAILED_TO_FETCH_SIGNUP_REQUEST, error.message);
        }
    }
};

module.exports.mutations = {
    processSignupRequestApproval: async ({ input }, context) => {
        const { subscriberId, userInfo } = AuthUser(context);
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

        try {
            const { userId, operationType, employeeId, designation, vesselName, vesselStatus, isRegistered } = input;

            const processSignupRequestApproval = await DbTransactionHelper.performDbTransaction(async session => {

                if (!mongoose.Types.ObjectId.isValid(userId)) {
                    throw CustomError(ErrorName.INVALID_SIGNUP_REQUEST_ID, 'Invalid user ID');
                }

                const signupRequest = await SignupRequest.findOne({ userId, isDeleted: false });
                if (!signupRequest) {
                    throw CustomError(ErrorName.SIGNUP_REQUEST_DATA_NOT_FOUND, 'Signup request not found');
                }

                if (operationType === operationTypeEnum?.APPROVED) {
                    signupRequest.signupStatus = signupStatus?.APPROVED;

                    const existingUser = await User.findOne({ civilIdOrPassport: employeeId, isDeleted: false, isSignupAdminAprroved: { $ne: false } });
                    if (existingUser) {
                        throw CustomError(ErrorName.USER_ALREADY_EXIST, 'Employee with this EmployeeID already exists.');
                    }
                    const updateUser = {
                        civilIdOrPassport: employeeId?.toUpperCase(),
                        isSignupAdminAprroved: true,
                        isRegistered,
                        vesselStatus: vesselStatus || null,
                        currentVessel: vesselName || null
                    }
                    if (designation) {
                        const designationRecord = await Designation.findOne({ _id: designation, isDeleted: false });
                        if (!designationRecord) {
                            throw CustomError(ErrorName.INVALID_DESIGNATION, 'Designation not found');
                        }
                        await Employee.findOneAndUpdate(
                            { user: signupRequest?.userId },
                            {
                                $set: {
                                    designation: designationRecord?.name,
                                    empDesignation: designation
                                }
                            },
                            { session, upsert: true }
                        );
                    }
                    await User.updateOne(
                        { _id: signupRequest?.userId },
                        { $set: updateUser },
                        { session }
                    )
                    if (vesselName || vesselStatus) {
                        await UserVessel.create([{
                            vessel: vesselName,
                            vesselStatus,
                            user: signupRequest?.userId,
                            isActive: true
                        }], { session });
                    }
                    await HistorySignupRequest.create([{
                        firstName: signupRequest?.firstName,
                        lastName: signupRequest?.lastName,
                        email: signupRequest?.email,
                        employeeId: employeeId?.toUpperCase(),
                        userId: signupRequest?.userId,
                        requestDate: signupRequest?.requestDate,
                        signupStatus: signupStatus?.APPROVED,
                        country: signupRequest?.country,
                        decisionDate: new Date(),
                        vesselName,
                        vesselStatus,
                        isRegistered
                    }], { session });

                    await SignupRequest.deleteOne({ userId }, { session });

                    const sendmailforApproval = await aws_helper.sendEmail({
                        receiverEmail: signupRequest?.email,
                        subject: 'Signup request APPROVED',
                        htmlContent: approvalEmailTemplate({
                            firstName: signupRequest?.firstName,
                            loginLink: `${process.env.APP_URL}/login`
                        })
                    });

                    // Conditions for auto enrollment
                    const learningPlans = await LearningPlan.find({ isDeleted: false, status: 'ACTIVE' });
                    const existingVesselType = await Vessel.findOne({ _id: vesselName }).select('typeOfVessel -_id').lean();
                    const conditions = [{
                        designationID: designation,
                        vesselID: vesselName || "",
                        vesselTypeID: existingVesselType ? existingVesselType.typeOfVessel : "",
                        currentStatus: vesselStatus || "",
                        email: signupRequest?.email,
                        _id: signupRequest?.userId
                    }];

                    if (learningPlans.length > 0) {
                        const result = await filterLearningPlans(learningPlans, conditions, context, session);
                    }

                    if (!sendmailforApproval) {
                        throw CustomError(ErrorName.FAILED_TO_SEND_APPROVAL_EMAIL, 'Failed to send approval email');
                    }
                    const userName = `${signupRequest?.firstName} ${signupRequest?.lastName || ''}`.trim();
                    return {
                        status: true,
                        message: `Signup request for ${userName} has been APPROVED successfully.`
                    };

                } else if (operationType === operationTypeEnum?.REJECTED) {

                    signupRequest.signupStatus = signupStatus?.REJECTED;
                    await User.deleteOne(
                        { _id: signupRequest?.userId },
                        // { $set: { isDeleted: true , isSignupAdminAprroved: false} },
                        { session }
                    );

                    await Employee.deleteOne(
                        { user: signupRequest?.userId },
                        // { $set: { isDeleted: true } },
                        { session }
                    );
                    const historySignupRequest = await HistorySignupRequest.create([{
                        firstName: signupRequest?.firstName,
                        lastName: signupRequest?.lastName,
                        email: signupRequest?.email,
                        userId: signupRequest?.userId,
                        requestDate: signupRequest?.requestDate,
                        signupStatus: signupStatus?.REJECTED,
                        country: signupRequest?.country,
                        decisionDate: new Date()
                    }], { session });
                    await SignupRequest.deleteOne({ userId }, { session });
                    const userName = `${signupRequest?.firstName} ${signupRequest?.lastName || ''}`.trim();
                    const sendmailforRejection = await aws_helper.sendEmail({
                        receiverEmail: signupRequest?.email,
                        subject: 'Signup request REJECTED',
                        htmlContent: rejectionEmailTemplate({
                            firstName: signupRequest?.firstName,
                        })
                    });
                    if (!sendmailforRejection) {
                        throw CustomError(ErrorName.FAILED_TO_SEND_REJECTION_EMAIL, 'Failed to send rejection email');
                    }
                    return {
                        status: true,
                        message: `Signup request for ${userName} has been REJECTED successfully.`
                    };

                } else {
                    throw CustomError(ErrorName.INVALID_OPERATION_TYPE, "Invalid operation type. Must be APPROVED or REJECTED.");
                }
            });

            return processSignupRequestApproval;

        } catch (error) {
            throw CustomError(ErrorName.FAILED_TO_PROCESS_SIGNUP_REQUEST, error.message);
        }
    }
}
