const { Schema } = require("../tools");

const StringNormalize = require("./string_helper").stringNormalize;

module.exports.LocalisedDataSchema = new Schema({
    lang: {
        type: String,
        lowercase: true,
        required: true,
    },
    value: {
        type: String,
        trim: true,
        set: StringNormalize,
        required: true,
    },
});
