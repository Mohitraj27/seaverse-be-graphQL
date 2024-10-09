const { Schema, Model } = require("../../tools");

const otpSchema = new Schema(
    {
        email: {
            type: String,
            trim: true,
        },
        phone: {
            type: {
                countryCode: {
                    type: String,
                    trim: true,
                    required: true,
                },
                number: {
                    type: String,
                    trim: true,
                    required: true,
                },
            },
        },
        verificationOtp: {
            type: {
                value: {
                    type: String,
                    required: true,
                },
                expireAt: {
                    type: Date,
                    required: true,
                },
            },
            required: true,
        },
    },
    { timestamps: true }
);

module.exports.Otp = Model("Otp", otpSchema);
