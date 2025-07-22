const fs = require('fs');
const os = require('os');
const path = require('path');
const { contentTypes } = require("../../../util");
const axios = require('axios');
const archiver = require('archiver');
const stream = require('stream');
const { uploadType, uploadZip } = require("../../../util/upload_helper");
const AwsHelper = require("../../../util/aws_helper");
const { PassThrough, Readable } = require('stream');
const AWS = require('aws-sdk');
const ffmpeg = require('fluent-ffmpeg');
const { pipeline } = require('stream/promises');
const tmp = require('tmp');
const VIDEO_MIME_TYPES = ['video/mp4'];
const { spawn } = require('child_process');
const UploadHelper = require("../../../util/upload_helper");

const filterVideosByLanguage = async (videos = [], userLanguages = []) => {
    if (!videos?.length) return [];

    if (userLanguages?.length === 0) {
        userLanguages = ['english'];
    }

    const matchedVideos = videos.filter(video => userLanguages.includes(video?.lang));

    if (matchedVideos?.length > 0) {
        return matchedVideos;
    }

    return videos.filter(video => video.isDefault);
};

// const fileDownloader = async (contentMap) => {

//     const archive = archiver('zip', { zlib: { level: 9 } });
//     const metadata = {};

//     const saveZipName = `zip_${Date.now()}.zip`;
//     const tempDir = os.tmpdir();
//     console.log(`Temporary directory: ${tempDir}`);
//     const tempFilePath = path.join(tempDir, saveZipName);
//     const fileWriteStream = fs.createWriteStream(tempFilePath);

//     archive.pipe(fileWriteStream);

//     for (const [contentId, fileUrl] of contentMap.entries()) {
//         const updatedUrl = await AwsHelper.fetchFile(fileUrl);

//         try {

//             const response = await axios.get(updatedUrl, { responseType: 'stream' });
//             const fileName = fileUrl.split('/').pop();

//             archive.append(response.data, { name: fileName });

//             metadata[contentId] = fileName;

//         } catch (error) {
//             return;
//         }

//     }

//     archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });

//     await archive.finalize();

//     await new Promise((resolve, reject) => {
//         fileWriteStream.on('finish', () => {
//             resolve();
//         });
//         fileWriteStream.on('error', (error) => {
//             reject(error);
//         });
//     });

//     let filePath;

//     try {

//         filePath = await uploadZip({
//             data: fs.createReadStream(tempFilePath),
//             folderName: 'trainingContents',
//             fileName: saveZipName,
//             uploadType: uploadType.lessonZip,
//         });

//     } catch (uploadError) {
//         return;
//     } finally {
//         fs.unlink(tempFilePath, (err) => {
//             if (err) {
//                 console.error(`Failed to delete temporary file ${tempFilePath}: ${err.message}`);
//                 return;
//             }
//             console.log(`Temporary file ${tempFilePath} deleted successfully.`);
//         });
//     }

//     return filePath;

// };

// Fixed fileDownloader that ensures complete upload before returning

// const fileDownloader = async (contentMap) => {
//     // First, create a temporary file to ensure we have complete data
//     const saveZipName = `zip_${Date.now()}.zip`;
//     const tempDir = os.tmpdir();
//     const tempFilePath = path.join(tempDir, saveZipName);

//     console.log(`Creating temporary zip file: ${tempFilePath}`);

//     try {
//         // Step 1: Create the complete zip file first
//         await createZipFile(contentMap, tempFilePath);

//         // Step 2: Upload the complete file to S3
//         const fileStream = fs.createReadStream(tempFilePath);

//         const filePath = await uploadZip({
//             data: fileStream,
//             folderName: 'trainingContents',
//             fileName: saveZipName,
//             uploadType: uploadType.lessonZip,
//         });

//         console.log(`Upload successful: ${filePath}`);

//         // Step 3: Verify the upload (optional but recommended)
//         // await verifyS3Upload(filePath);

//         return filePath;

//     } catch (error) {
//         console.error('Error in fileDownloader:', error);
//         throw error;
//     } finally {
//         // Clean up temp file
//         fs.unlink(tempFilePath, (err) => {
//             if (err) {
//                 console.error(`Failed to delete temporary file ${tempFilePath}: ${err.message}`);
//             } else {
//                 console.log(`Temporary file ${tempFilePath} deleted successfully.`);
//             }
//         });
//     }
// };

