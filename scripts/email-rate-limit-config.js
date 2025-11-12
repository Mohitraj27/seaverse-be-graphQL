// Email Rate Limiting Configuration
// Adjust these values based on your email service provider limits

module.exports = {
    // AWS SES default limits (can be increased by request)
    AWS_SES: {
        emailsPerSecond: 14,
        batchSize: 20,
        delayBetweenEmails: 72, // 1000ms / 14 emails = ~72ms
        delayBetweenBatches: 2000,
        maxRetries: 3
    },

    // Gmail API limits
    GMAIL_API: {
        emailsPerSecond: 1, // Conservative estimate based on quota limits
        batchSize: 10,
        delayBetweenEmails: 1000, // 1 second between emails
        delayBetweenBatches: 5000,
        maxRetries: 3
    },

    // Custom high-volume configuration (for verified high-limit accounts)
    HIGH_VOLUME: {
        emailsPerSecond: 20,
        batchSize: 20,
        delayBetweenEmails: 50, // 50ms = 20 emails per second
        delayBetweenBatches: 2000,
        maxRetries: 3
    },

    // Conservative configuration (safest option)
    CONSERVATIVE: {
        emailsPerSecond: 5,
        batchSize: 10,
        delayBetweenEmails: 200, // 200ms = 5 emails per second
        delayBetweenBatches: 3000,
        maxRetries: 3
    }
};