const { User } = require("../../user/user_model");
const { CryptoHelper } = require("../../../tools");
const { generateRandomString } = require("../../user/user-profile/user_profile_helper");

/**
 * Add dummy passwords for users with null dummyPassword
 * Called from the admin UI
 */
const addDummyPasswordsResolver = async (req, res) => {
    try {
        console.log('[ADD-DUMMY-PASSWORDS] API called');

        // Find all users with null dummyPassword
        const usersWithoutDummyPassword = await User.find({
            dummyPassword: null,
            isDeleted: false
        }).select('_id email firstName lastName dummyPassword').lean();

        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        console.log(`[ADD-DUMMY-PASSWORDS] Starting: Found ${usersWithoutDummyPassword.length} users`);

        // Process users in batches
        const batchSize = 100;

        for (let i = 0; i < usersWithoutDummyPassword.length; i += batchSize) {
            const batch = usersWithoutDummyPassword.slice(i, i + batchSize);

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
            });

            await Promise.all(updatePromises);
        }

        // Verify the updates
        const updatedCount = await User.countDocuments({
            recentlyAddedDummyPass: true,
            isDeleted: false
        });

        console.log(`[ADD-DUMMY-PASSWORDS] Completed: Success: ${successCount}, Errors: ${errorCount}`);

        return res.json({
            success: true,
            message: 'Dummy passwords added successfully',
            summary: {
                totalProcessed: usersWithoutDummyPassword.length,
                successCount,
                errorCount,
                updatedCount,
                errors: errors.length > 0 ? errors : null
            }
        });
    } catch (error) {
        console.error('[ADD-DUMMY-PASSWORDS] Error:', error);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = { addDummyPasswordsResolver };
