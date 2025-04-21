const fs = require('fs');
const os = require('os');
const path = require('path');
const { contentTypes } = require("../../../util");
const axios = require('axios');
const archiver = require('archiver');
const stream = require('stream');
const { uploadType, uploadZip } = require("../../../util/upload_helper");
const AwsHelper = require("../../../util/aws_helper");

const filterVideosByLanguage = async (videos = [], userLanguages = []) => {
    if (!videos?.length) return [];

    if (userLanguages?.length === 0) {
        userLanguages = ['en'];
    }

    const matchedVideos = videos.filter(video => userLanguages.includes(video?.lang));

    if (matchedVideos?.length > 0) {
        return matchedVideos;
    }

    return videos.filter(video => video.isDefault);
};

const fileDownloader = async (contentMap) => {

    const archive = archiver('zip', { zlib: { level: 9 } });
    const metadata = {};

    const saveZipName = `zip_${Date.now()}.zip`;
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, saveZipName);
    const fileWriteStream = fs.createWriteStream(tempFilePath);

    archive.pipe(fileWriteStream);

    for (const [contentId, fileUrl] of contentMap.entries()) {
        const updatedUrl = await AwsHelper.fetchFile(fileUrl);

        try {

            const response = await axios.get(updatedUrl, { responseType: 'stream' });
            const fileName = fileUrl.split('/').pop();

            archive.append(response.data, { name: fileName });

            metadata[contentId] = fileName;

        } catch (error) {
            return;
        }

    }

    archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });

    await archive.finalize();

    await new Promise((resolve, reject) => {
        fileWriteStream.on('finish', () => {
            resolve();
        });
        fileWriteStream.on('error', (error) => {
            reject(error);
        });
    });

    let filePath;

    try {

        filePath = await uploadZip({
            data: fs.createReadStream(tempFilePath),
            folderName: 'trainingContents',
            fileName: saveZipName,
            uploadType: uploadType.lessonZip,
        });

    } catch (uploadError) {
        return;
    } finally {
        fs.unlink(tempFilePath, (err) => {
            if (err) {
                return;
            }
        });
    }

    return filePath;

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