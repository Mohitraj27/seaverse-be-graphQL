const {
    CustomError,
    ErrorName,
    AuthUser,
    SendEmail,
    VesselStatus
} = require("../../../util");
const { User } = require("../user_model");
const { UserVessel } = require("./userVessel_model");
const { Vessel } = require('../../vessle/vessel_model');
const { vesselAssignmentEmail, vesselAssignmentEmailforAdmin } = require("../../email-template/assignVessel");
module.exports.mutations = {
    assignVesselToUser: async ({ input }, context) => {

        try {

            const { subscriberId, userInfo } = AuthUser(context);

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

            let newVesselUpdate;

            if (String(getUser?.currentVessel) === String(input.vesselId)) {

                newVesselUpdate = await UserVessel.findOneAndUpdate({ user: input.userId, isActive: true, vessel: input.vesselId },
                    {
                        $set: {
                            vesselStatus: input.vesselStatus || VesselStatus.ONSHORE,
                            isActive: input.vesselStatus === VesselStatus.ONSHORE ? false : true,
                            deletedAt: input.vesselStatus === VesselStatus.ONSHORE ? Date.now() : null
                        }
                    }
                );

            } else {

                await UserVessel.findOneAndUpdate({ user: input.userId, isActive: true },
                    {
                        $set: {
                            isActive: false,
                            vesselStatus: VesselStatus.ONSHORE,
                            deletedAt: Date.now()
                        }
                    }
                );

                if (input.vesselStatus !== VesselStatus.ONSHORE) {

                    newVesselUpdate = await UserVessel.create({
                        user: input.userId,
                        vessel: input.vesselId,
                        isActive: true,
                        vesselStatus: input.vesselStatus || VesselStatus.ONSHORE,
                    });

                }
            }



            if (newVesselUpdate) {

                const updateUser = await User.findByIdAndUpdate(input.userId, { currentVessel: input.vesselStatus == VesselStatus.ONSHORE ? null : input.vesselId, vesselStatus: input.vesselStatus || VesselStatus.ONSHORE }, { new: true });

                if (updateUser) {
                    const emailContent = vesselAssignmentEmail({
                        firstName: getUser.firstName,
                        vesselName: getVessel.name,
                    });
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