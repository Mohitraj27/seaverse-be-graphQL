const { Moment } = require("../tools");

module.exports = {
    generateOtp: ({ count = 6, expiryInMinutes = 10 }) => {
        const digits = "0123456789";
        let otp = "";

        for (let i = 0; i < count; i++) otp += digits[Math.floor(Math.random() * count)];

        return {
            value: otp,
            expireAt: Moment().add({ minute: expiryInMinutes }),
        };
    },
};
