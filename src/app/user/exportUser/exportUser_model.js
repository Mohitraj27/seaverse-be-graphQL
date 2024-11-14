const mongoose = require('mongoose');
const { Schema } = mongoose;

const exportSchema = new Schema({
    filePath: {
        type: String,
        required: true,
    },
    subscriberId: {
        type: Schema.Types.ObjectId, 
        ref: 'Subscriber', 
        required: true,
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    updatedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
    },
    type_of_export: {
        type: String,
        enum: ['USER_EXPORT'],
        required: true,
    }
}, { timestamps: true });  

const Export = mongoose.model('Export', exportSchema);
module.exports = Export;
