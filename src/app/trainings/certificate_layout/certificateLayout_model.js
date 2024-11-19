const { Schema, Model, ObjectId} = require("../../../tools");
const Types  = require('mongoose');
const { LocalisedDataSchema } = require("../../../util/localised_data_schema");

const certificateLayout = new Schema(
    {
        layout: {
            type: String,
            default: "0",
        },
        training: {
            type: ObjectId,
            ref: "Training",
            required: true,
        },
        authorName: String,
        title: [LocalisedDataSchema],
        authorName: String,
        authoringTitle: String,
        certificateReference: String,
        logos: [{
            url: String,
        }],
        additionalData: [{
            key: { type: String, required: true },
            value: { type: Types.Mixed, required: true }
        }]
    },
    { timestamps: true }
);
module.exports.certificateLayout = Model(
    "certificateLayout",
    certificateLayout
);