// Helper function to create the zip file
// const createZipFile = async (contentMap, outputPath) => {
//     const tempCleanups = [];
//     const metadata = {};

//     return new Promise(async (resolve, reject) => {
//         const archive = archiver("zip", {
//             zlib: { level: 5 },
//         });

//         const fileWriteStream = fs.createWriteStream(outputPath);

//         // Error handling
//         fileWriteStream.on("error", err => {
//             console.error("Write stream error:", err);
//             reject(err);
//         });

//         archive.on("error", err => {
//             console.error("Archive error:", err);
//             reject(err);
//         });

//         archive.on("warning", err => {
//             if (err.code === "ENOENT") {
//                 console.warn("Archive warning:", err);
//             } else {
//                 reject(err);
//             }
//         });

//         // Cleanup after archive finishes writing
//         archive.on("end", () => {
//             console.log("Archive stream ended.");
//             for (const { path, cleanupCallback } of tempCleanups) {
//                 try {
//                     cleanupCallback();
//                     console.log(`Cleaned up temp file: ${path}`);
//                 } catch (err) {
//                     console.warn(`Failed to clean up temp file: ${path} - ${err.message}`);
//                 }
//             }
//             resolve();
//         });

//         // Start piping archive output to file
//         archive.pipe(fileWriteStream);

//         const CONCURRENT_DOWNLOADS = 3;
//         const entries = Array.from(contentMap.entries());

//         for (let i = 0; i < entries.length; i += CONCURRENT_DOWNLOADS) {
//             const batch = entries.slice(i, i + CONCURRENT_DOWNLOADS);

//             await Promise.all(
//                 batch.map(async ([contentId, fileUrl]) => {
//                     try {
//                         const updatedUrl = await AwsHelper.fetchFile(fileUrl);
//                         const fileName = fileUrl.split("/").pop();

//                         console.log(`Downloading: ${fileName}`);
//                         const { path, contentType, cleanupCallback } = await downloadWithRetry(
//                             updatedUrl
//                         );
//                         tempCleanups.push({ path, cleanupCallback });

//                         // Create base stream
//                         let inputStream = fs.createReadStream(path);
//                         // if (VIDEO_MIME_TYPES.includes(contentType)) {
//                         //     console.log(`Compressing video: ${fileName}`);
//                         //     inputStream = compressVideoStream(path, { maxResolution: 720 });
//                         // }

//                         // Create passthrough stream and append it to archive
//                         const passThrough = new PassThrough();
//                         archive.append(passThrough, { name: fileName });

//                         // Wait for full piping to complete before continuing
//                         await pipeline(inputStream, passThrough);

//                         metadata[contentId] = fileName;
//                     } catch (error) {
//                         console.error(`Error processing file ${fileUrl}:`, error.message);
//                     }
//                 })
//             );
//         }

//         // Add metadata to archive
//         archive.append(JSON.stringify(metadata, null, 2), { name: "metadata.json" });

//         // Finalize the archive
//         await archive.finalize();
//     });
// };

// Helper function to download with retry
// const downloadWithRetry = async (url, maxRetries = 3) => {
//     for (let i = 0; i < maxRetries; i++) {
//         console.log(`Attempt ${i + 1} to download: ${url}`);
//         try {
//             const response = await axios.get(url, {
//                 responseType: 'stream',
//                 timeout: 300000 * 6, // 5 minutes
//                 maxContentLength: Infinity,
//                 maxBodyLength: Infinity,
//                 decompress: false, // ⬅️ important for signed S3 URLs
//                 headers: {}
//             });

//             const tmpFile = tmp.fileSync({ postfix: '.mp4' });
//             await pipeline(response.data, fs.createWriteStream(tmpFile.name));
//             console.log(`\nDownloaded file to temporary location: ${tmpFile.name}`);
//             return {
//                 path: tmpFile.name,
//                 cleanupCallback: tmpFile.removeCallback, // in case you want to delete later
//                 contentType: response.headers['content-type']
//             };
//         } catch (error) {
//             if (i === maxRetries - 1) throw error;

//             console.warn(`Retry ${i + 1} for ${url}`);
//             await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
//         }
//     }
// };

