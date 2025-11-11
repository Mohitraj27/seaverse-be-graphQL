const { User } = require("../src/app/user/user_model");
const { sendEmail } = require("../src/util/aws_helper");
const { SqliteEmailHelper } = require("../src/util");
const { sendPasswordResetReminderEmail } = require("../src/app/email-template/passwordResetReminder");
const { decrypt } = require("../src/util/encryption_helper");

// SQLite setup for password reset reminder emails
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./emails.db');

// Create table for password reset reminder emails if it doesn't exist
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS password_reset_reminder_emails (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            firstName TEXT NOT NULL,
            userId TEXT NOT NULL,
            buttonLink TEXT NOT NULL,
            tempPassword TEXT NOT NULL DEFAULT 'N/A',
            subject TEXT NOT NULL DEFAULT 'Welcome Back to Seaverse!',
            status TEXT DEFAULT 'PENDING',
            retryCount INTEGER DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            lastAttemptAt DATETIME DEFAULT NULL
        )
    `);
});

// Helper functions for SQLite operations
const insertPasswordResetReminderEmails = (emailBatch) => {
    const stmt = db.prepare(
        "INSERT INTO password_reset_reminder_emails (email, firstName, userId, buttonLink, tempPassword, subject) VALUES (?, ?, ?, ?, ?, ?)"
    );
    const subject = 'Registration Invitation';

    emailBatch.forEach(({ email, firstName, userId, buttonLink, tempPassword }) => {
        stmt.run(email, firstName, userId, buttonLink, tempPassword, subject);
    });
    stmt.finalize();
};

const fetchPasswordResetReminderEmailBatch = () => {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT * FROM password_reset_reminder_emails 
            WHERE status = 'PENDING' AND retryCount < ? 
            LIMIT ?
        `, [RATE_LIMIT.maxRetries, RATE_LIMIT.batchSize], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const updateEmailStatus = (id, status, retryCount = null) => {
    return new Promise((resolve, reject) => {
        let query = `UPDATE password_reset_reminder_emails SET status = ?, lastAttemptAt = CURRENT_TIMESTAMP`;
        let params = [status];

        if (retryCount !== null) {
            query += `, retryCount = ?`;
            params.push(retryCount);
        }

        query += ` WHERE id = ?`;
        params.push(id);

        db.run(query, params, (err) => {
            if (err) reject(err);
            else resolve(true);
        });
    });
};

const deleteProcessedEmails = (ids) => {
    return new Promise((resolve, reject) => {
        const placeholders = ids.map(() => '?').join(',');
        db.run(`DELETE FROM password_reset_reminder_emails WHERE id IN (${placeholders})`, ids, (err) => {
            if (err) reject(err);
            else resolve(true);
        });
    });
};

// Main function to fetch users and queue emails
async function queuePasswordResetReminderEmails() {
    try {
        console.log('🔍 Fetching users with isResetPasswordDialog: false...');

        // First, let's check total user count for debugging
        const totalUsers = await User.countDocuments({});
        console.log(`📊 Total users in database: ${totalUsers}`);

        const activeUsers = await User.countDocuments({ isDeleted: false, isActive: true });
        console.log(`📊 Active users: ${activeUsers}`);

        // Fetch users where isResetPasswordDialog is false
        const users = await User.find({
            isResetPasswordDialog: false,
            isDeleted: false,
            isActive: true,
            isRegistered: true,
            email: { $exists: true, $ne: null }
        }).select('_id firstName email dummyPassword').lean();

        console.log(`📊 Users with isResetPasswordDialog: false: ${users.length}`);

        if (users.length === 0) {
            console.log('✅ No users found with isResetPasswordDialog: false');
            return { totalSent: 0, totalFailed: 0, totalQueued: 0 };
        }

        console.log(`📧 Found ${users.length} users to send password reset reminders`);

        // Prepare email data
        const emailData = users.map(user => {
            // Extract password from dummyPassword field (format: hash~~~plaintext)
            let tempPassword = 'N/A';
            if (user.dummyPassword) {
                const parts = user.dummyPassword.split('~~~');
                tempPassword = parts[1] || 'N/A';
            }

            return {
                email: decrypt(user.email),
                firstName: decrypt(user.firstName) || 'User',
                userId: user._id.toString(),
                buttonLink: `${process.env.APP_URL}/login`,
                tempPassword: tempPassword
            };
        });

        // Insert emails into SQLite queue
        insertPasswordResetReminderEmails(emailData);

        console.log(`✅ Queued ${emailData.length} password reset reminder emails`);
        console.log('📤 Starting email sending process...');

        // Start sending emails
        const result = await sendPasswordResetReminderEmailBulk();

        return {
            totalSent: result.totalSent,
            totalFailed: result.totalFailed,
            totalQueued: emailData.length
        };

    } catch (error) {
        console.error('❌ Error in queuePasswordResetReminderEmails:', error);
        throw error;
    }
}

