const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { Parser } = require('json2csv');
const { Client } = require('@opensearch-project/opensearch');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Import Models (only for course count)
const { OverallTrainingProgress } = require('../src/app/training-registrations/overall-course-progress/overall_progress_model');

// Import decrypt function
const { decrypt } = require('../src/util/encryption_helper');

// Initialize Elasticsearch/OpenSearch client
const esClient = new Client({
    node: process.env.OPENSEARCH_URL,
    auth: {
        username: process.env.OPENSEARCH_USERNAME,
        password: process.env.OPENSEARCH_PASSWORD,
    },
});

const generateUserCourseCount = async () => {
    try {
        console.log('Connecting to Elasticsearch...');
        await esClient.info();
        console.log('Connected to Elasticsearch.');

        console.log('Connecting to MongoDB for course count...');
        if (!process.env.MONGO_DB) {
            throw new Error('MONGO_DB environment variable is not defined.');
        }
        await mongoose.connect(process.env.MONGO_DB, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('Connected to MongoDB.');

        console.log('Fetching all users from Elasticsearch...');

        // Fetch all users from Elasticsearch using scroll API for large datasets
        const SCROLL_SIZE = 1000;
        let allUsers = [];

        // Initial search with scroll
        let response = await esClient.search({
            index: 'users',
            scroll: '2m',
            size: SCROLL_SIZE,
            body: {
                query: {
                    bool: {
                        must_not: [
                            { term: { isDeleted: true } },
                            { term: { isSignupAdminAprroved: false } }
                        ]
                    }
                },
                _source: ['userId', 'firstName', 'lastName', 'email', 'designation']
            }
        });

        let scrollId = response.body._scroll_id;
        let hits = response.body.hits.hits;
        allUsers = allUsers.concat(hits);

        console.log(`Fetched ${allUsers.length} users from Elasticsearch...`);

        // Continue scrolling until no more results
        while (hits.length > 0) {
            response = await esClient.scroll({
                scroll_id: scrollId,
                scroll: '2m'
            });

            scrollId = response.body._scroll_id;
            hits = response.body.hits.hits;
            allUsers = allUsers.concat(hits);

            console.log(`Fetched ${allUsers.length} users from Elasticsearch...`);
        }

        // Clear scroll
        await esClient.clearScroll({ scroll_id: scrollId });

        console.log(`Total users fetched from Elasticsearch: ${allUsers.length}`);

        // Extract user IDs for course count query
        const userIds = allUsers.map(hit => {
            const userId = hit._source.userId;
            // Handle both string and ObjectId formats
            return typeof userId === 'string' ? mongoose.Types.ObjectId(userId) : userId;
        });

        console.log('Fetching course counts from MongoDB...');

        // Get course counts for all users in one query
        const courseCounts = await OverallTrainingProgress.aggregate([
            {
                $match: {
                    user: { $in: userIds },
                    isDeleted: { $ne: true }
                }
            },
            {
                $group: {
                    _id: '$user',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Create a map for quick lookup
        const courseCountMap = new Map();
        courseCounts.forEach(item => {
            courseCountMap.set(item._id.toString(), item.count);
        });

        console.log(`Found course counts for ${courseCounts.length} users.`);
        console.log('Processing and decrypting user data...');

        const results = [];
        let processedCount = 0;

        // Process decryption in batches to show progress
        const DECRYPT_BATCH_SIZE = 1000;
        for (let i = 0; i < allUsers.length; i += DECRYPT_BATCH_SIZE) {
            const batch = allUsers.slice(i, i + DECRYPT_BATCH_SIZE);

            for (const hit of batch) {
                const user = hit._source;
                let firstName = '';
                let lastName = '';
                let email = '';

                try {
                    firstName = user.firstName ? decrypt(user.firstName, true) : '';
                } catch (error) {
                    console.warn(`Failed to decrypt firstName for user ${user.userId}:`, error.message);
                    firstName = '';
                }

                try {
                    lastName = user.lastName ? decrypt(user.lastName, true) : '';
                } catch (error) {
                    console.warn(`Failed to decrypt lastName for user ${user.userId}:`, error.message);
                    lastName = '';
                }

                try {
                    email = user.email ? decrypt(user.email) : '';
                } catch (error) {
                    console.warn(`Failed to decrypt email for user ${user.userId}:`, error.message);
                    email = '';
                }

                // Get course count from map
                const userId = user.userId ? user.userId.toString() : '';
                const courseCount = courseCountMap.get(userId) || 0;

                results.push({
                    FirstName: firstName,
                    LastName: lastName,
                    Email: email,
                    Designation: user.designation || 'N/A',
                    NumberOfCourses: courseCount
                });

                processedCount++;
            }

            console.log(`Processed ${processedCount} / ${allUsers.length} users...`);
        }

        console.log(`\nTotal users processed: ${processedCount}`);
        console.log('Generating CSV...');

        const fields = ['FirstName', 'LastName', 'Email', 'Designation', 'NumberOfCourses'];
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(results);

        const outputPath = path.join(__dirname, 'user_course_counts.csv');
        fs.writeFileSync(outputPath, csv);

        console.log(`CSV file successfully created at: ${outputPath}`);
        console.log(`Total records in CSV: ${results.length}`);

    } catch (error) {
        console.error('Error:', error);
        console.error('Stack trace:', error.stack);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
        process.exit();
    }
};

generateUserCourseCount();
