const { AuthUser, Role, CustomError, ErrorName } = require("../../../util");

const { TrainingAttendance } = require("./training_attendance_model");

module.exports = {
    createOrUpdateTrainingAttendance: async ({ input, session }, context) => {
        const { role, subscriberId, employeeId } = AuthUser(context);

        const attendanceFilterConditions = {
            subscriber: subscriberId,
            trainingRegistration: input.trainingRegistrationId,
        };

        const attendanceUpdateData = {};

        if (context.platform === Role.EMPLOYEE && role === Role.EMPLOYEE && employeeId) {
            attendanceUpdateData.employee = employeeId;
        } else if (input.employee) {
            attendanceUpdateData.employee = input.employee;
        }

        if (!attendanceUpdateData.employee) throw CustomError(ErrorName.ARGUMENTS_REQUIRED);
        const savedTrainingAttendance = await TrainingAttendance.findOneAndUpdate(
            attendanceFilterConditions,
            {
                $setOnInsert: {
                    ...attendanceFilterConditions,
                    ...attendanceUpdateData,
                },
                $addToSet: { attendances: input.attendances },
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true,
                runValidators: true,
                lean: true,
                session,
            }
        );

        if (!savedTrainingAttendance) throw CustomError(ErrorName.FAILED);
        return savedTrainingAttendance;
    },
};
