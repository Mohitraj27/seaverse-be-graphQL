/**
 * Transaction Helper
 * Provides utilities for wrapping operations in MongoDB transactions
 */

const mongoose = require('mongoose');

/**
 * Execute operations within a transaction
 * Automatically handles session creation, commit, and rollback
 * 
 * @param {Function} operations - Async function that receives session as parameter
 * @returns {Promise<any>} - Result from operations function
 * 
 * @example
 * const result = await withTransaction(async (session) => {
 *   const user = await User.create([userData], { session });
 *   await Employee.create([employeeData], { session });
 *   await indexDocumenttoElasticSearch('users', user._id, cacheData, session);
 *   return user;
 * });
 */
async function withTransaction(operations) {
    const session = await mongoose.startSession();

    try {
        await session.startTransaction();

        // Execute operations with session
        const result = await operations(session);

        // Commit transaction
        await session.commitTransaction();

        return result;
    } catch (error) {
        // Rollback on error
        await session.abortTransaction();
        throw error;
    } finally {
        // Always end session
        session.endSession();
    }
}

/**
 * Execute operations within a transaction with retry logic
 * Retries up to maxRetries times on transient errors
 * 
 * @param {Function} operations - Async function that receives session as parameter
 * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
 * @returns {Promise<any>} - Result from operations function
 */
async function withTransactionRetry(operations, maxRetries = 3) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await withTransaction(operations);
        } catch (error) {
            lastError = error;

            // Check if error is transient (can be retried)
            const isTransient = error.hasErrorLabel && error.hasErrorLabel('TransientTransactionError');

            if (!isTransient || attempt === maxRetries) {
                throw error;
            }

            // Wait before retry (exponential backoff)
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            await new Promise(resolve => setTimeout(resolve, delay));

            console.log(`Transaction retry attempt ${attempt}/${maxRetries}`);
        }
    }

    throw lastError;
}

/**
 * Check if MongoDB is configured for transactions (replica set)
 * @returns {Promise<boolean>}
 */
async function isTransactionSupported() {
    try {
        const admin = mongoose.connection.db.admin();
        const serverInfo = await admin.serverStatus();
        return serverInfo.repl && serverInfo.repl.setName;
    } catch (error) {
        return false;
    }
}

module.exports = {
    withTransaction,
    withTransactionRetry,
    isTransactionSupported
};