const fetchFiles = async (moduleAndContents, userLanguages = []) => {
    let metadataObject = {};

    for (const item of moduleAndContents) {

        const trainingContents = Array.isArray(item.trainingContent) ? item.trainingContent : [];

        for (const trainingContent of trainingContents) {

            if (!trainingContent) continue;

            switch (trainingContent.contentType) {
                case contentTypes.VIDEO:
                    const selectedVideos = await filterVideosByLanguage(trainingContent?.videos, userLanguages);
                    selectedVideos.forEach(video => {
                        if (video?.url) {
                            const videoKey = `${item?.trainingModule}_${trainingContent?._id}_video_${video?._id}_${video?.lang}`;
                            const fileName = video?.url.split("/").pop();
                            metadataObject[videoKey] = fileName;
                        }

                        // Process subtitles for the current video
                        video?.subtitles?.forEach(subtitle => {
                            if (subtitle?.url) {
                                const subtitleKey = `${item?.trainingModule}_${trainingContent?._id}_subtitle_${video?._id}_${video?.lang}_${subtitle?._id}_${subtitle?.lang}`;
                                const fileName = subtitle?.url.split("/").pop();
                                metadataObject[subtitleKey] = fileName;
                            }
                        });
                    });
                    break;

                case contentTypes.IMAGE:
                    if (trainingContent.images && trainingContent.images[0]?.url) {
                        const imageKey = `${item?.trainingModule}_${trainingContent?._id}`;
                        const fileName = trainingContent.images[0]?.url.split("/").pop();
                        metadataObject[imageKey] = fileName;
                    }
                    break;

                case contentTypes.QUIZ:
                    break;

                default:
                    if (trainingContent.files && trainingContent.files[0]?.url) {
                        const fileName = trainingContent.files[0]?.url.split("/").pop();
                        const defaultKey = `${item?.trainingModule}_${trainingContent?._id}`;
                        metadataObject[defaultKey] = fileName;
                    }
                    break;
            }
        }
    }

    // Return the completed object.
    return metadataObject;
};

const generateAndUploadMetadata = async (moduleAndContents, userLanguages, folderName = 'metadatas') => {

    const metadataObject = await fetchFiles(moduleAndContents, userLanguages);

    const jsonString = JSON.stringify(metadataObject, null, 2);

    const stream = Readable.from(jsonString);

    const s3Path = await UploadHelper.uploadFile({
        fileData: stream,
        folderName: folderName,
        fileName: `metadata_${Date.now()}.json`,
        uploadType: 'metadataJSON',
        acceptedTypes: 'application/json',
    });

    return s3Path;
};

const getTheContent = async (moduleAndContents, userLanguages = []) => {

    try {
        const allQuizzes = moduleAndContents.every(item => item?.trainingContent?.contentType === contentTypes.QUIZ);

        if (allQuizzes) {
            return [];
        }

        const metaData = await generateAndUploadMetadata(moduleAndContents, userLanguages);

        return metaData;
    } catch (error) {
        throw new Error('Failed to generate content metadata');
    }


}

async function compressVideoToFile(inputPath, options = {}) {
    console.log(`[FFMPEG] Compressing video InputPath: ${inputPath}`);
    const { maxResolution = 720 } = options;
    const outputPath = path.join(os.tmpdir(), `compressed_${Date.now()}.mp4`);

    return new Promise((resolve, reject) => {
        const ffmpegArgs = [
            '-probesize', '5000000',
            '-analyzeduration', '10000000',
            '-i', inputPath,
            '-vcodec', 'libx264',
            '-acodec', 'aac',
            '-preset', 'veryfast',
            '-crf', '24',
            ...(maxResolution ? ['-vf', `scale=-2:${maxResolution}`] : []),
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            '-f', 'mp4',
            outputPath
        ];

        const ffmpeg = spawn('ffmpeg', ffmpegArgs);

        ffmpeg.stderr.on('data', (data) => {
            console.log('[FFMPEG]', data.toString());
        });

        ffmpeg.on('error', (err) => reject(err));
        ffmpeg.on('close', (code) => {
            if (code === 0) resolve(outputPath);
            else reject(new Error(`FFmpeg exited with code ${code}`));
        });
    });
}

module.exports = {
    getTheContent,
    compressVideoToFile
}