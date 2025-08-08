const mongoose = require("mongoose");
const { Schema } = mongoose;
const signupStatus = require("./signup-status");
const SignupRequestSchema = new Schema({
    firstName: { type: String},
    lastName: { type: String},
    email: { type: String, required: true },
    requestDate: { type: Date, default: Date.now },
    signupStatus: { type: String, required: true, enum: [signupStatus], default: signupStatus.PENDING },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    isDeleted: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("SignupRequest", SignupRequestSchema);
