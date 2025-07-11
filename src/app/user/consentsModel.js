const { Schema, Model, ObjectId } = require("../../tools");


const consentSchema = new Schema(
    {
        user: {
            type: ObjectId,
            ref: "User",
            required: true,
        },
        consentType: { 
            type: String,
            required: true,
        },
        message: { type: String },
        title: { type: String },
        status: { type: Boolean }
    },
    { timestamps: true }
);

const Consent = Model("Consent", consentSchema);
module.exports = {
    Consent,
};
