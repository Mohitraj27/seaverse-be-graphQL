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
const NotificationHelper = require("../../notifications/notification_helper");
const NotificationType = require("../../notifications/notification_type.json");
const notificationEnum = require("../../notifications/notification_icon.json")
module.exports.mutations = {
    assignVesselToUser: async ({ input }, context) => {

        try {

            const { subscriberId, userInfo } = AuthUser(context);

            if (!input.userId) {
                throw CustomError(ErrorName.VALIDATION_ERROR, "Provide all the required fields");
            }

            let getVessel;
            if (input.vesselId) {
                getVessel = await Vessel.findById(input.vesselId);
                if (!getVessel) {
                    throw CustomError(ErrorName.VESSEL_NOT_FOUND, "Vessel not found");
                }
            }

            const getUser = await User.findById(input.userId);

            if (!getUser) {
                throw CustomError(ErrorName.USER_NOT_FOUND, "User not found");
            }

            let newVesselUpdate;
            let updateUser;
            let newVessel;

            if (input.vesselId) {

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

                    getUser.currentVessel = input.vesselStatus === VesselStatus.ONSHORE ? null : input.vesselId;
                    getUser.vesselStatus = input.vesselStatus || VesselStatus.ONSHORE;
                    updateUser = await getUser.save();

                } else {

                    newVesselUpdate = await UserVessel.findOneAndUpdate({ user: input.userId, isActive: true, vessel: input.vesselId },
                        {
                            $set: {
                                vesselStatus: input.vesselStatus || VesselStatus.ONSHORE,
                                isActive: input.vesselStatus === VesselStatus.ONSHORE ? false : true,
                                deletedAt: input.vesselStatus === VesselStatus.ONSHORE ? Date.now() : null
                            }
                        }
                    );

                    newVessel = await UserVessel.create({
                        user: input.userId,
                        vessel: input.vesselId,
                        vesselStatus: input.vesselStatus || VesselStatus.ONSHORE,
                        isActive: input.vesselStatus === VesselStatus.ONSHORE ? false : true,
                    });

                    getUser.currentVessel = input.vesselStatus === VesselStatus.ONSHORE ? null : input.vesselId;
                    getUser.vesselStatus = input.vesselStatus || VesselStatus.ONSHORE;
                    updateUser = await getUser.save();
                }
            } else {

                newVesselUpdate = await UserVessel.findOneAndUpdate({ user: input.userId, isActive: true },
                    {
                        $set: {
                            vesselStatus: input?.vesselStatus || VesselStatus.ONSHORE,
                            isActive: input?.vesselStatus === VesselStatus.ONSHORE ? false : true,
                            deletedAt: input?.vesselStatus === VesselStatus.ONSHORE ? Date.now() : null
                        }
                    }
                );

                newVesselUpdate = await UserVessel.findOne({ user: input.userId })
                    .sort({ updatedAt: -1 });

                newVesselUpdate.vesselStatus = input?.vesselStatus || VesselStatus.ONSHORE;
                newVesselUpdate.isActive = input?.vesselStatus === VesselStatus.ONSHORE ? false : !input.vesselId ? false : true;
                newVesselUpdate.deletedAt = input?.vesselStatus === VesselStatus.ONSHORE ? Date.now() : !input.vesselId ? Date.now() : null;
                await newVesselUpdate.save();

                getUser.currentVessel = input.vesselStatus === VesselStatus.ONSHORE ? null : input.vesselId ? input.vesselId : null;
                getUser.vesselStatus = input.vesselStatus || VesselStatus.ONSHORE;
                updateUser = await getUser.save();

            }

            if (updateUser) {

                const emailContent = vesselAssignmentEmail({
                    firstName: getUser.firstName,
                    vesselName: getVessel?.name || 'N/A',
                });
                await SendEmail({
                    receiverEmail: getUser.email,
                    subject: `Vessel Assignment Notification`,
                    htmlContent: emailContent,
                });
                const emailContentforAdmin = vesselAssignmentEmailforAdmin({
                    firstName: userInfo.firstName,
                    vesselName: getVessel?.name || 'N/A',
                    userName: getUser.firstName,
                })
                await NotificationHelper.createNotificationhelper({
                    subscriber: subscriberId,
                    titleValue: `New Vessel Assigned: ${getVessel?.name}`,
                    messageValue: `${getVessel?.name} has been assigned by ${userInfo?.firstName} ${userInfo?.lastName}.`,
                    notificationType: NotificationType.VESSEL_CREATED,
                    notifyAdmin: true,
                    status: "SENT",
                    icon: notificationEnum.SUCCESS,
                    createdBy: userInfo,
                });
                await SendEmail({
                    receiverEmail: userInfo.email,
                    subject: `User Vessel Assignment Notification`,
                    htmlContent: emailContentforAdmin,
                })
                return {
                    status: "Success",
                    message: "The vessel updated successfully!"
                }

            }

        } catch (error) {
            throw CustomError(ErrorName.FAILED, `${error.message}`);
        }

    }
};