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

            let vesselId = input.vesselId === "" ? null : input.vesselId;
            let vesselStatus = input.vesselStatus === "" ? null : input.vesselStatus;

            if (vesselId) {

                if (String(getUser?.currentVessel) === String(vesselId)) {

                    newVesselUpdate = await UserVessel.findOneAndUpdate({ user: input.userId, isActive: true, vessel: getUser?.currentVessel },
                        {
                            $set: {
                                vesselStatus: vesselStatus,
                                isActive: vesselId ? true : false,
                                deletedAt: vesselId ? null : Date.now()
                            }
                        }
                    );

                    getUser.currentVessel = vesselId ?? null;
                    getUser.vesselStatus = vesselStatus ?? null;
                    updateUser = await getUser.save();

                } else {

                    newVesselUpdate = await UserVessel.findOneAndUpdate({ user: input.userId, isActive: true, vessel: getUser?.currentVessel },
                        {
                            $set: {
                                vesselStatus: vesselStatus,
                                isActive: vesselId ? false : true,
                                deletedAt: vesselId ? null : Date.now()
                            }
                        }
                    );

                    newVessel = await UserVessel.create({
                        user: input.userId,
                        vessel: vesselId,
                        vesselStatus: vesselStatus,
                        isActive: vesselId ? true : false,
                    });

                    getUser.currentVessel = vesselId;
                    getUser.vesselStatus = vesselStatus;
                    updateUser = await getUser.save();

                }
            } else {

                newVesselUpdate = await UserVessel.findOneAndUpdate({ user: input.userId, isActive: true, vessel: getUser?.currentVessel },
                    {
                        $set: {
                            vesselStatus: vesselStatus,
                            isActive: vesselId ? true : false,
                            deletedAt: vesselId ? null : Date.now()
                        }
                    }
                );

                newVesselUpdate = await UserVessel.findOne({ user: input.userId })
                    .sort({ updatedAt: -1 });

                if (newVesselUpdate) {
                    newVesselUpdate.vesselStatus = vesselStatus || null;
                    newVesselUpdate.isActive = vesselId ? true : false;
                    newVesselUpdate.deletedAt = vesselId ? null : Date.now();
                    await newVesselUpdate.save();
                }

                getUser.currentVessel = vesselId;
                getUser.vesselStatus = vesselStatus;
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
                if (getVessel) {

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

                }
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