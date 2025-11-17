require("dotenv").config();
const { User } = require("../src/app/user/user_model");
const { CryptoHelper } = require("../src/tools");
const { generateRandomString } = require("../src/app/user/user-profile/user_profile_helper");
const { connectToMongo } = require("../src/util/mongodb_helper");

/**
 * Script to add dummy passwords for users who have null dummyPassword
 * and add recentlyAddedDummyPass flag to their profile
 */

async function addDummyPasswordsToUsers() {
    try {
        console.log("🔄 Connecting to MongoDB...");
        if (!process.env.MONGO_DB) {
            throw new Error("MONGO_DB environment variable is not set. Please check your .env file.");
        }
        await connectToMongo(process.env.MONGO_DB);
        console.log("✅ MongoDB connection successful\n");

        // Find all users with null dummyPassword
        console.log("🔍 Searching for users with null dummyPassword...");
        const usersWithoutDummyPassword = await User.find({
            dummyPassword: null,
            isDeleted: false
        }).select('_id email firstName lastName dummyPassword').lean();

        console.log(`📊 Found ${usersWithoutDummyPassword.length} users with null dummyPassword\n`);

        if (usersWithoutDummyPassword.length === 0) {
            console.log("✨ No users found with null dummyPassword. Exiting...");
            process.exit(0);
        }

        // Display preview of users to be updated
        console.log("👥 Preview of users to be updated:");
        usersWithoutDummyPassword.slice(0, 5).forEach((user, index) => {
            console.log(`   ${index + 1}. ${user.firstName} ${user.lastName} (${user.email})`);
        });
        if (usersWithoutDummyPassword.length > 5) {
            console.log(`   ... and ${usersWithoutDummyPassword.length - 5} more users`);
        }
        console.log();

        // Process users in batches
        const batchSize = 100;
        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        for (let i = 0; i < usersWithoutDummyPassword.length; i += batchSize) {
            const batch = usersWithoutDummyPassword.slice(i, i + batchSize);
            const batchNumber = Math.floor(i / batchSize) + 1;
            console.log(`⚙️  Processing batch ${batchNumber} (${batch.length} users)...`);

            const updatePromises = batch.map(async (user) => {
                try {
                    // Generate random password
                    const generatePassword = generateRandomString(10);

                    // Hash the password
                    const dummyPasswordHash = await CryptoHelper.hash(generatePassword, 10);

                    // Format: hash~~~plaintext
                    const dummyPassword = `${dummyPasswordHash}~~~${generatePassword}`;
                    const passwordHash = dummyPasswordHash;

                    // Update user with new dummy password and flag
                    const result = await User.findByIdAndUpdate(
                        user._id,
                        {
                            dummyPassword: dummyPassword,
                            password: passwordHash,
                            recentlyAddedDummyPass: true
                        },
                        { new: true }
                    );

                    if (result) {
                        successCount++;
                    }
                } catch (error) {
                    errorCount++;
                    const errorMsg = `Failed to update user ${user.email}: ${error.message}`;
                    errors.push(errorMsg);
                }
            }); await Promise.all(updatePromises);
            console.log(`   ✅ Batch ${batchNumber} completed\n`);
        }

        // Summary
        console.log("\n" + "=".repeat(60));
        console.log("📋 MIGRATION SUMMARY");
        console.log("=".repeat(60));
        console.log(`Total users processed: ${usersWithoutDummyPassword.length}`);
        console.log(`✅ Successfully updated: ${successCount}`);
        console.log(`❌ Failed: ${errorCount}`);

        if (errors.length > 0) {
            console.log("\n⚠️  Errors encountered:");
            errors.forEach((error, index) => {
                console.log(`   ${index + 1}. ${error}`);
            });
        }

        console.log("\n🏁 Script execution completed!\n");

        // Verify the updates
        console.log("🔍 Verifying updates...");
        const updatedCount = await User.countDocuments({
            recentlyAddedDummyPass: true,
            isDeleted: false
        });
        console.log(`✅ Users with recentlyAddedDummyPass flag: ${updatedCount}\n`);

        process.exit(0);
    } catch (error) {
        console.error("❌ Error during migration:", error);
        process.exit(1);
    }
}

// Run the script
addDummyPasswordsToUsers();
