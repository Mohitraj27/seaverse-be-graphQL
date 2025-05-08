const { Employee } = require("../user/employee/employee_model");
const { User } = require("../user/user_model");
const HistorySignupRequest = require("../signup-request-history/signup-request-history-model");
const SignupRequest = require("./signup-request-model");
const db_transaction_helper = require("../../util/db_transaction_helper");
const { DbTransactionHelper } = require("../../util");
const signupStatus = require("./signup-status");
const { rejectionEmailTemplate } = require('../email-template/SignupRequestRejected');
const aws_helper = require("../../util/aws_helper");
const reject30DayOldSignupRequests = async () => {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 5 * 60 * 1000 /* - 30 * 24 * 60 * 60 * 1000 */); //5 mins (for testing)
        const oldSignupRequests = await SignupRequest.find({
            requestDate: { $lt: thirtyDaysAgo },
            signupStatus: "PENDING",
        });

        if (oldSignupRequests.length === 0) {
            return;
        }

        await rejectSignUpRequests(oldSignupRequests);
    } catch (error) {
        console.error("Error rejecting old signup requests:", error);
    }
}


const rejectSignUpRequests = async signupRequests => {
    try {
        const session = await DbTransactionHelper.performDbTransaction(async session => {
            const userIds = signupRequests.map(req => req.userId);

            await User.deleteMany({ _id: { $in: userIds } }, { session });

            await Employee.deleteMany({ user: { $in: userIds } }, { session });

            const historyRecords = signupRequests.map(req => ({
                firstName: req.firstName,
                lastName: req.lastName,
                email: req.email,
                userId: req.userId,
                requestDate: req.requestDate,
                signupStatus: signupStatus?.REJECTED,
                country: req.country,
                decisionDate: new Date(),
            }));
            await HistorySignupRequest.insertMany(historyRecords, { session });

            const result = await SignupRequest.deleteMany({ userId: { $in: userIds } }, { session });
            return result.deletedCount;
        });

        const emailPromises = signupRequests.map(req =>
            aws_helper.sendEmail({
                receiverEmail: req.email,
                subject: "Signup request REJECTED",
                htmlContent: rejectionEmailTemplate({
                    firstName: req.firstName,
                }),
            })
        );
        const emailResults = await Promise.all(emailPromises);

        const failedEmails = signupRequests.filter((_, i) => !emailResults[i]);
        if (failedEmails.length > 0) {
            throw CustomError(
                ErrorName.FAILED_TO_SEND_REJECTION_EMAIL,
                `Failed to send rejection email to: ${failedEmails
                    .map(e => e.email)
                    .join(", ")}`
            );
        }

    } catch (error) {
        console.error("Error rejecting signup requests:", error);
        throw Error(error.message);
    }
};

module.exports = {
    reject30DayOldSignupRequests,
    rejectSignUpRequests,
};