const {
    CustomError,
    ErrorName,
    AuthUser
} = require("../../../util");

const { ObjectId } = require("../../../tools");
const { Owner } = require("../owner/owner_model");
const { encrypt, decrypt } = require("../../../util/encryption_helper");

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
                const encryptedSearch = encrypt(search, true); // deterministic encryption
                query.$or = [
                    { firstName: { $regex: encryptedSearch, $options: "i" } },
                    { lastName: { $regex: encryptedSearch, $options: "i" } }
                ];
            }

            // Fetch from DB
            const owners = await Owner.find(query);

            // Decrypt before returning
            const decryptedOwners = owners.map(owner => {
                const obj = owner.toObject();
                return {
                    ...obj,
                    // name: obj.name ? decrypt(obj.name) : "",
                    firstName: obj.firstName ? decrypt(obj.firstName) : "",
                    lastName: obj.lastName ? decrypt(obj.lastName) : "",
                    address: obj.address ? decrypt(obj.address) : "",

                };
            });


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
            const { name } = input;
            const owner = new Owner({
                subscriber: subscriberId,
                name: encrypt(name),
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