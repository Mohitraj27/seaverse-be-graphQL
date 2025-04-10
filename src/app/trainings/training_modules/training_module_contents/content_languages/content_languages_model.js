const { Schema, Model, ObjectId, AggregatePaginate } = require("../../../../../tools");
const mongoose = require('mongoose');

const contentLanguagesSchema = new Schema(
    {
        title: {
            type: String,
            required: true,
            unique: true,
        },
        contentLanguageCode: {
            type: String,
            required: true,
            unique: true,
        },
        createdBy: {
            type: ObjectId,
            ref: "User",
            required: true,
        },
        updatedBy: {
            type: ObjectId,
            ref: "User",
            required: true
        },
    },
    { timestamps: true }
);


const contentLanguage = mongoose.model('contentLanguage', contentLanguagesSchema);

module.exports = contentLanguage;
