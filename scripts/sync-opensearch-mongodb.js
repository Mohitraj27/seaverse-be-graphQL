require("dotenv").config();
const path = require('path');
const { User } = require("../src/app/user/user_model");
const { Employee } = require("../src/app/user/employee/employee_model");
const { Designation } = require("../src/app/designations/designation_model");
const { Vessel } = require("../src/app/vessle/vessel_model");
const SignupRequest = require("../src/app/signup-request/signup-request-model");
const signupStatus = require("../src/app/signup-request/signup-status.json");
const { client, bulkIndexDocumentsToElasticSearch } = require("../src/util/elastic_helper");
const { encrypt } = require("../src/util/encryption_helper");
const mongoose = require("mongoose");

/**
 * Sync Script for OpenSearch and MongoDB
 * This script ensures data consistency between OpenSearch and MongoDB
 */

class OpenSearchMongoDBSync {
    constructor() {
        this.stats = {
            totalMongoUsers: 0,
            totalOpenSearchUsers: 0,
            missingInOpenSearch: 0,
            missingInMongoDB: 0,
            syncedToOpenSearch: 0,
            syncedToMongoDB: 0,
            errors: [],
            startTime: null,
            endTime: null
        };
        this.OPENSEARCH_INDEX = 'users';
        this.BATCH_SIZE = 1000;
    }

