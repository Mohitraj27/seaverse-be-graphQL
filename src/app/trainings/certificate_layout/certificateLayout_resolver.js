const { certificateLayout } = require("./certificateLayout_model")
const { Training } = require("../../trainings/training_model"); 
const Permission = require("../../user/sub-roles/permission.json");
const SubRoleHelper = require("../../user/sub-roles/sub_role_helper");
const {  CustomError, ErrorName,AuthUser ,UploadHelper} = require("../../../util");

module.exports.mutations = {
    createOrUpdateCertificateLayout: async ({ input, logoImage }, context) => {
        try {
            const { role, userId, userPermissions, subscriberId, isOrganizationManager } =
                AuthUser(context);

            if (
                !SubRoleHelper.hasPermission({
                    currentRole: role,
                    currentPermissions: userPermissions,
                    requiredPermission: [Permission.CREATE_TRAINING_REGISTRATION],
                    requiredAll: false,
                    restrictOrganizationManager: isOrganizationManager,
                })
            ) {
                throw  CustomError(ErrorName.FORBIDDEN);
            }

            if (!subscriberId) {
                throw  CustomError(ErrorName.FORBIDDEN);
            }

            if (logoImage) {
                
                const logo = await UploadHelper.uploadImage({
                    data: logoImage,
                    folderName: `certificate-layout`,
                    fileName: `certificate-layout-logo_${Date.now()}`,
                    uploadType: UploadHelper.uploadType.certificateLogo,
                });

                input.logo = logo;
            }

            const {
                id,  
                layout = "0",
                training,
                authorName,
                title,
                authoringTitle,
                certificateReference,
                logo,
                additionalData,
            } = input;

            if (!title) {
                throw  CustomError(ErrorName.VALIDATION_ERROR, "Title and Authoring Title are required");
            }

            const trainingExists = await Training.findById(training);
            if (!trainingExists) {
                throw  CustomError(ErrorName.VALIDATION_ERROR, "Training not found for the provided ID");
            }

            if (additionalData && !Array.isArray(additionalData)) {
                throw  CustomError(ErrorName.VALIDATION_ERROR, "Additional data must be an array");
            }

            if (id) {
                const existingLayout = await certificateLayout.findById(id);
                if (!existingLayout) {
                    throw  CustomError(ErrorName.VALIDATION_ERROR, "Certificate layout not found for the provided ID");
                }

                existingLayout.layout = layout;
                existingLayout.training = training;
                existingLayout.authorName = authorName;
                existingLayout.title = title;
                existingLayout.authoringTitle = authoringTitle;
                existingLayout.certificateReference = certificateReference;
                existingLayout.logo = logo;
                existingLayout.additionalData = additionalData;

                await existingLayout.save();
                return { success: true, message: "Certificate layout updated successfully." };
            } else {
                const newCertificateLayout =  certificateLayout({
                    layout,
                    training,
                    authorName,
                    title,
                    authoringTitle,
                    certificateReference,
                    logo,
                    additionalData,
                });

                await newCertificateLayout.save();
                return { success: true, message: "Certificate layout created successfully." }; 
            }
        } catch (error) {
            return { success: false, message: error.message || "An unexpected error occurred. Please try again later." };

        }
    },
};
