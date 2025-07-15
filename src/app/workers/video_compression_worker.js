require('dotenv').config({ path: '../../.env' });

const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const { connectDb, closeDb } = require('../../util/child_process_db_helper');
const contentZipHelper = require('../trainings/compress_to_zip/content_zip_helper');
const { UploadHelper } = require('../../util');
const AwsHelper = require('../../util/aws_helper');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { default: axios } = require('axios');
const upload_helper = require('../../util/upload_helper');
const { TrainingModuleContent } = require("../trainings/training_modules/training_module_contents/training_module_content_model");

const QUEUE_URL = process.env.SQS_VIDEO_COMPRESSION_QUEUE_URL;

const sqsClient = new SQSClient({
    region: process.env.SQS_AWS_REGION,
    credentials: {
        accessKeyId: process.env.SQS_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.SQS_AWS_SECRET_ACCESS_KEY,
    },
});

let isRunning = true;

async function pollMessages() {
    console.log('✅ Video Compression Worker is ready (SQS)');

    while (isRunning) {
        try {
            const params = {
                QueueUrl: QUEUE_URL,
                MaxNumberOfMessages: 5,
                WaitTimeSeconds: 10,
                VisibilityTimeout: 30,
            };

            const data = await sqsClient.send(new ReceiveMessageCommand(params));

            if (data.Messages) {
                await Promise.all(
                    data.Messages.map(async (message) => {

                        try {
                            await connectDb();

                            const { savedContent: saveContentData, jobId } = message.Body ? JSON.parse(message.Body) : {};

                            if (!jobId || !saveContentData) {
                                throw new Error(`Missing jobId in message body for Job ${message.MessageId}`);
                            }

                            const savedContent = await TrainingModuleContent.findById(saveContentData._id);

                            if (!savedContent) {
                                throw new Error(`Content not found for ID ${saveContentData._id} in Job ${message.MessageId}`);
                            }
                            const videos = savedContent?.videos || [];
                            for (const video of videos) {
                                try {
                                    console.log(`🔄 Processing video: ${video.url}`);
                                    const url = video?.url;
                                    const fetchedFile = await AwsHelper.fetchFile(url);
                                    console.log(`📡 Fetched video: ${fetchedFile}`);
                                    const fileName = url.split('/').pop();


                                    // Step 2: Compress video
                                    const outputPath = await contentZipHelper.compressVideoToFile(fetchedFile);

                                    const fileStream = fs.createReadStream(outputPath);
                                    const uploadedFile = await upload_helper.uploadVideo({
                                        data: fileStream,
                                        folderName: `video-content`,
                                        fileName: `${fileName}_compressed`,
                                        uploadType: upload_helper.uploadType.trainingContentVideo,
                                        acceptedTypes: upload_helper.fileType.videos,
                                    });

                                    if (uploadedFile) {

                                        console.log(uploadedFile);
                                        console.log(`✅ Compressed video uploaded: ${uploadedFile}`);

                                        // Update compressed video URL in savedContent
                                        const videoToUpdate = savedContent.videos.find(v => v.url === url);
                                        if (videoToUpdate) {
                                            videoToUpdate.url = uploadedFile;
                                        }
                                        console.log('savedContent');
                                        console.log(savedContent);
                                        // Save the updated content back to the database
                                        await savedContent.save();

                                        console.log(`✅ Video compressed and uploaded successfully: ${uploadedFile}`);
                                    } else {
                                        console.warn(`⚠️ Upload failed for video: ${outputPath}`);
                                    }
                                } catch (err) {
                                    console.error(`❌ Error processing video:`, err);
                                }
                            }


                            console.log(`✅ Job ${message.MessageId} (${jobId}) processed successfully`);

                            // ✅ Delete the message after successful processing
                            await sqsClient.send(
                                new DeleteMessageCommand({
                                    QueueUrl: QUEUE_URL,
                                    ReceiptHandle: message.ReceiptHandle,
                                })
                            );
                            console.log(`🗑️ Deleted Job ${message.MessageId}`);
                        } catch (err) {
                            console.error(`❌ Job ${message.MessageId} failed:`, err);
                            // Message will return to the queue after VisibilityTimeout
                        } finally {
                            // await closeDb();
                        }
                    })
                );
            }
        } catch (err) {
            console.error('💥 Error polling SQS:', err);
        }
    }

    console.log('🛑 Worker stopped polling');
}

// Start polling
pollMessages();

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Shutting down worker (SIGTERM)');
    isRunning = false;
});

process.on('SIGINT', () => {
    console.log('🛑 Shutting down worker (SIGINT)');
    isRunning = false;
});
