# Background Process Console Output Guide

## Overview

This document shows the expected console output when the learning plan background process runs.

## Console Output Flow

### 1. Parent Process (Main Application)

When a background process is triggered, you'll see:

```
🚀 [PARENT] Starting background process for learning plan filtering
📊 [PARENT] Operation: register
👥 [PARENT] User count: 25
🆔 [PARENT] User IDs: 507f1f77bcf86cd799439011, 507f1f77bcf86cd799439012, 507f1f77bcf86cd799439013, 507f1f77bcf86cd799439014, 507f1f77bcf86cd799439015...
📂 [PARENT] Process path: /path/to/src/app/user/employee/learning_plan_background_process.js
✅ [PARENT] Child process forked with PID: 12345
📤 [PARENT] Sending data to child process...
✅ [PARENT] Data sent to child process
✅ [PARENT] Learning plan job queued for 25 users (register)
```

### 2. Child Process (Background Worker)

The child process will log its progress:

```
🔄 [CHILD 12345] ========================================
🔄 [CHILD 12345] Background process started
📊 [CHILD 12345] Operation: register
👥 [CHILD 12345] User count: 25
🆔 [CHILD 12345] User IDs: 507f1f77bcf86cd799439011, 507f1f77bcf86cd799439012, 507f1f77bcf86cd799439013, 507f1f77bcf86cd799439014, 507f1f77bcf86cd799439015...
🔄 [CHILD 12345] ========================================

🔌 [CHILD 12345] Connecting to database...
✅ [CHILD 12345] Database connected successfully
🔍 [CHILD 12345] Fetching active learning plans...
📋 [CHILD 12345] Found 15 active learning plans
🔍 [CHILD 12345] Fetching user conditions for 25 users...
📋 [CHILD 12345] Found 25 user conditions
⚙️  [CHILD 12345] Starting learning plan filtering...
📊 [CHILD 12345] Processing 15 plans for 25 users
✅ [CHILD 12345] Learning plans filtered successfully in 3.45s
📊 [CHILD 12345] Operation: register, Users: 25
🔌 [CHILD 12345] Closing database connection...
✅ [CHILD 12345] Database connection closed

✅ [CHILD 12345] ========================================
✅ [CHILD 12345] Background process completed successfully
✅ [CHILD 12345] ========================================
```

### 3. Parent Process (Completion)

When the child process completes, the parent logs:

```
✅ [PARENT] Child process completed successfully
📝 [PARENT] Message: Learning plan filtering completed for register

✅ [PARENT] Child process exited successfully (code: 0)
```

## Complete Example Flow

Here's what you'll see for a complete operation:

```
🚀 [PARENT] Starting background process for learning plan filtering
📊 [PARENT] Operation: assign_role
👥 [PARENT] User count: 50
🆔 [PARENT] User IDs: 507f1f77bcf86cd799439011, 507f1f77bcf86cd799439012, 507f1f77bcf86cd799439013, 507f1f77bcf86cd799439014, 507f1f77bcf86cd799439015...
📂 [PARENT] Process path: C:\project\src\app\user\employee\learning_plan_background_process.js
✅ [PARENT] Child process forked with PID: 23456
📤 [PARENT] Sending data to child process...
✅ [PARENT] Data sent to child process
✅ [PARENT] Learning plan job queued for 50 users (assign_role)

🔄 [CHILD 23456] ========================================
🔄 [CHILD 23456] Background process started
📊 [CHILD 23456] Operation: assign_role
👥 [CHILD 23456] User count: 50
🆔 [CHILD 23456] User IDs: 507f1f77bcf86cd799439011, 507f1f77bcf86cd799439012, 507f1f77bcf86cd799439013, 507f1f77bcf86cd799439014, 507f1f77bcf86cd799439015...
🔄 [CHILD 23456] ========================================

🔌 [CHILD 23456] Connecting to database...
✅ [CHILD 23456] Database connected successfully
🔍 [CHILD 23456] Fetching active learning plans...
📋 [CHILD 23456] Found 20 active learning plans
🔍 [CHILD 23456] Fetching user conditions for 50 users...
📋 [CHILD 23456] Found 48 user conditions
⚙️  [CHILD 23456] Starting learning plan filtering...
📊 [CHILD 23456] Processing 20 plans for 48 users
✅ [CHILD 23456] Learning plans filtered successfully in 5.67s
📊 [CHILD 23456] Operation: assign_role, Users: 50
🔌 [CHILD 23456] Closing database connection...
✅ [CHILD 23456] Database connection closed

✅ [CHILD 23456] ========================================
✅ [CHILD 23456] Background process completed successfully
✅ [CHILD 23456] ========================================

✅ [PARENT] Child process completed successfully
📝 [PARENT] Message: Learning plan filtering completed for assign_role

✅ [PARENT] Child process exited successfully (code: 0)
```

