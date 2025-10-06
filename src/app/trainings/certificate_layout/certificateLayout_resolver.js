const { certificateLayout } = require("./certificateLayout_model");
const { Training } = require("../../trainings/training_model");
const Permission = require("../../user/sub-roles/permission.json");
const SubRoleHelper = require("../../user/sub-roles/sub_role_helper");
const { CustomError, ErrorName, AuthUser, UploadHelper } = require("../../../util");
const aws_helper = require("../../../util/aws_helper");
const { ObjectId } = require("../../../tools");
const { switchCertificateLayouts, createOrupdateCertificateLayout, toggleCertificatesOnOrOFF, getLatestCertificateLayoutByTrainingId, checkAssociatedUsers } = require("./certificatelayout_helper");
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
                .findOne({ training: trainingId, layout: assignedCertificateLayout })
                .sort({ version: -1, createdAt: -1 }) 
                .exec();

            if(!certificate){
                return { listOfLayouts : [] }
            }
            const listOfLayouts = (await certificateLayout.find({ training: trainingId}).select('layout').exec())?.map(l => l.layout);

            const latestLayouts = await certificateLayout.aggregate([
                { $match: { training: trainingId } },
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
                disabled,
                apiMode,
            } = input;

            let logosInput = logos ? [...logos] : [];
            let logoKeys = [];
            let signatureUrl = null;
            let existingLayout;
            switch (apiMode) {
                case 'TOGGLE':
                    const response = await toggleCertificatesOnOrOFF(training, disabled);
                    if (!response.success) {
                        return{
                            success: false,
                            message: "Failed to toggle certificate layout",
                        }
                    }
                    const currentLayout = await getLatestCertificateLayoutByTrainingId(training);
                    return {
                        success: true,
                        message: `Certificate layout ${disabled ? "disabled" : "enabled"} successfully.`,
                        layout : currentLayout ? currentLayout : null,
                    };
                case 'CREATE_OR_UPDATE':

                    if (id) {
                        existingLayout = await certificateLayout.findById(id);
                        if (!existingLayout) {
                            throw CustomError(
                                ErrorName.VALIDATION_ERROR,
                                "Certificate layout not found for the provided ID"
                            );
                        }

                        logosInput = existingLayout.logos || [];
                        signatureUrl = existingLayout.signature?.url || null;
                    }

                    const selectedTraining = await Training.findById(training).select("currentCertificateLayout").exec();
                    if (!selectedTraining || selectedTraining?.length === 0) {
                        throw CustomError(
                            ErrorName.VALIDATION_ERROR,
                            "Training not found for the provided ID"
                        );
                    }
                    const currentTimeStamp = Date.now();
                    if (logoImage1) {
                        const logo = await UploadHelper.uploadImage({
                            data: logoImage1,
                            folderName: `certificate-layout`,
                            fileName: `certificate-layout-logo1_${currentTimeStamp}`,
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
                            fileName: `certificate-layout-logo2_${currentTimeStamp}`,
                            uploadType: UploadHelper.uploadType.certificateLogo,
                        });
                        if (logosInput[1]) {
                            logosInput[1].url = logo;
                        } else {
                            logosInput[1] = { url: logo };
                        }
                        logoKeys.push(logo);
                    }

                    // if (logoImage3) {
                        /* const logo = await UploadHelper.uploadImage({
                            data: logoImage3,
                            folderName: `certificate-layout`,
                            fileName: `certificate-layout-logo${currentTimeStamp}`,
                            uploadType: UploadHelper.uploadType.certificateLogo,
                        });
                        if (logosInput[2]) {
                            logosInput[2].url = logo;
                        } else {
                            logosInput[2] = { url: logo };
                        }
                        logoKeys.push(logo); */
                    // }

                    // Handle signature upload separately
                    if (signatureImage) {
                        signatureUrl = await UploadHelper.uploadImage({
                            data: signatureImage,
                            folderName: `certificate-layout`,
                            fileName: `certificate-layout-signature_${currentTimeStamp}`,
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

                    let hasAssociatedUsers = false;
                    if (id) {
                       hasAssociatedUsers = await checkAssociatedUsers(id); 
                    }

                    if ((!hasAssociatedUsers) && id) { //If there are no users connected with the existing layout
                        if (layout !== undefined) existingLayout.layout = layout;
                        if (training !== undefined) existingLayout.training = training;
                        if (authorName !== undefined) existingLayout.authorName = authorName;
                        if (title !== undefined) existingLayout.title = title;
                        if (authoringTitle !== undefined) existingLayout.authoringTitle = authoringTitle;
                        if (certificateReference !== undefined) existingLayout.certificateReference = certificateReference;
                        if (courseProvidedBy !== undefined) existingLayout.courseProvidedBy = courseProvidedBy;
                        if (certificateExpiry !== undefined) existingLayout.certificateExpiry = certificateExpiry;
                        if (logosInput !== undefined) existingLayout.logos = logosInput;
                        if (additionalData !== undefined) existingLayout.additionalData = additionalData;
                        if (signatureUrl !== undefined) existingLayout.signature = signatureUrl ? { url: signatureUrl } : null;
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
                            signature: { url: signatureUrl },
                        };
                    } else if ((hasAssociatedUsers && id) || (!hasAssociatedUsers && !id)) { //If there are users connected with the existing layout OR if the admin wants to create a new layout
                        let action = 'created';
                        let version = 0;

                        const oldCertificateLayout = await certificateLayout.find({
                            training: ObjectId(training),
                            layout: layout,
                        }).sort({ version: -1 }).limit(1);

                        if (hasAssociatedUsers && id) {
                            action = 'updated';
                            version = (oldCertificateLayout?.version ?? 0) + 1;
                        }
                        // if we have new input values for the layout to be updated we will change only that , preserving the old values 
                        const newCertificateLayout = new certificateLayout({
                            layout: layout ?? oldCertificateLayout?.layout,
                            training: training ?? oldCertificateLayout?.training,
                            authorName: authorName ?? oldCertificateLayout?.authorName,
                            title: title ?? oldCertificateLayout?.title,
                            authoringTitle: authoringTitle ?? oldCertificateLayout?.authoringTitle,
                            certificateReference: certificateReference ?? oldCertificateLayout?.certificateReference,
                            logos: logosInput.length > 0 ? logosInput : oldCertificateLayout?.logos ?? [],
                            additionalData: additionalData ?? oldCertificateLayout?.additionalData,
                            certificateExpiry: certificateExpiry ?? oldCertificateLayout?.certificateExpiry,
                            courseProvidedBy: courseProvidedBy ?? oldCertificateLayout?.courseProvidedBy,
                            signature: signatureUrl
                                ? { url: signatureUrl }
                                : oldCertificateLayout?.signature
                                    ? { url: oldCertificateLayout.signature.url }
                                    : null,
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

                        return {
                            success: true,
                            message: `Certificate layout ${action} successfully.`,
                            logos: logosInput,
                            signature: signatureUrl, // Return signature URL as part of response
                        };
                    }
                    break;
                case 'SWITCH_LAYOUTS':
                    const layoutSwitched = await switchCertificateLayouts(training,layout);
                    var selectedCertificateLayout = await getLatestCertificateLayoutByTrainingId(training);
                    if (!layoutSwitched.success) {
                        return {
                            success: false,
                            message: "Failed to switch certificate layouts",
                        };
                    }else{
                        return {
                            success: true,
                            message: "Certificate layout switched successfully.",
                            layout : selectedCertificateLayout ? selectedCertificateLayout : null,
                        };
                    }
                default:
                    return {
                        success: false,
                        message: "Invalid mode. Use 'CREATE_OR_UPDATE' or 'SWITCH_LAYOUTS'.",
                    }
            }
        } catch (error) {
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

            const hasAssociatedUsers = await checkAssociatedUsers(layoutId) ?? false;

            let existingLayout = await certificateLayout.findById(layoutId);
            if (!existingLayout) {
                throw new Error('Layout not found');
            }

            if (hasAssociatedUsers) {
                const layoutCopy = existingLayout.toObject();

                delete layoutCopy._id;
                delete layoutCopy.createdAt;
                delete layoutCopy.updatedAt;

                layoutCopy.version = (layoutCopy.version || 1) + 1;
                existingLayout = await certificateLayout.create(layoutCopy);
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
