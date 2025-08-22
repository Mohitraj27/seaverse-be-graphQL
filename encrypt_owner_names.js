const { encrypt, decrypt } = require('./src/util/encryption_helper');
const { Owner } = require('./src/app/vessle/owner/owner_model');
const mongoose = require('mongoose');
require('dotenv').config();

/**
 * Encrypts data using the encryption helper
 * @param {string} data - Data to encrypt
 * @returns {string|null} - Encrypted data or null
 */
function encryptData(data) {
    try {
        return data ? encrypt(data, true) : null; // deterministic
    } catch (error) {
        console.error('Encryption error:', error.message);
        return null;
    }
}

/**
 * Connect to MongoDB
 */
async function connectToDatabase() {
    try {
        const mongoUri = process.env.MONGO_DB;
        if (!mongoUri) {
            throw new Error('MONGO_DB environment variable is not set');
        }

        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log('✅ Connected to MongoDB:', mongoose.connection.db.databaseName);
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        throw error;
    }
}

/**
 * Main function to process owner names - split name and encrypt name/firstName/lastName/address
 */
async function processOwnerNames() {
    try {
        await connectToDatabase();
        console.log('Starting owner name processing...');

        const owners = await Owner.find({ isDeleted: false });
        console.log(`Found ${owners.length} owners to process`);

        let processedCount = 0;
        let errorCount = 0;

        for (const owner of owners) {
            try {
                if (!owner.name) {
                    console.log(`Skipping owner ${owner._id} - no name field`);
                    continue;
                }

                // Try to decrypt name, fallback to plain
                let decryptedName;
                try {
                    decryptedName = decrypt(owner.name, true);
                } catch (decryptError) {
                    decryptedName = owner.name;
                }

                // Split into parts
                const nameParts = decryptedName.trim().split(/\s+/);
                const firstName = nameParts[0] || '';
                const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

                // Encrypt all fields
                const encryptedName = encryptData(decryptedName); // ✅ encrypt the full name
                const encryptedFirstName = firstName ? encryptData(firstName) : null;
                const encryptedLastName = lastName ? encryptData(lastName) : null;
                const encryptedAddress = owner.address ? encryptData(owner.address) : null;

                // Prepare update object
                const updateData = {};
                if (encryptedName) {
                    updateData.name = encryptedName;
                }
                if (encryptedFirstName) {
                    updateData.firstName = encryptedFirstName;
                }
                if (encryptedLastName) {
                    updateData.lastName = encryptedLastName;
                }
                if (encryptedAddress) {
                    updateData.address = encryptedAddress;
                }

                if (Object.keys(updateData).length > 0) {
                    await Owner.updateOne({ _id: owner._id }, { $set: updateData });
                    processedCount++;

                    const addressInfo = owner.address ? `, address: "${owner.address}"` : '';
                    console.log(
                        `✔ Processed owner ${owner._id}: "${decryptedName}" → firstName: "${firstName}", lastName: "${lastName}"${addressInfo}`
                    );
                } else {
                    console.log(`No updates needed for owner ${owner._id}`);
                }
            } catch (error) {
                errorCount++;
                console.error(`❌ Error processing owner ${owner._id}:`, error.message);
            }
        }

        console.log(`\nProcessing complete:`);
        console.log(`- Total owners: ${owners.length}`);
        console.log(`- Successfully processed: ${processedCount}`);
        console.log(`- Errors: ${errorCount}`);

    } catch (error) {
        console.error('Error in processOwnerNames:', error);
        throw error;
    } finally {
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
            console.log('🔌 MongoDB connection closed');
        }
    }
}

// Export
module.exports = {
    encryptData,
    processOwnerNames,
    connectToDatabase,
};

// Run directly
if (require.main === module) {
    processOwnerNames()
        .then(() => {
            console.log('Script completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Script failed:', error);
            process.exit(1);
        });
}
