const {
    CustomError,
    ErrorName,
    AuthUser
} = require("../../../util");

const { Vessel } = require("./vessel_model");

module.exports.mutatations = {
    createVessel: async ({ input }, context) => {
        try {
            const { role, userId, userInfo, userPermissions, subscriberId } = AuthUser(context);
            const { name, typeOfVessel, imoNumber } = input;

            const existingImoNumber = await Vessel.findOne({ imoNumber: imoNumber });

            if (existingImoNumber) throw new CustomError(ErrorName.ALREADY_EXIST, 'IMO number already exist.');

            const vessel = new Vessel({
                subscriber: subscriberId,
                name: name,
                typeOfVessel: typeOfVessel,
                imoNumber: imoNumber,
                createdBy: userId,
                updatedBy: userId,
            });
            await vessel.save();

            return vessel;
        } catch (error) {
            return {
                success: true,
                message: 'Something went wrong!.'
            };

        }
    },

    updateVessel: async ({ id, input }, context) => {
        try {
            const { role, userId, userInfo, userPermissions, subscriberId } = AuthUser(context);
            const { name, typeOfVessel, imoNumber } = input;

            const vessel = await Vessel.findOne({ _id: id});

            if (!vessel) throw new CustomError(ErrorName.NOT_FOUND);

            const existingImoNumber = await Vessel.findOne({ _id: { $ne: vessel._id }, imoNumber: imoNumber });

            if (existingImoNumber) throw new CustomError(ErrorName.ALREADY_EXIST, 'IMO number already exist.');

            vessel.name = name;
            vessel.typeOfVessel = typeOfVessel;
            vessel.imoNumber = imoNumber;
            vessel.subscriber = subscriberId;

            await vessel.save();

            return vessel;
        } catch (error) {
            return {
                success: true,
                message: 'Something went wrong!.'
            };

        }
    },

    deleteVessel: async ({ id }, context) => {
        try {
            const { role, userId, userInfo, userPermissions, subscriberId } = AuthUser(context);

            const vessel = await Vessel.findOne({ _id: id });

            if (!vessel) {
                throw new CustomError(ErrorName.NOT_FOUND, 'Vessel not found.');
            }

            vessel.isDeleted = true;
            vessel.updatedBy = userId;

            await vessel.save();

            return {
                success: true,
                message: 'Vessel deleted successfully.'
            };
        } catch (error) {
            return {
                success: true,
                message: 'Something went wrong!.'
            };

        }
    },
};