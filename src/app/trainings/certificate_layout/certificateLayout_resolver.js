const { certificateLayout } = require("./certificateLayout_model")
const { Training } = require("../../trainings/training_model"); 
const Permission = require("../../user/sub-roles/permission.json");
const SubRoleHelper = require("../../user/sub-roles/sub_role_helper");
const {  CustomError, ErrorName,AuthUser ,UploadHelper} = require("../../../util");
const aws_helper = require("../../../util/aws_helper")

module.exports.mutations = {
    createOrUpdateCertificateLayout: async ({ input, logoImage1,logoImage2,logoImage3 }, context) => {
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

            const {
                id,  
                layout = "0",
                training,
                authorName,
                title,
                authoringTitle,
                certificateReference,
                logos,
                additionalData,
            } = input;
            
            logosInput = logos ?  logos : []

            if (logoImage1) {
                
                const logo = await UploadHelper.uploadImage({
                    data: logoImage1,
                    folderName: `certificate-layout`,
                    fileName: `certificate-layout-logo1_${Date.now()}`,
                    uploadType: UploadHelper.uploadType.certificateLogo,
                });
                logoUrl = await aws_helper.fetchFile(logo)
                logosInput.push({url :logoUrl});
            }
            if (logoImage2) {
                
                const logo = await UploadHelper.uploadImage({
                    data: logoImage2,
                    folderName: `certificate-layout`,
                    fileName: `certificate-layout-logo2_${Date.now()}`,
                    uploadType: UploadHelper.uploadType.certificateLogo,
                });
                logoUrl = await aws_helper.fetchFile(logo)
                logosInput.push({url :logoUrl});
            }
            if (logoImage3) {
                
                const logo = await UploadHelper.uploadImage({
                    data: logoImage3,
                    folderName: `certificate-layout`,
                    fileName: `certificate-layout-logo3_${Date.now()}`,
                    uploadType: UploadHelper.uploadType.certificateLogo,
                });
                logoUrl = await aws_helper.fetchFile(logo)
                logosInput.push({url :logoUrl});
            }

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
                existingLayout.logos = logosInput;
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
                    logos : logosInput,
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
