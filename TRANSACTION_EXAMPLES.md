# Transaction Examples: User Operations with Cache

This guide shows how to wrap User/Employee operations with cache updates in transactions for atomic consistency.

## Prerequisites

**MongoDB Requirements:**

-   MongoDB 4.0+
-   Replica set configuration (even single-node)
-   WiredTiger storage engine

**Check if your MongoDB supports transactions:**

```javascript
// In MongoDB shell
rs.status(); // Should show replica set info
```

---

## Example 1: Create User with Cache (Atomic)

```javascript
const mongoose = require("mongoose");
const { User } = require("./src/app/user/user_model");
const { Employee } = require("./src/app/user/employee/employee_model");
const { indexDocumenttoElasticSearch } = require("./src/util/user_search_helper");

async function createUserWithCache(userData, employeeData) {
    const session = await mongoose.startSession();

    try {
        await session.startTransaction();

        // 1. Create User
        const [user] = await User.create([userData], { session });

        // 2. Create Employee
        const [employee] = await Employee.create(
            [
                {
                    ...employeeData,
                    user: user._id,
                },
            ],
            { session }
        );

        // 3. Create Cache Entry
        const cacheData = {
            userId: user._id,
            employeeId: employee._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            designation: employee.designation,
            role: user.role,
            isActive: user.isActive,
            isRegistered: user.isRegistered,
            // ... other fields
        };

        await indexDocumenttoElasticSearch("users", user._id, cacheData, session);

        // 4. Commit - All succeed or all fail
        await session.commitTransaction();

        console.log("✅ User created with cache atomically");
        return user;
    } catch (error) {
        // Rollback everything
        await session.abortTransaction();
        console.error("❌ Transaction failed, rolled back:", error);
        throw error;
    } finally {
        session.endSession();
    }
}
```

---

## Example 2: Update User with Cache (Atomic)

```javascript
const { updateDocumenttoElasticSearch } = require("./src/util/user_search_helper");

async function updateUserWithCache(userId, updates) {
    const session = await mongoose.startSession();

    try {
        await session.startTransaction();

        // 1. Update User
        const user = await User.findByIdAndUpdate(
            userId,
            { $set: updates },
            { new: true, session }
        );

        if (!user) {
            throw new Error("User not found");
        }

        // 2. Update Cache
        const cacheUpdates = {
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            isActive: user.isActive,
            updatedAt: new Date(),
        };

        await updateDocumenttoElasticSearch("users", userId, cacheUpdates, session);

        // 3. Commit
        await session.commitTransaction();

        console.log("✅ User updated with cache atomically");
        return user;
    } catch (error) {
        await session.abortTransaction();
        console.error("❌ Transaction failed, rolled back:", error);
        throw error;
    } finally {
        session.endSession();
    }
}
```

---

## Example 3: Delete User with Cache (Atomic)

```javascript
const { deleteDocumenttoElasticSearch } = require("./src/util/user_search_helper");

async function deleteUserWithCache(userId) {
    const session = await mongoose.startSession();

    try {
        await session.startTransaction();

        // 1. Soft delete User
        await User.findByIdAndUpdate(
            userId,
            { $set: { isDeleted: true, deletedAt: new Date() } },
            { session }
        );

        // 2. Soft delete Employee
        await Employee.findOneAndUpdate(
            { user: userId },
            { $set: { isDeleted: true } },
            { session }
        );

        // 3. Delete from Cache
        await deleteDocumenttoElasticSearch("users", userId, session);

        // 4. Commit
        await session.commitTransaction();

        console.log("✅ User deleted with cache atomically");
    } catch (error) {
        await session.abortTransaction();
        console.error("❌ Transaction failed, rolled back:", error);
        throw error;
    } finally {
        session.endSession();
    }
}
```

---

## Example 4: Update User Profile (GraphQL Resolver)

