const { OverallTrainingProgress } = require("../../training-registrations/overall-course-progress/overall_progress_model");
const { certificateLayout } = require("./certificateLayout_model");
const { MigrationCourses, UserCourses } = require("../migrationcourses/migrationcourses_model");
const {  CustomError, ErrorName,AuthUser ,UploadHelper, DbTransactionHelper} = require("../../../util");
module.exports = {
    createOrupdateCertificateLayout: async({},context)=>{

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
};
