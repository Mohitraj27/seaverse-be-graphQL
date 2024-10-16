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
    assignVesselToUser: async ({ input }) => {

        if (!input.vesselId || !input.userId) {
            throw CustomError(ErrorName.VALIDATION_ERROR);
        }

        const getVessel = await UserVessel.findById(input.vesselId);

        if (!getVessel) {
            throw CustomError(ErrorName.VESSEL_NOT_FOUND);
        }

        const getUser = await User.findById(input.userId);

        if (!getUser) {
            throw CustomError(ErrorName.USER_NOT_FOUND);
        }

        const updateCurrentVessel = await UserVessel.findOneAndUpdate({ user: input.userId, isActive: true },
            {
                $set: {
                    isActive: false,
                    deletedTime: Date.now()
                }
            },
            { new: true });
        }

        
};