```javascript
// In src/app/user/user-profile/user_profile_resolver.js

const mongoose = require("mongoose");
const { updateDocumenttoElasticSearch } = require("../../../util/user_search_helper");

module.exports.mutations = {
    updateUserProfile: async ({ input }, context) => {
        const session = await mongoose.startSession();

        try {
            await session.startTransaction();

            const userId = context.user._id;

            // 1. Update User
            const user = await User.findByIdAndUpdate(
                userId,
                { $set: input },
                { new: true, session }
            );

            // 2. Update Employee if needed
            if (input.designation) {
                await Employee.findOneAndUpdate(
                    { user: userId },
                    { $set: { designation: input.designation } },
                    { session }
                );
            }

            // 3. Update Cache
            const cacheUpdates = {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                designation: input.designation,
                updatedAt: new Date(),
            };

            await updateDocumenttoElasticSearch("users", userId, cacheUpdates, session);

            // 4. Commit
            await session.commitTransaction();

            return {
                success: true,
                message: "Profile updated successfully",
                user,
            };
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    },
};
```

---

## Example 5: Bulk User Update with Cache

```javascript
const { bulkUpdateDocumentsInElastic } = require("./src/util/user_search_helper");

async function bulkUpdateUsersWithCache(userUpdates) {
    const session = await mongoose.startSession();

    try {
        await session.startTransaction();

        // 1. Bulk update Users
        const bulkUserOps = userUpdates.map(({ userId, updates }) => ({
            updateOne: {
                filter: { _id: userId },
                update: { $set: updates },
            },
        }));

        await User.bulkWrite(bulkUserOps, { session });

        // 2. Bulk update Cache
        const cacheUpdates = userUpdates.map(({ userId, updates }) => ({
            id: userId,
            ...updates,
            updatedAt: new Date(),
        }));

        await bulkUpdateDocumentsInElastic("users", cacheUpdates, session);

        // 3. Commit
        await session.commitTransaction();

        console.log(`✅ ${userUpdates.length} users updated with cache atomically`);
    } catch (error) {
        await session.abortTransaction();
        console.error("❌ Bulk transaction failed, rolled back:", error);
        throw error;
    } finally {
        session.endSession();
    }
}
```

---

## Example 6: Vessel Assignment with Cache Update

```javascript
// In src/app/user/user-vessel-bridge/userVessel_resolver.js

const mongoose = require("mongoose");
const { updateDocumenttoElasticSearch } = require("../../../util/user_search_helper");

module.exports.mutations = {
    assignVesselToUser: async ({ input }, context) => {
        const session = await mongoose.startSession();

        try {
            await session.startTransaction();

            const { userId, vesselId } = input;

            // 1. Get vessel info
            const vessel = await Vessel.findById(vesselId).session(session);

            if (!vessel) {
                throw new Error("Vessel not found");
            }

            // 2. Update User
            await User.findByIdAndUpdate(
                userId,
                {
                    $set: {
                        currentVessel: vesselId,
                        vesselStatus: "ONBOARD",
                    },
                },
                { session }
            );

            // 3. Update Cache
            const cacheUpdates = {
                currentVessel: vesselId,
                vesselName: vessel.name,
                vesselStatus: "ONBOARD",
                vesselIsActive: vessel.isActive,
                tyepOfVesselId: vessel.typeOfVessel,
                updatedAt: new Date(),
            };

            await updateDocumenttoElasticSearch("users", userId, cacheUpdates, session);

            // 4. Commit
            await session.commitTransaction();

            return {
                success: true,
                message: "Vessel assigned successfully",
            };
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    },
};
```

---

## Example 7: User Registration with Multiple Operations

```javascript
async function registerUserComplete(registrationData) {
    const session = await mongoose.startSession();

    try {
        await session.startTransaction();

        // 1. Create User
        const [user] = await User.create(
            [
                {
                    firstName: registrationData.firstName,
                    lastName: registrationData.lastName,
                    email: registrationData.email,
                    password: hashedPassword,
                    role: "LEARNER",
                    isRegistered: true,
                },
            ],
            { session }
        );

        // 2. Create Employee
        const [employee] = await Employee.create(
            [
                {
                    user: user._id,
                    designation: registrationData.designation,
                    subscriber: registrationData.subscriber,
                },
            ],
            { session }
        );

        // 3. Create User Profile
        await UserProfile.create(
            [
                {
                    user: user._id,
                    phone: registrationData.phone,
                },
            ],
            { session }
        );

        // 4. Create Cache Entry
        const cacheData = {
            userId: user._id,
            employeeId: employee._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            designation: employee.designation,
            role: user.role,
            isRegistered: true,
            isActive: true,
            subscriber: employee.subscriber,
        };

        await indexDocumenttoElasticSearch("users", user._id, cacheData, session);

        // 5. Commit all operations
        await session.commitTransaction();

        console.log("✅ User registration completed atomically");
        return user;
    } catch (error) {
        await session.abortTransaction();
        console.error("❌ Registration failed, all operations rolled back:", error);
        throw error;
    } finally {
        session.endSession();
    }
}
```

