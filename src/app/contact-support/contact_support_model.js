const mongoose = require('mongoose');

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
