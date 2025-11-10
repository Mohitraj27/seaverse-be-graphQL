const express = require('express');
const router = express.Router();
const {
    queuePasswordResetReminderEmails,
    queuePasswordResetReminderEmailsWithProgress,
    sendPasswordResetReminderEmailBulk,
    retryFailedEmails,
    retryFailedEmailsWithProgress,
    checkEmailQueueStatus,
    getEmailQueueDetails,
    getEmailQueueCounts,
    clearSentEmails
} = require('../../scripts/send-password-reset-reminder');

// Send new password reset reminder emails
router.post('/send', async (req, res) => {
    try {
        console.log('🚀 API: Starting password reset reminder email process...');
        addLogEntry('Starting password reset reminder email process...');

        // Create progress callback for real-time updates
        const progressCallback = (progress) => {
            addLogEntry(`Progress: ${progress.type} - Sent: ${progress.totalSent || 0}, Failed: ${progress.totalFailed || 0}`);
            broadcastProgress(progress);

            // Broadcast status updates immediately if we have current counts
            if (progress.currentCounts) {
                broadcastStatus(progress.currentCounts);
            }
        };

        // Queue new emails and send them with progress tracking
        const result = await queuePasswordResetReminderEmailsWithProgress(progressCallback);

        console.log('📊 API: Email process completed with result:', result);
        addLogEntry(`Email process completed - Sent: ${result?.totalSent || 0}, Failed: ${result?.totalFailed || 0}`);

        // Broadcast final status
        const finalStatus = await getEmailQueueCounts();
        broadcastStatus(finalStatus);

        res.json({
            success: true,
            message: 'Password reset reminder emails processed successfully',
            totalSent: result?.totalSent || 0,
            totalFailed: result?.totalFailed || 0,
            totalQueued: result?.totalQueued || 0,
            result: result // Include full result for debugging
        });

    } catch (error) {
        console.error('❌ API Error in /send:', error);
        addLogEntry(`Error in email sending: ${error.message}`, 'error');
        broadcastProgress({ type: 'error', error: error.message });

        res.status(500).json({
            success: false,
            error: error.message || 'Failed to send password reset reminder emails'
        });
    }
});

// Retry failed emails
router.post('/retry', async (req, res) => {
    try {
        console.log('🔄 API: Retrying failed password reset reminder emails...');
        addLogEntry('Retrying failed password reset reminder emails...');

        // Create progress callback for real-time updates
        const progressCallback = (progress) => {
            addLogEntry(`Retry Progress: ${progress.type} - Sent: ${progress.totalSent || 0}, Failed: ${progress.totalFailed || 0}`);
            broadcastProgress(progress);

            // Broadcast status updates immediately if we have current counts
            if (progress.currentCounts) {
                broadcastStatus(progress.currentCounts);
            }
        };

        const result = await retryFailedEmailsWithProgress(progressCallback);

        console.log('📊 API: Retry process completed with result:', result);
        addLogEntry(`Retry process completed - Sent: ${result?.totalSent || 0}, Failed: ${result?.totalFailed || 0}`);

        // Broadcast final status
        const finalStatus = await getEmailQueueCounts();
        broadcastStatus(finalStatus);

        res.json({
            success: true,
            message: 'Failed emails retry completed',
            totalSent: result?.totalSent || 0,
            totalFailed: result?.totalFailed || 0,
            result: result // Include full result for debugging
        });

    } catch (error) {
        console.error('❌ API Error in /retry:', error);
        addLogEntry(`Error in retry process: ${error.message}`, 'error');
        broadcastProgress({ type: 'error', error: error.message });

        res.status(500).json({
            success: false,
            error: error.message || 'Failed to retry emails'
        });
    }
});

// Debug endpoint to check user counts
router.get('/debug', async (req, res) => {
    try {
        console.log('🔍 API: Debug - Checking user counts...');

        const { User } = require('../../src/app/user/user_model');

        const totalUsers = await User.countDocuments({});
        const activeUsers = await User.countDocuments({ isDeleted: false, isActive: true });
        const usersWithEmail = await User.countDocuments({
            isDeleted: false,
            isActive: true,
            email: { $exists: true, $ne: null }
        });
        const targetUsers = await User.countDocuments({
            isResetPasswordDialog: false,
            isDeleted: false,
            isActive: true,
            email: { $exists: true, $ne: null }
        });

        // Get a sample of target users (first 5)
        const sampleUsers = await User.find({
            isResetPasswordDialog: false,
            isDeleted: false,
            isActive: true,
            email: { $exists: true, $ne: null }
        }).select('_id firstName email isResetPasswordDialog').limit(5).lean();

        res.json({
            success: true,
            debug: {
                totalUsers,
                activeUsers,
                usersWithEmail,
                targetUsers,
                sampleUsers: sampleUsers.map(user => ({
                    id: user._id,
                    firstName: user.firstName ? 'encrypted' : 'null',
                    email: user.email ? 'encrypted' : 'null',
                    isResetPasswordDialog: user.isResetPasswordDialog
                }))
            }
        });

    } catch (error) {
        console.error('❌ API Error in /debug:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get debug info'
        });
    }
});

