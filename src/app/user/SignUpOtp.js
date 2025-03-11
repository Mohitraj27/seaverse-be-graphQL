const mongoose = require('mongoose');

const signUpOtpSchema = new mongoose.Schema({
    otp: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        trim: true
    },
    generatedtoken: {
        type: String
    }
}, { timestamps: true });

const SignUpOtp = mongoose.model('SignUpOtp', signUpOtpSchema);

module.exports = SignUpOtp;
