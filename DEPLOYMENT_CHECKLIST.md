# Deployment Checklist: Elasticsearch to MongoDB Migration

## Pre-Deployment

### 1. Backup

-   [ ] Backup MongoDB database
    ```bash
    mongodump --uri="your_mongodb_uri" --out=./backup-$(date +%Y%m%d)
    ```
-   [ ] Backup Elasticsearch (optional, for rollback)
-   [ ] Backup application code
    ```bash
    git commit -am "Pre-migration backup"
    git tag pre-elasticsearch-migration
    ```

### 2. Review Changes

-   [ ] Review all updated files (15 files)
-   [ ] Check `IMPLEMENTATION_SUMMARY.md`
-   [ ] Understand rollback plan
-   [ ] Review `MIGRATION_INSTRUCTIONS.md`

### 3. Environment Check

-   [ ] MongoDB connection working
-   [ ] Sufficient disk space (estimate: 2x current user data)
-   [ ] MongoDB version >= 4.0 (for text search)
-   [ ] Node.js version compatible

---

## Deployment Steps

### Step 1: Deploy Code Changes

-   [ ] Pull latest code
    ```bash
    git pull origin main
    ```
-   [ ] Install dependencies (if needed)
    ```bash
    npm install
    ```
-   [ ] Verify all files updated
    ```bash
    grep -r "user_search_helper" src/
    ```

### Step 2: Run Migration

-   [ ] Run migration script
    ```bash
    node scripts/migrate-elastic-to-mongodb.js
    ```
-   [ ] Verify migration output
    -   [ ] No errors in output
    -   [ ] Total migrated matches expected count
    -   [ ] Indexes created successfully

### Step 3: Test Migration

-   [ ] Run test script
    ```bash
    node scripts/test-mongodb-search.js
    ```
-   [ ] Verify all tests pass
    -   [ ] Cache size correct
    -   [ ] Simple search works
    -   [ ] Name search works
    -   [ ] Filters work
    -   [ ] Pagination works
    -   [ ] Sorting works
    -   [ ] Indexes exist

### Step 4: Start Application

-   [ ] Start application
    ```bash
    npm start
    # or
    pm2 restart app
    ```
-   [ ] Check logs for connection message
    ```
    "User Search Cache (MongoDB) is connected"
    ```
-   [ ] No errors in startup logs

### Step 5: Smoke Tests

-   [ ] Test user search in UI
-   [ ] Test search by name
-   [ ] Test search by email
-   [ ] Test filters (designation, vessel, role)
-   [ ] Test pagination
-   [ ] Test sorting
-   [ ] Test user creation (cache updates)
-   [ ] Test user update (cache updates)
-   [ ] Test user deletion (cache updates)

---

## Post-Deployment

### Immediate (First Hour)

-   [ ] Monitor application logs
    ```bash
    tail -f logs/app.log
    ```
-   [ ] Check for errors
-   [ ] Monitor MongoDB performance
    ```javascript
    db.currentOp();
    db.serverStatus();
    ```
-   [ ] Verify search response times
-   [ ] Check cache size
    ```javascript
    db.user_search_cache.countDocuments();
    ```

### First Day

-   [ ] Monitor user feedback
-   [ ] Check error logs
-   [ ] Monitor MongoDB metrics
    -   [ ] Query performance
    -   [ ] Index usage
    -   [ ] Disk usage
-   [ ] Verify data consistency
    ```bash
    node scripts/test-mongodb-search.js
    ```

### First Week

-   [ ] Analyze query performance
-   [ ] Check slow query log
-   [ ] Optimize indexes if needed
-   [ ] Gather user feedback
-   [ ] Document any issues

---

## Verification Tests

### Functional Tests

-   [ ] **Search by first name**
    -   Input: "john"
    -   Expected: Returns users with firstName containing "john"
-   [ ] **Search by last name**
    -   Input: "doe"
    -   Expected: Returns users with lastName containing "doe"
-   [ ] **Search by full name**
    -   Input: "john doe"
    -   Expected: Returns users with firstName="john" AND lastName="doe"
-   [ ] **Search by email**
    -   Input: "john@example.com"
    -   Expected: Returns user with that email
-   [ ] **Search by civil ID**
    -   Input: "ABC123"
    -   Expected: Returns user with that civil ID
-   [ ] **Filter by designation**
    -   Expected: Only users with selected designation
-   [ ] **Filter by vessel**
    -   Expected: Only users on selected vessel
-   [ ] **Filter by role**
    -   Expected: Only users with selected role
-   [ ] **Filter by registration status**
    -   Expected: Only registered/unregistered users
-   [ ] **Pagination**
    -   Expected: Different results on different pages
-   [ ] **Sorting ascending**
    -   Expected: Results sorted A-Z
-   [ ] **Sorting descending**
    -   Expected: Results sorted Z-A

### Performance Tests

-   [ ] **Simple search < 100ms**
    ```bash
    time node -e "require('./scripts/test-mongodb-search.js')"
    ```
-   [ ] **Complex search < 200ms**
-   [ ] **Bulk operations < 1s per 100 records**
-   [ ] **Cache update < 50ms**

