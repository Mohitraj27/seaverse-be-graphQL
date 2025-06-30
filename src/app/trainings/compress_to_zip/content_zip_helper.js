const fs = require('fs');
const os = require('os');
const path = require('path');
const { contentTypes } = require("../../../util");
const axios = require('axios');
const archiver = require('archiver');
const stream = require('stream');
const { uploadType, uploadZip } = require("../../../util/upload_helper");
const AwsHelper = require("../../../util/aws_helper");
const { PassThrough } = require('stream');
const AWS = require('aws-sdk');

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
const fileDownloader = async (contentMap) => {
    // First, create a temporary file to ensure we have complete data
    const saveZipName = `zip_${Date.now()}.zip`;
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, saveZipName);

    console.log(`Creating temporary zip file: ${tempFilePath}`);

    try {
        // Step 1: Create the complete zip file first
        await createZipFile(contentMap, tempFilePath);

        // Step 2: Upload the complete file to S3
        const fileStream = fs.createReadStream(tempFilePath);

        const filePath = await uploadZip({
            data: fileStream,
            folderName: 'trainingContents',
            fileName: saveZipName,
            uploadType: uploadType.lessonZip,
        });

        console.log(`Upload successful: ${filePath}`);

        // Step 3: Verify the upload (optional but recommended)
        // await verifyS3Upload(filePath);

        return filePath;

    } catch (error) {
        console.error('Error in fileDownloader:', error);
        throw error;
    } finally {
        // Clean up temp file
        fs.unlink(tempFilePath, (err) => {
            if (err) {
                console.error(`Failed to delete temporary file ${tempFilePath}: ${err.message}`);
            } else {
                console.log(`Temporary file ${tempFilePath} deleted successfully.`);
            }
        });
    }
};

// Helper function to create the zip file
const createZipFile = async (contentMap, outputPath) => {
    return new Promise(async (resolve, reject) => {
        const archive = archiver('zip', {
            zlib: { level: 5 } // Balanced compression
        });

        const metadata = {};
        const fileWriteStream = fs.createWriteStream(outputPath);

        // Set up event handlers
        fileWriteStream.on('error', (error) => {
            console.error('Write stream error:', error);
            reject(error);
        });

        fileWriteStream.on('close', () => {
            console.log(`Zip file created: ${archive.pointer()} total bytes`);
            resolve();
        });

        archive.on('error', (err) => {
            console.error('Archive error:', err);
            reject(err);
        });

        archive.on('warning', (err) => {
            if (err.code === 'ENOENT') {
                console.warn('Archive warning:', err);
            } else {
                reject(err);
            }
        });

        // Pipe archive data to the file
        archive.pipe(fileWriteStream);

        // Process files with concurrency control
        const CONCURRENT_DOWNLOADS = 3;
        const entries = Array.from(contentMap.entries());

        for (let i = 0; i < entries.length; i += CONCURRENT_DOWNLOADS) {
            const batch = entries.slice(i, i + CONCURRENT_DOWNLOADS);

            await Promise.all(batch.map(async ([contentId, fileUrl]) => {
                try {
                    const updatedUrl = await AwsHelper.fetchFile(fileUrl);
                    const fileName = fileUrl.split('/').pop();

                    console.log(`Downloading: ${fileName}`);

                    const response = await downloadWithRetry(updatedUrl);

                    // Append stream to archive
                    archive.append(response.data, { name: fileName });
                    metadata[contentId] = fileName;

                } catch (error) {
                    console.error(`Error processing file ${fileUrl}:`, error.message);
                    // Continue with other files
                }
            }));
        }

        // Add metadata file
        archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });

        // Finalize the archive (no more files will be appended)
        await archive.finalize();
    });
};

// Helper function to download with retry
const downloadWithRetry = async (url, maxRetries = 3) => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await axios.get(url, {
                responseType: 'stream',
                timeout: 300000, // 5 minutes
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                headers: {
                    'Accept-Encoding': 'gzip, deflate'
                }
            });
        } catch (error) {
            if (i === maxRetries - 1) throw error;

            console.log(`Retry ${i + 1} for ${url}`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
};

const fetchFiles = async (contents, userLanguages = []) => {

    let fileUrlMap = new Map();

    for (let content of contents) {

        const trainingContent = content;

        switch (trainingContent.contentType) {
            case contentTypes.VIDEO:
                /* fileUrlMap.set(content._id, trainingContent.videos[0]?.url);
               break;
               */
                const selectedVideos = await filterVideosByLanguage(trainingContent?.videos, userLanguages);
                selectedVideos.forEach((video, index) => {
                    if (video?.url) {
                        fileUrlMap.set(`${content?._id}_video_${video?._id}_${video?.lang}`, video?.url);
                    }
                    video?.subtitles?.forEach((subtitle) => {
                        if (subtitle?.url) {
                            fileUrlMap.set(`${content?._id}_subtitle_${video?._id}_${video?.lang}_${subtitle?._id}_${subtitle?.lang}`, subtitle?.url);
                        }
                    });
                });
                break;
            case contentTypes.IMAGE:
                fileUrlMap.set(content._id, trainingContent.images[0]?.url);
                break;
            case contentTypes.QUIZ:
                break;
            default:
                fileUrlMap.set(content._id, trainingContent.files[0]?.url);
                break;
        }

    }

    return fileUrlMap;

}

const getTheContent = async (contents, userLanguages = []) => {

    let zipUrl = null;
    let fetchedData;

    const allQuizzes = contents.every(content => content.contentType === contentTypes.QUIZ);

    if (allQuizzes) {
        return [];
    }

    fetchedData = await fetchFiles(contents, userLanguages);
    if (fetchedData?.size > 0) {
        zipUrl = await fileDownloader(fetchedData);
    }

    if (!zipUrl) {
        return null;
    }

    return zipUrl || null;
}

module.exports = {
    getTheContent
}