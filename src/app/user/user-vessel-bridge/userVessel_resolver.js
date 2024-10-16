const { JwtHelper, CryptoHelper } = require("../../../tools");
const {
    CustomError,
    ErrorName,
    AuthUser,
    Role,
    DbTransactionHelper,
    UploadHelper,
} = require("../../../util");
const { User } = require("../user_model");
const { UserVessel } = require("./userVessel_model")

module.exports.queries = {

};
module.exports.mutations = {
    assignVesselToUser: async ({ input }, context) => {

        const { subscriberId } = AuthUser(context);

        try {
            
            if (!input.vesselId || !input.userId) {
                throw CustomError(ErrorName.VALIDATION_ERROR, "Provide all the required fields");
            }
    
            const getVessel = await UserVessel.findById(input.vesselId);
    
            if (!getVessel) {
                throw CustomError(ErrorName.VESSEL_NOT_FOUND, "Vessel not found");
            }
    
            const getUser = await User.findById(input.userId);
    
            if (!getUser) {
                throw CustomError(ErrorName.USER_NOT_FOUND, "User not found");
            }
    
            const updateCurrentVessel = await UserVessel.findOneAndUpdate({ user: input.userId, isActive: true },
                {
                    $set: {
                        isActive: false,
                        deletedAt: Date.now()
                    }
                },
                { new: true });
    
            const newVesselUpdate = await UserVessel.create({
                user: input.userId,
                vessel: input.vesselId,
                isActive: true
            });
    
            const updateUser = await User.findByIdAndUpdate(input.userId, { currentVessel: input.vesselId }, { new: true });
    
            if (updateUser) {
                return {
                    status: "Success",
                    message: "The vessel assigned successfully!"
                }
            }

        } catch (error) {
            throw CustomError(ErrorName.FAILED, `${error.message}`);
        }
    }
};