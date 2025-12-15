require('dotenv').config();
const mongoose = require('mongoose');
const { Client } = require('@opensearch-project/opensearch');
const { UserSearchCache } = require('../src/app/user/user_search_cache/user_search_cache_model');

// OpenSearch client
const osClient = new Client({
    node: process.env.OPENSEARCH_URL || 'http://localhost:9200',
    auth: {
        username: process.env.OPENSEARCH_USERNAME || 'admin',
        password: process.env.OPENSEARCH_PASSWORD || 'admin'
    }
});

const BATCH_SIZE = 100; // Process 100 users at a time
const OS_INDEX = 'users'; // OpenSearch index name

async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGO_DB, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ MongoDB connected successfully');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
}

async function initializeScroll() {
    try {
        const response = await osClient.search({
            index: OS_INDEX,
            scroll: '2m', // Keep scroll context alive for 2 minutes
            size: BATCH_SIZE,
            body: {
                query: {
                    match_all: {}
                },
                _source: ['userId', 'enrolledCourses', 'averageCourseProgress']
            }
        });

        return {
            scrollId: response.body._scroll_id,
            hits: response.body.hits.hits,
            total: response.body.hits.total.value
        };
    } catch (error) {
        console.error('❌ Error initializing scroll:', error.message);
        throw error;
    }
}

async function fetchNextScrollBatch(scrollId) {
    try {
        const response = await osClient.scroll({
            scroll_id: scrollId,
            scroll: '2m'
        });

        return {
            scrollId: response.body._scroll_id,
            hits: response.body.hits.hits
        };
    } catch (error) {
        console.error('❌ Error fetching scroll batch:', error.message);
        throw error;
    }
}

async function clearScroll(scrollId) {
    try {
        await osClient.clearScroll({
            scroll_id: scrollId
        });
        console.log('✅ Scroll context cleared');
    } catch (error) {
        console.error('⚠️  Error clearing scroll:', error.message);
    }
}

async function updateMongoDBBatch(users) {
    if (!users || users.length === 0) {
        return { updated: 0, errors: 0 };
    }

    const bulkOps = users.map(user => ({
        updateOne: {
            filter: { userId: user.userId },
            update: {
                $set: {
                    enrolledCourses: user.enrolledCourses || 0,
                    averageCourseProgress: user.averageCourseProgress || 0.0,
                    updatedAt: new Date()
                }
            }
        }
    }));

    try {
        const result = await UserSearchCache.bulkWrite(bulkOps, { ordered: false });
        return {
            updated: result.modifiedCount || 0,
            matched: result.matchedCount || 0,
            errors: 0
        };
    } catch (error) {
        console.error('❌ Error updating MongoDB batch:', error.message);
        return {
            updated: 0,
            matched: 0,
            errors: users.length
        };
    }
}

async function migrateCourseProgress() {
    console.log('\n🚀 Starting migration of course progress from OpenSearch to MongoDB...\n');

    try {
        // Connect to MongoDB
        await connectDB();

        // Check OpenSearch connection
        const osHealth = await osClient.ping();
        if (!osHealth) {
            throw new Error('OpenSearch is not reachable');
        }
        console.log('✅ OpenSearch connected successfully\n');

        // Initialize scroll and get total count
        const { scrollId: initialScrollId, hits: initialHits, total } = await initializeScroll();
        console.log(`📊 Total users in OpenSearch: ${total}\n`);

        if (total === 0) {
            console.log('ℹ️  No users found in OpenSearch. Exiting...');
            return;
        }

        let processedCount = 0;
        let updatedCount = 0;
        let matchedCount = 0;
        let errorCount = 0;
        let scrollId = initialScrollId;
        let hits = initialHits;
        let batchNumber = 1;

        // Process in batches using scroll API
        while (hits && hits.length > 0) {
            console.log(`\n📦 Processing batch ${batchNumber}: ${processedCount + 1} to ${processedCount + hits.length} of ${total}`);

            // Transform data
            const usersToUpdate = hits.map(hit => ({
                userId: hit._source.userId,
                enrolledCourses: hit._source.enrolledCourses || 0,
                averageCourseProgress: hit._source.averageCourseProgress || 0.0
            }));

            // Update MongoDB batch
            const result = await updateMongoDBBatch(usersToUpdate);

            processedCount += hits.length;
            updatedCount += result.updated;
            matchedCount += result.matched;
            errorCount += result.errors;

            console.log(`   ✓ Processed: ${hits.length} users`);
            console.log(`   ✓ Matched: ${result.matched} users`);
            console.log(`   ✓ Updated: ${result.updated} users`);
            if (result.errors > 0) {
                console.log(`   ⚠️  Errors: ${result.errors} users`);
            }

            // Fetch next batch using scroll
            const scrollResult = await fetchNextScrollBatch(scrollId);
            scrollId = scrollResult.scrollId;
            hits = scrollResult.hits;
            batchNumber++;

            // Small delay to avoid overwhelming the database
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Clear scroll context
        await clearScroll(scrollId);

        console.log('\n' + '='.repeat(60));
        console.log('✅ Migration completed successfully!');
        console.log('='.repeat(60));
        console.log(`📊 Summary:`);
        console.log(`   • Total processed: ${processedCount} users`);
        console.log(`   • Total matched: ${matchedCount} users`);
        console.log(`   • Total updated: ${updatedCount} users`);
        console.log(`   • Total errors: ${errorCount} users`);
        console.log('='.repeat(60) + '\n');

    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    } finally {
        // Close connections
        await mongoose.connection.close();
        console.log('✅ MongoDB connection closed');
        process.exit(0);
    }
}

// Run the migration
migrateCourseProgress().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
});