### Data Integrity Tests

-   [ ] **Cache count matches user count**
    ```javascript
    const userCount = await User.countDocuments({ isDeleted: false });
    const cacheCount = await UserSearchCache.countDocuments();
    console.log(userCount === cacheCount ? "PASS" : "FAIL");
    ```
-   [ ] **Sample data matches**
    -   Pick 10 random users
    -   Compare User collection with cache
    -   Verify all fields match
-   [ ] **Encrypted data correct**
    -   Verify firstName, lastName, email are encrypted
    -   Verify encryption matches User collection

---

## Rollback Plan

### If Issues Detected

#### Minor Issues (Search not working perfectly)

1. [ ] Check logs for specific errors
2. [ ] Re-run migration
    ```bash
    node scripts/migrate-elastic-to-mongodb.js
    ```
3. [ ] Restart application
4. [ ] Test again

#### Major Issues (Application broken)

1. [ ] Stop application
    ```bash
    pm2 stop app
    ```
2. [ ] Revert code changes
    ```bash
    git checkout pre-elasticsearch-migration
    ```
3. [ ] Restart application
    ```bash
    pm2 start app
    ```
4. [ ] Restart Elasticsearch sync
    ```bash
    node scripts/sync-opensearch-mongodb.js
    ```
5. [ ] Verify Elasticsearch working
6. [ ] Drop new collection (optional)
    ```javascript
    db.user_search_cache.drop();
    ```

**Estimated Rollback Time**: 5 minutes

---

## Success Criteria

Migration is successful when ALL of these are true:

### Technical Criteria

-   [ ] Migration script completed without errors
-   [ ] Test script passes all tests
-   [ ] Application starts without errors
-   [ ] No errors in application logs
-   [ ] Cache size matches user count
-   [ ] All indexes created
-   [ ] Search response time < 200ms

### Functional Criteria

-   [ ] User search works
-   [ ] All filters work
-   [ ] Pagination works
-   [ ] Sorting works
-   [ ] User creation updates cache
-   [ ] User update updates cache
-   [ ] User deletion updates cache

### Business Criteria

-   [ ] No user complaints
-   [ ] No performance degradation
-   [ ] No data loss
-   [ ] No downtime

---

## Monitoring Metrics

### Application Metrics

-   [ ] Search request count
-   [ ] Search response time (avg, p95, p99)
-   [ ] Error rate
-   [ ] Cache hit rate

### Database Metrics

-   [ ] MongoDB CPU usage
-   [ ] MongoDB memory usage
-   [ ] MongoDB disk I/O
-   [ ] Query execution time
-   [ ] Index usage
-   [ ] Collection size

### Business Metrics

-   [ ] User search success rate
-   [ ] User satisfaction
-   [ ] Support tickets related to search

---

## Communication Plan

### Before Deployment

-   [ ] Notify team of deployment
-   [ ] Share deployment window
-   [ ] Share rollback plan
-   [ ] Assign on-call person

### During Deployment

-   [ ] Update status in team chat
-   [ ] Report progress
-   [ ] Report any issues immediately

### After Deployment

-   [ ] Announce completion
-   [ ] Share test results
-   [ ] Share monitoring dashboard
-   [ ] Document any issues

---

## Documentation Updates

### After Successful Deployment

-   [ ] Update README.md
-   [ ] Update architecture diagrams
-   [ ] Update API documentation
-   [ ] Update team wiki
-   [ ] Archive old Elasticsearch docs

---

## Cleanup (After 1 Week)

### If Migration Successful

-   [ ] Remove Elasticsearch infrastructure
-   [ ] Delete old sync scripts (optional)
    ```bash
    rm scripts/sync-opensearch-mongodb.js
    rm scripts/verify-mongodb-elastic-sync.js
    rm scripts/debug-elastic-*.js
    ```
-   [ ] Remove Elasticsearch dependencies (optional)
    ```bash
    npm uninstall @opensearch-project/opensearch @elastic/elasticsearch
    ```
-   [ ] Remove old helper (optional)
    ```bash
    rm src/util/elastic_helper.js
    ```
-   [ ] Update .env (remove Elasticsearch vars)
-   [ ] Update documentation

---

## Sign-Off

### Deployment Team

-   [ ] Developer: ********\_******** Date: **\_\_\_**
-   [ ] QA: ********\_******** Date: **\_\_\_**
-   [ ] DevOps: ********\_******** Date: **\_\_\_**
-   [ ] Product Owner: ********\_******** Date: **\_\_\_**

### Post-Deployment Review

-   [ ] All tests passed: Yes / No
-   [ ] Performance acceptable: Yes / No
-   [ ] No critical issues: Yes / No
-   [ ] Ready for production: Yes / No

---

## Notes

### Issues Encountered

```
[Document any issues here]
```

### Resolutions

```
[Document resolutions here]
```

### Lessons Learned

```
[Document lessons learned here]
```

---

**Deployment Date**: ******\_\_\_******
**Deployment Time**: ******\_\_\_******
**Deployed By**: ******\_\_\_******
**Status**: ⬜ Pending | ⬜ In Progress | ⬜ Complete | ⬜ Rolled Back
