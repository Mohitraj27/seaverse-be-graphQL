const { Schema, Model, ObjectId, AggregatePaginate } = require("../../../tools");
const { LocalisedDataSchema } = require("../../../util/localised_data_schema");

const classroomModuleSchema = new Schema(
    {
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            required: true,
            index: true,
        },
        title: [LocalisedDataSchema],
        description: [LocalisedDataSchema],
        classroomModuleImage:[
            { url: String}
        ],
        details: [
            {
                startDate: { type: Date, required: true },
                endDate: { type: Date, required: true },
            },
        ],
        time: {
            startTime: { type: String, required: true }, 
            endTime: { type: String, required: true },   
        },
        meetingRoomName: { type: String },
        seatLimit: { type: Number },
        Instructor: { type: String},
        courseId: { 
            type: ObjectId, 
            ref: "Training", 
        }, 
        createdBy: {
            type: ObjectId,
            ref: "User",
        },
    },
    { timestamps: true }
);

classroomModuleSchema.index({ _id: 1, subscriber: 1 });
classroomModuleSchema.plugin(AggregatePaginate);
module.exports.ClassroomModule = Model("ClassroomModule", classroomModuleSchema);
