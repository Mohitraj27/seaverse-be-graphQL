# Quick Reference: MongoDB Search (Replaces Elasticsearch)

## 🔄 Import Changes

### Before

```javascript
const { searchEmployeesFromElastic } = require("./src/util/elastic_helper");
```

### After

```javascript
const { searchEmployeesFromElastic } = require("./src/util/user_search_helper");
```

**Note**: Function names and signatures remain exactly the same!

---

## 📚 Available Functions

All functions work identically to the Elasticsearch version:

### 1. Index/Create Document

```javascript
await indexDocumenttoElasticSearch("users", userId, {
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    // ... other fields
});
```

### 2. Update Document

```javascript
await updateDocumenttoElasticSearch("users", userId, {
    firstName: "Jane",
    updatedAt: new Date(),
});
```

### 3. Delete Document

```javascript
await deleteDocumenttoElasticSearch("users", userId);
```

### 4. Get Document

```javascript
// Get single document
const user = await getDocumentfromElasticSearch("users", userId);

// Get all documents
const allUsers = await getDocumentfromElasticSearch("users");
```

### 5. Search with Filters

```javascript
const results = await searchEmployeesFromElastic({
    indexName: "users",
    filterInput: {
        search: "john", // Search term
        empDesignation: ["id1"], // Filter by designation
        vesselName: ["id2"], // Filter by vessel
        role: ["LEARNER"], // Filter by role
        isRegistered: true, // Filter by registration
        vesselStatus: ["ONSHORE"], // Filter by vessel status
    },
    sortField: "firstName", // Sort field
    sortOrder: "asc", // Sort order
    skip: 0, // Pagination offset
    limit: 10, // Page size
});

// Results format
console.log(results.total); // Total count
console.log(results.employees); // Array of users
```

### 6. Update by Query

```javascript
await updateByQueryToElasticSearch(
    "users",
    "ctx._source.isActive = params.value", // Script
    { term: { userId: "user123" } }, // Query
    { value: true } // Params
);
```

### 7. Delete by Query

```javascript
await deleteByQueryFromElasticSearch("users", { term: { isDeleted: true } });
```

### 8. Bulk Index

```javascript
await bulkIndexDocumentsToElasticSearch("users", [
    { id: "user1", firstName: "John", lastName: "Doe" },
    { id: "user2", firstName: "Jane", lastName: "Smith" },
]);
```

### 9. Bulk Update

```javascript
await bulkUpdateDocumentsInElastic("users", [
    { id: "user1", isActive: true },
    { id: "user2", isActive: false },
]);
```

---

## 🔍 Search Examples

### Simple Text Search

```javascript
const results = await searchEmployeesFromElastic({
    indexName: "users",
    filterInput: { search: "john" },
    skip: 0,
    limit: 10,
});
```

### Full Name Search

```javascript
const results = await searchEmployeesFromElastic({
    indexName: "users",
    filterInput: { search: "john doe" }, // Searches firstName + lastName
    skip: 0,
    limit: 10,
});
```

### Search with Multiple Filters

```javascript
const results = await searchEmployeesFromElastic({
    indexName: "users",
    filterInput: {
        search: "john",
        role: ["LEARNER"],
        isRegistered: true,
        vesselStatus: ["ONSHORE"],
    },
    skip: 0,
    limit: 10,
});
```

### Search with Sorting

```javascript
const results = await searchEmployeesFromElastic({
    indexName: "users",
    filterInput: { search: "john" },
    sortField: "lastName",
    sortOrder: "desc",
    skip: 0,
    limit: 10,
});
```

### Pagination

```javascript
// Page 1
const page1 = await searchEmployeesFromElastic({
    indexName: "users",
    filterInput: {},
    skip: 0,
    limit: 20,
});

// Page 2
const page2 = await searchEmployeesFromElastic({
    indexName: "users",
    filterInput: {},
    skip: 20,
    limit: 20,
});
```

---

## 🗄️ Database Collection

### Collection Name

```
user_search_cache
```

### Key Fields

