const {
    CustomError,
    ErrorName,
    AuthUser,
    SendEmail
} = require("../../../util");
const { User } = require("../user_model");
const { UserVessel } = require("./userVessel_model");
const { Vessel } = require('../../vessle/vessel_model');
const {vesselAssignmentEmail, vesselAssignmentEmailforAdmin} = require("../../email-template/assignVessel");
module.exports.mutations = {
    assignVesselToUser: async ({ input }, context) => {

        try {

            const { subscriberId,userInfo } = AuthUser(context);

            if (!input.vesselId || !input.userId) {
                throw CustomError(ErrorName.VALIDATION_ERROR, "Provide all the required fields");
            }

            const getVessel = await Vessel.findById(input.vesselId);

            if (!getVessel) {
                throw CustomError(ErrorName.VESSEL_NOT_FOUND, "Vessel not found");
            }

            const getUser = await User.findById(input.userId);

            if (!getUser) {
                throw CustomError(ErrorName.USER_NOT_FOUND, "User not found");
            }

            await UserVessel.findOneAndUpdate({ user: input.userId, isActive: true },
                {
                    $set: {
                        isActive: false,
                        deletedAt: Date.now()
                    }
                });

            const newVesselUpdate = await UserVessel.create({
                user: input.userId,
                vessel: input.vesselId,
                isActive: true,
                vesselStatus: input.vesselStatus || 'ASSIGNED',
            });

            if (newVesselUpdate) {

                const updateUser = await User.findByIdAndUpdate(input.userId, { currentVessel: input.vesselId, vesselStatus: input.vesselStatus || 'ASSIGNED' }, { new: true });

                if (updateUser) {
                    const emailContent = vesselAssignmentEmail({
                        firstName: getUser.firstName, 
                        vesselName: getVessel.name, 
                    });
                    console.log(getUser.email);
                    await SendEmail({
                        receiverEmail: getUser.email,
                        subject: `Vessel Assignment Notification`,
                        htmlContent: emailContent,
                    });
                    const emailContentforAdmin = vesselAssignmentEmailforAdmin({
                        firstName: userInfo.firstName,
                        vesselName: getVessel.name,
                        userName: getUser.firstName,
                    })
                    console.log(userInfo.email)
                    await SendEmail({
                        receiverEmail: userInfo.email,
                        subject: `User Vessel Assignment Notification`,
                        htmlContent: emailContentforAdmin,
                    })
                    return {
                        status: "Success",
                        message: "The vessel assigned successfully!"
                    }
                }

            }

        } catch (error) {

            throw CustomError(ErrorName.FAILED, `${error.message}`);

        }
    }
};