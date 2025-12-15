const { connectDb, closeDb } = require("../../../util/child_process_db_helper");
const { filterLearningPlans } = require("./employee_helper");
const { LearningPlan } = require("../../learning-plan/learning_plan_model");
const { Employee } = require("./employee_model");

/**
 * Background process to handle time-consuming learning plan filtering
 * Used for: register, unregister, role changes, delete operations
 * This runs asynchronously to avoid blocking the main API response
 */
process.on('message', async (data) => {
    const { userIds, operation, context } = data;

    console.log(`\n🔄 [CHILD ${process.pid}] ========================================`);
    console.log(`🔄 [CHILD ${process.pid}] Background process started`);
    console.log(`📊 [CHILD ${process.pid}] Operation: ${operation}`);
    console.log(`👥 [CHILD ${process.pid}] User count: ${userIds.length}`);
    console.log(`🆔 [CHILD ${process.pid}] User IDs: ${userIds.slice(0, 5).join(', ')}${userIds.length > 5 ? '...' : ''}`);
    console.log(`🔄 [CHILD ${process.pid}] ========================================\n`);

    try {
        console.log(`🔌 [CHILD ${process.pid}] Connecting to database...`);

        // Connect to database
        await connectDb();

        console.log(`✅ [CHILD ${process.pid}] Database connected successfully`);

        // Fetch active learning plans
        console.log(`🔍 [CHILD ${process.pid}] Fetching active learning plans...`);
        const learningPlans = await LearningPlan.find({
            isDeleted: false,
            status: 'ACTIVE'
        });

        console.log(`📋 [CHILD ${process.pid}] Found ${learningPlans.length} active learning plans`);

        if (learningPlans.length === 0) {
            console.log(`ℹ️  [CHILD ${process.pid}] No active learning plans found - exiting`);
            closeDb();
            process.send({ success: true, message: 'No active learning plans' });
            process.exit(0);
        }

        // Fetch user conditions
        console.log(`🔍 [CHILD ${process.pid}] Fetching user conditions for ${userIds.length} users...`);
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
                select: 'currentVessel role',
                populate: {
                    path: 'currentVessel',
                    select: 'typeOfVessel',
                },
            })
            .lean();

        console.log(`📋 [CHILD ${process.pid}] Found ${userConditions.length} user conditions`);

        if (userConditions.length === 0) {
            console.log(`ℹ️  [CHILD ${process.pid}] No user conditions found for ${userIds.length} users - exiting`);
            closeDb();
            process.send({ success: true, message: 'No user conditions found' });
            process.exit(0);
        }

        // Filter and process learning plans
        console.log(`⚙️  [CHILD ${process.pid}] Starting learning plan filtering...`);
        console.log(`📊 [CHILD ${process.pid}] Processing ${learningPlans.length} plans for ${userConditions.length} users`);

        const startTime = Date.now();

        try {
            await filterLearningPlans(learningPlans, userConditions, context, null);

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`✅ [CHILD ${process.pid}] Learning plans filtered successfully in ${duration}s`);
            console.log(`📊 [CHILD ${process.pid}] Operation: ${operation}, Users: ${userIds.length}`);
        } catch (error) {
            console.error(`⚠️  [CHILD ${process.pid}] Error filtering learning plans:`, error);
            console.error(`📝 [CHILD ${process.pid}] Stack trace:`, error.stack);
            throw error;
        }

        // Close database connection
        console.log(`🔌 [CHILD ${process.pid}] Closing database connection...`);
        closeDb();
        console.log(`✅ [CHILD ${process.pid}] Database connection closed`);

        console.log(`\n✅ [CHILD ${process.pid}] ========================================`);
        console.log(`✅ [CHILD ${process.pid}] Background process completed successfully`);
        console.log(`✅ [CHILD ${process.pid}] ========================================\n`);

        process.send({ success: true, message: `Learning plan filtering completed for ${operation}` });
        process.exit(0);

    } catch (error) {
        console.error(`\n❌ [CHILD ${process.pid}] ========================================`);
        console.error(`❌ [CHILD ${process.pid}] Background process failed`);
        console.error(`📊 [CHILD ${process.pid}] Operation: ${operation}`);
        console.error(`📝 [CHILD ${process.pid}] Error: ${error.message}`);
        console.error(`📝 [CHILD ${process.pid}] Stack trace:`, error.stack);
        console.error(`❌ [CHILD ${process.pid}] ========================================\n`);

        try {
            console.log(`🔌 [CHILD ${process.pid}] Attempting to close database connection...`);
            closeDb();
            console.log(`✅ [CHILD ${process.pid}] Database connection closed`);
        } catch (closeError) {
            console.error(`❌ [CHILD ${process.pid}] Error closing database:`, closeError);
        }

        process.send({ success: false, error: error.message });
        process.exit(1);
    }
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error(`\n💥 [CHILD ${process.pid}] Uncaught exception:`, error);
    console.error(`📝 [CHILD ${process.pid}] Stack trace:`, error.stack);
    process.exit(1);
});

process.on('unhandledRejection', (error) => {
    console.error(`\n💥 [CHILD ${process.pid}] Unhandled rejection:`, error);
    console.error(`📝 [CHILD ${process.pid}] Stack trace:`, error?.stack);
    process.exit(1);
});
