const { CustomError, ErrorName } = require("../../../util");

const { UserAddress } = require("./user_address_model");

module.exports = {
    createOrUpdateAddress: async ({ input }, { userId }) => {
        const savedAddress = await UserAddress.findOneAndUpdate(
            { user: userId },
            {
                user: userId,
                houseNameOrNumber: input.houseNameOrNumber,
                street: input.street,
                country: input.country,
                place: input.place,
                postalCode: input.postalCode,
            },
            {
                setDefaultsOnInsert: true,
                upsert: true,
                new: true,
            }
        ).lean();

        if (savedAddress) return savedAddress;
        throw CustomError(ErrorName.FAILED);
    },
};