// Rate limiting configuration
const rateLimitConfigs = require('./email-rate-limit-config');
const { sendWelcomeEmailsToLearner, sendEmailToLearner } = require("../src/app/email-template/sendWelcomeEmail");
// Choose configuration based on environment variable or default to HIGH_VOLUME
const configType = process.env.EMAIL_RATE_LIMIT_CONFIG || 'HIGH_VOLUME';
const RATE_LIMIT = rateLimitConfigs[configType] || rateLimitConfigs.HIGH_VOLUME;

console.log(`📧 Using rate limit configuration: ${configType}`, RATE_LIMIT);

// Function to send emails in batches with proper rate limiting
async function sendPasswordResetReminderEmailBulk(progressCallback = null) {
    try {
        let totalSent = 0;
        let totalFailed = 0;
        let batchNumber = 0;
        let emailsSentInCurrentSecond = 0;
        let lastEmailTime = Date.now();

        // Get initial counts for progress tracking
        const initialStatus = await getEmailQueueCounts();
        const totalToProcess = initialStatus.pending || 0;

        console.log(`📊 Rate limiting configured: ${RATE_LIMIT.emailsPerSecond} emails/second, ${RATE_LIMIT.batchSize} per batch`);

        if (progressCallback) {
            progressCallback({
                type: 'start',
                totalToProcess,
                totalSent: 0,
                totalFailed: 0,
                currentBatch: 0
            });
        }

        while (true) {
            // Fetch batch of emails to send
            const emailBatch = await fetchPasswordResetReminderEmailBatch();

            if (!emailBatch.length) {
                console.log('✅ No more emails to process');
                if (progressCallback) {
                    progressCallback({
                        type: 'complete',
                        totalToProcess,
                        totalSent,
                        totalFailed,
                        currentBatch: batchNumber
                    });
                }
                break;
            }

            batchNumber++;
            console.log(`📤 Processing batch ${batchNumber} of ${emailBatch.length} emails...`);

            if (progressCallback) {
                progressCallback({
                    type: 'batch_start',
                    totalToProcess,
                    totalSent,
                    totalFailed,
                    currentBatch: batchNumber,
                    batchSize: emailBatch.length
                });
            }

            const results = [];

            // Process each email in the batch with proper rate limiting
            for (let i = 0; i < emailBatch.length; i++) {
                const emailRecord = emailBatch[i];

                // Rate limiting logic
                const currentTime = Date.now();
                const timeSinceLastEmail = currentTime - lastEmailTime;

                // Reset counter if more than 1 second has passed
                if (timeSinceLastEmail >= 1000) {
                    emailsSentInCurrentSecond = 0;
                    lastEmailTime = currentTime;
                }

                // If we've hit the rate limit for this second, wait
                if (emailsSentInCurrentSecond >= RATE_LIMIT.emailsPerSecond) {
                    const waitTime = 1000 - timeSinceLastEmail;
                    console.log(`⏳ Rate limit reached, waiting ${waitTime}ms...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    emailsSentInCurrentSecond = 0;
                    lastEmailTime = Date.now();
                }

                try {
                    const user = {
                        firstName: emailRecord.firstName,
                        email: emailRecord.email,
                        temp_password: emailRecord.tempPassword,
                        buttonLink: emailRecord.buttonLink || `${process.env.APP_URL}/login`
                    };

                    const htmlContent = sendEmailToLearner(user);

                    // Send email using AWS SES
                    const response = await sendEmail({
                        receiverEmail: emailRecord.email,
                        subject: emailRecord.subject,
                        htmlContent: htmlContent
                    });

                    if (response) {
                        await updateEmailStatus(emailRecord.id, 'SENT');
                        results.push({ id: emailRecord.id, status: 'success', email: emailRecord.email });
                        totalSent++;
                        emailsSentInCurrentSecond++;
                        console.log(`✅ Email sent successfully to: ${emailRecord.email} (${emailsSentInCurrentSecond}/${RATE_LIMIT.emailsPerSecond} this second)`);

                        if (progressCallback) {
                            // Get current status counts for real-time updates
                            const currentStatus = await getEmailQueueCounts();
                            progressCallback({
                                type: 'email_sent',
                                totalToProcess,
                                totalSent,
                                totalFailed,
                                currentBatch: batchNumber,
                                emailIndex: i + 1,
                                batchSize: emailBatch.length,
                                email: emailRecord.email,
                                currentCounts: currentStatus
                            });
                        }
                    } else {
                        throw new Error('No response from email service');
                    }

                } catch (error) {
                    console.error(`❌ Failed to send email to ${emailRecord.email}:`, error.message);

                    const newRetryCount = emailRecord.retryCount + 1;

                    if (newRetryCount >= RATE_LIMIT.maxRetries) {
                        await updateEmailStatus(emailRecord.id, 'FAILED', newRetryCount);
                        totalFailed++;
                        console.log(`💀 Email permanently failed for: ${emailRecord.email} (max retries reached)`);
                    } else {
                        await updateEmailStatus(emailRecord.id, 'PENDING', newRetryCount);
                        console.log(`🔄 Email queued for retry (${newRetryCount}/${RATE_LIMIT.maxRetries}) for: ${emailRecord.email}`);
                    }

                    results.push({ id: emailRecord.id, status: 'failed', email: emailRecord.email, error: error.message });

                    if (progressCallback) {
                        // Get current status counts for real-time updates
                        const currentStatus = await getEmailQueueCounts();
                        progressCallback({
                            type: 'email_failed',
                            totalToProcess,
                            totalSent,
                            totalFailed,
                            currentBatch: batchNumber,
                            emailIndex: i + 1,
                            batchSize: emailBatch.length,
                            email: emailRecord.email,
                            error: error.message,
                            currentCounts: currentStatus
                        });
                    }
                }

                // Small delay between emails to ensure smooth processing
                await new Promise(resolve => setTimeout(resolve, RATE_LIMIT.delayBetweenEmails));
            }

            // Clean up successfully sent emails
            const successfulIds = results.filter(r => r.status === 'success').map(r => r.id);
            if (successfulIds.length > 0) {
                await deleteProcessedEmails(successfulIds);
            }

            console.log(`📊 Batch ${batchNumber} completed - Sent: ${results.filter(r => r.status === 'success').length}, Failed: ${results.filter(r => r.status === 'failed').length}`);

            if (progressCallback) {
                progressCallback({
                    type: 'batch_complete',
                    totalToProcess,
                    totalSent,
                    totalFailed,
                    currentBatch: batchNumber,
                    batchResults: {
                        sent: results.filter(r => r.status === 'success').length,
                        failed: results.filter(r => r.status === 'failed').length
                    }
                });
            }

            // Delay between batches to ensure we don't exceed rate limits
            console.log(`⏸️  Waiting ${RATE_LIMIT.delayBetweenBatches}ms before next batch...`);
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT.delayBetweenBatches));
        }

        console.log(`\n📈 Final Summary:`);
        console.log(`✅ Total emails sent: ${totalSent}`);
        console.log(`❌ Total emails failed: ${totalFailed}`);

        return { totalSent, totalFailed };

    } catch (error) {
        console.error('❌ Error in sendPasswordResetReminderEmailBulk:', error);
        if (progressCallback) {
            progressCallback({
                type: 'error',
                error: error.message
            });
        }
        throw error;
    }
}

// Function to retry failed emails
async function retryFailedEmails() {
    try {
        console.log('🔄 Retrying failed emails...');
        const result = await sendPasswordResetReminderEmailBulk();
        return result;
    } catch (error) {
        console.error('❌ Error in retryFailedEmails:', error);
        throw error;
    }
}

// Function to retry failed emails with progress callback
async function retryFailedEmailsWithProgress(progressCallback) {
    try {
        console.log('🔄 Retrying failed emails with progress tracking...');
        const result = await sendPasswordResetReminderEmailBulk(progressCallback);
        return result;
    } catch (error) {
        console.error('❌ Error in retryFailedEmailsWithProgress:', error);
        throw error;
    }
}

// Function to queue and send emails with progress callback
async function queuePasswordResetReminderEmailsWithProgress(progressCallback) {
    try {
        console.log('🔍 Fetching users with isResetPasswordDialog: false...');

        // First, let's check total user count for debugging
        const totalUsers = await User.countDocuments({});
        console.log(`📊 Total users in database: ${totalUsers}`);

        const activeUsers = await User.countDocuments({ isDeleted: false, isActive: true });
        console.log(`📊 Active users: ${activeUsers}`);

        // Fetch users where isResetPasswordDialog is false
        const users = await User.find({
            isResetPasswordDialog: false,
            isDeleted: false,
            isActive: true,
            email: { $exists: true, $ne: null }
        }).select('_id firstName email dummyPassword').lean();

        console.log(`📊 Users with isResetPasswordDialog: false: ${users.length}`);

        if (users.length === 0) {
            console.log('✅ No users found with isResetPasswordDialog: false');
            return { totalSent: 0, totalFailed: 0, totalQueued: 0 };
        }

        console.log(`📧 Found ${users.length} users to send password reset reminders`);

        // Prepare email data
        const emailData = users.map(user => {
            // Extract password from dummyPassword field (format: hash~~~plaintext)
            let tempPassword = 'N/A';
            if (user.dummyPassword) {
                const parts = user.dummyPassword.split('~~~');
                tempPassword = parts[1] || 'N/A';
            }

            return {
                email: decrypt(user.email),
                firstName: decrypt(user.firstName) || 'User',
                userId: user._id.toString(),
                buttonLink: `${process.env.APP_URL}/login`,
                tempPassword: tempPassword
            };
        });

        // Insert emails into SQLite queue
        insertPasswordResetReminderEmails(emailData);

        console.log(`✅ Queued ${emailData.length} password reset reminder emails`);
        console.log('📤 Starting email sending process...');

        // Start sending emails with progress tracking
        const result = await sendPasswordResetReminderEmailBulk(progressCallback);

        return {
            totalSent: result.totalSent,
            totalFailed: result.totalFailed,
            totalQueued: emailData.length
        };

    } catch (error) {
        console.error('❌ Error in queuePasswordResetReminderEmailsWithProgress:', error);
        throw error;
    }
}

// Function to check email queue status
async function checkEmailQueueStatus() {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT 
                status,
                COUNT(*) as count,
                AVG(retryCount) as avgRetries
            FROM password_reset_reminder_emails 
            GROUP BY status
        `, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                console.log('\n📊 Email Queue Status:');
                rows.forEach(row => {
                    console.log(`${row.status}: ${row.count} emails (avg retries: ${row.avgRetries?.toFixed(1) || 0})`);
                });
                resolve(rows);
            }
        });
    });
}

