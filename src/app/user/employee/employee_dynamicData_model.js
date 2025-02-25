const { Schema, model, ObjectId } = require("mongoose");

const dynamicDataSchema = new Schema(
    {
        userId: {
            type: ObjectId,
            ref: "User",  
            required: true,
        },
        jsonData: {
            type: Schema.Types.Mixed,  
            required: true,
        }
    },
    { timestamps: true } 
);

module.exports.DynamicData = model("DynamicData", dynamicDataSchema);
