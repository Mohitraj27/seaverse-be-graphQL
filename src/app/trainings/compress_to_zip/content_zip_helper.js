const { contentTypes } = require("../../../util");
const axios = require('axios');
const archiver = require('archiver');
const stream = require('stream');
const { uploadType, uploadZip } = require("../../../util/upload_helper");
const AwsHelper = require("../../../util/aws_helper");

const fileDownloader = async (contentMap) => {

    const zipStream = new stream.PassThrough();
    const archive = archiver('zip', { zlib: { level: 9 } });
    const metadata = {};

    archive.pipe(zipStream);

    for (const [contentId, fileUrl] of contentMap.entries()) {

        let updatedUrl = await AwsHelper.fetchFile(fileUrl);

        try {
            const response = await axios.get(updatedUrl, { responseType: 'stream' });
            const fileName = fileUrl.split('/').pop();

            archive.append(response.data, { name: fileName });

            metadata[contentId] = fileName;
        } catch (error) {
            console.error(`Failed to download file: ${updatedUrl}`, error);
        }
    }

    archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });

    await archive.finalize();

    let saveZipName = `zip_${Date.now()}.zip`;

    const filePath = await uploadZip({
        data: zipStream,
        folderName: 'trainingContents',
        fileName: saveZipName,
        uploadType: uploadType.lessonZip,
    });

    return filePath;

}
const fetchFiles = (contents) => {

    let fileUrlMap = new Map();

    for (let content of contents) {
        const trainingContent = content.trainingContent;
        switch (content.contentType) {
            case contentTypes.VIDEO:
                fileUrlMap.set(content._id, trainingContent.video[0]?.url);
                break;
            case contentTypes.IMAGE:
                fileUrlMap.set(content._id, trainingContent.audio[0]?.url);
                break;
            default:
                fileUrlMap.set(content._id, trainingContent.files[0]?.url);
                break;
        }
    }

    return fileUrlMap;

}
const getTheContent = async (contents, tableType) => {

    let zipUrl = null;
    let fetchedData;

    fetchedData = fetchFiles(contents);

    if (fetchedData.size > 0) {
        zipUrl = await fileDownloader(fetchedData);
    }

    return zipUrl;
}

module.exports = {
    getTheContent
}