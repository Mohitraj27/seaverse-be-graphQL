module.exports = {
    types: `
        type UserAddress {
            houseNameOrNumber: String
            street: String
            country: String
            place: String
            postalCode: String
        }
        input UserAddressInput {
            houseNameOrNumber: String!
            street: String!
            country: String!
            place: String
            postalCode: String
        }
    `,
};
