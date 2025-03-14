const { certificateLayout } = require("./certificateLayout_model");
const { Training } = require("../../trainings/training_model");
const Permission = require("../../user/sub-roles/permission.json");
const SubRoleHelper = require("../../user/sub-roles/sub_role_helper");
const { CustomError, ErrorName, AuthUser, UploadHelper } = require("../../../util");
const aws_helper = require("../../../util/aws_helper");
const { ObjectId } = require("../../../tools");
const { createOrupdateCertificateLayout } = require("./certificatelayout_helper");

module.exports.queries = {
    getCertificateLayoutByTrainingId: async ({ trainingId , layout }, context) => {
        const { role, userId, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);
        if (!subscriberId) {
            throw CustomError(ErrorName.FORBIDDEN);
        }
        try {

            if (!trainingId) {
                throw new Error("Course ID is required");
            }

            const trainingExists = await Training.findById(trainingId)
                .select('isCertificate currentCertificateLayout')
                .exec();

            if (!trainingExists) {
                throw new Error("Course not found for the provided ID");
            }
            if(!trainingExists?.isCertificate){
                throw new Error("Certificate has not been enabled for this course, please enable certificate and assign a certificate layout to this course");
            }

            const assignedCertificateLayout = layout ? layout : trainingExists?.currentCertificateLayout ?? "0";
            const certificate = await certificateLayout.findOne({ training: trainingId, layout: assignedCertificateLayout, disabled: false }).exec();
            const listOfLayouts = (await certificateLayout.find({ training: trainingId, disabled: false }).select('layout').exec())?.map(l => l.layout);

            if (!certificate) {
                throw Error(`Certificate layout ${layout} not found for this training ID`);
            }
            return {
                ...certificate,
                listOfLayouts
            };
        } catch (error) {
            throw CustomError(ErrorName.FAILED, error.message);
        }
    },
    getMigrationcoursesToCertificateLayout: async ({ }, context) => {
        const { role, userId, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);
        if (!subscriberId) {
            throw CustomError(ErrorName.FORBIDDEN);
        }
        try {
            await createOrupdateCertificateLayout({}, context);
            return {
                success: true,
                message: "Successfully created Certificate Layout for Migration Courses",
            };
        } catch (error) {
            throw CustomError(ErrorName.FAILED, error.message);
        }
    },
};
module.exports.mutations = {
    createOrUpdateCertificateLayout: async (
        { input, logoImage1, logoImage2, logoImage3 },
        context
    ) => {
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
                throw CustomError(ErrorName.FORBIDDEN);
            }

            if (!subscriberId) {
                throw CustomError(ErrorName.FORBIDDEN);
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
                disabled
            } = input;

            let logosInput = logos ? [...logos] : [];
            let logoKeys = [];

            let existingLayout;
            if (id) {
                if (typeof disabled === "boolean") {
                    //checking if training exists
                    const trainingExists = await Training.findById(training);
                    if (!trainingExists) {
                        throw CustomError(
                            ErrorName.VALIDATION_ERROR,
                            "Training not found for the provided ID"
                        );
                    }

                    await certificateLayout.findByIdAndUpdate(id, { $set: { disabled } });

                    await Training.findByIdAndUpdate(
                        { _id: training },
                        { $set: { isCertificate: !disabled } }
                    );

                    return {
                        success: true,
                        message: "Certificate layout updated successfully.",
                    };
                }
                existingLayout = await certificateLayout.findById(id);
                if (!existingLayout) {
                    throw CustomError(
                        ErrorName.VALIDATION_ERROR,
                        "Certificate layout not found for the provided ID"
                    );
                }
                logosInput = existingLayout.logos || [];
            }

            const selectedTraining = await Training.findById(training).select("currentCertificateLayout").exec();

            if (logoImage1) {
                const logo = await UploadHelper.uploadImage({
                    data: logoImage1,
                    folderName: `certificate-layout`,
                    fileName: `certificate-layout-logo1_${Date.now()}`,
                    uploadType: UploadHelper.uploadType.certificateLogo,
                });
                if (logosInput[0]) {
                    logosInput[0].url = logo;
                } else {
                    logosInput[0] = { url: logo };
                }
                logoKeys.push(logo);
            }
            if (logoImage2) {
                const logo = await UploadHelper.uploadImage({
                    data: logoImage2,
                    folderName: `certificate-layout`,
                    fileName: `certificate-layout-logo2_${Date.now()}`,
                    uploadType: UploadHelper.uploadType.certificateLogo,
                });
                if (logosInput[1]) {
                    logosInput[1].url = logo;
                } else {
                    logosInput[1] = { url: logo };
                }
                logoKeys.push(logo);
            }
            if (logoImage3) {
                const logo = await UploadHelper.uploadImage({
                    data: logoImage3,
                    folderName: `certificate-layout`,
                    fileName: `certificate-layout-logo3_${Date.now()}`,
                    uploadType: UploadHelper.uploadType.certificateLogo,
                });
                if (logosInput[2]) {
                    logosInput[2].url = logo;
                } else {
                    logosInput[2] = { url: logo };
                }
                logoKeys.push(logo);
            }

            if (!title) {
                throw CustomError(
                    ErrorName.VALIDATION_ERROR,
                    "Title and Authoring Title are required"
                );
            }

            const trainingExists = await Training.findById(training);
            if (!trainingExists) {
                throw CustomError(
                    ErrorName.VALIDATION_ERROR,
                    "Training not found for the provided ID"
                );
            }

            if (additionalData && !Array.isArray(additionalData)) {
                throw CustomError(ErrorName.VALIDATION_ERROR, "Additional data must be an array");
            }

            if (id) {
                existingLayout.layout = layout;
                existingLayout.training = training;
                existingLayout.authorName = authorName;
                existingLayout.title = title;
                existingLayout.authoringTitle = authoringTitle;
                existingLayout.certificateReference = certificateReference;
                existingLayout.logos = logosInput;
                existingLayout.additionalData = additionalData;

                if(layout){
                    selectedTraining.currentCertificateLayout = layout;
                    await selectedTraining.save();
                }
                
                await existingLayout.save();
                return {
                    success: true,
                    message: "Certificate layout updated successfully.",
                    logos: logosInput,
                };
            } else {
                const oldCertificateLayout = await certificateLayout.findOne({
                    training: ObjectId(training),
                    layout: layout,
                });
                if (oldCertificateLayout){
                    throw new Error("A layout already exists for this training");
                }
                const newCertificateLayout = new certificateLayout({
                    layout,
                    training,
                    authorName,
                    title,
                    authoringTitle,
                    certificateReference,
                    logos: logosInput,
                    additionalData,
                });
                await newCertificateLayout.save();
                await Training.findByIdAndUpdate(
                    { _id: training },
                    { 
                        $set: { 
                            isCertificate: true,
                            currentCertificateLayout: layout  
                        } 
                    }
                );
                return {
                    success: true,
                    message: "Certificate layout created successfully.",
                    logos: logosInput,
                };
            }
        } catch (error) {
            console.log(error);
            return {
                success: false,
                message: error.message || "An unexpected error occurred. Please try again later.",
            };
        }
    },
    deleteLogosFromCertificateLayout: async ({ layoutId, logoIndexes }, context) => {
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
                throw CustomError(ErrorName.FORBIDDEN);
            }

            if (!subscriberId) {
                throw CustomError(ErrorName.FORBIDDEN);
            }

            const existingLayout = await certificateLayout.findById(layoutId);
            if (!existingLayout) {
                throw CustomError(
                    ErrorName.VALIDATION_ERROR,
                    "Certificate layout not found for the provided ID"
                );
            }

            if (
                !Array.isArray(logoIndexes) ||
                logoIndexes.some(
                    index =>
                        typeof index !== "number" ||
                        index < 0 ||
                        index >= existingLayout.logos.length
                )
            ) {
                throw CustomError(ErrorName.VALIDATION_ERROR, "Invalid logo indexes");
            }

            logoIndexes.sort((a, b) => b - a);

            logoIndexes.forEach(logoIndex => {
                existingLayout.logos.splice(logoIndex, 1);
            });

            await existingLayout.save();

            return {
                success: true,
                message: "Logos deleted successfully.",
                logos: existingLayout.logos,
            };
        } catch (error) {
            return {
                success: false,
                message: error.message || "An unexpected error occurred. Please try again later.",
            };
        }
    },
};