// Get email queue status and details
router.get('/status', async (req, res) => {
    try {
        console.log('📊 API: Checking email queue status...');

        const [statusCounts, emailDetails] = await Promise.all([
            checkEmailQueueStatus(),
            getEmailQueueDetails()
        ]);

        // Transform status counts for easier frontend consumption
        const statusCountsMap = {};
        statusCounts.forEach(row => {
            statusCountsMap[row.status.toLowerCase()] = row.count;
        });

        res.json({
            success: true,
            statusCounts: statusCountsMap,
            emails: emailDetails,
            totalEmails: emailDetails.length
        });

    } catch (error) {
        console.error('❌ API Error in /status:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get email queue status'
        });
    }
});

// Get detailed email queue information
router.get('/details', async (req, res) => {
    try {
        const { status, limit = 50 } = req.query;

        console.log(`📋 API: Getting email queue details (status: ${status || 'all'}, limit: ${limit})`);

        const emailDetails = await getEmailQueueDetails(status, parseInt(limit));

        res.json({
            success: true,
            emails: emailDetails,
            totalEmails: emailDetails.length,
            filters: { status, limit }
        });

    } catch (error) {
        console.error('❌ API Error in /details:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get email queue details'
        });
    }
});

// Clear completed emails from queue
router.delete('/clear-sent', async (req, res) => {
    try {
        console.log('🧹 API: Clearing sent emails from queue...');

        const result = await clearSentEmails();

        res.json({
            success: true,
            message: `Cleared ${result.deletedCount} sent emails from queue`,
            deletedCount: result.deletedCount
        });

    } catch (error) {
        console.error('❌ API Error in /clear-sent:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to clear sent emails'
        });
    }
});

// Store logs in memory for streaming to UI
let logBuffer = [];
const MAX_LOG_ENTRIES = 100;

// SSE clients for real-time updates
let sseClients = [];

// Function to add log entry
function addLogEntry(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, message, level };

    logBuffer.push(logEntry);
    if (logBuffer.length > MAX_LOG_ENTRIES) {
        logBuffer = logBuffer.slice(-MAX_LOG_ENTRIES);
    }

    // Send to SSE clients
    broadcastToSSEClients({
        type: 'log',
        data: logEntry
    });

    // Also log to console
    console.log(`[${timestamp}] ${message}`);
}

// Function to broadcast progress updates to SSE clients
function broadcastProgress(data) {
    broadcastToSSEClients({
        type: 'progress',
        data: data
    });
}

// Function to broadcast status updates to SSE clients
function broadcastStatus(data) {
    broadcastToSSEClients({
        type: 'status',
        data: data
    });
}

// Function to send data to all SSE clients
function broadcastToSSEClients(message) {
    const data = JSON.stringify(message);
    sseClients.forEach((client, index) => {
        try {
            client.write(`data: ${data}\n\n`);
        } catch (error) {
            console.error('Error sending SSE data to client:', error);
            // Remove dead client
            sseClients.splice(index, 1);
        }
    });
}

// Get recent logs
router.get('/logs', (req, res) => {
    try {
        const { limit = 50 } = req.query;
        const recentLogs = logBuffer.slice(-parseInt(limit));

        res.json({
            success: true,
            logs: recentLogs,
            totalLogs: logBuffer.length
        });

    } catch (error) {
        console.error('❌ API Error in /logs:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get logs'
        });
    }
});

// Clear logs
router.delete('/logs', (req, res) => {
    try {
        logBuffer = [];
        res.json({
            success: true,
            message: 'Logs cleared successfully'
        });

    } catch (error) {
        console.error('❌ API Error in /logs clear:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to clear logs'
        });
    }
});

// SSE endpoint for real-time updates
router.get('/progress', (req, res) => {
    // Set headers for SSE
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Add client to the list
    sseClients.push(res);
    addLogEntry(`SSE client connected. Total clients: ${sseClients.length}`);

    // Send initial connection message
    res.write(`data: ${JSON.stringify({
        type: 'connected',
        data: { message: 'Connected to real-time updates', timestamp: new Date().toISOString() }
    })}\n\n`);

    // Handle client disconnect
    req.on('close', () => {
        const index = sseClients.indexOf(res);
        if (index !== -1) {
            sseClients.splice(index, 1);
            console.log(`SSE client disconnected. Remaining clients: ${sseClients.length}`);
        }
    });

    req.on('error', (error) => {
        console.error('SSE client error:', error);
        const index = sseClients.indexOf(res);
        if (index !== -1) {
            sseClients.splice(index, 1);
        }
    });
});

module.exports = router;