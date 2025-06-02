const { PathHelper, MimeHelper } = require("../tools");

const { CustomError, ErrorName } = require("./error_helper");
const AwsHelper = require("./aws_helper");
const streamifier = require('streamifier');
const fileType = {
    excel: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    videos: ["video/mp4"],
    audios: ["audio/mpeg"],
    images: ["image/png", "image/jpeg", "image/bmp", "image/jpg"],
    allImages: "image/",
    subtitles: [
        "text/vtt",
        "text/srt",
        "application/srt",
        "application/octet-stream",
        "text/plain"
    ],
    documents: [
        "application/pdf",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
        "application/vnd.ms-powerpoint.presentation.macroEnabled.12",
        "application/vnd.ms-powerpoint.slideshow.macroEnabled.12"
    ],
    csv: "text/csv",
    zip: "application/zip",
    all: "*",
};

const uploadType = {
    userImage: "userImage",
    trainingImage: "trainingImage",
    trainingContentVideo: "trainingContentVideo",
    trainingContentAudio: "trainingContentAudio",
    trainingContentImage: "trainingContentImage",
    trainingContentSubtitle: "trainingContentSubtitle",
    quizContentImage: "quizContentImage",
    introVideo: "introVideo",
    organizationImage: "organizationImage",
    employeeSignatureImage: "employeeSignatureImage",
    certificateImage: "certificateImage",
    profileCardImage: "profileCardImage",
    logJson: "logJson",
    trainingContentFile: "trainingContentFile",
    trainingCertificateImage: "trainingCertificateImage",
    trainingBannerImage: "trainingBannerImage",
    bulkCSV: "bulkCSV",
    certificateLogo: "certificateLogo",
    exportExcel: "exportExcel",
    exportLearnersReportAsExcel: "exportLearnersReportAsExcel",
    exportLearnersCoursesReportAsExcel: "exportLearnersCoursesReportAsExcel",
    exportCustomQuizReport :"exportCustomQuizReport",
    lessonZip: "lessonZip",
};


const getPathFromType = ({ type, folder, filename }) => {
    const rootFolder = `files`;

    if (type === uploadType.userImage) return `${rootFolder}/users/${folder}/images/${filename}`;
    else if (type === uploadType.trainingImage)
        return `${rootFolder}/trainings/${folder}/images/${filename}`;
    else if (type === uploadType.trainingContentVideo)
        return `${rootFolder}/training-contents/${folder}/videos/${filename}`;
    else if (type === uploadType.trainingContentAudio)
        return `${rootFolder}/training-contents/${folder}/audios/${filename}`;
    else if (type === uploadType.trainingContentSubtitle)
        return `${rootFolder}/training-contents/${folder}/subtitles/${filename}`;
    else if (type === uploadType.trainingContentImage)
        return `${rootFolder}/training-contents/${folder}/images/${filename}`;
    else if (type === uploadType.quizContentImage)
        return `${rootFolder}/quiz-contents/${folder}/images/${filename}`;
    else if (type === uploadType.introVideo)
        return `${rootFolder}/app-settings/${folder}/videos/${filename}`;
    else if (type === uploadType.organizationImage)
        return `${rootFolder}/organizations/${folder}/images/${filename}`;
    else if (type === uploadType.employeeSignatureImage)
        return `${rootFolder}/employees/${folder}/images/${filename}`;
    else if (type === uploadType.certificateImage)
        return `${rootFolder}/certificates/${folder}/images/${filename}`;
    else if (type === uploadType.profileCardImage)
        return `${rootFolder}/profile-card-images/${folder}/images/${filename}`;
    else if (type === uploadType.logJson) return `${rootFolder}/logs/${folder}/${filename}`;
    else if (type === uploadType.trainingContentFile) return `${rootFolder}/training-contents/${folder}/files/${filename}`;
    else if (type === uploadType.trainingCertificateImage) return `${rootFolder}/trainings/${folder}/certificate-images/${filename}`;
    else if (type === uploadType.trainingBannerImage) return `${rootFolder}/trainings/${folder}/training-banner-images/${filename}`;
    else if (type === uploadType.bulkCSV) return `${rootFolder}/import-logs/${folder}/csv-files/${filename}`;
    else if (type === uploadType.certificateLogo) return `${rootFolder}/certificate-layout/${folder}/${filename}`;
    else if (type === uploadType.exportExcel) return `${rootFolder}/export-users/${folder}/${filename}`;
    else if (type === uploadType.exportLearnersReportAsExcel) return `${rootFolder}/export-reports/${folder}/${filename}`;
    else if (type === uploadType.exportLearnersCoursesReportAsExcel) return `${rootFolder}/export-reports/${folder}/${filename}`;
    else if (type === uploadType.exportCustomQuizReport) return `${rootFolder}/export-reports/Custom-Reports/${folder}/${filename}`;
    else if (type === uploadType.lessonZip) return `${rootFolder}/lessons/${folder}/${filename}`;
};

