const mongoose = require('mongoose');
const TermsAndConditionsSchema = new mongoose.Schema({
    message: {
        type: String,
        required: true
    },
    title: {
        type: String,
        required: true
    },
    status: {
        type: Boolean,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});
const ContactSupportSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        trim: true
    },
    subject: {
        type: String,
        required: true,
        maxlength: 500
    },
    consents: [TermsAndConditionsSchema],
    message: {
        type: String,
        required: true,
        maxlength: 200
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const ContactSupportUser = mongoose.model('ContactSupportUser', ContactSupportSchema);

module.exports = ContactSupportUser;
