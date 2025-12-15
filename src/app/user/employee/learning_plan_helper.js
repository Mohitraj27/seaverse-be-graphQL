const { fork } = require('child_process');
const path = require('path');

/**
 * Offload learning plan filtering to background child process
 * @param {Array} userIds - Array of user IDs to process
 * @param {String} operation - Operation type: 'register', 'unregister', 'assign_role', 'remove_role', 'delete'
 * @param {Object} context - GraphQL context object
 */
function processLearningPlansInBackground(userIds, operation, context) {
    try {
        if (!userIds || userIds.length === 0) {
            console.log('ℹ️  No users to process for learning plan auto-enrollment');
            return;
        }

        console.log(`\n🚀 [PARENT] Starting background process for learning plan filtering`);
        console.log(`📊 [PARENT] Operation: ${operation}`);
        console.log(`👥 [PARENT] User count: ${userIds.length}`);
        console.log(`🆔 [PARENT] User IDs: ${userIds.slice(0, 5).join(', ')}${userIds.length > 5 ? '...' : ''}`);

        // Prepare minimal context (remove circular references and large objects)
        const minimalContext = {
            ipInfo: context?.ipInfo,
            userAgent: context?.userAgent,
            user: {
                userId: context?.user?.userId
            }
        };

        const backgroundProcessPath = path.join(__dirname, 'learning_plan_background_process.js');
        console.log(`📂 [PARENT] Process path: ${backgroundProcessPath}`);

        const child = fork(backgroundProcessPath);
        console.log(`✅ [PARENT] Child process forked with PID: ${child.pid}`);

        // Send data to child process
        const payload = {
            userIds: userIds.map(id => id.toString()),
            operation,
            context: minimalContext
        };

        console.log(`📤 [PARENT] Sending data to child process...`);
        child.send(payload);
        console.log(`✅ [PARENT] Data sent to child process`);

        // Handle child process messages (optional logging)
        child.on('message', (message) => {
            if (message.success) {
                console.log(`\n✅ [PARENT] Child process completed successfully`);
                console.log(`📝 [PARENT] Message: ${message.message}`);
            } else {
                console.error(`\n❌ [PARENT] Child process failed`);
                console.error(`📝 [PARENT] Error: ${message.error}`);
            }
        });

        // Handle child process errors
        child.on('error', (error) => {
            console.error(`\n❌ [PARENT] Child process error:`, error);
        });

        // Handle child process exit
        child.on('exit', (code, signal) => {
            if (code === 0) {
                console.log(`\n✅ [PARENT] Child process exited successfully (code: ${code})`);
            } else {
                console.error(`\n⚠️  [PARENT] Child process exited with code ${code}${signal ? `, signal: ${signal}` : ''}`);
            }
        });

        console.log(`✅ [PARENT] Learning plan job queued for ${userIds.length} users (${operation})\n`);

    } catch (error) {
        console.error('\n❌ [PARENT] Error spawning learning plan background process:', error);
        console.error('📝 [PARENT] Stack trace:', error.stack);
        // Don't throw - learning plan processing is non-critical
        // The main operation should succeed even if background process fails
    }
}

module.exports = {
    processLearningPlansInBackground
};
