# Quick Start: Elasticsearch to MongoDB Migration

## 🚀 Quick Migration (5 Steps)

### Step 1: Run the Migration Script

```bash
node scripts/migrate-elastic-to-mongodb.js
```

This will:

-   Create the `user_search_cache` collection
-   Copy all user data from existing collections
-   Create optimized indexes
-   Take ~2-5 minutes for 10,000 users

### Step 2: Test the Migration

```bash
node scripts/test-mongodb-search.js
```

This will verify:

-   Cache is populated
-   Search works correctly
-   Filters work
-   Pagination works
-   Sorting works

### Step 3: Start Your Application

```bash
npm start
```

Look for this log message:

```
User Search Cache (MongoDB) is connected
```

### Step 4: Test in Your Application

Test these features:

-   [ ] User search by name
-   [ ] User search by email
-   [ ] Filter by designation
-   [ ] Filter by vessel
-   [ ] Filter by role
-   [ ] Pagination
-   [ ] Sorting

### Step 5: Monitor for 24 Hours

-   Check application logs for errors
-   Monitor MongoDB performance
-   Verify search results are correct

## ✅ What Was Changed

### Code Changes (Automatic)

All files now use `user_search_helper.js` instead of `elastic_helper.js`:

-   ✅ `app.js` - Updated
-   ✅ `src/app/user/user_resolver.js` - Updated
-   ✅ `src/app/user/employee/employee_resolver.js` - Updated
-   ✅ `src/app/user/employee/employee_helper.js` - Updated
-   ✅ `src/app/reports/reports_resolver.js` - Updated
-   ✅ All other files - Updated

### New Files Created

-   ✅ `src/app/user/user_search_cache/user_search_cache_model.js` - New model
-   ✅ `src/util/user_search_helper.js` - New helper (replaces elastic_helper.js)
-   ✅ `scripts/migrate-elastic-to-mongodb.js` - Migration script
-   ✅ `scripts/test-mongodb-search.js` - Test script

### Database Changes

-   ✅ New collection: `user_search_cache`
-   ✅ Indexes created automatically
-   ✅ No changes to existing collections

## 📊 Before vs After

### Before (Elasticsearch)

```
User Request → API → MongoDB (User/Employee)
                  ↓
                  → Elasticsearch (Search)
                  ↓
                  ← Search Results
```

### After (MongoDB Only)

```
User Request → API → MongoDB (user_search_cache)
                  ↓
                  ← Search Results
```

## 🎯 Benefits

1. **No Sync Required** - Single source of truth
2. **Simpler Architecture** - One database instead of two
3. **Lower Costs** - No Elasticsearch hosting
4. **Faster Development** - Easier local setup
5. **Better Consistency** - No sync delays

## 🔧 Troubleshooting

### Problem: Migration script fails

**Solution**: Check MongoDB connection in `.env`

```bash
# Verify connection
mongo "your_mongodb_uri"
```

### Problem: Search returns no results

**Solution**: Check cache is populated

```javascript
// In MongoDB shell
db.user_search_cache.countDocuments();
```

### Problem: Search is slow

**Solution**: Check indexes are created

```javascript
// In MongoDB shell
db.user_search_cache.getIndexes();
```

### Problem: Need to re-run migration

**Solution**: Just run the script again

```bash
node scripts/migrate-elastic-to-mongodb.js
```

It will update existing records.

## 📞 Need Help?

1. Check logs: `tail -f logs/app.log`
2. Test search: `node scripts/test-mongodb-search.js`
3. Check cache: `db.user_search_cache.countDocuments()`
4. Re-run migration: `node scripts/migrate-elastic-to-mongodb.js`

## 🎉 Success Criteria

Migration is successful when:

-   ✅ Migration script completes without errors
-   ✅ Test script passes all tests
-   ✅ Application starts without errors
-   ✅ User search works in the application
-   ✅ All filters work correctly
-   ✅ No performance degradation

## 📝 Next Steps (After 1 Week)

If everything works well:

1. Remove Elasticsearch infrastructure
2. Delete old sync scripts (optional)
3. Remove Elasticsearch dependencies (optional)
4. Update team documentation

---

**Estimated Time**: 30 minutes
**Downtime Required**: None (zero-downtime migration)
**Rollback Time**: 5 minutes (if needed)