    /**
     * Connect to MongoDB
     */
    async connectToMongoDB() {
        try {
            if (mongoose.connection.readyState === 0) {
                await mongoose.connect(process.env.MONGO_DB, {
                    useNewUrlParser: true,
                    useUnifiedTopology: true,
                });
                console.log('✅ Connected to MongoDB');
            }
        } catch (error) {
            console.error('❌ MongoDB connection error:', error.message);
            this.stats.errors.push(`MongoDB connection error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Connect to OpenSearch
     */
    async connectToOpenSearch() {
        try {
            await client.ping();
            console.log('✅ Connected to OpenSearch');
        } catch (error) {
            console.error('❌ OpenSearch connection error:', error.message);
            this.stats.errors.push(`OpenSearch connection error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get all user IDs from MongoDB
     */
    async getAllMongoDBUserIds() {
        try {
            console.log('\n📊 Fetching all user IDs from MongoDB...');
            const users = await User.find(
                {},
                { _id: 1 }
            ).lean();

            this.stats.totalMongoUsers = users.length;
            console.log(`✅ Found ${users.length} users in MongoDB`);
            return new Set(users.map(u => u._id.toString()));
        } catch (error) {
            console.error('❌ Error fetching MongoDB users:', error.message);
            this.stats.errors.push(`MongoDB fetch error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get all user IDs from OpenSearch using scroll API
     */
    async getAllOpenSearchUserIds() {
        try {
            console.log('\n📊 Fetching all user IDs from OpenSearch...');
            const userIds = new Set();

            // Initial search with scroll
            let response = await client.search({
                index: this.OPENSEARCH_INDEX,
                scroll: '2m',
                size: this.BATCH_SIZE,
                body: {
                    query: {
                        match_all: {}
                    },
                    _source: ['userId']
                }
            });

            let scrollId = response.body._scroll_id;
            let hits = response.body.hits.hits;

            // Process initial batch
            hits.forEach(hit => {
                if (hit._source && hit._source.userId) {
                    userIds.add(hit._source.userId);
                }
            });

            // Continue scrolling
            while (hits.length > 0) {
                response = await client.scroll({
                    scroll_id: scrollId,
                    scroll: '2m'
                });

                scrollId = response.body._scroll_id;
                hits = response.body.hits.hits;
                hits.forEach(hit => {
                    if (hit._source && hit._source.userId) {
                        userIds.add(hit._source.userId);
                    }
                });
            }

            // Clear scroll
            await client.clearScroll({
                scroll_id: scrollId
            });

            this.stats.totalOpenSearchUsers = userIds.size;
            console.log(`✅ Found ${userIds.size} users in OpenSearch`);
            return userIds;
        } catch (error) {
            console.error('❌ Error fetching OpenSearch users:', error.message);
            this.stats.errors.push(`OpenSearch fetch error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Build OpenSearch document from MongoDB user data
     */
    async buildOpenSearchDocument(user, employee, designation, vessel) {
        try {
            const document = {
                userId: user._id.toString(),
                UID: user.UID || null,
                subscriber: user.subscriber?.toString() || null,
                firstName: user.firstName ? encrypt(user.firstName) : null,
                lastName: user.lastName ? encrypt(user.lastName) : null,
                email: user.email ? encrypt(user.email) : null,
                companyEmail: user.companyEmail ? encrypt(user.companyEmail) : null,
                civilIdOrPassport: user.civilIdOrPassport ? encrypt(user.civilIdOrPassport) : null,
                phone: user.phone ? {
                    countryCode: user.phone.countryCode,
                    number: encrypt(user.phone.number)
                } : null,
                avatar: user.avatar || null,
                role: user.role || 'LEARNER',
                subRoles: user.subRoles?.map(r => r.toString()) || [],
                languagePreference: user.languagePreference || 'en',
                lastLoginAt: user.lastLoginAt || null,
                isVerified: user.isVerified || false,
                isActive: user.isActive !== undefined ? user.isActive : true,
                isRegistered: user.isRegistered !== undefined ? user.isRegistered : true,
                lastUnregisteredAt: user.lastUnregisteredAt || null,
                isProfileCompleted: user.isProfileCompleted || false,
                isOrganizationManager: user.isOrganizationManager || false,
                managingOrganization: user.managingOrganization?.toString() || null,
                superAdmin: user.superAdmin || false,
                isDeleted: user.isDeleted || false,
                isResetPasswordDialog: user.isResetPasswordDialog || false,
                currentVessel: user.currentVessel?.toString() || null,
                vesselStatus: user.vesselStatus || null,
                directSignup: user.directSignup || false,
                isSignupAdminAprroved: user.isSignupAdminAprroved,
                roleAssignmentDate: user.roleAssignmentDate || null,
                contentlanguages: user.contentlanguages || ['english'],
                isEmailNotification: user.isEmailNotification !== undefined ? user.isEmailNotification : true,
                isPushNotification: user.isPushNotification !== undefined ? user.isPushNotification : true,
                deletionDate: user.deletionDate || null,
                isShipAdmin: user.isShipAdmin || false,
                createdAt: user.createdAt || null,
                updatedAt: user.updatedAt || null,
            };

            // Add employee data if exists
            if (employee) {
                document.empId = employee.empId || null;
                document.empDesignation = employee.empDesignation?.toString() || null;
                document.designation = designation?.name || null;
                document.tyepOfVesselId = employee.tyepOfVesselId?.toString() || null;
                document.vesselName = vessel?.name || null;
                document.regType = employee.regType || null;
            }

            return document;
        } catch (error) {
            console.error(`❌ Error building document for user ${user._id}:`, error.message);
            throw error;
        }
    }

    /**
     * Sync users from MongoDB to OpenSearch
     */
    async syncMongoDBToOpenSearch(missingUserIds) {
        if (missingUserIds.size === 0) {
            console.log('\n✅ No users to sync from MongoDB to OpenSearch');
            return;
        }

        console.log(`\n🔄 Syncing ${missingUserIds.size} users from MongoDB to OpenSearch...`);
        const userIdsArray = Array.from(missingUserIds);
        let syncedCount = 0;

        // Process in batches
        for (let i = 0; i < userIdsArray.length; i += this.BATCH_SIZE) {
            const batch = userIdsArray.slice(i, i + this.BATCH_SIZE);
            const batchNum = Math.floor(i / this.BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(userIdsArray.length / this.BATCH_SIZE);

            console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} users)...`);

            try {
                // Fetch users with related data
                const users = await User.find({ _id: { $in: batch } }).lean();
                const employees = await Employee.find({ user: { $in: batch } }).lean();

                // Create maps for quick lookup
                const employeeMap = new Map(employees.map(e => [e.user.toString(), e]));

                // Get unique designation and vessel IDs
                const designationIds = [...new Set(employees.map(e => e.empDesignation).filter(Boolean))];
                const vesselIds = [...new Set(users.map(u => u.currentVessel).filter(Boolean))];

                // Fetch designations and vessels
                const designations = await Designation.find({ _id: { $in: designationIds } }).lean();
                const vessels = await Vessel.find({ _id: { $in: vesselIds } }).lean();

                // Create maps
                const designationMap = new Map(designations.map(d => [d._id.toString(), d]));
                const vesselMap = new Map(vessels.map(v => [v._id.toString(), v]));

                // Build documents for bulk insert
                const documents = [];
                for (const user of users) {
                    const employee = employeeMap.get(user._id.toString());
                    const designation = employee ? designationMap.get(employee.empDesignation?.toString()) : null;
                    const vessel = vesselMap.get(user.currentVessel?.toString());

                    const document = await this.buildOpenSearchDocument(user, employee, designation, vessel);
                    documents.push({
                        id: user._id.toString(),
                        ...document
                    });
                }

                // Bulk index to OpenSearch
                if (documents.length > 0) {
                    await bulkIndexDocumentsToElasticSearch(this.OPENSEARCH_INDEX, documents);
                    syncedCount += documents.length;
                    console.log(`✅ Batch ${batchNum}: Synced ${documents.length} users to OpenSearch`);
                }
            } catch (error) {
                console.error(`❌ Error syncing batch ${batchNum}:`, error.message);
                this.stats.errors.push(`Batch ${batchNum} sync error: ${error.message}`);
            }
        }

        this.stats.syncedToOpenSearch = syncedCount;
        console.log(`\n✅ Total synced to OpenSearch: ${syncedCount} users`);
    }

    /**
     * Sync users from OpenSearch to MongoDB
     * Creates User and Employee records from orphaned OpenSearch data
     */
    async syncOpenSearchToMongoDB(missingUserIds) {
        if (missingUserIds.size === 0) {
            console.log('\n✅ No orphaned users found in OpenSearch');
            return;
        }

        console.log(`\n🔄 Syncing ${missingUserIds.size} orphaned users from OpenSearch to MongoDB...`);
        const userIdsArray = Array.from(missingUserIds);
        let syncedCount = 0;
        let errorCount = 0;

        // Process in batches
        for (let i = 0; i < userIdsArray.length; i += this.BATCH_SIZE) {
            const batch = userIdsArray.slice(i, i + this.BATCH_SIZE);
            const batchNum = Math.floor(i / this.BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(userIdsArray.length / this.BATCH_SIZE);

            console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} users)...`);

            try {
                // Fetch OpenSearch documents for this batch
                const response = await client.search({
                    index: this.OPENSEARCH_INDEX,
                    body: {
                        query: {
                            terms: {
                                userId: batch
                            }
                        },
                        size: batch.length
                    }
                });

                const hits = response.body.hits.hits;

                for (const hit of hits) {
                    const osData = hit._source;

                    try {
                        // Build User document from OpenSearch data
                        // Note: Data in OpenSearch is already encrypted, save as-is to MongoDB
                        const userData = {
                            _id: osData.userId,
                            UID: osData.UID || null,
                            subscriber: osData.subscriber || null,
                            firstName: osData.firstName || null,
                            lastName: osData.lastName || null,
                            companyEmail: osData.companyEmail || null,
                            phone: osData.phone || null,
                            avatar: osData.avatar || null,
                            role: osData.role || 'LEARNER',
                            subRoles: osData.subRoles || [],
                            languagePreference: osData.languagePreference || 'en',
                            lastLoginAt: osData.lastLoginAt || null,
                            isVerified: osData.isVerified || false,
                            isActive: osData.isActive !== undefined ? osData.isActive : true,
                            isRegistered: osData.isRegistered !== undefined ? osData.isRegistered : true,
                            lastUnregisteredAt: osData.lastUnregisteredAt || null,
                            isProfileCompleted: osData.isProfileCompleted || false,
                            isOrganizationManager: osData.isOrganizationManager || false,
                            managingOrganization: osData.managingOrganization || null,
                            superAdmin: osData.superAdmin || false,
                            isDeleted: osData.isDeleted || false,
                            isResetPasswordDialog: osData.isResetPasswordDialog || false,
                            currentVessel: osData.currentVessel || null,
                            vesselStatus: osData.vesselStatus || null,
                            directSignup: osData.directSignup || false,
                            isSignupAdminAprroved: osData.isSignupAdminAprroved,
                            roleAssignmentDate: osData.roleAssignmentDate || null,
                            contentlanguages: osData.contentlanguages || ['english'],
                            isEmailNotification: osData.isEmailNotification !== undefined ? osData.isEmailNotification : true,
                            isPushNotification: osData.isPushNotification !== undefined ? osData.isPushNotification : true,
                            deletionDate: osData.deletionDate || null,
                            isShipAdmin: osData.isShipAdmin || false,
                            createdAt: osData.createdAt || osData.userCreatedAt || new Date(),
                            updatedAt: osData.updatedAt || osData.userUpdatedAt || new Date(),
                        };

                        // Add unique fields only if they exist (to avoid unique constraint violations)
                        // Keep data encrypted as-is from OpenSearch
                        if (osData.email) {
                            userData.email = osData.email;
                        }
                        if (osData.civilIdOrPassport) {
                            userData.civilIdOrPassport = osData.civilIdOrPassport;
                        }

                        // Create User document
                        const user = new User(userData);
                        await user.save();

                        // Create SignupRequest document if isSignupAdminAprroved is false
                        if (osData.isSignupAdminAprroved === false) {
                            const signupRequestData = {
                                firstName: osData.firstName || null,
                                lastName: osData.lastName || null,
                                email: osData.email || osData.companyEmail || null,
                                requestDate: osData.createdAt || new Date(),
                                signupStatus: signupStatus.PENDING,
                                userId: osData.userId,
                                isDeleted: false,
                                createdAt: osData.createdAt || new Date(),
                                updatedAt: osData.updatedAt || new Date(),
                            };

                            const signupRequest = new SignupRequest(signupRequestData);
                            await signupRequest.save();
                            console.log(`   ✅ Created signup request for user ${osData.userId}`);
                        }

                        // Create Employee document if employee data exists
                        if (osData.empDesignation || osData.regType || osData.employeeId) {
                            const employeeData = {
                                _id: osData.employeeId || undefined,
                                UID: osData.UID || null,
                                subscriber: osData.subscriber,
                                empDesignation: osData.empDesignation || null,
                                user: osData.userId,
                                designation: osData.designation || 'Unknown',
                                regType: osData.regType || 1,
                                bulkId: osData.bulkId || null,
                                isActive: true,
                                isDeleted: false,
                                createdAt: osData.createdAt || new Date(),
                                updatedAt: osData.updatedAt || new Date(),
                            };

                            const employee = new Employee(employeeData);
                            await employee.save();
                        }

                        syncedCount++;
                    } catch (error) {
                        errorCount++;
                        console.error(`   ❌ Error syncing user ${osData.userId}:`, error.message);
                        this.stats.errors.push(`User ${osData.userId} sync error: ${error.message}`);
                    }
                }

                console.log(`✅ Batch ${batchNum}: Synced ${hits.length} users to MongoDB`);
            } catch (error) {
                console.error(`❌ Error processing batch ${batchNum}:`, error.message);
                this.stats.errors.push(`Batch ${batchNum} processing error: ${error.message}`);
            }
        }

        this.stats.syncedToMongoDB = syncedCount;
        console.log(`\n✅ Total synced to MongoDB: ${syncedCount} users`);
        if (errorCount > 0) {
            console.log(`⚠️  Errors encountered: ${errorCount} users failed to sync`);
        }
    }

    /**
     * Find duplicate user records in OpenSearch using Composite Aggregation
     * This method supports unlimited duplicates through pagination (no 10K limit)
     * Returns a map of userId -> array of document IDs
     */
    async findDuplicatesInOpenSearch() {
        try {
            console.log('\n' + '='.repeat(60));
            console.log('🔍 FINDING DUPLICATES IN OPENSEARCH');
            console.log('='.repeat(60));

            await this.connectToOpenSearch();

            console.log('\n📊 Scanning OpenSearch for duplicate email entries...');
            console.log('   Using Composite Aggregation (supports unlimited duplicates)');

            // Step 1: Use composite aggregation to find ALL duplicate emails (with pagination)
            const duplicateEmails = new Map(); // email -> count
            let afterKey = null;
            let batchNum = 0;

            do {
                batchNum++;
                console.log(`\n   📦 Fetching batch ${batchNum}...`);

                const aggBody = {
                    size: 0,
                    aggs: {
                        user_groups: {
                            composite: {
                                size: 1000, // Batch size for pagination
                                sources: [
                                    {
                                        email: {
                                            terms: {
                                                field: 'email.keyword'
                                            }
                                        }
                                    }
                                ]
                            }
                        }
                    }
                };

                // Add after_key for pagination
                if (afterKey) {
                    aggBody.aggs.user_groups.composite.after = afterKey;
                }

                const response = await client.search({
                    index: this.OPENSEARCH_INDEX,
                    body: aggBody
                });

                const buckets = response.body.aggregations.user_groups.buckets;

                // Filter only duplicates (count > 1)
                let duplicatesInBatch = 0;
                for (const bucket of buckets) {
                    const email = bucket.key.email;
                    const count = bucket.doc_count;

                    if (count > 1) {
                        duplicateEmails.set(email, count);
                        duplicatesInBatch++;
                    }
                }

                console.log(`      Found ${duplicatesInBatch} duplicates in this batch`);
                console.log(`      Total duplicates found so far: ${duplicateEmails.size}`);

                afterKey = response.body.aggregations.user_groups.after_key;

            } while (afterKey);

            console.log(`\n✅ Aggregation complete: Found ${duplicateEmails.size} emails with duplicates`);

            if (duplicateEmails.size === 0) {
                console.log('\n✅ No duplicates found in OpenSearch!');
                return { duplicates: {}, totalDuplicateUsers: 0, totalDuplicateDocuments: 0 };
            }

            // Step 2: Fetch all documents for each duplicate email
            console.log('\n🔄 Fetching duplicate documents...');
            const duplicates = {};
            let totalDuplicateDocuments = 0;
            const emailsArray = Array.from(duplicateEmails.keys());

            for (let i = 0; i < emailsArray.length; i++) {
                const email = emailsArray[i];
                const count = duplicateEmails.get(email);

                // Show progress every 10 emails or for the first 5
                if (i < 5 || i % 10 === 0 || i === emailsArray.length - 1) {
                    console.log(`   Processing email ${i + 1}/${emailsArray.length}: ${email} (${count} documents)`);
                }

                // Fetch all documents for this email
                const docsResponse = await client.search({
                    index: this.OPENSEARCH_INDEX,
                    body: {
                        query: {
                            term: {
                                'email.keyword': email
                            }
                        },
                        size: count,
                        sort: [
                            { updatedAt: { order: 'desc' } }
                        ]
                    }
                });

                const docs = docsResponse.body.hits.hits.map(hit => ({
                    documentId: hit._id,
                    userId: hit._source.userId,
                    updatedAt: hit._source.updatedAt,
                    createdAt: hit._source.createdAt,
                    email: hit._source.email,
                    firstName: hit._source.firstName,
                    lastName: hit._source.lastName,
                    isSignupAdminAprroved: hit._source.isSignupAdminAprroved
                }));

                duplicates[email] = docs;
                totalDuplicateDocuments += count;
            }

            console.log(`\n✅ Finished fetching all duplicate documents`);

            // Display summary
            console.log('\n📋 Duplicate Summary:');
            console.log(`   Total emails with duplicates: ${duplicateEmails.size}`);
            console.log(`   Total duplicate documents: ${totalDuplicateDocuments}`);
            console.log(`   Documents to remove: ${totalDuplicateDocuments - duplicateEmails.size}`);

            // Show sample duplicates
            console.log('\n📄 Sample Duplicates (showing first 10):');
            const sampleEmails = Object.keys(duplicates).slice(0, 10);

            sampleEmails.forEach((email, index) => {
                const docs = duplicates[email];
                console.log(`\n   ${index + 1}. Email: ${email} (${docs.length} documents)`);
                docs.forEach((doc, docIndex) => {
                    console.log(`      ${docIndex === 0 ? '✅ KEEP' : '❌ DELETE'} - Doc ID: ${doc.documentId}`);
                    console.log(`         Updated: ${doc.updatedAt || 'N/A'}`);
                    console.log(`         Created: ${doc.createdAt || 'N/A'}`);
                });
            });

            if (Object.keys(duplicates).length > 10) {
                console.log(`\n   ... and ${Object.keys(duplicates).length - 10} more duplicate emails`);
            }

            console.log('\n' + '='.repeat(60));
            console.log('✅ Duplicate scan completed!');
            console.log('='.repeat(60) + '\n');

            return {
                duplicates,
                totalDuplicateUsers: duplicateEmails.size,
                totalDuplicateDocuments
            };

        } catch (error) {
            console.error('\n❌ Error finding duplicates:', error.message);
            console.error('Stack trace:', error.stack);
            throw error;
        }
    }

    /**
     * Remove duplicate user records from OpenSearch
     * Keeps the most recently updated document for each email
     */
    async removeDuplicatesFromOpenSearch(dryRun = true) {
        try {
            console.log('\n' + '='.repeat(60));
            console.log(`🗑️  REMOVING DUPLICATES FROM OPENSEARCH ${dryRun ? '(DRY RUN)' : '(LIVE)'}`);
            console.log('='.repeat(60));

            // First, find all duplicates
            const { duplicates, totalDuplicateUsers, totalDuplicateDocuments } = await this.findDuplicatesInOpenSearch();

            if (totalDuplicateUsers === 0) {
                console.log('\n✅ No duplicates to remove!');
                return { removed: 0, kept: 0 };
            }

            console.log(`\n🔄 Processing ${totalDuplicateUsers} emails with duplicates...`);

            let removedCount = 0;
            let keptCount = 0;
            const errors = [];

            for (const [email, docs] of Object.entries(duplicates)) {
                try {
                    // Sort documents: prioritize keeping approved users (isSignupAdminAprroved !== false)
                    // Then by most recently updated
                    const sortedDocs = [...docs].sort((a, b) => {
                        // First priority: approved status (keep approved, delete unapproved)
                        const aApproved = a.isSignupAdminAprroved !== false;
                        const bApproved = b.isSignupAdminAprroved !== false;

                        if (aApproved !== bApproved) {
                            return bApproved ? 1 : -1; // Keep approved ones
                        }

                        // Second priority: most recently updated
                        const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
                        const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
                        return bTime - aTime;
                    });

                    const [keepDoc, ...removeDocs] = sortedDocs;

                    keptCount++;
                    console.log(`\n✅ Keeping document ${keepDoc.documentId} for email ${email}`);
                    console.log(`   isSignupAdminAprroved: ${keepDoc.isSignupAdminAprroved}`);
                    console.log(`   Updated: ${keepDoc.updatedAt || 'N/A'}`);

                    // Remove the rest
                    for (const doc of removeDocs) {
                        if (dryRun) {
                            console.log(`   🔍 [DRY RUN] Would delete document ${doc.documentId}`);
                            console.log(`      isSignupAdminAprroved: ${doc.isSignupAdminAprroved}`);
                            console.log(`      Updated: ${doc.updatedAt || 'N/A'}`);
                        } else {
                            await client.delete({
                                index: this.OPENSEARCH_INDEX,
                                id: doc.documentId
                            });
                            console.log(`   ❌ Deleted document ${doc.documentId}`);
                            console.log(`      isSignupAdminAprroved: ${doc.isSignupAdminAprroved}`);
                            console.log(`      Updated: ${doc.updatedAt || 'N/A'}`);
                        }
                        removedCount++;
                    }

                } catch (error) {
                    console.error(`   ❌ Error processing email ${email}:`, error.message);
                    errors.push(`Email ${email}: ${error.message}`);
                }
            }

            console.log('\n' + '='.repeat(60));
            console.log('📊 REMOVAL SUMMARY');
            console.log('='.repeat(60));
            console.log(`Mode: ${dryRun ? 'DRY RUN (no changes made)' : 'LIVE (changes applied)'}`);
            console.log(`Emails processed: ${totalDuplicateUsers}`);
            console.log(`Documents kept: ${keptCount}`);
            console.log(`Documents ${dryRun ? 'to be removed' : 'removed'}: ${removedCount}`);

            if (errors.length > 0) {
                console.log(`\n❌ Errors encountered: ${errors.length}`);
                errors.forEach((error, index) => {
                    console.log(`   ${index + 1}. ${error}`);
                });
            }

            if (dryRun) {
                console.log('\n💡 This was a DRY RUN. To actually remove duplicates, run with dryRun=false');
            }

            console.log('='.repeat(60) + '\n');

            return {
                removed: removedCount,
                kept: keptCount,
                errors
            };

        } catch (error) {
            console.error('\n❌ Error removing duplicates:', error.message);
            throw error;
        }
    }


    /**
     * Get sample user IDs that differ between MongoDB and OpenSearch
     * This function only retrieves and displays samples without syncing
     */
    async getSampleDifferences(sampleSize = 10) {
        this.stats.startTime = new Date();

        try {
            console.log('\n' + '='.repeat(60));
            console.log('🔍 GETTING SAMPLE DIFFERENCES');
            console.log('='.repeat(60));

            // Connect to databases
            await this.connectToMongoDB();
            await this.connectToOpenSearch();

            // Get all user IDs from both sources
            const mongoUserIds = await this.getAllMongoDBUserIds();
            const openSearchUserIds = await this.getAllOpenSearchUserIds();

            // Find differences
            const missingInOpenSearch = new Set([...mongoUserIds].filter(id => !openSearchUserIds.has(id)));
            const missingInMongoDB = new Set([...openSearchUserIds].filter(id => !mongoUserIds.has(id)));

            this.stats.missingInOpenSearch = missingInOpenSearch.size;
            this.stats.missingInMongoDB = missingInMongoDB.size;

            console.log('\n📊 Summary:');
            console.log(`   Total MongoDB Users: ${mongoUserIds.size}`);
            console.log(`   Total OpenSearch Users: ${openSearchUserIds.size}`);
            console.log(`   Users in MongoDB only: ${missingInOpenSearch.size}`);
            console.log(`   Users in OpenSearch only (Orphaned): ${missingInMongoDB.size}`);

            // Show sample IDs for missing users in OpenSearch
            if (missingInOpenSearch.size > 0) {
                console.log('\n📋 Sample User IDs in MongoDB but NOT in OpenSearch:');
                console.log('   (These need to be indexed to OpenSearch)');
                const sampleMissingInOS = Array.from(missingInOpenSearch).slice(0, sampleSize);
                sampleMissingInOS.forEach((id, index) => {
                    console.log(`   ${index + 1}. ${id}`);
                });
                if (missingInOpenSearch.size > sampleSize) {
                    console.log(`   ... and ${missingInOpenSearch.size - sampleSize} more`);
                }
            } else {
                console.log('\n✅ All MongoDB users are present in OpenSearch');
            }

            // Show sample IDs for orphaned users in OpenSearch
            if (missingInMongoDB.size > 0) {
                console.log('\n📋 Sample User IDs in OpenSearch but NOT in MongoDB (Orphaned):');
                console.log('   (These need to be synced to MongoDB or deleted from OpenSearch)');
                const sampleMissingInMongo = Array.from(missingInMongoDB).slice(0, sampleSize);
                sampleMissingInMongo.forEach((id, index) => {
                    console.log(`   ${index + 1}. ${id}`);
                });
                if (missingInMongoDB.size > sampleSize) {
                    console.log(`   ... and ${missingInMongoDB.size - sampleSize} more`);
                }
            } else {
                console.log('\n✅ No orphaned users in OpenSearch');
            }

            if (missingInOpenSearch.size === 0 && missingInMongoDB.size === 0) {
                console.log('\n🎉 Perfect! All data is in sync between MongoDB and OpenSearch.');
            }

            console.log('\n' + '='.repeat(60));
            console.log('✅ Sample retrieval completed!');
            console.log('='.repeat(60) + '\n');

            return {
                mongoTotal: mongoUserIds.size,
                openSearchTotal: openSearchUserIds.size,
                missingInOpenSearch: Array.from(missingInOpenSearch),
                missingInMongoDB: Array.from(missingInMongoDB)
            };

        } catch (error) {
            console.error('\n❌ Error getting samples:', error.message);
            throw error;
        } finally {
            // Close connections
            if (mongoose.connection.readyState !== 0) {
                await mongoose.connection.close();
                console.log('🔌 MongoDB connection closed');
            }
        }
    }

    /**

     * Perform verification after sync
     */
    async verifySyncResults() {
        console.log('\n🔍 Verifying sync results...');

        try {
            const mongoIds = await this.getAllMongoDBUserIds();
            const openSearchIds = await this.getAllOpenSearchUserIds();

            const stillMissingInOpenSearch = new Set([...mongoIds].filter(id => !openSearchIds.has(id)));
            const stillMissingInMongoDB = new Set([...openSearchIds].filter(id => !mongoIds.has(id)));

            console.log('\n📊 Verification Results:');
            console.log(`   MongoDB users: ${mongoIds.size}`);
            console.log(`   OpenSearch users: ${openSearchIds.size}`);
            console.log(`   Still missing in OpenSearch: ${stillMissingInOpenSearch.size}`);
            console.log(`   Still orphaned in OpenSearch: ${stillMissingInMongoDB.size}`);

            if (stillMissingInOpenSearch.size === 0 && stillMissingInMongoDB.size === 0) {
                console.log('\n✅ Perfect sync! All data is consistent.');
            } else {
                console.log('\n⚠️  Some inconsistencies remain. Review the logs above.');
            }
        } catch (error) {
            console.error('❌ Error during verification:', error.message);
        }
    }

    /**
     * Print final statistics
     */
    printStats() {
        this.stats.endTime = new Date();
        const duration = (this.stats.endTime - this.stats.startTime) / 1000;

        console.log('\n' + '='.repeat(60));
        console.log('📊 SYNC STATISTICS');
        console.log('='.repeat(60));
        console.log(`Start Time: ${this.stats.startTime.toISOString()}`);
        console.log(`End Time: ${this.stats.endTime.toISOString()}`);
        console.log(`Duration: ${duration.toFixed(2)} seconds`);
        console.log('-'.repeat(60));
        console.log(`Total MongoDB Users: ${this.stats.totalMongoUsers}`);
        console.log(`Total OpenSearch Users: ${this.stats.totalOpenSearchUsers}`);
        console.log(`Missing in OpenSearch: ${this.stats.missingInOpenSearch}`);
        console.log(`Orphaned in OpenSearch: ${this.stats.missingInMongoDB}`);
        console.log(`Synced to OpenSearch: ${this.stats.syncedToOpenSearch}`);
        console.log(`Synced to MongoDB: ${this.stats.syncedToMongoDB}`);
        console.log('-'.repeat(60));

        if (this.stats.errors.length > 0) {
            console.log(`\n❌ Errors (${this.stats.errors.length}):`);
            this.stats.errors.forEach((error, index) => {
                console.log(`   ${index + 1}. ${error}`);
            });
        } else {
            console.log('\n✅ No errors occurred during sync');
        }
        console.log('='.repeat(60) + '\n');
    }

    /**
     * Main sync process
     */
    async sync(options = {}) {
        this.stats.startTime = new Date();

        try {
            console.log('\n' + '='.repeat(60));
            console.log('🔄 OPENSEARCH ↔️ MONGODB SYNC SCRIPT');
            console.log('='.repeat(60));

            // Connect to databases
            await this.connectToMongoDB();
            await this.connectToOpenSearch();

            // Get all user IDs from both sources
            const mongoUserIds = await this.getAllMongoDBUserIds();
            const openSearchUserIds = await this.getAllOpenSearchUserIds();

            // Find differences
            const missingInOpenSearch = new Set([...mongoUserIds].filter(id => !openSearchUserIds.has(id)));
            const missingInMongoDB = new Set([...openSearchUserIds].filter(id => !mongoUserIds.has(id)));

            this.stats.missingInOpenSearch = missingInOpenSearch.size;
            this.stats.missingInMongoDB = missingInMongoDB.size;

            console.log('\n📊 Sync Analysis:');
            console.log(`   Users in MongoDB only: ${missingInOpenSearch.size}`);
            console.log(`   Users in OpenSearch only: ${missingInMongoDB.size}`);

            // Show sample IDs for missing users in OpenSearch
            if (missingInOpenSearch.size > 0) {
                console.log('\n📋 Sample User IDs in MongoDB but NOT in OpenSearch:');
                const sampleMissingInOS = Array.from(missingInOpenSearch).slice(0, 10);
                sampleMissingInOS.forEach((id, index) => {
                    console.log(`   ${index + 1}. ${id}`);
                });
                if (missingInOpenSearch.size > 10) {
                    console.log(`   ... and ${missingInOpenSearch.size - 10} more`);
                }
            }

            // Show sample IDs for orphaned users in OpenSearch
            if (missingInMongoDB.size > 0) {
                console.log('\n📋 Sample User IDs in OpenSearch but NOT in MongoDB (Orphaned):');
                const sampleMissingInMongo = Array.from(missingInMongoDB).slice(0, 10);
                sampleMissingInMongo.forEach((id, index) => {
                    console.log(`   ${index + 1}. ${id}`);
                });
                if (missingInMongoDB.size > 10) {
                    console.log(`   ... and ${missingInMongoDB.size - 10} more`);
                }
            }

            if (missingInOpenSearch.size === 0 && missingInMongoDB.size === 0) {
                console.log('\n✅ Perfect! All data is in sync between MongoDB and OpenSearch.');
            }


            // Perform sync
            if (options.syncToOpenSearch !== false) {
                await this.syncMongoDBToOpenSearch(missingInOpenSearch);
            }

            if (options.syncToMongoDB !== false) {
                await this.syncOpenSearchToMongoDB(missingInMongoDB);
            }

            // Verify results
            if (options.verify !== false) {
                await this.verifySyncResults();
            }

            // Print statistics
            this.printStats();

            console.log('✅ Sync process completed!\n');
        } catch (error) {
            console.error('\n❌ Fatal error during sync:', error.message);
            this.stats.errors.push(`Fatal error: ${error.message}`);
            this.printStats();
            throw error;
        } finally {
            // Close connections
            if (mongoose.connection.readyState !== 0) {
                await mongoose.connection.close();
                console.log('🔌 MongoDB connection closed');
            }
        }
    }
}

// Run the sync if this file is executed directly
if (require.main === module) {
    const sync = new OpenSearchMongoDBSync();

    // Parse command line arguments
    const args = process.argv.slice(2);

    // Check for duplicate operations
    if (args.includes('--find-duplicates')) {
        // Find duplicates only
        sync.findDuplicatesInOpenSearch()
            .then(() => {
                console.log('✅ Duplicate scan completed successfully');
                process.exit(0);
            })
            .catch((error) => {
                console.error('❌ Duplicate scan failed:', error.message);
                process.exit(1);
            });
    } else if (args.includes('--remove-duplicates')) {
        // Remove duplicates (dry run by default, use --live to actually delete)
        const dryRun = !args.includes('--live');
        sync.removeDuplicatesFromOpenSearch(dryRun)
            .then(() => {
                console.log('✅ Duplicate removal completed successfully');
                process.exit(0);
            })
            .catch((error) => {
                console.error('❌ Duplicate removal failed:', error.message);
                process.exit(1);
            });
    } else {
        // Normal sync operation
        const options = {
            syncToOpenSearch: !args.includes('--skip-opensearch'),
            syncToMongoDB: !args.includes('--skip-mongodb'),
            verify: !args.includes('--skip-verify')
        };

        sync.sync(options)
            .then(() => {
                console.log('✅ Script completed successfully');
                process.exit(0);
            })
            .catch((error) => {
                console.error('❌ Script failed:', error.message);
                process.exit(1);
            });
    }
}

module.exports = OpenSearchMongoDBSync;
