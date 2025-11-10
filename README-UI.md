# Password Reset Reminder - Web UI

A web-based interface to manage password reset reminder emails for users who haven't reset their passwords.

## Access

Once the server is running, access the UI at:

```
http://localhost:YOUR_PORT/password-reset-reminder
```

## Features

### 📧 Email Management

-   **Send New Emails**: Queue and send emails to all users with `isResetPasswordDialog: false`
-   **Retry Failed Emails**: Retry emails that previously failed (up to 3 attempts each)
-   **Refresh Status**: Check current email queue status and statistics

### 📊 Real-time Status Dashboard

-   **Pending**: Emails waiting to be sent
-   **Sent**: Successfully delivered emails
-   **Failed**: Emails that failed after maximum retries

### 📋 Email Queue Details

-   View detailed information about each email in the queue
-   Filter by status (pending, sent, failed)
-   See retry counts and timestamps
-   Monitor email delivery progress

### 🔍 Activity Log

-   Real-time logging of all operations
-   Detailed error messages and success confirmations
-   Timestamped entries for audit trail

## How to Use

1. **Start the Server**: Make sure your Node.js server is running
2. **Open the UI**: Navigate to `/password-reset-reminder` in your browser
3. **Check Status**: Click "Refresh Status" to see current queue state
4. **Send Emails**: Click "Send New Emails" to queue and send new emails
5. **Monitor Progress**: Watch the activity log and status cards update in real-time
6. **Retry if Needed**: Use "Retry Failed Emails" for any failed deliveries

## API Endpoints

The UI communicates with these backend endpoints:

-   `POST /api/password-reset-reminder/send` - Send new emails
-   `POST /api/password-reset-reminder/retry` - Retry failed emails
-   `GET /api/password-reset-reminder/status` - Get queue status and details
-   `GET /api/password-reset-reminder/details` - Get detailed email information
-   `DELETE /api/password-reset-reminder/clear-sent` - Clear sent emails from queue

## Email Template

Uses the existing `sendWelcomeEmail` template with:

-   Professional Seaverse branding
-   Responsive design for all devices
-   "Welcome Back to Seaverse!" messaging
-   Clear call-to-action button linking to login page
-   Step-by-step guide link for user assistance

## Technical Details

-   **Frontend**: Vanilla JavaScript with modern CSS
-   **Backend**: Express.js routes with SQLite queue management
-   **Database**: SQLite for email queue, MongoDB for user data
-   **Email Service**: AWS SES via existing helper functions
-   **Batch Processing**: 20 emails per batch with retry logic
-   **Real-time Updates**: Automatic status refresh and progress tracking

## Security

-   Only accessible when server is running
-   Uses existing authentication and security measures
-   No sensitive data exposed in frontend
-   Secure API endpoints with error handling

## Troubleshooting

### Common Issues

1. **"Failed to send emails"**

    - Check AWS SES configuration
    - Verify environment variables
    - Check server logs for detailed errors

2. **"No users found"**

    - Verify MongoDB connection
    - Check user data and `isResetPasswordDialog` field
    - Ensure users have valid email addresses

3. **UI not loading**
    - Verify server is running
    - Check that routes are properly configured
    - Ensure static files are being served

### Logs

Check the server console for detailed logging:

-   Email sending progress
-   Error messages with stack traces
-   Database operation results
-   API request/response details

## Monitoring

The UI provides comprehensive monitoring:

-   Real-time status updates
-   Detailed email queue information
-   Success/failure statistics
-   Activity log with timestamps
-   Retry count tracking

Perfect for administrators to monitor and manage password reset reminder campaigns efficiently.
