const { OverallTrainingProgress } = require("../../training-registrations/overall-course-progress/overall_progress_model");
const { Training } = require("../training_model");
const { certificateLayout } = require("./certificateLayout_model");
const { CustomError, ErrorName, AuthUser, UploadHelper, DbTransactionHelper } = require("../../../util");
const { cert } = require("firebase-admin/app");


const getLatestCertificateLayoutByTrainingId = async (trainingId, layout) => {

    const trainingExists = await Training.findById(trainingId)
        .select('isCertificate currentCertificateLayout')
        .exec();

    if (!trainingExists) {
        throw CustomError(ErrorName.FAILED, "Course not found for the provided ID");
    }

    const assignedCertificateLayout = layout ? layout : trainingExists?.currentCertificateLayout ?? "0";
    const certificate = await certificateLayout
        .findOne({ training: trainingId, layout: assignedCertificateLayout, disabled: false })
        .sort({ version: -1 })
        .exec();

    return certificate;
};

const switchCertificateLayouts = async (trainingId, layout) => {
    try {
        const trainingExists = await Training.findById(trainingId)
            .select('isCertificate currentCertificateLayout')
            .exec();

        if (!trainingExists) {
            throw CustomError(ErrorName.FAILED, "Course not found for the provided ID");
        }
        const assignedCertificateLayout = await certificateLayout.findOne({ training: trainingId, layout: layout }).sort({ version: -1 }).exec();
        if (!assignedCertificateLayout) {
            throw CustomError(ErrorName.FAILED, "Certificate layout not found for the provided ID");
        }
        trainingExists.currentCertificateLayout = layout;
        await trainingExists.save();

        const associatedUsers = await OverallTrainingProgress.updateMany(
            { training: trainingId, status: "NOT_STARTED" },
            { $set: { assignedCertificateLayoutId: assignedCertificateLayout?._id, assignedCertificateLayout: layout } });
        
        return {
            success: true,
            message: "Certificate layout changed successfully.",
        }

    } catch (error) {
        throw CustomError(ErrorName.FAILED, error.message);
    }
}


const toggleCertificatesOnOrOFF = async (training, disabled) => {
    try {
        if (typeof disabled === "boolean") {
            const trainingExists = await Training.findById(training);
            if (!trainingExists) {
                throw CustomError(
                    ErrorName.VALIDATION_ERROR,
                    "Training not found for the provided ID"
                );
            }
            const assignedCertificateLayout = trainingExists?.currentCertificateLayout;
            if (!assignedCertificateLayout) {
                return {
                    success: false,
                    message: "No certificate layout assigned to this training.",
                };
            }
            const certificate = await certificateLayout
                .findOne({ training: training, layout: assignedCertificateLayout })
                .sort({ version: -1 })
                .exec();

            certificate.disabled = !disabled;
            await certificate.save();
            // Update the certificate layout in the training document
            const updateTraining = await Training.findByIdAndUpdate(
                { _id: training },
                { $set: { isCertificate: !disabled } }
            );

            // Update to NOT_STARTED users
            if (updateTraining) {
                await OverallTrainingProgress.updateMany(
                    { training: training, status: "NOT_STARTED" },
                    { $set: { isCertificatePresent: !disabled } }
                );
            }
            return {
                success: true,
                message: "Certificate layout updated successfully.",
            };
        }
    } catch (error) {
        throw Error(error);
    }
}


module.exports = {
    createOrupdateCertificateLayout: async ({ }, context) => {

        const { subscriberId } = AuthUser(context);

        try {
            const overallTrainingProgressData = await OverallTrainingProgress.find({
                isFromMigration: true,
            });
            const array = overallTrainingProgressData.map(data => ({
                certificateNumber: data.certificateNumber,
                pdfUrl: data.pdfUrl,
                user: data.user,
                training: data.training,
                isFromMigration: data.isFromMigration,
                createdAt: data.createdAt,
            }));

            const resultPromises = array.map(data => {
                const newCertificateLayout = new certificateLayout({
                    certificateNumber: data.certificateNumber,
                    subscriber: subscriberId,
                    pdfUrl: data.pdfUrl,
                    user: data.user,
                    training: data.training,
                    isFromMigration: data.isFromMigration,
                    createdAt: data.createdAt,
                });

                return newCertificateLayout.save();
            });
        } catch (error) {
            throw CustomError(ErrorName.FAILED, error.message);
        }
    },
    getLatestCertificateLayoutByTrainingId,
    toggleCertificatesOnOrOFF,
    switchCertificateLayouts,
};
