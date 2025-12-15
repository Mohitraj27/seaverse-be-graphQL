# Learning Plan Background Process Implementation

## Overview

This document describes the implementation of background processing for learning plan filtering operations. The goal is to offload time-consuming learning plan evaluation and auto-enrollment operations to child processes, preventing them from blocking the main API responses.

## Problem Statement

The `filterLearningPlans` function performs complex operations:

-   Evaluates conditional custom fields for each user
-   Queries multiple collections (LearningPlan, Employee, LearningPlanAssignment)
-   Performs bulk insertions for auto-enrollment
-   Can take several seconds when processing many users

When called synchronously during user operations (register, role changes, etc.), this causes:

-   Slow API response times
-   Poor user experience
-   Potential timeouts on bulk operations

## Solution

Offload learning plan filtering to background child processes using Node.js `child_process.fork()`.

## Architecture

### Components

1. **learning_plan_helper.js** - Main helper that spawns background processes
2. **learning_plan_background_process.js** - Child process that executes the filtering
3. **child_process_db_helper.js** - Database connection helper for child processes

### Flow

```
API Request (Register/Role Change)
    ↓
Main Process: Update user data
    ↓
Main Process: Return success response immediately
    ↓
Background Process: Fork child process
    ↓
Background Process: Connect to DB
    ↓
Background Process: Fetch learning plans & user conditions
    ↓
Background Process: Execute filterLearningPlans
    ↓
Background Process: Close DB & exit
```

## Implementation Details

### 1. Background Process Helper

**File:** `src/app/user/employee/learning_plan_helper.js`

```javascript
function processLearningPlansInBackground(userIds, operation, context)
```

**Parameters:**

-   `userIds` - Array of user IDs to process
-   `operation` - Operation type: 'register', 'unregister', 'assign_role', 'remove_role', 'delete', 'vessel_assignment', 'vessel_update', 'group_update'
-   `context` - GraphQL context (minimal version without circular references)

**Features:**

-   Spawns child process using `fork()`
-   Sends minimal data to avoid serialization issues
-   Handles child process messages, errors, and exit codes
-   Non-blocking - returns immediately
-   Graceful error handling (doesn't throw)

### 2. Background Process Worker

**File:** `src/app/user/employee/learning_plan_background_process.js`

**Responsibilities:**

-   Receives message from parent process
-   Connects to MongoDB
-   Fetches active learning plans
-   Fetches user conditions (Employee + User data with populations)
-   Calls `filterLearningPlans` function
-   Sends success/failure message back to parent
-   Closes DB connection and exits

**Error Handling:**

-   Catches all errors and reports back to parent
-   Handles uncaught exceptions and unhandled rejections
-   Always closes DB connection before exit

### 3. Integration Points

The background process is integrated in `employee_resolver.js` at these locations:

#### Register Employee

```javascript
if (learningPlans?.length > 0) {
    processLearningPlansInBackground(input.users, "register", context);
}
```

#### Assign Role

```javascript
if (validSubRole.name === Roles.ADMIN && sendOnlyRegisteredUsers?.length > 0) {
    processLearningPlansInBackground(users, "assign_role", context);
}
```

#### Remove Role

```javascript
if (updateUserRole?.nModified > 0 && registeredUsers?.length > 0) {
    processLearningPlansInBackground(input.users, "remove_role", context);
}
```

#### Vessel Assignment (Single User)

**File:** `src/app/user/user-vessel-bridge/userVessel_resolver.js`

```javascript
processLearningPlansInBackground([input.userId], "vessel_assignment", context);
```

#### Vessel Update (All Users on Vessel)

**File:** `src/app/vessle/vessel_resolver.js`

```javascript
const userIdsOnVessel = userIds.map(u => u._id);
processLearningPlansInBackground(userIdsOnVessel, "vessel_update", context);
```

#### Group Update (All Group Members)

**File:** `src/app/user/group-user/group_resolver.js`

```javascript
processLearningPlansInBackground(allUniqueUserIds, "group_update", context);
```

### 4. When NOT to Use Background Process

**Single User Creation with Transaction:**
When creating a single user within a transaction (with session parameter), keep the synchronous call:

```javascript
const filteredPlans = await filterLearningPlans(learningPlans, conditions, context, session);
```

This ensures the learning plan assignment is part of the atomic transaction.

## Benefits

1. **Faster API Responses** - User operations return immediately without waiting for learning plan processing
2. **Better User Experience** - No perceived lag during registration or role changes
3. **Scalability** - Can handle bulk operations without blocking
4. **Isolation** - Learning plan failures don't affect main operation success
5. **Resource Management** - Child processes are automatically cleaned up after completion

## Monitoring

The implementation includes comprehensive logging:

-   `✅` Success messages when background process completes
-   `❌` Error messages if background process fails
-   `⚠️` Warning messages for edge cases
-   `ℹ️` Info messages for no-op scenarios

Example logs:

```
✅ Learning plan job queued for 25 users (register)
🔄 Starting background learning plan filtering for 25 users (register)
✅ Learning plans filtered successfully for 25 users (register)
✅ Background learning plan filtering completed for register
```

## Testing

### Manual Test Script

Run the test script to verify background processing:

```bash
node scripts/test-learning-plan-background.js
```

This script:

-   Connects to MongoDB
-   Finds test users
-   Triggers background processes for different operations
-   Monitors completion

### Integration Testing

Test in the actual application:

1. Register multiple users
2. Check logs for background process messages
3. Verify learning plan assignments are created
4. Confirm API response time is fast

## Limitations

1. **No Transaction Support** - Background processes cannot participate in parent transactions
2. **Eventual Consistency** - Learning plan assignments happen after the main operation
3. **No Direct Error Feedback** - Errors in background process don't affect API response

## Future Enhancements

1. **Queue System** - Replace child processes with a proper job queue (Bull, BullMQ)
2. **Retry Logic** - Implement automatic retries for failed background jobs
3. **Progress Tracking** - Store job status in database for monitoring
4. **Batch Processing** - Group multiple operations into batches
5. **Priority Queue** - Prioritize certain operations over others

## Related Files

-   `src/app/user/employee/learning_plan_helper.js` - Background process spawner
-   `src/app/user/employee/learning_plan_background_process.js` - Child process worker
-   `src/app/user/employee/employee_helper.js` - filterLearningPlans function
-   `src/app/user/employee/employee_resolver.js` - Employee operations integration
-   `src/app/vessle/vessel_resolver.js` - Vessel operations integration
-   `src/app/user/user-vessel-bridge/userVessel_resolver.js` - Vessel assignment integration
-   `src/app/user/group-user/group_resolver.js` - Group operations integration
-   `src/util/child_process_db_helper.js` - Database helper for child processes
-   `scripts/test-learning-plan-background.js` - Test script

## Rollback Plan

If issues arise, revert to synchronous processing by replacing:

```javascript
processLearningPlansInBackground(userIds, operation, context);
```

With:

```javascript
await filterLearningPlans(learningPlans, userConditions, context);
```

## Deployment Notes

1. Ensure Node.js child process support is available in production environment
2. Monitor memory usage - each child process creates a new Node.js instance
3. Consider process limits on the server
4. Test with production-like data volumes
5. Monitor logs for background process failures
