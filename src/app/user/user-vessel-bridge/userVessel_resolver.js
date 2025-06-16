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
const {filterLearningPlans} = require('../employee/employee_helper');
const {LearningPlan} = require('../../learning-plan/learning_plan_model');
const {Employee} = require('../employee/employee_model');
const { updateByQueryToElasticSearch } = require("../../../util/elastic_helper");
module.exports.mutations = {
    assignVesselToUser: async ({ input }, context) => {

        console.log("came here to assignVesselToUser");

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

            const userVesselsDetails = await Vessel.find({ _id: vesselId, isDeleted: false, isActive: true }).populate('typeOfVessel', '_id name');

            const vesselName= userVesselsDetails?.[0]?.name;
            const vesselIsActive= userVesselsDetails?.[0]?.isActive
            const typeOfVesselName= userVesselsDetails?.[0]?.typeOfVessel?.name
            const tyepOfVesselId= userVesselsDetails?.[0]?.typeOfVessel?._id

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

                    try {
                        await updateByQueryToElasticSearch(
                        'users', 
                        `
                            ctx._source.currentVessel = params.vesselId;
                            ctx._source.vesselId = params.vesselId;
                            ctx._source.vesselStatus = params.vesselStatus;
                            ctx._source.vesselName = params.vesselName;
                            ctx._source.vesselIsActive = params.vesselIsActive;
                            ctx._source.typeOfVesselName = params.typeOfVesselName;
                            ctx._source.tyepOfVesselId = params.tyepOfVesselId;
                        `,
                        {
                            term: {
                            userId: input.userId
                            }
                        },
                        {
                            vesselId: vesselId ?? null,
                            vesselStatus: vesselStatus ?? null,
                            vesselName: vesselName ?? null,
                            vesselIsActive: vesselIsActive ?? null,
                            typeOfVesselName: typeOfVesselName ?? null,
                            tyepOfVesselId: tyepOfVesselId ?? null
                        }
                    );
                    } catch (error) {
                        throw CustomError(ErrorName.FAILED, `${error.message}`);
                    }

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

                    try {
                        await updateByQueryToElasticSearch(
                        'users', 
                        `
                            ctx._source.currentVessel = params.vesselId;
                            ctx._source.vesselId = params.vesselId;
                            ctx._source.vesselStatus = params.vesselStatus;
                            ctx._source.vesselName = params.vesselName;
                            ctx._source.vesselIsActive = params.vesselIsActive;
                            ctx._source.typeOfVesselName = params.typeOfVesselName;
                            ctx._source.tyepOfVesselId = params.tyepOfVesselId;
                        `,
                        {
                            term: {
                            userId: input.userId
                            }
                        },
                        {
                            vesselId: vesselId ?? null,
                            vesselStatus: vesselStatus ?? null,
                            vesselName: vesselName ?? null,
                            vesselIsActive: vesselIsActive ?? null,
                            typeOfVesselName: typeOfVesselName ?? null,
                            tyepOfVesselId: tyepOfVesselId ?? null
                        }
                    );
                    } catch (error) {
                        throw CustomError(ErrorName.FAILED, `${error.message}`);
                    }
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

                try {
                    await updateByQueryToElasticSearch(
                        'users', 
                        `
                            ctx._source.currentVessel = params.vesselId;
                            ctx._source.vesselId = params.vesselId;
                            ctx._source.vesselStatus = params.vesselStatus;
                            ctx._source.vesselName = params.vesselName;
                            ctx._source.vesselIsActive = params.vesselIsActive;
                            ctx._source.typeOfVesselName = params.typeOfVesselName;
                            ctx._source.tyepOfVesselId = params.tyepOfVesselId;
                        `,
                        {
                            term: {
                            userId: input.userId
                            }
                        },
                        {
                            vesselId: vesselId ?? null,
                            vesselStatus: vesselStatus ?? null,
                            vesselName: vesselName ?? null,
                            vesselIsActive: vesselIsActive ?? null,
                            typeOfVesselName: typeOfVesselName ?? null,
                            tyepOfVesselId: tyepOfVesselId ?? null
                        }
                    );
                } catch (error) {
                    throw CustomError(ErrorName.FAILED, `${error.message}`);
                }
            }

            if (updateUser) {
                /*
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
                    */
/*  
                if (getVessel) {
                    await NotificationHelper.createNotificationhelper({
                        subscriber: subscriberId,
                        titleValue: `New Vessel Assigned: ${getVessel?.name}`,
                        messageValue: `${getVessel?.name} has been assigned by ${userInfo?.firstName} ${userInfo?.lastName}.`,
                        notificationType: NotificationType.VESSEL_CREATED,
                        notifyAllAdmin: true,
                        status: "SENT",
                        icon: notificationEnum.SUCCESS,
                        createdBy: userInfo,
                    });
                }
  */
                const learningPlans = await LearningPlan.find({ isDeleted: false, status: 'ACTIVE' });
                const designation = await Employee.find({user: input?.userId}).select('empDesignation -_id');
                let typeOfVessel;
                if(input?.vesselId){
                    typeOfVessel = await Vessel.find({_id: input?.vesselId}).select('ownerName typeOfVessel -_id');
                }
                const emailData = await User.find({_id: input?.userId}).select('email -_id');
                const conditions = [{
                    designationID: designation?.[0]?.empDesignation ?? null,
                    vesselID: input?.vesselId ?? null, 
                    vesselTypeID: typeOfVessel?.[0]?.typeOfVessel ?? null,
                    owner : typeOfVessel?.[0]?.ownerName ?? null,
                    currentStatus: input?.vesselStatus ?? null,
                    email: emailData,
                    _id: input?.userId ,
                }];
                const result = await filterLearningPlans(learningPlans, conditions, context);
               /*
                await SendEmail({
                    receiverEmail: userInfo.email,
                    subject: `User Vessel Assignment Notification`,
                    htmlContent: emailContentforAdmin,
                })
                */
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