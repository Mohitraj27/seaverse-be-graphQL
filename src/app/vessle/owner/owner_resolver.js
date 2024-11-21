const {
    CustomError,
    ErrorName,
    AuthUser
} = require("../../../util");

const { ObjectId } = require("../../../tools");
const { Owner } = require("../owner/owner_model");

module.exports.queries = {
    getOwners: async ({ search }, context) => {
        const { subscriberId } = AuthUser(context);
        try {
            const query = {
                subscriber: ObjectId(subscriberId),
                isDeleted: false
            };
            if (search) {
                query.name = { $regex: search, $options: "i" };
            }
            const owners = await Owner.find(query);

            return {
                owners,
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
                name: name,
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