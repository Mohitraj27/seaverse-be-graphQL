const { Crypto } = require("../../../tools");
const { CustomError, ErrorName, FirebaseHelper } = require("../../../util");

const {
    Subscription,
    PendingSubscription,
} = require("../subscriber/subscription/subscription_model");

const SaasPaymentStatus = require("./saas_payment_status");

module.exports = {
    updatePendingSubscription: async ({ input }) => {
        const generatedHash = Crypto.createHmac("sha256", process.env.PAYMENT_WEB_HOOK_SECRET_KEY)
            .update(input.orderReference.toString()) 
            .digest()
            .toString("base64");

        if (generatedHash !== input.hash) throw CustomError(ErrorName.BAD_REQUEST);

        const existingPendingSubscription = await PendingSubscription.findById(
            input.orderReference
        ).populate("payment").select("-createdAt -updatedAt");

        if (existingPendingSubscription?.payment) {
           

            if (
                input.status.toUpperCase() === "PAID" ||
                input.status.toUpperCase() === "SUCCESS" ||
                input.status.toUpperCase() === "CAPTURED"
            ) {
                existingPendingSubscription.payment.status = SaasPaymentStatus.PAID;
                await existingPendingSubscription.payment.save();

                const filterConditions = {
                    _id: existingPendingSubscription._id,
                };

                const savedSubscription = await Subscription.findOneAndUpdate(
                    filterConditions,
                    {
                        $setOnInsert: {
                            ...existingPendingSubscription,
                            ...filterConditions,
                        },
                    },
                    {
                        upsert: true,
                        new: true,
                        setDefaultsOnInsert: true,
                        runValidators: true,
                        lean: true,
                    }
                );

                if (savedSubscription) {
                    await existingPendingSubscription.deleteOne();
                    return savedSubscription;
                }
            } else {
                existingPendingSubscription.payment.status = input.status.toUpperCase();
                await existingPendingSubscription.payment.save();
            }

            throw CustomError(ErrorName.FAILED);
        } else {
            const existingSubscription = await Subscription.findById(input.orderReference).lean();
            if (existingSubscription) return existingSubscription;
        }

        throw CustomError(ErrorName.NOT_FOUND);
    },
};
