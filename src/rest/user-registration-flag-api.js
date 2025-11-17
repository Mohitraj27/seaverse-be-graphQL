/**
 * API Route for updating isRegistered flag with batching support
 * Handles large-scale updates (10k+ users) efficiently
 */

const express = require('express');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const { Client } = require('@opensearch-project/opensearch');

const router = express.Router();

// Initialize Elasticsearch/OpenSearch client
const esClient = new Client({
    node: process.env.OPENSEARCH_URL,
    auth: {
        username: process.env.OPENSEARCH_USERNAME,
        password: process.env.OPENSEARCH_PASSWORD,
    },
});

const MONGODB_INDEX = 'users';
const ELASTICSEARCH_INDEX = 'users';

class RegisteredFlagUpdater {
    constructor(batchSize = 1000) {
        this.mongoConnection = null;
        this.batchSize = batchSize;
        this.stats = {
            mongoUpdated: 0,
            elasticsearchUpdated: 0,
            errors: [],
            mongoCount: 0,
            elasticsearchCount: 0,
            mongoTrueCount: 0,
            elasticsearchTrueCount: 0,
            mongoFalseCount: 0,
            elasticsearchFalseCount: 0,
            mongoBatches: 0,
            elasticsearchBatches: 0,
            startTime: null,
            endTime: null,
            duration: 0,
        };
    }

    /**
     * Connect to MongoDB if not already connected
     */
    async connectToMongo() {
        try {
            if (!this.mongoConnection || this.mongoConnection.readyState === 0) {
                await mongoose.connect(process.env.MONGO_DB, {
                    useNewUrlParser: true,
                    useUnifiedTopology: true,
                });
                this.mongoConnection = mongoose.connection;
            }
            return true;
        } catch (error) {
            this.stats.errors.push(`MongoDB connection error: ${error.message}`);
            return false;
        }
    }

    /**
     * Connect to Elasticsearch/OpenSearch
     */
    async connectToElasticsearch() {
        try {
            await esClient.info();
            return true;
        } catch (error) {
            this.stats.errors.push(`Elasticsearch connection error: ${error.message}`);
            return false;
        }
    }

    /**
     * Update MongoDB documents with batching
     */
    async updateMongoDB() {
        try {
            const db = this.mongoConnection.db;
            const usersCollection = db.collection(MONGODB_INDEX);

            // Count documents with isRegistered: false
            const countToUpdate = await usersCollection.countDocuments({
                isRegistered: false
            });

            if (countToUpdate === 0) {
                console.log('ℹ️  No users with isRegistered: false found in MongoDB');
                this.stats.mongoCount = 0;
                return;
            }

            this.stats.mongoCount = countToUpdate;
            const totalBatches = Math.ceil(countToUpdate / this.batchSize);

            console.log(`📊 MongoDB: Found ${countToUpdate} users to update`);
            console.log(`📦 Processing in ${totalBatches} batches of ${this.batchSize}\n`);

            let totalUpdated = 0;
            let batchNum = 0;

            // Process in batches using find and skip/limit
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
                    this.stats.errors.push(`MongoDB batch ${batchNum} error: ${batchError.message}`);
                    console.error(`  ❌ Batch ${batchNum} failed: ${batchError.message}`);
                }
            }

