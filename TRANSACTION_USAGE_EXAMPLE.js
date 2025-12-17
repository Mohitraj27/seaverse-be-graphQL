/**
 * Transaction Usage Examples
 * How to wrap User/Employee/Cache operations in transactions for atomicity
 */

const mongoose = require('mongoose');
const { User } = require('./src/app/user/user_model');
const { Employee } = require('./src/app/user/employee/employee_model');
const { indexDocumenttoElasticSearch, updateDocumenttoElasticSearch, deleteDocumenttoElasticSearch } = require('./src/util/user_search_helper');

// Example 1: Create User with Cache (Atomic)
async function createUserWithCache(userData, employeeData) {
    const session = await mongoose.startSession();
    await session.startTransaction();

    try {
        // 1. Create user
        const [user] = await User.create([userData], { session });

        // 2. Create employee
        const [employee] = await Employee.create([{
            ...employeeData,
            user: user._id
        }], { session });

        // 3. Index to cache (within same transaction)
        await indexDocumenttoElasticSearch('users', user._id, {
            userId: user._id,
            employeeId: employee._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            // ... other fields
        }, session);

        // All succeed or all fail
        await session.commitTransaction();
        console.log('✅ User created atomically');
        return { user, employee };

    } catch (error) {
        // Rollback everything
        await session.abortTransaction();
        console.error('❌ Transaction failed, rolled back:', error);
        throw error;

    } finally {
        session.endSession();
    }
}

// Example 2: Update User with Cache (Atomic)
async function updateUserWithCache(userId, updates) {
    const session = await mongoose.startSession();
    await session.startTransaction();

    try {
        // 1. Update user
        const user = await User.findByIdAndUpdate(
            userId,
            { $set: updates },
            { new: true, session }
        );

        // 2. Update cache (within same transaction)
        await updateDocumenttoElasticSearch('users', userId, {
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            updatedAt: new Date()
        }, session);

        // Both succeed or both fail
        await session.commitTransaction();
        console.log('✅ User updated atomically');
        return user;

    } catch (error) {
        await session.abortTransaction();
        console.error('❌ Transaction failed, rolled back:', error);
        throw error;

    } finally {
        session.endSession();
    }
}

// Example 3: Delete User with Cache (Atomic)
async function deleteUserWithCache(userId) {
    const session = await mongoose.startSession();
    await session.startTransaction();

    try {
        // 1. Delete user
        await User.findByIdAndDelete(userId, { session });

        // 2. Delete employee
        await Employee.deleteOne({ user: userId }, { session });

        // 3. Delete from cache (within same transaction)
        await deleteDocumenttoElasticSearch('users', userId, session);

        // All succeed or all fail
        await session.commitTransaction();
        console.log('✅ User deleted atomically');

    } catch (error) {
        await session.abortTransaction();
        console.error('❌ Transaction failed, rolled back:', error);
        throw error;

    } finally {
        session.endSession();
    }
}

// Example 4: Using DbTransactionHelper (Your existing pattern)
const { DbTransactionHelper } = require('./src/util');

async function createUserWithDbHelper(userData, employeeData) {
    return await DbTransactionHelper.performDbTransaction(async (session) => {
        // 1. Create user
        const [user] = await User.create([userData], { session });

        // 2. Create employee
        const [employee] = await Employee.create([{
            ...employeeData,
            user: user._id
        }], { session });

        // 3. Index to cache (pass session!)
        await indexDocumenttoElasticSearch('users', user._id, {
            userId: user._id,
            employeeId: employee._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            // ... other fields
        }, session);

        return { user, employee };
    });
}

// Example 5: Bulk Operations with Cache (Atomic)
async function bulkCreateUsersWithCache(usersData) {
    const session = await mongoose.startSession();
    await session.startTransaction();

    try {
        // 1. Bulk create users
        const users = await User.insertMany(usersData, { session });

        // 2. Bulk create employees
        const employeesData = users.map(user => ({
            user: user._id,
            subscriber: user.subscriber,
            // ... other fields
        }));
        const employees = await Employee.insertMany(employeesData, { session });

        // 3. Bulk index to cache (within same transaction)
        const cacheDocuments = users.map((user, index) => ({
            id: user._id,
            userId: user._id,
            employeeId: employees[index]._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            // ... other fields
        }));

        const { bulkIndexDocumentsToElasticSearch } = require('./src/util/user_search_helper');
        await bulkIndexDocumentsToElasticSearch('users', cacheDocuments, session);

        // All succeed or all fail
        await session.commitTransaction();
        console.log(`✅ ${users.length} users created atomically`);
        return { users, employees };

    } catch (error) {
        await session.abortTransaction();
        console.error('❌ Transaction failed, rolled back:', error);
        throw error;

    } finally {
        session.endSession();
    }
}

// Example 6: Update with Related Data (Atomic)
async function updateUserVesselWithCache(userId, vesselId) {
    const session = await mongoose.startSession();
    await session.startTransaction();

    try {
        // 1. Update user's vessel
        const user = await User.findByIdAndUpdate(
            userId,
            { $set: { currentVessel: vesselId } },
            { new: true, session }
        );

        // 2. Get vessel details
        const { Vessel } = require('./src/app/vessle/vessel_model');
        const vessel = await Vessel.findById(vesselId).session(session);

        // 3. Update cache with vessel info (within same transaction)
        await updateDocumenttoElasticSearch('users', userId, {
            currentVessel: vesselId,
            vesselName: vessel?.name,
            vesselStatus: user.vesselStatus,
            updatedAt: new Date()
        }, session);

        // All succeed or all fail
        await session.commitTransaction();
        console.log('✅ User vessel updated atomically');
        return user;

    } catch (error) {
        await session.abortTransaction();
        console.error('❌ Transaction failed, rolled back:', error);
        throw error;

    } finally {
        session.endSession();
    }
}

module.exports = {
    createUserWithCache,
    updateUserWithCache,
    deleteUserWithCache,
    createUserWithDbHelper,
    bulkCreateUsersWithCache,
    updateUserVesselWithCache
};

/**
 * KEY POINTS:
 * 
 * 1. Always pass `session` to cache operations:
 *    - indexDocumenttoElasticSearch(index, id, doc, session)
 *    - updateDocumenttoElasticSearch(index, id, doc, session)
 *    - deleteDocumenttoElasticSearch(index, id, session)
 *    - bulkIndexDocumentsToElasticSearch(index, docs, session)
 * 
 * 2. All operations in the transaction succeed or fail together
 * 
 * 3. If any operation fails, everything rolls back
 * 
 * 4. Always use try/catch/finally with session.endSession()
 * 
 * 5. MongoDB replica set required for transactions
 */