const isPromise = data => data !== undefined && data instanceof Promise;

const uploadFile = async ({ fileData, folderName, fileName, uploadType, acceptedTypes }) => {
    if (isPromise(fileData)) {
        const { filename: fileNameCurrent, mimetype, createReadStream } = await fileData;
        if (
            acceptedTypes === fileType.all ||
            mimetype?.startsWith(acceptedTypes) ||
            acceptedTypes?.includes(mimetype)
        ) {
            let extension = PathHelper.extname(fileName) || PathHelper.extname(fileNameCurrent);
            if (!extension) {
                const ext = MimeHelper.extension(mimetype);
                if (ext) extension = `.${ext}`;
            }

            fileName = `${fileName}${extension}`;
            const fileNameWithDate = `${fileNameCurrent}-${new Date().getTime()}${extension}`;
            const filePath = getPathFromType({
                type: uploadType,
                folder: folderName,
                filename: fileNameWithDate,
            });

            if (filePath) {
                const stream = createReadStream();
                const s3Path = await AwsHelper.uploadFile({
                    fileData: stream,
                    filePath: filePath,
                    originalFileName: fileName || fileNameWithDate,
                    mimeType: mimetype,
                });

                stream.destroy()
                if (s3Path) return s3Path;
            }

            throw CustomError(ErrorName.UPLOAD_FAILED);
        }

        throw CustomError(ErrorName.UNSUPPORTED_FILE);
    } else if (fileData instanceof require('stream').Readable) {
        let extension = PathHelper.extname(fileName);
        if (!extension) {
            const ext = MimeHelper.extension("application/octet-stream");
            if (ext) extension = `.${ext}`;
        }
        fileName = `${fileName}${extension}`;

        const filePath = getPathFromType({
            type: uploadType,
            folder: folderName,
            filename: fileName,
        });

        if (filePath) {
            const s3Path = await AwsHelper.uploadFile({
                fileData: fileData,
                filePath: filePath,
                originalFileName: fileName,
                mimeType: "application/octet-stream",
            });

            fileData.destroy();
            if (s3Path) return s3Path;
        }
        throw CustomError(ErrorName.UPLOAD_FAILED);

    } else if (typeof fileData.pipe === "function" &&
        typeof fileData._read === "function" &&
        typeof fileData._readableState === "object") {
        let extension = PathHelper.extname(fileName);
        if (!extension) {
            const ext = MimeHelper.extension("application/octet-stream");
            if (ext) extension = `.${ext}`;
        }
        fileName = `${fileName}${extension}`;

        const filePath = getPathFromType({
            type: uploadType,
            folder: folderName,
            filename: fileName,
        });

        if (filePath) {
            const s3Path = await AwsHelper.uploadFile({
                fileData: fileData,
                filePath: filePath,
                originalFileName: fileName,
                mimeType: "application/octet-stream",
            });

            fileData.destroy();
            if (s3Path) return s3Path;
        }
        throw CustomError(ErrorName.UPLOAD_FAILED);
    }

    throw CustomError(ErrorName.INVALID_FILE);
};