            this.stats.mongoUpdated = totalUpdated;
            this.stats.mongoBatches = totalBatches;
            console.log(`\n✅ MongoDB: Total updated: ${totalUpdated}\n`);

        } catch (error) {
            this.stats.errors.push(`MongoDB update error: ${error.message}`);
            console.error(`❌ MongoDB update error: ${error.message}`);
        }
    }

    /**
     * Update Elasticsearch documents with batching using search_after
     */
    async updateElasticsearch() {
        try {
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
            this.stats.elasticsearchCount = countToUpdate;

            if (countToUpdate === 0) {
                console.log('ℹ️  No users with isRegistered: false found in Elasticsearch');
                return;
            }

            const totalBatches = Math.ceil(countToUpdate / this.batchSize);

            console.log(`📊 Elasticsearch: Found ${countToUpdate} users to update`);
            console.log(`📦 Processing in ${totalBatches} batches of ${this.batchSize}\n`);

            let totalUpdated = 0;
            let batchNum = 0;
            let searchAfter = null;

            // Process batches using scroll-like approach with search_after
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

                    // Extract IDs for this batch
                    const ids = hits.map(hit => hit._id);

                    // Update all documents in this batch
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
                    this.stats.errors.push(`Elasticsearch batch ${batchNum} error: ${batchError.message}`);
                    console.error(`  ❌ Batch ${batchNum} failed: ${batchError.message}`);
                }
            }

            this.stats.elasticsearchUpdated = totalUpdated;
            this.stats.elasticsearchBatches = totalBatches;

            // Final refresh
            await esClient.indices.refresh({ index: ELASTICSEARCH_INDEX });
            console.log(`\n✅ Elasticsearch: Total updated: ${totalUpdated}\n`);

        } catch (error) {
            this.stats.errors.push(`Elasticsearch update error: ${error.message}`);
            console.error(`❌ Elasticsearch update error: ${error.message}`);
        }
    }

    /**
     * Verify updates were applied
     */
    async verifyUpdates() {
        try {
            console.log('🔍 Verifying updates...\n');

            // Check MongoDB
            const mongoFalseCount = await this.mongoConnection.db
                .collection(MONGODB_INDEX)
                .countDocuments({ isRegistered: false });

            this.stats.mongoFalseCount = mongoFalseCount;

            // Check Elasticsearch
            const esFalseCount = await esClient.count({
                index: ELASTICSEARCH_INDEX,
                body: {
                    query: {
                        term: { isRegistered: false }
                    }
                }
            });

            this.stats.elasticsearchFalseCount = esFalseCount.body.count;

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

            this.stats.mongoTrueCount = mongoTrueCount;
            this.stats.elasticsearchTrueCount = esTrueCount.body.count;

            console.log(`📊 MongoDB - Users with isRegistered: true: ${mongoTrueCount}`);
            console.log(`📊 MongoDB - Users with isRegistered: false: ${mongoFalseCount}`);
            console.log(`📊 Elasticsearch - Users with isRegistered: true: ${esTrueCount.body.count}`);
            console.log(`📊 Elasticsearch - Users with isRegistered: false: ${esFalseCount.body.count}\n`);

        } catch (error) {
            this.stats.errors.push(`Verification error: ${error.message}`);
        }
    }

    /**
     * Main execution
     */
    async run() {
        this.stats.startTime = new Date();

        try {
            // Connect to databases
            const mongoConnected = await this.connectToMongo();
            const esConnected = await this.connectToElasticsearch();

            if (!mongoConnected || !esConnected) {
                return this.stats;
            }

            // Perform updates
            await this.updateMongoDB();
            await this.updateElasticsearch();

            // Verify updates
            await this.verifyUpdates();

            return this.stats;
        } catch (error) {
            this.stats.errors.push(`Fatal error: ${error.message}`);
            return this.stats;
        } finally {
            this.stats.endTime = new Date();
            this.stats.duration = this.stats.endTime - this.stats.startTime; // in milliseconds
        }
    }
}

/**
 * API Endpoint: POST /api/users/update-registered-flag
 * Query params:
 *   - batchSize (optional): Number of documents per batch (default: 1000)
 * 
 * Example: POST /api/users/update-registered-flag?batchSize=500
 */
router.post('/update-registered-flag', async (req, res) => {
    try {
        const batchSize = parseInt(req.query.batchSize) || 1000;

        console.log(`\n🚀 Starting batch update with batch size: ${batchSize}`);
        const updater = new RegisteredFlagUpdater(batchSize);
        const result = await updater.run();

        const success = result.errors.length === 0;

        res.json({
            success,
            data: {
                mongoUpdated: result.mongoUpdated,
                mongoCount: result.mongoCount,
                mongoTrueCount: result.mongoTrueCount,
                mongoFalseCount: result.mongoFalseCount,
                mongoBatches: result.mongoBatches,
                elasticsearchUpdated: result.elasticsearchUpdated,
                elasticsearchCount: result.elasticsearchCount,
                elasticsearchTrueCount: result.elasticsearchTrueCount,
                elasticsearchFalseCount: result.elasticsearchFalseCount,
                elasticsearchBatches: result.elasticsearchBatches,
                batchSize: batchSize,
            },
            performance: {
                startTime: result.startTime,
                endTime: result.endTime,
                durationMs: result.duration,
                durationSec: (result.duration / 1000).toFixed(2),
            },
            errors: result.errors,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * API Endpoint: GET /api/users/registered-flag-stats
 * Get current statistics without updating
 */
router.get('/registered-flag-stats', async (req, res) => {
    try {
        await mongoose.connect(process.env.MONGO_DB, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        const mongoConnection = mongoose.connection;
        const startTime = new Date();
        const stats = {};

        // MongoDB stats
        const mongoFalseCount = await mongoConnection.db
            .collection(MONGODB_INDEX)
            .countDocuments({ isRegistered: false });

        const mongoTrueCount = await mongoConnection.db
            .collection(MONGODB_INDEX)
            .countDocuments({ isRegistered: true });

        // Elasticsearch stats
        const esFalseCount = await esClient.count({
            index: ELASTICSEARCH_INDEX,
            body: {
                query: {
                    term: { isRegistered: false }
                }
            }
        });

        const esTrueCount = await esClient.count({
            index: ELASTICSEARCH_INDEX,
            body: {
                query: {
                    term: { isRegistered: true }
                }
            }
        });

        stats.mongoFalseCount = mongoFalseCount;
        stats.mongoTrueCount = mongoTrueCount;
        stats.mongoTotal = mongoFalseCount + mongoTrueCount;
        stats.elasticsearchFalseCount = esFalseCount.body.count;
        stats.elasticsearchTrueCount = esTrueCount.body.count;
        stats.elasticsearchTotal = esFalseCount.body.count + esTrueCount.body.count;

        await mongoose.disconnect();

        const endTime = new Date();

        res.json({
            success: true,
            data: stats,
            performance: {
                queryDurationMs: endTime - startTime,
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