```javascript
{
    userId: ObjectId,              // User ID (primary key)
    employeeId: ObjectId,          // Employee ID
    firstName: String,             // Encrypted
    lastName: String,              // Encrypted
    email: String,                 // Encrypted
    civilIdOrPassport: String,     // Encrypted
    designation: String,           // Designation name
    empDesignation: ObjectId,      // Designation ID
    vesselName: String,            // Vessel name
    currentVessel: ObjectId,       // Vessel ID
    vesselStatus: String,          // ONSHORE/OFFSHORE
    role: String,                  // LEARNER/ADMIN
    subRoles: [ObjectId],          // Sub-roles
    isRegistered: Boolean,         // Registration flag
    isDeleted: Boolean,            // Deletion flag
    isActive: Boolean,             // Active flag
    // ... 30+ more fields
}
```

---

## 🛠️ Maintenance Commands

### Check Cache Size

```javascript
db.user_search_cache.countDocuments();
```

### Check Indexes

```javascript
db.user_search_cache.getIndexes();
```

### Rebuild Cache

```bash
node scripts/migrate-elastic-to-mongodb.js
```

### Test Search

```bash
node scripts/test-mongodb-search.js
```

### Query Cache Directly

```javascript
const { UserSearchCache } = require("./src/app/user/user_search_cache/user_search_cache_model");

// Find users
const users = await UserSearchCache.find({ isDeleted: false }).limit(10);

// Count users
const count = await UserSearchCache.countDocuments({ role: "LEARNER" });

// Search by name
const results = await UserSearchCache.find({
    firstName: { $regex: "john", $options: "i" },
});
```

---

## ⚡ Performance Tips

### 1. Use Indexes

All common queries are indexed automatically. Check with:

```javascript
db.user_search_cache.getIndexes();
```

### 2. Limit Results

Always use pagination:

```javascript
{ skip: 0, limit: 20 }  // Good
{ skip: 0, limit: 1000 } // Bad (slow)
```

### 3. Use Specific Filters

More filters = faster queries:

```javascript
// Slower
{ search: 'john' }

// Faster
{ search: 'john', role: ['LEARNER'], isDeleted: false }
```

### 4. Monitor Query Performance

```javascript
db.user_search_cache.find({ ... }).explain("executionStats")
```

---

## 🐛 Debugging

### Check if Cache is Populated

```javascript
const count = await UserSearchCache.countDocuments();
console.log(`Cache has ${count} users`);
```

### Check Specific User

```javascript
const user = await UserSearchCache.findOne({ userId: "user123" });
console.log(user);
```

### Check Search Query

```javascript
const results = await searchEmployeesFromElastic({
    indexName: "users",
    filterInput: { search: "test" },
    skip: 0,
    limit: 1,
});
console.log("Total:", results.total);
console.log("Results:", results.employees);
```

### Enable MongoDB Query Logging

```javascript
mongoose.set("debug", true);
```

---

## 🔄 Migration Commands

### Initial Migration

```bash
node scripts/migrate-elastic-to-mongodb.js
```

### Test Migration

```bash
node scripts/test-mongodb-search.js
```

### Re-run Migration (Safe)

```bash
# Can be run multiple times
node scripts/migrate-elastic-to-mongodb.js
```

---

## 📊 Monitoring

### Check Collection Stats

```javascript
db.user_search_cache.stats();
```

### Check Index Usage

```javascript
db.user_search_cache.aggregate([{ $indexStats: {} }]);
```

### Check Slow Queries

```javascript
db.setProfilingLevel(2); // Enable profiling
db.system.profile.find().sort({ millis: -1 }).limit(10);
```

---

## ❓ FAQ

**Q: Do I need to change my code?**
A: No! All function names and signatures are the same.

**Q: How do I rebuild the cache?**
A: Run `node scripts/migrate-elastic-to-mongodb.js`

**Q: Is it slower than Elasticsearch?**
A: Similar performance for most queries, faster for exact matches.

**Q: Can I query the cache directly?**
A: Yes! Use the `UserSearchCache` model.

**Q: What if I need to rollback?**
A: Just revert the code changes and restart Elasticsearch sync.

---

## 📞 Need Help?

1. Check logs: `tail -f logs/app.log`
2. Test search: `node scripts/test-mongodb-search.js`
3. Check cache: `db.user_search_cache.countDocuments()`
4. Read docs: `ELASTICSEARCH_TO_MONGODB_MIGRATION.md`

---

**Last Updated**: December 14, 2025
**Version**: 1.0
