const { performDbTransaction } = require("../../../util/db_transaction_helper");
const { User } = require("../../user/user_model");
const { OverallTrainingProgress } = require("./overall_progress_model");
const { TrainingRegistration } = require("../training_registration_model");
const { TrainingProgress } = require("../training-progress/training_progress_model");
const  LearningPlanAssignment  = require("../../learning-plan/assignedLearner/assignedLearnerModel");
const { Employee } = require("../../user/employee/employee_model");
const { ObjectId } = require("../../../tools");
const { bulkUpdateDocumentsInElastic } = require("../../../util/elastic_helper");

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

        const userIds = usersToDelete.map(user => user._id);
        await deleteCourseDataForDeletedUsers(userIds);
    } catch (error) {
        console.error("Error deleting course data for users deleted 5 years ago:", error);
    }
};

const deleteCourseDataForDeletedUsers = async userIds => {
    console.log("Deleting course data for deleted users:", userIds);
    try {
        const existingData = await OverallTrainingProgress.find({ user: { $in: userIds } }).select("user trainingRegistration learningPlan ").lean();
        if(existingData.length === 0) {
            console.log("No course data found for deleted users.");
            return;
        }
        const trainingProgressesToBeDeletedIds = existingData.map(({ _id }) => _id);
        const usersToBeDeleted = User.find({ _id: { $in: userIds } });
        if (usersToBeDeleted.length === 0) {
            console.log("No users found to delete course data for.");
            return;
        }
        const userTrainingRegMapDeleteOps = existingData.map(({ user, trainingRegistration }) => ({
            updateOne: {
                filter: { _id: trainingRegistration },
                update: { $pull: { users: user } }
            }
        }));

        const userlearningPlanIdMap = existingData.reduce((acc, curr) => {
            const userId = curr.user.toString();
            const plans = Array.isArray(curr.learningPlan) ? curr.learningPlan : [curr.learningPlan];
        
            if (!acc[userId]) {
                acc[userId] = [];
            }
        
            acc[userId].push(...plans);
            return acc;
        }, {});

        // for removing duplicate learningplan ids
        for (const userId in userlearningPlanIdMap) {
            userlearningPlanIdMap[userId] = [...new Set(userlearningPlanIdMap[userId])];
        }

        const bulkDeleteOpsLPAssignments = Object.entries(userlearningPlanIdMap).map(([userId, allowedPlanIds]) => ({
            deleteMany: {
                filter: {
                    assignedLearnerId: userId,
                    learningPlanId: { $nin: allowedPlanIds }
                }
            }
        }));

        const session = await performDbTransaction(async session => {
            
            if (userTrainingRegMapDeleteOps.length > 0) {
                await TrainingRegistration.bulkWrite(userTrainingRegMapDeleteOps, { session });
            }
            if (bulkDeleteOpsLPAssignments.length > 0) {
                await LearningPlanAssignment.bulkWrite(bulkDeleteOpsLPAssignments, { session });
            }
            await TrainingProgress.deleteMany(
                {
                    overallTrainingProgress: { $in: trainingProgressesToBeDeletedIds },
                },
                { session },
            );
            const result = await OverallTrainingProgress.deleteMany(
                { user: { $in: userIds } },
                { session }
            );

            await User.deleteMany(
                { _id: { $in: userIds } },
                { session }
            );

            await Employee.deleteMany(
                { user: { $in: userIds } },
                { session }
            );
            
            console.log(result.deletedCount, "OverallTrainingProgress deleted");
            return result.deletedCount;
        });
        return session;
    } catch (error) {
        console.error("Error deleting course data for deleted users:", error);
        throw Error(error.message);
    }
};

const getEnrolledCoursesOfUsers = async (userIds,session) => {
    try {
        if (!Array.isArray(userIds) || userIds.length === 0) {
            return [];
        }
        const arrayOfUsers = await OverallTrainingProgress.find({
            user: { $in: userIds },
            $or: [
                { isEnrolled: true },
                { status: "COMPLETED" }
            ]
        }).select("user").lean().session(session);

        const userCounts = {};

        for (const doc of arrayOfUsers) {
            const userId = doc.user.toString();
            userCounts[userId] = (userCounts[userId] || 0) + 1;
        }

        return userCounts;

    } catch (error) {
        console.log("error calculating user's enrolled courses: ", error)
    }
}
const getUsersAvgProgress = async (userIds,session) => {
    try {
        if (!Array.isArray(userIds) || userIds.length === 0) {
            return {};
        }

        const averageProgressByUser = await OverallTrainingProgress.aggregate([
            {
                $match: {
                    user: { $in: userIds.map(id => ObjectId(id)) },
                    $or: [
                        { isEnrolled: true },
                        { status: "COMPLETED" }
                    ]
                }
            },
            {
                $group: {
                    _id: "$user",
                    averageProgress: { $avg: "$progressPercentage" }
                }
            },
            {
                $project: {
                    user: "$_id",
                    averageProgress: 1,
                    _id: 0
                }
            }
        ]).session(session);

        const userToAvgProgress = Object.fromEntries(
            averageProgressByUser.map(item => [item.user.toString(), item?.averageProgress ? parseInt(item.averageProgress).toFixed(2) : 0])
        );

        return userToAvgProgress;

    } catch (error) {
        console.log("error calculating user's average course progress : ", error)
    }
}

const updateCoursesCountAndProgressInElasticSearch = async (userIds, session) => {
    try {

        if (!userIds || userIds.length === 0) {
            return "No users to update";
        }

        //Bulk updattion in Elasticsearch ( enrolled courses count and average progress of each user )
        const enrolledCoursesCountOfEachUser = await getEnrolledCoursesOfUsers(userIds, session);
        const avgProgressOfEachUser = await getUsersAvgProgress(userIds, session);
        const updateMap = {};

        // since we are using the same user ids in both maps, we can use the same loop
        for (const userId of Object.keys(enrolledCoursesCountOfEachUser)) {
            updateMap[userId] = {
                enrolledCourses: enrolledCoursesCountOfEachUser[userId],
                averageCourseProgress: avgProgressOfEachUser[userId] || 0,
            };
        }
        console.log("update map: ", updateMap);
        const bulkUpdateInElasticResult = await bulkUpdateDocumentsInElastic("users", updateMap, { upsert: true });
        console.log("Bulk update in Elasticsearch result:", bulkUpdateInElasticResult);
        return bulkUpdateInElasticResult;

    } catch (error) {
        throw Error(error.message);
    }
}
module.exports = {
    updateCoursesCountAndProgressInElasticSearch,
    deleteCourseDataForUserDeleted5yearsAgo,
    deleteCourseDataForDeletedUsers,
    getEnrolledCoursesOfUsers,
    getUsersAvgProgress,
};