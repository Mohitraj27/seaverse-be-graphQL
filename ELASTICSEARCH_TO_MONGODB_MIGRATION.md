# Elasticsearch to MongoDB Migration Guide

## Overview

This migration replaces Elasticsearch/OpenSearch with a denormalized MongoDB collection (`user_search_cache`) for user search functionality. This eliminates the need for a separate search engine and simplifies the architecture.

## What Changed

### Before

-   **Elasticsearch/OpenSearch** - Separate search engine for user data
-   **Index**: `users` in Elasticsearch
-   **Client**: `@opensearch-project/opensearch`
-   **Sync Required**: Bidirectional sync between MongoDB and Elasticsearch

### After

-   **MongoDB Collection**: `user_search_cache` (denormalized)
-   **No Separate Engine**: All data in MongoDB
-   **No Sync Required**: Single source of truth
-   **Same API**: All function signatures remain the same

## New Files Created

### 1. **src/app/user/user_search_cache/user_search_cache_model.js**

-   Mongoose model for the denormalized user search cache
-   Contains all user, employee, vessel, and designation data in one document
-   Optimized indexes for fast queries

### 2. **src/util/user_search_helper.js**

-   Drop-in replacement for `elastic_helper.js`
-   Same function signatures and behavior
-   MongoDB implementation instead of Elasticsearch

### 3. **scripts/migrate-elastic-to-mongodb.js**

-   Migration script to populate the new collection
-   Copies all data from existing User/Employee collections
-   Runs in batches for performance

## Migration Steps

### Step 1: Backup Your Data

```bash
# Backup MongoDB
mongodump --uri="your_mongodb_uri" --out=./backup

# Backup Elasticsearch (optional, for rollback)
# Use your Elasticsearch backup tool
```

### Step 2: Run the Migration Script

```bash
# This will create the user_search_cache collection and populate it
node scripts/migrate-elastic-to-mongodb.js
```

Expected output:

```
✅ Connected to MongoDB
📑 Creating indexes...
✅ Indexes created successfully
📊 Counting users...
📦 Found 10000 users to migrate
📦 Processing in batches of 500

🔄 Processing batch 1/20...
  ✅ Migrated 500 users (5% complete)
...
✅ Migration complete!
   Total migrated: 10000
   Skipped: 0
   Errors: 0
```

### Step 3: Test the Application

```bash
# Start your application
npm start

# Check the logs for:
# "User Search Cache (MongoDB) is connected"
```

### Step 4: Verify Search Functionality

Test these key features:

-   User search by name
-   User search by email
-   User search by civil ID
-   Filtering by designation
-   Filtering by vessel
-   Filtering by role
-   Pagination and sorting

### Step 5: Update Environment Variables (Optional)

You can remove these from `.env` (no longer needed):

```
# OPENSEARCH_URL=...
# OPENSEARCH_USERNAME=...
# OPENSEARCH_PASSWORD=...
```

## Files Updated

All files that previously used `elastic_helper.js` now use `user_search_helper.js`:

### Application Files (12 files)

1. `app.js`
2. `bulkuserdelete.js`
3. `src/app/user/user_resolver.js`
4. `src/app/user/user_helper.js`
5. `src/app/user/employee/employee_resolver.js`
6. `src/app/user/employee/employee_helper.js`
7. `src/app/user/user-profile/user_profile_resolver.js`
8. `src/app/user/user-profile/user_profile_helper.js`
9. `src/app/user/user-vessel-bridge/userVessel_resolver.js`
10. `src/app/vessle/vessel_resolver.js`
11. `src/app/training-registrations/training_registration_helper.js`
12. `src/app/training-registrations/overall-course-progress/overall_progress_helper.js`
13. `src/app/reports/reports_resolver.js`
14. `src/app/signup-request/signup-request-resolver.js`
15. `src/rest/user-registration-flag-api.js`

### Scripts (No Changes Required)

Scripts in the `scripts/` folder that use Elasticsearch directly will continue to work but are no longer needed:

-   `scripts/sync-opensearch-mongodb.js` - No longer needed
-   `scripts/verify-mongodb-elastic-sync.js` - No longer needed
-   All debug scripts - No longer needed

You can keep them for reference or delete them.

## API Compatibility

All functions maintain the same signature:

```javascript
// Before (Elasticsearch)
const { searchEmployeesFromElastic } = require("./src/util/elastic_helper");

// After (MongoDB)
const { searchEmployeesFromElastic } = require("./src/util/user_search_helper");

// Usage remains exactly the same
const results = await searchEmployeesFromElastic({
    indexName: "users",
    filterInput: { search: "john" },
    skip: 0,
    limit: 10,
});
```