const uploadJsonObject = async ({ jsonData, folderName, fileName, uploadType }) => {
    fileName = `${fileName}.json`;

    const filePath = getPathFromType({
        type: uploadType,
        folder: folderName,
        filename: fileName,
    });

    if (filePath) {
        const s3Path = await AwsHelper.uploadFile({
            fileData: JSON.stringify(jsonData),
            filePath: filePath,
            originalFileName: fileName,
            mimeType: "application/json",
        });

        if (s3Path) return s3Path;
    }
};

module.exports = {
    uploadType,
    uploadJsonObject,
    uploadZip: async ({ data, folderName, fileName, uploadType }) => {
        if (typeof data === "object" && typeof data.pipe === "function") {
            const filePath = await uploadFile({
                fileData: data,
                folderName: folderName,
                fileName: fileName,
                uploadType: uploadType,
                acceptedTypes: fileType.zip,
            });

            if (filePath) return filePath;
        } else if (typeof data === "string") return data;
    },
    uploadVideo: async ({ data, folderName, fileName, uploadType }) => {
        if (isPromise(data)) {
            const filePath = await uploadFile({
                fileData: data,
                folderName: folderName,
                fileName: fileName,
                uploadType: uploadType,
                acceptedTypes: fileType.videos,
            });

            if (filePath) return filePath;
        } else if (typeof data === "string") return data;
    },
    uploadSubtitle: async ({ data, folderName, fileName, uploadType }) => {
        if (isPromise(data)) {
            const filePath = await uploadFile({
                fileData: data,
                folderName: folderName,
                fileName: fileName,
                uploadType: uploadType,
                acceptedTypes: fileType.all,
            });

            if (filePath) return filePath;
        } else if (typeof data === "string") return data;
    },
    uploadAudio: async ({ data, folderName, fileName, uploadType }) => {
        if (isPromise(data)) {
            const filePath = await uploadFile({
                fileData: data,
                folderName: folderName,
                fileName: fileName,
                uploadType: uploadType,
                acceptedTypes: fileType.audios,
            });

            if (filePath) return filePath;
        } else if (typeof data === "string") return data;
    },
    uploadImage: async ({ data, folderName, fileName, uploadType }) => {
        if (isPromise(data)) {
            const filePath = await uploadFile({
                fileData: data,
                folderName: folderName,
                fileName: fileName,
                uploadType: uploadType,
                acceptedTypes: fileType.allImages,
            });

            if (filePath) return filePath;
        } else if (typeof data === "string") return data;
    },
    uploadDocument: async ({ data, folderName, fileName, uploadType }) => {
        if (isPromise(data)) {
            const filePath = await uploadFile({
                fileData: data,
                folderName: folderName,
                fileName: fileName,
                uploadType: uploadType,
                acceptedTypes: fileType.documents,
            });

            if (filePath) return filePath;
        } else if (typeof data === "string") return data;
    },
    uploadCSV: async ({ data, folderName, fileName, uploadType }) => {
        if (isPromise(data)) {
            const filePath = await uploadFile({
                fileData: data,
                folderName: folderName,
                fileName: fileName,
                uploadType: uploadType,
                acceptedTypes: fileType.csv,
            });

            if (filePath) return filePath;
        } else if (typeof data === "string") return data;
    },
    uploadExcel: async ({ data, folderName, fileName, uploadType }) => {
        if (isPromise(data) || Buffer.isBuffer(data)) {
            const stream = streamifier.createReadStream(data);
            const filePath = await uploadFile({
                fileData: stream,
                folderName: folderName,
                fileName: fileName,
                uploadType: uploadType,
                acceptedTypes: fileType.excel,
            });
            if (filePath) return filePath;
        } else if (typeof data === "string") {
            return data;
        }
    },

};
