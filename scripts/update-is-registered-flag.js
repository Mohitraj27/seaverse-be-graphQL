#!/usr/bin/env node

/**
 * Update isRegistered Flag to True for All Users - WITH BATCHING
 * 
 * Efficiently updates the isRegistered flag from false to true for all users
 * in both MongoDB and Elasticsearch (OpenSearch) with batch processing.
 * 
 * Supports large datasets (10k+ users) with configurable batch sizes.
 * 
 * Usage: 
 *   node scripts/update-is-registered-flag.js
 *   node scripts/update-is-registered-flag.js 2000  (with custom batch size)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const { Client } = require('@opensearch-project/opensearch');

// Constants
const MONGODB_INDEX = 'users';
const ELASTICSEARCH_INDEX = 'users';
const DEFAULT_BATCH_SIZE = 1000;

// Initialize Elasticsearch/OpenSearch client
const esClient = new Client({
    node: process.env.OPENSEARCH_URL,
    auth: {
        username: process.env.OPENSEARCH_USERNAME,
        password: process.env.OPENSEARCH_PASSWORD,
    },
});

class RegisteredFlagUpdater {
    constructor(batchSize = DEFAULT_BATCH_SIZE) {
        this.mongoConnection = null;
        this.batchSize = batchSize;
        this.stats = {
            mongoUpdated: 0,
            elasticsearchUpdated: 0,
            mongoBatches: 0,
            elasticsearchBatches: 0,
            errors: 0,
            startTime: null,
            endTime: null,
            duration: 0,
        };
    }

    /**
     * Connect to MongoDB
     */
    async connectToMongo() {
        try {
            console.log('🔌 Connecting to MongoDB...');
            await mongoose.connect(process.env.MONGO_DB, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
            });
            this.mongoConnection = mongoose.connection;
            console.log('✅ Connected to MongoDB');
            return true;
        } catch (error) {
            console.error('❌ MongoDB connection error:', error.message);
            return false;
        }
    }

    /**
     * Connect to Elasticsearch/OpenSearch
     */
    async connectToElasticsearch() {
        try {
            console.log('🔌 Connecting to Elasticsearch/OpenSearch...');
            await esClient.info();
            console.log('✅ Connected to Elasticsearch/OpenSearch');
            return true;
        } catch (error) {
            console.error('❌ Elasticsearch connection error:', error.message);
            return false;
        }
    }

    /**
     * Update MongoDB documents with batching
     */
    async updateMongoDB() {
        try {
            console.log('\n📝 Updating MongoDB users...');

            const db = this.mongoConnection.db;
            const usersCollection = db.collection(MONGODB_INDEX);

            // Count documents with isRegistered: false
            const countToUpdate = await usersCollection.countDocuments({
                isRegistered: false
            });

            if (countToUpdate === 0) {
                console.log('ℹ️  No users with isRegistered: false found in MongoDB');
                return;
            }

            const totalBatches = Math.ceil(countToUpdate / this.batchSize);
            console.log(`📊 Found ${countToUpdate} users to update`);
            console.log(`📦 Processing in ${totalBatches} batches of ${this.batchSize}\n`);

            let totalUpdated = 0;
            let batchNum = 0;

            // Process in batches
            for (let i = 0; i < totalBatches; i++) {
                batchNum++;
                const skip = i * this.batchSize;

                try {
                    // Fetch IDs for this batch
                    const batch = await usersCollection
                        .find({ isRegistered: false })
                        .skip(skip)
                        .limit(this.batchSize)
                        .project({ _id: 1 })
                        .toArray();

                    if (batch.length === 0) break;

                    const ids = batch.map(doc => doc._id);

                    // Update this batch
                    const result = await usersCollection.updateMany(
                        { _id: { $in: ids } },
                        {
                            $set: {
                                isRegistered: true,
                                updatedAt: new Date()
                            }
                        }
                    );

                    totalUpdated += result.modifiedCount;
                    const progress = Math.round((batchNum / totalBatches) * 100);
                    console.log(`  ✅ Batch ${batchNum}/${totalBatches} (${progress}%) - Updated: ${result.modifiedCount}`);

                } catch (batchError) {
                    console.error(`  ❌ Batch ${batchNum} error: ${batchError.message}`);
                    this.stats.errors++;
                }
            }

            this.stats.mongoUpdated = totalUpdated;
            this.stats.mongoBatches = totalBatches;
            console.log(`\n✅ MongoDB: Total updated: ${totalUpdated}\n`);

        } catch (error) {
            console.error('❌ MongoDB update error:', error.message);
            this.stats.errors++;
        }
    }

    /**
     * Update Elasticsearch documents with batching using search_after
     */
    async updateElasticsearch() {
        try {
            console.log('\n📝 Updating Elasticsearch/OpenSearch users...');

            // Count documents with isRegistered: false
            const countResponse = await esClient.count({
                index: ELASTICSEARCH_INDEX,
                body: {
                    query: {
                        term: { isRegistered: false }
                    }
                }
            });

            const countToUpdate = countResponse.body.count;

            if (countToUpdate === 0) {
                console.log('ℹ️  No users with isRegistered: false found in Elasticsearch');
                return;
            }

            const totalBatches = Math.ceil(countToUpdate / this.batchSize);
            console.log(`📊 Found ${countToUpdate} users to update`);
            console.log(`📦 Processing in ${totalBatches} batches of ${this.batchSize}\n`);

            let totalUpdated = 0;
            let batchNum = 0;
            let searchAfter = null;

            // Process batches using search_after
            while (batchNum < totalBatches) {
                batchNum++;

                try {
                    // Build search query
                    const searchBody = {
                        query: {
                            term: { isRegistered: false }
                        },
                        size: this.batchSize,
                        sort: [{ _id: 'asc' }]
                    };

                    if (searchAfter) {
                        searchBody.search_after = searchAfter;
                    }

                    // Get batch IDs
                    const searchResponse = await esClient.search({
                        index: ELASTICSEARCH_INDEX,
                        body: searchBody
                    });

                    const hits = searchResponse.body.hits.hits;
                    if (hits.length === 0) break;

                    // Get the last document's sort values for next iteration
                    const lastHit = hits[hits.length - 1];
                    searchAfter = lastHit.sort;

                    // Extract IDs
                    const ids = hits.map(hit => hit._id);

                    // Update batch
                    const updateBody = {
                        query: {
                            ids: { values: ids }
                        },
                        script: {
                            source: 'ctx._source.isRegistered = params.value; ctx._source.updatedAt = params.timestamp;',
                            lang: 'painless',
                            params: {
                                value: true,
                                timestamp: new Date().toISOString()
                            }
                        }
                    };

                    const updateResponse = await esClient.updateByQuery({
                        index: ELASTICSEARCH_INDEX,
                        refresh: batchNum === totalBatches,
                        body: updateBody,
                        conflicts: 'proceed'
                    });

                    totalUpdated += updateResponse.body.updated;
                    const progress = Math.round((batchNum / totalBatches) * 100);
                    console.log(`  ✅ Batch ${batchNum}/${totalBatches} (${progress}%) - Updated: ${updateResponse.body.updated}`);

                } catch (batchError) {
                    console.error(`  ❌ Batch ${batchNum} error: ${batchError.message}`);
                    this.stats.errors++;
                }
            }

            this.stats.elasticsearchUpdated = totalUpdated;
            this.stats.elasticsearchBatches = totalBatches;

            // Final refresh
            await esClient.indices.refresh({ index: ELASTICSEARCH_INDEX });
            console.log(`\n✅ Elasticsearch: Total updated: ${totalUpdated}\n`);

        } catch (error) {
            console.error('❌ Elasticsearch update error:', error.message);
            this.stats.errors++;
        }
    }

    /**
     * Verify updates were applied
     */
    async verifyUpdates() {
        try {
            console.log('🔍 Verifying updates...\n');

            // Check MongoDB
            const mongoCount = await this.mongoConnection.db
                .collection(MONGODB_INDEX)
                .countDocuments({ isRegistered: false });

            // Check Elasticsearch
            const esCount = await esClient.count({
                index: ELASTICSEARCH_INDEX,
                body: {
                    query: {
                        term: { isRegistered: false }
                    }
                }
            });

            // Check count with isRegistered: true
            const mongoTrueCount = await this.mongoConnection.db
                .collection(MONGODB_INDEX)
                .countDocuments({ isRegistered: true });

            const esTrueCount = await esClient.count({
                index: ELASTICSEARCH_INDEX,
                body: {
                    query: {
                        term: { isRegistered: true }
                    }
                }
            });

            console.log(`📊 MongoDB - Users with isRegistered: true: ${mongoTrueCount}`);
            console.log(`📊 MongoDB - Users with isRegistered: false: ${mongoCount}`);
            console.log(`📊 Elasticsearch - Users with isRegistered: true: ${esTrueCount.body.count}`);
            console.log(`📊 Elasticsearch - Users with isRegistered: false: ${esCount.body.count}\n`);

        } catch (error) {
            console.error('❌ Verification error:', error.message);
            this.stats.errors++;
        }
    }

    /**
     * Main execution
     */
    async run() {
        this.stats.startTime = new Date();

        console.log('═══════════════════════════════════════════════════════════');
        console.log('🚀 Starting isRegistered Flag Update (BATCHED)');
        console.log(`📦 Batch Size: ${this.batchSize} documents`);
        console.log('═══════════════════════════════════════════════════════════\n');

        try {
            // Connect to databases
            const mongoConnected = await this.connectToMongo();
            const esConnected = await this.connectToElasticsearch();

            if (!mongoConnected || !esConnected) {
                console.error('\n❌ Failed to connect to one or more databases');
                process.exit(1);
            }

            // Perform updates
            await this.updateMongoDB();
            await this.updateElasticsearch();

            // Verify updates
            await this.verifyUpdates();

            // Display summary
            this.displaySummary();

        } catch (error) {
            console.error('❌ Fatal error:', error.message);
            this.stats.errors++;
        } finally {
            await this.cleanup();
        }
    }

    /**
     * Display summary
     */
    displaySummary() {
        this.stats.endTime = new Date();
        this.stats.duration = this.stats.endTime - this.stats.startTime;

        console.log('═══════════════════════════════════════════════════════════');
        console.log('📋 Update Summary');
        console.log('═══════════════════════════════════════════════════════════');
        console.log(`✅ MongoDB documents updated: ${this.stats.mongoUpdated} (${this.stats.mongoBatches} batches)`);
        console.log(`✅ Elasticsearch documents updated: ${this.stats.elasticsearchUpdated} (${this.stats.elasticsearchBatches} batches)`);
        console.log(`⚠️  Errors encountered: ${this.stats.errors}`);
        console.log(`⏱️  Total duration: ${(this.stats.duration / 1000).toFixed(2)}s`);
        console.log('═══════════════════════════════════════════════════════════\n');
    }

    /**
     * Cleanup connections
     */
    async cleanup() {
        try {
            if (this.mongoConnection) {
                await mongoose.disconnect();
                console.log('🔌 Disconnected from MongoDB');
            }
        } catch (error) {
            console.error('Error during cleanup:', error.message);
        }
    }
}

// Get batch size from command line argument or use default
const batchSizeArg = process.argv[2];
const batchSize = batchSizeArg ? parseInt(batchSizeArg) : DEFAULT_BATCH_SIZE;

// Run the script
const updater = new RegisteredFlagUpdater(batchSize);
updater.run().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
