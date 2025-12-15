/**
 * Migration Script: Elasticsearch to MongoDB
 * Migrates all user data from Elasticsearch to MongoDB UserSearchCache collection
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const { User } = require('../src/app/user/user_model');
const { Employee } = require('../src/app/user/employee/employee_model');
const { Designation } = require('../src/app/designations/designation_model');
const { Vessel } = require('../src/app/vessle/vessel_model');
const { VesselType } = require('../src/app/vessle/vessel-type/vessel_type_model');
const { UserSearchCache } = require('../src/app/user/user_search_cache/user_search_cache_model');
const { encrypt } = require('../src/util/encryption_helper');

class ElasticToMongoMigration {
    constructor(batchSize = 500) {
        this.batchSize = batchSize;
        this.stats = {
            totalUsers: 0,
            migrated: 0,
            skipped: 0,
            errors: [],
            startTime: null,
            endTime: null
        };
    }

    async connect() {
        try {
            await mongoose.connect(process.env.MONGO_DB, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
            });
            console.log('✅ Connected to MongoDB\n');
            return true;
        } catch (error) {
            console.error('❌ MongoDB connection error:', error.message);
            return false;
        }
    }

    async buildSearchDocument(user, employee, designation, vessel, vesselType) {
        try {
            const document = {
                userId: user._id,
                employeeId: employee?._id || null,
                UID: user.UID || employee?.UID,
                subscriber: user.subscriber,

                // Encrypted personal info
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                civilIdOrPassport: user.civilIdOrPassport,

                // Role & permissions
                role: user.role,
                subRoles: user.subRoles || [],
                superAdmin: user.superAdmin || false,

                // Employee info
                designation: designation?.name || employee?.designation || null,
                empDesignation: employee?.empDesignation || null,
                regType: employee?.regType || 1,
                bulkId: employee?.bulkId || null,

                // Vessel info
                currentVessel: user.currentVessel || null,
                vesselName: vessel?.name || null,
                vesselId: vessel?._id || null,
                vesselStatus: user.vesselStatus || null,
                vesselIsActive: vessel?.isActive || false,
                vesselIsDeleted: vessel?.isDeleted || false,
                typeOfVesselName: vesselType?.name || null,
                tyepOfVesselId: vesselType?._id || null,

                // Status flags
                isActive: user.isActive,
                isVerified: user.isVerified || false,
                isRegistered: user.isRegistered !== undefined ? user.isRegistered : true,
                isDeleted: user.isDeleted || false,
                isDeleted_user: user.isDeleted || false,
                isSignupAdminAprroved: user.isSignupAdminAprroved,
                isResetPasswordDialog: user.isResetPasswordDialog || false,
                deleteRequest: user.deleteRequest || false,
                directSignup: user.directSignup || false,

                // Preferences
                languagePreference: user.languagePreference || 'en',
                contentlanguages: user.contentlanguages || ['english'],
                isEmailNotification: user.isEmailNotification !== undefined ? user.isEmailNotification : true,
                isPushNotification: user.isPushNotification !== undefined ? user.isPushNotification : true,

                // Course info (will be updated separately)
                enrolledCourses: 0,
                averageCourseProgress: 0,

                // Timestamps
                lastLoginAt: user.lastLoginAt,
                userCreatedAt: user.createdAt,
                userUpdatedAt: user.updatedAt,
                indexedAt: new Date(),
                updatedAt: new Date(),
                createdAt: new Date()
            };

            return document;
        } catch (error) {
            throw new Error(`Error building document: ${error.message}`);
        }
    }

    async migrateUsers() {
        try {
            console.log('📊 Counting users...');
            const totalUsers = await User.countDocuments({ isDeleted: false });
            this.stats.totalUsers = totalUsers;

            console.log(`📦 Found ${totalUsers} users to migrate`);
            console.log(`📦 Processing in batches of ${this.batchSize}\n`);

            const totalBatches = Math.ceil(totalUsers / this.batchSize);
            let processedCount = 0;

            for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
                const skip = batchNum * this.batchSize;

                try {
                    console.log(`\n🔄 Processing batch ${batchNum + 1}/${totalBatches}...`);

                    // Fetch users with related data
                    const users = await User.find({ isDeleted: false })
                        .skip(skip)
                        .limit(this.batchSize)
                        .lean();

                    if (users.length === 0) break;

                    const userIds = users.map(u => u._id);

                    // Fetch related data in parallel
                    const [employees, vessels] = await Promise.all([
                        Employee.find({ user: { $in: userIds } }).lean(),
                        Vessel.find({ _id: { $in: users.map(u => u.currentVessel).filter(Boolean) } }).lean()
                    ]);

                    // Get designation IDs and vessel type IDs
                    const designationIds = employees.map(e => e.empDesignation).filter(Boolean);
                    const vesselTypeIds = vessels.map(v => v.typeOfVessel).filter(Boolean);

                    // Fetch designations and vessel types
                    const [designations, vesselTypes] = await Promise.all([
                        Designation.find({ _id: { $in: designationIds } }).lean(),
                        VesselType.find({ _id: { $in: vesselTypeIds } }).lean()
                    ]);

                    // Create lookup maps
                    const employeeMap = new Map(employees.map(e => [e.user.toString(), e]));
                    const vesselMap = new Map(vessels.map(v => [v._id.toString(), v]));
                    const designationMap = new Map(designations.map(d => [d._id.toString(), d]));
                    const vesselTypeMap = new Map(vesselTypes.map(vt => [vt._id.toString(), vt]));

                    // Build documents
                    const documents = [];
                    for (const user of users) {
                        try {
                            const employee = employeeMap.get(user._id.toString());
                            const vessel = user.currentVessel ? vesselMap.get(user.currentVessel.toString()) : null;
                            const designation = employee?.empDesignation ? designationMap.get(employee.empDesignation.toString()) : null;
                            const vesselType = vessel?.typeOfVessel ? vesselTypeMap.get(vessel.typeOfVessel.toString()) : null;

                            const doc = await this.buildSearchDocument(user, employee, designation, vessel, vesselType);
                            documents.push(doc);
                        } catch (error) {
                            this.stats.errors.push(`User ${user._id}: ${error.message}`);
                            this.stats.skipped++;
                        }
                    }

                    // Bulk insert/update
                    if (documents.length > 0) {
                        const bulkOps = documents.map(doc => ({
                            updateOne: {
                                filter: { userId: doc.userId },
                                update: { $set: doc },
                                upsert: true
                            }
                        }));

                        await UserSearchCache.bulkWrite(bulkOps);
                        this.stats.migrated += documents.length;
                        processedCount += users.length;

                        const progress = Math.round((processedCount / totalUsers) * 100);
                        console.log(`  ✅ Migrated ${documents.length} users (${progress}% complete)`);
                    }

                } catch (batchError) {
                    this.stats.errors.push(`Batch ${batchNum + 1} error: ${batchError.message}`);
                    console.error(`  ❌ Batch ${batchNum + 1} failed: ${batchError.message}`);
                }
            }

            console.log(`\n✅ Migration complete!`);
            console.log(`   Total migrated: ${this.stats.migrated}`);
            console.log(`   Skipped: ${this.stats.skipped}`);
            console.log(`   Errors: ${this.stats.errors.length}`);

        } catch (error) {
            console.error('❌ Migration error:', error.message);
            throw error;
        }
    }

    async createIndexes() {
        try {
            console.log('\n📑 Creating indexes...');
            await UserSearchCache.createIndexes();
            console.log('✅ Indexes created successfully');
        } catch (error) {
            console.error('❌ Index creation error:', error.message);
        }
    }

    async run() {
        this.stats.startTime = new Date();

        try {
            const connected = await this.connect();
            if (!connected) {
                throw new Error('Failed to connect to MongoDB');
            }

            await this.createIndexes();
            await this.migrateUsers();

            this.stats.endTime = new Date();
            const duration = (this.stats.endTime - this.stats.startTime) / 1000;

            console.log('\n' + '='.repeat(60));
            console.log('📊 MIGRATION SUMMARY');
            console.log('='.repeat(60));
            console.log(`Total users: ${this.stats.totalUsers}`);
            console.log(`Migrated: ${this.stats.migrated}`);
            console.log(`Skipped: ${this.stats.skipped}`);
            console.log(`Errors: ${this.stats.errors.length}`);
            console.log(`Duration: ${duration.toFixed(2)} seconds`);
            console.log('='.repeat(60));

            if (this.stats.errors.length > 0) {
                console.log('\n❌ Errors encountered:');
                this.stats.errors.slice(0, 10).forEach(err => console.log(`  - ${err}`));
                if (this.stats.errors.length > 10) {
                    console.log(`  ... and ${this.stats.errors.length - 10} more`);
                }
            }

        } catch (error) {
            console.error('\n❌ Fatal error:', error.message);
            throw error;
        } finally {
            await mongoose.disconnect();
            console.log('\n✅ Disconnected from MongoDB');
        }
    }
}

// Run migration
if (require.main === module) {
    const migration = new ElasticToMongoMigration();

    migration.run()
        .then(() => {
            console.log('\n✅ Migration completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Migration failed:', error);
            process.exit(1);
        });
}

module.exports = ElasticToMongoMigration;
