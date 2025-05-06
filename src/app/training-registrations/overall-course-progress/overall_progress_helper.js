const { performDbTransaction } = require("../../../util/db_transaction_helper");
const { User } = require("../../user/user_model");
const { OverallTrainingProgress } = require("./overall_progress_model");

const deleteCourseDataForUserDeleted5yearsAgo = async () => {
    try {
        const fiveYearsAgo = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000);
        const usersToDelete = await User.find({
            deletionDate: { $lt: fiveYearsAgo },
            isDeleted: true,
        })
            .select("userId")
            .lean();

        if (usersToDelete.length === 0) {
            return;
        }

        const userIds = usersToDelete.map(user => user.userId);
        await deleteCourseDataForDeletedUsers(userIds);
    } catch (error) {
        console.error("Error deleting course data for users deleted 5 years ago:", error);
    }
};

const deleteCourseDataForDeletedUsers = async userIds => {
    try {
        const session = await performDbTransaction(async session => {
            const result = await OverallTrainingProgress.deleteMany(
                { userId: { $in: userIds } },
                { session }
            );
            return result.deletedCount;
        });
        return session;
    } catch (error) {
        console.error("Error deleting course data for deleted users:", error);
        throw Error(error.message);
    }
};


module.exports = {
    deleteCourseDataForUserDeleted5yearsAgo,
    deleteCourseDataForDeletedUsers,
};