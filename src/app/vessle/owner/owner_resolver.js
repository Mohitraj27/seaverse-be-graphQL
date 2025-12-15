const {
    CustomError,
    ErrorName,
    AuthUser
} = require("../../../util");

const { ObjectId } = require("../../../tools");
const { Owner } = require("../owner/owner_model");
const { encrypt, decrypt } = require("../../../util/encryption_helper");

// Utility function to safely decrypt data
const safeDecrypt = (encryptedData, fieldName = 'field') => {
    if (!encryptedData) return '';

    // Check if data looks corrupted (too long or contains invalid patterns)
    if (encryptedData.length > 10000) {
        console.warn(`${fieldName} appears corrupted - too long: ${encryptedData.length} characters`);
        return '';
    }

    try {
        return decrypt(encryptedData);
    } catch (error) {
        console.warn(`Failed to decrypt ${fieldName}:`, error.message);
        return '';
    }
};

// Utility function to safely encrypt data
const safeEncrypt = (plainData, fieldName = 'field') => {
    if (!plainData || plainData.length === 0) return null;

    // Strict length validation
    if (plainData.length > 100) {
        throw new Error(`${fieldName} is too long: ${plainData.length} characters`);
    }

    try {
        return encrypt(plainData);
    } catch (error) {
        console.error(`Failed to encrypt ${fieldName}:`, error.message);
        throw new Error(`Failed to process ${fieldName}`);
    }
};

module.exports.queries = {
    getOwners: async ({ search }, context) => {
        const { subscriberId } = AuthUser(context);
        try {
            const query = {
                subscriber: ObjectId(subscriberId),
                isDeleted: false
            };

            // If search is provided → encrypt it
            if (search) {
                try {
                    const encryptedSearch = safeEncrypt(search, 'search term');
                    query.$or = [
                        { firstName: { $regex: encryptedSearch, $options: "i" } },
                        { lastName: { $regex: encryptedSearch, $options: "i" } }
                    ];
                } catch (error) {
                    console.warn('Failed to encrypt search term, skipping encrypted search:', error.message);
                }
            }

            // Fetch from DB
            const owners = await Owner.find(query);

            // Decrypt before returning
            let decryptedOwners = owners.map(owner => {
                const obj = owner.toObject();
                const firstName = obj.firstName ? safeDecrypt(obj.firstName, 'owner firstName') : "";
                const lastName = obj.lastName ? safeDecrypt(obj.lastName, 'owner lastName') : "";
                let name = obj.name ? safeDecrypt(obj.name, 'owner name') : "";

                // If name is empty but we have firstName/lastName, construct it
                if (!name && (firstName || lastName)) {
                    name = `${firstName} ${lastName}`.trim();
                }

                return {
                    ...obj,
                    name: name,
                    firstName: firstName,
                    lastName: lastName,
                    address: obj.address ? safeDecrypt(obj.address, 'owner address') : "",
                };
            });

            // Sort owners by firstName (ascending)
            decryptedOwners.sort((a, b) => a.firstName.localeCompare(b.firstName));
            return {
                owners: decryptedOwners,
                totalCount: decryptedOwners.length
            };

        } catch (error) {
            throw Error(error.message);
        }
    }


};

module.exports.mutations = {
    createOwner: async ({ input }, context) => {
        const { userId, subscriberId } = AuthUser(context);
        try {
            const { name, firstName, lastName, address } = input;

            // If firstName and lastName are provided, use them; otherwise split the name
            let encryptedFirstName, encryptedLastName, encryptedName;

            if (firstName || lastName) {
                encryptedFirstName = firstName ? safeEncrypt(firstName, 'owner firstName') : null;
                encryptedLastName = lastName ? safeEncrypt(lastName, 'owner lastName') : null;
                encryptedName = name ? safeEncrypt(name, 'owner name') : safeEncrypt(`${firstName || ''} ${lastName || ''}`.trim(), 'constructed owner name');
            } else if (name) {
                // Split name into firstName and lastName
                const nameParts = name.trim().split(/\s+/);
                const firstNamePart = nameParts[0] || '';
                const lastNamePart = nameParts.slice(1).join(' ') || '';

                encryptedFirstName = firstNamePart ? safeEncrypt(firstNamePart, 'owner firstName') : null;
                encryptedLastName = lastNamePart ? safeEncrypt(lastNamePart, 'owner lastName') : null;
                encryptedName = safeEncrypt(name, 'owner name');
            }

            const owner = new Owner({
                subscriber: subscriberId,
                name: encryptedName,
                firstName: encryptedFirstName,
                lastName: encryptedLastName,
                address: address ? safeEncrypt(address, 'owner address') : null,
                createdBy: userId,
                updatedBy: userId
            });

            await owner.save();

            return {
                success: true,
                message: "Owner created successfully",
                owner
            }
        } catch (error) {
            throw Error(error.message);
        }
    },
};