## Performance Considerations

### Indexes Created

The migration script creates these indexes automatically:

-   Text index on: firstName, lastName, email, civilIdOrPassport, designation, vesselName, UID
-   Compound indexes for common query patterns
-   Individual indexes on frequently filtered fields

### Query Performance

-   **Search queries**: Similar performance to Elasticsearch for most queries
-   **Exact matches**: Faster (no network hop)
-   **Complex filters**: Similar performance
-   **Pagination**: Efficient with proper indexes

### Recommendations

1. **Monitor query performance** after migration
2. **Add indexes** if you notice slow queries
3. **Use MongoDB Atlas** for automatic index recommendations
4. **Consider sharding** if you have millions of users

## Data Synchronization

### Automatic Updates

The `user_search_helper.js` functions automatically update the cache:

-   `indexDocumenttoElasticSearch()` - Creates/updates cache entry
-   `updateDocumenttoElasticSearch()` - Updates cache entry
-   `deleteDocumenttoElasticSearch()` - Removes cache entry
-   `bulkIndexDocumentsToElasticSearch()` - Bulk creates/updates

### When Cache is Updated

The cache is automatically updated when:

-   User is created
-   User profile is updated
-   Employee data changes
-   Vessel assignment changes
-   Role changes
-   Any field in the cache model changes

### Manual Sync (if needed)

If you need to rebuild the cache:

```bash
node scripts/migrate-elastic-to-mongodb.js
```

## Rollback Plan

If you need to rollback:

### Step 1: Restore Old Code

```bash
git checkout <previous-commit>
```

### Step 2: Update Imports

Change all files back to:

```javascript
const { ... } = require('./src/util/elastic_helper');
```

### Step 3: Restart Elasticsearch Sync

```bash
node scripts/sync-opensearch-mongodb.js
```

### Step 4: Drop New Collection (optional)

```javascript
db.user_search_cache.drop();
```

## Benefits of This Migration

1. **Simplified Architecture**

    - No separate search engine to maintain
    - No sync jobs required
    - Single source of truth

2. **Reduced Infrastructure Costs**

    - No Elasticsearch/OpenSearch hosting costs
    - Reduced complexity

3. **Easier Development**

    - No need to keep two systems in sync
    - Simpler local development setup
    - Fewer moving parts

4. **Better Data Consistency**

    - No sync delays
    - No sync failures
    - Immediate consistency

5. **Easier Debugging**
    - All data in one place
    - Standard MongoDB queries
    - Familiar tools

## Monitoring

### Check Cache Size

```javascript
db.user_search_cache.stats();
```

### Check Index Usage

```javascript
db.user_search_cache.aggregate([{ $indexStats: {} }]);
```

### Check Query Performance

```javascript
db.user_search_cache.find({ ... }).explain("executionStats")
```

## Troubleshooting

### Issue: Search is slow

**Solution**: Check if indexes are created

```javascript
db.user_search_cache.getIndexes();
```

### Issue: Search returns no results

**Solution**: Check if cache is populated

```javascript
db.user_search_cache.countDocuments();
```

### Issue: Data is outdated

**Solution**: Re-run migration

```bash
node scripts/migrate-elastic-to-mongodb.js
```

### Issue: Memory issues

**Solution**: Increase batch size in migration script or add more indexes

## Support

If you encounter issues:

1. Check the logs for errors
2. Verify indexes are created
3. Check cache is populated
4. Test queries directly in MongoDB
5. Compare with old Elasticsearch queries

## Next Steps

After successful migration:

1. ✅ Monitor performance for 1-2 weeks
2. ✅ Remove Elasticsearch infrastructure
3. ✅ Delete old sync scripts
4. ✅ Update documentation
5. ✅ Remove Elasticsearch dependencies from package.json (optional)

## Cleanup (After Successful Migration)

### Remove Elasticsearch Dependencies (Optional)

```bash
npm uninstall @opensearch-project/opensearch @elastic/elasticsearch
```

### Delete Old Scripts (Optional)

```bash
rm scripts/sync-opensearch-mongodb.js
rm scripts/verify-mongodb-elastic-sync.js
rm scripts/debug-elastic-*.js
rm scripts/add-fullname-to-elastic.js
```

### Remove Old Helper (Optional)

```bash
rm src/util/elastic_helper.js
```

---

**Migration Date**: December 14, 2025
**Status**: Ready for Production
**Estimated Downtime**: None (zero-downtime migration)