---

## Error Handling Best Practices

### 1. Always Use Try-Catch-Finally

```javascript
const session = await mongoose.startSession();
try {
    await session.startTransaction();
    // operations
    await session.commitTransaction();
} catch (error) {
    await session.abortTransaction();
    throw error;
} finally {
    session.endSession(); // Always end session
}
```

### 2. Handle Specific Errors

```javascript
try {
    await session.startTransaction();
    // operations
    await session.commitTransaction();
} catch (error) {
    await session.abortTransaction();

    if (error.code === 11000) {
        throw new Error("Duplicate key error");
    } else if (error.name === "ValidationError") {
        throw new Error("Validation failed");
    } else {
        throw error;
    }
} finally {
    session.endSession();
}
```

### 3. Timeout Handling

```javascript
const session = await mongoose.startSession();
session.startTransaction({
    readConcern: { level: "snapshot" },
    writeConcern: { w: "majority" },
    maxCommitTimeMS: 30000, // 30 second timeout
});
```

---

## Testing Transactions

### Test 1: Verify Rollback on Failure

```javascript
async function testRollback() {
    const session = await mongoose.startSession();

    try {
        await session.startTransaction();

        // This will succeed
        await User.create([{ email: "test@example.com" }], { session });

        // This will fail (intentional)
        throw new Error("Simulated failure");

        // This won't execute
        await indexDocumenttoElasticSearch("users", userId, data, session);

        await session.commitTransaction();
    } catch (error) {
        await session.abortTransaction();
        console.log("✅ Rollback successful - user not created");
    } finally {
        session.endSession();
    }

    // Verify user was NOT created
    const user = await User.findOne({ email: "test@example.com" });
    console.log(user ? "❌ Rollback failed" : "✅ Rollback worked");
}
```

### Test 2: Verify Cache Consistency

```javascript
async function testCacheConsistency(userId) {
    // Get user from database
    const user = await User.findById(userId);

    // Get user from cache
    const cached = await UserSearchCache.findOne({ userId });

    // Compare
    const consistent =
        user.firstName === cached.firstName &&
        user.lastName === cached.lastName &&
        user.email === cached.email;

    console.log(consistent ? "✅ Cache consistent" : "❌ Cache inconsistent");
}
```

---

## Performance Considerations

### 1. Keep Transactions Short

```javascript
// ❌ Bad - Long transaction
await session.startTransaction();
await sendEmail(); // External API call
await updateUser();
await session.commitTransaction();

// ✅ Good - Short transaction
await session.startTransaction();
await updateUser();
await session.commitTransaction();
await sendEmail(); // After transaction
```

### 2. Batch Operations When Possible

```javascript
// ✅ Better - Single transaction for multiple users
await session.startTransaction();
await User.bulkWrite(operations, { session });
await UserSearchCache.bulkWrite(cacheOps, { session });
await session.commitTransaction();
```

---

## Summary

**Key Points:**

1. ✅ Always use try-catch-finally
2. ✅ Pass `session` to all operations
3. ✅ Commit on success, abort on failure
4. ✅ Always end session in finally block
5. ✅ Keep transactions short (< 60 seconds)
6. ✅ Test rollback behavior

**When to Use:**

-   User create/update/delete operations
-   Operations affecting multiple collections
-   When cache consistency is critical

**When NOT to Use:**

-   Long-running operations
-   External API calls
-   File uploads
-   Email sending
-   Read-only operations