// Function to get detailed email queue information
async function getEmailQueueDetails(status = null, limit = 100) {
    return new Promise((resolve, reject) => {
        let query = `
            SELECT 
                id, email, firstName, userId, buttonLink, subject, 
                status, retryCount, createdAt, lastAttemptAt
            FROM password_reset_reminder_emails
        `;
        let params = [];

        if (status) {
            query += ` WHERE status = ?`;
            params.push(status.toUpperCase());
        }

        query += ` ORDER BY createdAt DESC LIMIT ?`;
        params.push(limit);

        db.all(query, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// Function to get email queue counts
async function getEmailQueueCounts() {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT 
                status,
                COUNT(*) as count
            FROM password_reset_reminder_emails 
            GROUP BY status
        `, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                const counts = {};
                rows.forEach(row => {
                    counts[row.status.toLowerCase()] = row.count;
                });
                resolve(counts);
            }
        });
    });
}

// Function to clear sent emails from queue
async function clearSentEmails() {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM password_reset_reminder_emails WHERE status = 'SENT'`, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve({ deletedCount: this.changes });
            }
        });
    });
}

// Main execution function
async function main() {
    try {
        console.log('🚀 Starting Password Reset Reminder Email Script...\n');

        // Check if we should queue new emails or just process existing ones
        const args = process.argv.slice(2);

        if (args.includes('--status')) {
            await checkEmailQueueStatus();
            return;
        }

        if (args.includes('--retry-only')) {
            await retryFailedEmails();
        } else {
            // Queue new emails and send them
            await queuePasswordResetReminderEmails();
        }

        // Show final status
        await checkEmailQueueStatus();

        console.log('\n✅ Script completed successfully!');

    } catch (error) {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    } finally {
        // Close database connection
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err.message);
            } else {
                console.log('📦 Database connection closed.');
            }
        });
    }
}

// Export functions for use in other scripts
module.exports = {
    queuePasswordResetReminderEmails,
    queuePasswordResetReminderEmailsWithProgress,
    sendPasswordResetReminderEmailBulk,
    retryFailedEmails,
    retryFailedEmailsWithProgress,
    checkEmailQueueStatus,
    getEmailQueueDetails,
    getEmailQueueCounts,
    clearSentEmails
};

// Run the script if called directly
if (require.main === module) {
    main();
}