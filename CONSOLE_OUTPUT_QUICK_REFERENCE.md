# Console Output Quick Reference

## What You'll See When Background Process Runs

### ✅ Success Flow (Normal Operation)

```
🚀 [PARENT] Starting background process...
✅ [PARENT] Child process forked with PID: 12345
✅ [PARENT] Learning plan job queued for 25 users

🔄 [CHILD 12345] Background process started
🔌 [CHILD 12345] Connecting to database...
✅ [CHILD 12345] Database connected
🔍 [CHILD 12345] Fetching active learning plans...
📋 [CHILD 12345] Found 15 active learning plans
⚙️  [CHILD 12345] Starting learning plan filtering...
✅ [CHILD 12345] Learning plans filtered successfully in 3.45s
✅ [CHILD 12345] Background process completed successfully

✅ [PARENT] Child process completed successfully
✅ [PARENT] Child process exited successfully (code: 0)
```

**Duration**: 3-10 seconds depending on user count and learning plans

---

### ℹ️ No Work Needed

```
ℹ️  No users to process for learning plan auto-enrollment
```

OR

```
📋 [CHILD 12345] Found 0 active learning plans
ℹ️  [CHILD 12345] No active learning plans found - exiting
```

**Duration**: <1 second

---

### ❌ Error Flow

```
⚠️  [CHILD 12345] Error filtering learning plans: <error message>
❌ [CHILD 12345] Background process failed
📝 [CHILD 12345] Error: <error details>

❌ [PARENT] Child process failed
⚠️  [PARENT] Child process exited with code 1
```

**Action**: Check error message and stack trace

---

## Quick Troubleshooting

| What You See                       | What It Means                | Action                          |
| ---------------------------------- | ---------------------------- | ------------------------------- |
| `✅ [PARENT] Child process forked` | Process started successfully | ✅ Normal                       |
| `✅ [CHILD] Database connected`    | DB connection OK             | ✅ Normal                       |
| `📋 Found 0 active learning plans` | No learning plans configured | ℹ️ Expected if no plans         |
| `📋 Found 0 user conditions`       | Users not found or deleted   | ⚠️ Check user IDs               |
| `filtered successfully in X.XXs`   | Processing completed         | ✅ Normal (note duration)       |
| `❌ Background process failed`     | Error occurred               | ❌ Check error details          |
| `exited with code 1`               | Process crashed              | ❌ Check logs above             |
| `💥 Uncaught exception`            | Unexpected error             | ❌ Critical - check stack trace |

---

## Performance Benchmarks

| Users  | Learning Plans | Expected Duration |
| ------ | -------------- | ----------------- |
| 1-10   | 1-20           | 1-3 seconds       |
| 11-50  | 1-20           | 3-7 seconds       |
| 51-100 | 1-20           | 7-15 seconds      |
| 100+   | 1-20           | 15-30 seconds     |

**Note**: Times vary based on server performance and database load

---

## Operations You'll See

| Operation           | When It Happens          |
| ------------------- | ------------------------ |
| `register`          | User registration        |
| `assign_role`       | Admin role assigned      |
| `remove_role`       | Role removed             |
| `vessel_assignment` | Vessel assigned to user  |
| `vessel_update`     | Vessel details updated   |
| `group_update`      | Group membership changed |

---

## Log Levels

| Symbol | Level    | Meaning    |
| ------ | -------- | ---------- |
| 🚀     | INFO     | Starting   |
| ✅     | SUCCESS  | Completed  |
| 🔄     | INFO     | Processing |
| 🔌     | INFO     | Database   |
| 🔍     | INFO     | Fetching   |
| 📋     | INFO     | Results    |
| ⚙️     | INFO     | Working    |
| ℹ️     | INFO     | Notice     |
| ⚠️     | WARNING  | Issue      |
| ❌     | ERROR    | Failed     |
| 💥     | CRITICAL | Crash      |

---

## Grep Commands for Monitoring

```bash
# Find all background process starts
grep "🚀 \[PARENT\]" app.log

# Find all errors
grep "❌" app.log

# Find slow operations (>10 seconds)
grep "filtered successfully" app.log | grep -E "[1-9][0-9]\.[0-9]{2}s"

# Count operations by type
grep "Operation:" app.log | sort | uniq -c

# Find specific PID
grep "\[CHILD 12345\]" app.log

# Find failed processes
grep "exited with code [^0]" app.log
```

---

## What's Normal vs. What's Not

### ✅ Normal

-   Process completes in 1-30 seconds
-   Exit code 0
-   "filtered successfully" message
-   No active learning plans (if none configured)
-   No user conditions (if users deleted)

### ⚠️ Investigate

-   Process takes >30 seconds
-   Multiple retries
-   Frequent "No user conditions" messages
-   Database connection timeouts

### ❌ Critical

-   Exit code 1 or higher
-   Uncaught exceptions
-   Database connection failures
-   Multiple consecutive failures
-   Process doesn't exit

---

## Need More Details?

See `BACKGROUND_PROCESS_CONSOLE_OUTPUT.md` for complete examples and scenarios.
