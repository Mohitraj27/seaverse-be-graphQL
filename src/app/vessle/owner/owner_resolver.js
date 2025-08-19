const {
    CustomError,
    ErrorName,
    AuthUser
} = require("../../../util");

const { ObjectId } = require("../../../tools");
const { Owner } = require("../owner/owner_model");
const { encrypt,decrypt } = require("../../../util/encryption_helper"); 

module.exports.queries = {
    getOwners: async ({ search }, context) => {
        const { subscriberId } = AuthUser(context);
        try {
            const query = {
                subscriber: ObjectId(subscriberId),
                isDeleted: false
            };
            
            const owners = await Owner.find(query);
            let decryptedOwnersName = owners.map(owner => {
                return {
                    ...owner.toObject(),
                    name: decrypt(owner.name)
                };
            });
            if (search) {
                const searchLower = search.toLowerCase();
                decryptedOwnersName = decryptedOwnersName.filter(owner =>
                    owner.name.toLowerCase().includes(searchLower)
                );
            }
            return {
                owners: decryptedOwnersName,
                totalCount: owners.length
            }
        } catch (error) {
            throw Error(error.message);
        }
    },
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