## Error Scenarios

### No Users to Process

```
ℹ️  No users to process for learning plan auto-enrollment
```

### No Active Learning Plans

```
🔄 [CHILD 12345] ========================================
🔄 [CHILD 12345] Background process started
📊 [CHILD 12345] Operation: register
👥 [CHILD 12345] User count: 10
🔄 [CHILD 12345] ========================================

🔌 [CHILD 12345] Connecting to database...
✅ [CHILD 12345] Database connected successfully
🔍 [CHILD 12345] Fetching active learning plans...
📋 [CHILD 12345] Found 0 active learning plans
ℹ️  [CHILD 12345] No active learning plans found - exiting

✅ [PARENT] Child process completed successfully
📝 [PARENT] Message: No active learning plans

✅ [PARENT] Child process exited successfully (code: 0)
```

### No User Conditions Found

```
🔍 [CHILD 12345] Fetching user conditions for 10 users...
📋 [CHILD 12345] Found 0 user conditions
ℹ️  [CHILD 12345] No user conditions found for 10 users - exiting

✅ [PARENT] Child process completed successfully
📝 [PARENT] Message: No user conditions found

✅ [PARENT] Child process exited successfully (code: 0)
```

### Processing Error

```
⚙️  [CHILD 12345] Starting learning plan filtering...
📊 [CHILD 12345] Processing 15 plans for 25 users
⚠️  [CHILD 12345] Error filtering learning plans: ValidationError: Invalid condition
📝 [CHILD 12345] Stack trace: Error: ValidationError...

❌ [CHILD 12345] ========================================
❌ [CHILD 12345] Background process failed
📊 [CHILD 12345] Operation: register
📝 [CHILD 12345] Error: ValidationError: Invalid condition
📝 [CHILD 12345] Stack trace: Error: ValidationError...
❌ [CHILD 12345] ========================================

🔌 [CHILD 12345] Attempting to close database connection...
✅ [CHILD 12345] Database connection closed

❌ [PARENT] Child process failed
📝 [PARENT] Error: ValidationError: Invalid condition

⚠️  [PARENT] Child process exited with code 1
```

### Fork Error

```
❌ [PARENT] Error spawning learning plan background process: Error: spawn ENOENT
📝 [PARENT] Stack trace: Error: spawn ENOENT...
```

## Log Prefixes Explained

| Prefix           | Meaning                        |
| ---------------- | ------------------------------ |
| `🚀 [PARENT]`    | Parent process starting action |
| `✅ [PARENT]`    | Parent process success         |
| `❌ [PARENT]`    | Parent process error           |
| `📊 [PARENT]`    | Parent process info            |
| `🔄 [CHILD PID]` | Child process activity         |
| `✅ [CHILD PID]` | Child process success          |
| `❌ [CHILD PID]` | Child process error            |
| `⚠️ [CHILD PID]` | Child process warning          |
| `ℹ️ [CHILD PID]` | Child process info             |
| `🔌 [CHILD PID]` | Database connection activity   |
| `🔍 [CHILD PID]` | Data fetching activity         |
| `📋 [CHILD PID]` | Data results                   |
| `⚙️ [CHILD PID]` | Processing activity            |
| `💥 [CHILD PID]` | Uncaught exception             |

## Monitoring Tips

1. **Search for errors**: Look for `❌` or `⚠️` in logs
2. **Track PIDs**: Each child process has a unique PID for tracking
3. **Monitor duration**: Check the time reported in "filtered successfully in X.XXs"
4. **Check exit codes**: Code 0 = success, non-zero = error
5. **Watch for patterns**: Multiple failures might indicate a systemic issue

## Production Monitoring

In production, you can:

1. **Grep for failures**:

    ```bash
    grep "❌ \[CHILD" application.log
    ```

2. **Count background jobs**:

    ```bash
    grep "Learning plan job queued" application.log | wc -l
    ```

3. **Find slow operations**:

    ```bash
    grep "filtered successfully" application.log | grep -E "[0-9]{2,}\.[0-9]{2}s"
    ```

4. **Track specific operations**:
    ```bash
    grep "Operation: register" application.log
    ```

## Integration with Logging Services

These logs work well with:

-   **Winston** - Structured logging
-   **Bunyan** - JSON logging
-   **Pino** - Fast logging
-   **CloudWatch** - AWS logging
-   **Datadog** - APM monitoring
-   **New Relic** - Application monitoring

The emoji prefixes make it easy to filter and visualize in log aggregation tools.
