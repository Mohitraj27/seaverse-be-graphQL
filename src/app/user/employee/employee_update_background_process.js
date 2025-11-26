const { connectDb, closeDb } = require("../../../util/child_process_db_helper");
const { filterLearningPlans } = require("./employee_helper");
const { Employee } = require("./employee_model");
const { LearningPlan } = require("../../learning-plan/learning_plan_model");

/**
 * Background process to handle time-consuming learning plan filtering after employee update
 * This runs asynchronously to avoid blocking the main API response
 */
process.on('message', async (data) => {
    const { userId, subscriberId, context, session } = data;

    try {
        console.log(`🔄 Starting background learning plan update for user ${userId}`);

        // Connect to database
        await connectDb();

        // Filter and update learning plans
        try {
            const userIds = [userId];
            const learningPlans = await LearningPlan.find({ isDeleted: false, status: 'ACTIVE' });

            const userConditions = await Employee.find({
                'user': { $in: userIds },
                'isDeleted': false
            })
                .populate({
                    path: 'empDesignation',
                    select: '_id',
                })
                .populate({
                    path: 'user',
                    select: '_id email currentVessel vesselStatus vesselType isDeleted',
                    match: { 'isDeleted': false },
                    populate: {
                        path: 'currentVessel',
                        select: '_id vesselStatus ownerName typeOfVessel isDeleted',
                        match: { 'isDeleted': false }
                    }
                })
                .then((employees) => {
                    const result = employees.map(employee => ({
                        designationID: employee.empDesignation ? employee.empDesignation._id : null,
                        vesselID: employee.user && employee.user.currentVessel ? employee.user.currentVessel._id : null,
                        vesselTypeID: employee.user && employee.user.currentVessel ? employee.user.currentVessel.typeOfVessel : null,
                        currentStatus: employee.user && employee.user.vesselStatus ? employee.user.vesselStatus : null,
                        owner: employee.user && employee.user.currentVessel ? employee.user.currentVessel.ownerName : null,
                        email: employee.user ? employee.user.email : null,
                        _id: employee?.user?._id
                    }));
                    return result;
                })
                .catch((error) => {
                    console.error('Error fetching user conditions:', error);
                    return [];
                });

            if (userConditions.length > 0) {
                const result = await filterLearningPlans(learningPlans, userConditions, context, session);
                console.log(`✅ Learning plans filtered successfully for user ${userId}`, result);
            } else {
                console.log(`ℹ️ No user conditions found for user ${userId}`);
            }
        } catch (error) {
            console.error(`⚠️ Error filtering learning plans for user ${userId}:`, error);
            throw error; // Propagate error for proper handling
        }

        // Close database connection
        await closeDb();

        console.log(`✅ Background learning plan update completed successfully for user ${userId}`);
        process.send({ success: true, message: 'Learning plan filtering completed successfully' });
        process.exit(0);

    } catch (error) {
        console.error(`❌ Background learning plan update failed for user ${userId}:`, error);

        try {
            await closeDb();
        } catch (closeError) {
            console.error('Error closing database:', closeError);
        }

        process.send({ success: false, error: error.message });
        process.exit(1);
    }
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception in background process:', error);
    process.exit(1);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection in background process:', error);
    process.exit(1);
});
