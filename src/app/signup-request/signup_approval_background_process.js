const { connectDb, closeDb } = require("../../util/child_process_db_helper");
const { filterLearningPlans } = require("../user/employee/employee_helper");
const { LearningPlan } = require("../learning-plan/learning_plan_model");

/**
 * Background process to handle time-consuming learning plan filtering after signup approval
 * This runs asynchronously to avoid blocking the main API response
 */
process.on('message', async (data) => {
    const { conditions, context } = data;

    try {
        console.log(`🔄 Starting background learning plan filtering for signup approval`);

        // Connect to database
        await connectDb();

        // Filter and update learning plans
        try {
            const learningPlans = await LearningPlan.find({ isDeleted: false, status: 'ACTIVE' });

            if (learningPlans.length > 0) {
                const result = await filterLearningPlans(learningPlans, conditions, context, null);
                console.log(`✅ Learning plans filtered successfully for signup approval`, result);
            } else {
                console.log(`ℹ️ No active learning plans found`);
            }
        } catch (error) {
            console.error(`⚠️ Error filtering learning plans for signup approval:`, error);
            throw error; // Propagate error for proper handling
        }

        // Close database connection
        await closeDb();

        console.log(`✅ Background learning plan filtering completed successfully for signup approval`);
        process.send({ success: true, message: 'Learning plan filtering completed successfully' });
        process.exit(0);

    } catch (error) {
        console.error(`❌ Background learning plan filtering failed for signup approval:`, error);

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
