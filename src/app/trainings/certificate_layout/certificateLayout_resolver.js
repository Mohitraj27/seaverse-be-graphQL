const { certificateLayout } = require("./certificateLayout_model");
const { Training } = require("../../trainings/training_model");
const Permission = require("../../user/sub-roles/permission.json");
const SubRoleHelper = require("../../user/sub-roles/sub_role_helper");
const { CustomError, ErrorName, AuthUser, UploadHelper } = require("../../../util");
const aws_helper = require("../../../util/aws_helper");
const { ObjectId } = require("../../../tools");
const { createOrupdateCertificateLayout } = require("./certificatelayout_helper");
const { OverallTrainingProgress } = require("../../training-registrations/overall-course-progress/overall_progress_model");

module.exports.queries = {
    getCertificateLayoutByTrainingId: async ({ trainingId, layout }, context) => {
        const { role, userId, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);
        if (!subscriberId) {
            throw CustomError(ErrorName.FORBIDDEN);
        }
        try {

            if (!trainingId) {
                throw CustomError(ErrorName.FAILED, "Course ID is required");
            }

            const trainingExists = await Training.findById(trainingId)
                .select('isCertificate currentCertificateLayout')
                .exec();

            if (!trainingExists) {
                throw CustomError(ErrorName.FAILED, "Course not found for the provided ID");
            }


            const assignedCertificateLayout = layout ? layout : trainingExists?.currentCertificateLayout ?? "0";
            const certificate = await certificateLayout
                .findOne({ training: trainingId, layout: assignedCertificateLayout, disabled: false })
                .sort({ version: -1, createdAt: -1 }) 
                .exec();

            if(!certificate){
                return { listOfLayouts : [] }
            }
            const listOfLayouts = (await certificateLayout.find({ training: trainingId, disabled: false }).select('layout').exec())?.map(l => l.layout);

            const latestLayouts = await certificateLayout.aggregate([
                { $match: { training: trainingId, disabled: false } },
                { $sort: { layout: 1, version: -1 } }, 
                {
                  $group: {
                    _id: '$layout',
                    layout: { $first: '$layout' },
                    version: { $first: '$version' },
                    docId: { $first: '$_id' }
                  }
                },
                {
                  $project: {
                    _id: '$docId',
                    layout: 1,
                    version: 1,
                  }
                }
              ]);

            if (!certificate) {
                throw CustomError(ErrorName.FAILED, `Certificate layout ${layout ?? ""} not found for this training ID`);
            }
            certificate.listOfLayouts = latestLayouts;
            return certificate;
        } catch (error) {
            console.log(error);
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
        { input, logoImage1, logoImage2, logoImage3, signatureImage },
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
                courseProvidedBy,
                certificateExpiry,
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

                        return {
                            success: true,
                            message: "Certificate layout updated successfully.",
                        };
                    }

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
            if (!selectedTraining||selectedTraining?.length === 0) {
                throw CustomError(
                    ErrorName.VALIDATION_ERROR,
                    "Training not found for the provided ID"
                );
            }

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
                    fileName: `certificate-layout-logo${Date.now()}`,
                    uploadType: UploadHelper.uploadType.certificateLogo,
                });
                if (logosInput[2]) {
                    logosInput[2].url = logo;
                } else {
                    logosInput[2] = { url: logo };
                }
                logoKeys.push(logo);
            }

            // Handle signature upload separately
            let signatureUrl = null;
            if (signatureImage) {
                signatureUrl = await UploadHelper.uploadImage({
                    data: signatureImage,
                    folderName: `certificate-layout`,
                    fileName: `certificate-layout-signature_${Date.now()}`,
                    uploadType: UploadHelper.uploadType.certificateLogo,
                });
            }

            if (!title) {
                throw CustomError(
                    ErrorName.VALIDATION_ERROR,
                    "Title and Authoring Title are required"
                );
            }

            if (additionalData && !Array.isArray(additionalData)) {
                throw CustomError(ErrorName.VALIDATION_ERROR, "Additional data must be an array");
            }

            let usersAssosciatedToLayout =[];
            if (id) {
                //if there are no users in ['IN_PROGRESS', 'COMPLETED'] states we dont have to store the data
                usersAssosciatedToLayout = await OverallTrainingProgress.find({
                    assignedCertificateLayoutId: id,
                    status: { $in: ['IN_PROGRESS', 'COMPLETED'] }
                }).lean();
            }

            if ((!(usersAssosciatedToLayout?.length > 0)) && id) {
                existingLayout.layout = layout;
                existingLayout.training = training;
                existingLayout.authorName = authorName;
                existingLayout.title = title;
                existingLayout.authoringTitle = authoringTitle;
                existingLayout.certificateReference = certificateReference;
                existingLayout.courseProvidedBy = courseProvidedBy;
                existingLayout.certificateExpiry = certificateExpiry;
                existingLayout.logos = logosInput;
                existingLayout.additionalData = additionalData;
                existingLayout.signature = signatureUrl ? { url : signatureUrl} : null; // Save signature as a separate field
                existingLayout.version = (existingLayout?.version ?? 0) + 1;

                if (layout) {
                    selectedTraining.currentCertificateLayout = layout;
                    selectedTraining.certificateValidity = certificateExpiry ?? null;
                    await selectedTraining.save();
                }

                await existingLayout.save();
                return {
                    success: true,
                    message: "Certificate layout updated successfully.",
                    logos: logosInput,
                    signature: { url : signatureUrl}, 
                };
            } else if(((usersAssosciatedToLayout?.length > 0) && id) || ((!(usersAssosciatedToLayout?.length > 0)) && (!id))) { //If there are users connected with the existing layout OR if the admin wants to create a new layout
                let action = 'created';
                let version = 0;

                const oldCertificateLayout = await certificateLayout.findOne({
                    training: ObjectId(training),
                    layout: layout,
                });

                if ((usersAssosciatedToLayout?.length > 0) && id) {
                    action = 'updated';
                    version =(oldCertificateLayout?.version ?? 0)+1;
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
                    certificateExpiry,
                    courseProvidedBy,
                    signature:  signatureUrl ? { url : signatureUrl} : null, // Save signature as a separate field
                    version,
                });
                await newCertificateLayout.save();
                const updateTraining = await Training.findByIdAndUpdate(
                    { _id: training },
                    {
                        $set: {
                            isCertificate: true,
                            currentCertificateLayout: layout,
                            certificateValidity: certificateExpiry,
                        }
                    }
                );

                if (updateTraining) {
                    const updateCertificate = await OverallTrainingProgress.updateMany(
                        { training: training, status: "NOT_STARTED" },
                        { $set: { isCertificatePresent: true } }
                    );
                }
                console.log("Signature Url: ",signatureUrl);
                return {
                    success: true,
                    message: `Certificate layout ${action} successfully.`,
                    logos: logosInput,
                    signature: signatureUrl, // Return signature URL as part of response
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
