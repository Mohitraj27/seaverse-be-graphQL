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
        certificateNumber:{
            type:String
        },
        pdfUrl:{
            type:String
        },
        isFromMigration:{
            type:Boolean
        },
        user:{
            type:ObjectId
        },
        authorName: String,
        title: [LocalisedDataSchema],
        authorName: String,
        authoringTitle: String,
        certificateReference: String,
        courseProvidedBy : String,
        logos: [{
            url: String,
        }],
        additionalData: [{
            key: { type: String, required: true },
            value: { type: Types.Mixed, required: true }
        }],
        disabled: {
            type: Boolean,
            default: false,
        },
        certificateExpiry : { // using number because we are saving the number of days
            type : Number,
            default : null
        }, 
        version : Number,
    },
    { timestamps: true }
);
module.exports.certificateLayout = Model(
    "certificateLayout",
    certificateLayout
);
