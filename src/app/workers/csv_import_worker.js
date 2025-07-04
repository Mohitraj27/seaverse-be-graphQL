require('dotenv').config({ path: '../../.env' });

const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const { connectDb, closeDb } = require('../../util/child_process_db_helper');
const { createEmployeesBackgroundTask } = require('../user/employee/employee_helper');
const { ImportJob } = require('../user/employee/import_job_model');

const QUEUE_URL = process.env.SQS_CSV_IMPORT_QUEUE_URL;
// console.log('CSV_IMPORT_QUEUE_URL:', QUEUE_URL);

const sqsClient = new SQSClient({
    region: process.env.SQS_AWS_REGION,
    credentials: {
        accessKeyId: process.env.SQS_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.SQS_AWS_SECRET_ACCESS_KEY,
    },
});

let isRunning = true;

async function pollMessages() {
    console.log('✅ CSV Import Worker is ready (SQS)');

    while (isRunning) {
        try {
            const params = {
                QueueUrl: QUEUE_URL,
                MaxNumberOfMessages: 5,
                WaitTimeSeconds: 10,
                VisibilityTimeout: 60,
            };

            const data = await sqsClient.send(new ReceiveMessageCommand(params));
            // console.log(`📬 Received ${data.Messages ? data.Messages.length : 0} messages from CSV SQS`);
            // console.log('data:', data?.Messages);

            if (data.Messages) {
                await Promise.all(
                    data.Messages.map(async (message) => {
                        console.log(`📥 CSV Import Job ${message.MessageId} received`);

                        try {
                            await connectDb();

                            const {
                                jobId,
                                users,
                                emailsArray,
                                empIdsArray,
                                subscriberId,
                                userId,
                                newFileName,
                                saveCSV,
                                context,
                            } = message.Body ? JSON.parse(message.Body) : {};

                            console.log(`🔍 Processing CSV Import Job ${message.MessageId} (${jobId})`);

                            if (!jobId) {
                                throw new Error('Missing jobId in message payload');
                            }

                            // const existingJob = await ImportJob.findOne({ jobId });
                            // if (existingJob && existingJob.importStatus === 'completed') {
                            //     console.log(`⚠️ Job ${jobId} already processed, skipping.`);
                            //     return;
                            // }

                            // await ImportJob.updateOne(
                            //     { jobId },
                            //     {
                            //         $setOnInsert: {
                            //             jobId,
                            //             subscriber: subscriberId,
                            //             fileName: newFileName,
                            //             importStatus: 'in_progress',
                            //             totalRecords: users?.length || 0,
                            //             description: 'CSV Import in progress'
                            //         },
                            //     },
                            //     { upsert: true }
                            // );

                            await createEmployeesBackgroundTask(
                                users,
                                emailsArray,
                                empIdsArray,
                                subscriberId,
                                userId,
                                newFileName,
                                saveCSV,
                                context
                            );

                            // await ImportJob.updateOne(
                            //     { jobId },
                            //     { $set: { importStatus: 'completed' } }
                            // );

                            console.log(`✅ CSV Import Job ${message.MessageId} (${jobId}) processed successfully`);

                            await sqsClient.send(
                                new DeleteMessageCommand({
                                    QueueUrl: QUEUE_URL,
                                    ReceiptHandle: message.ReceiptHandle,
                                })
                            );
                            console.log(`🗑️ Deleted CSV Import Job ${message.MessageId}`);
                        } catch (err) {
                            console.error(`❌ CSV Import Job ${message.MessageId} failed:`, err);
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

    console.log('🛑 CSV Import Worker stopped polling');
}

// Start polling
pollMessages();

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Shutting down CSV Import Worker (SIGTERM)');
    isRunning = false;
});

process.on('SIGINT', () => {
    console.log('🛑 Shutting down CSV Import Worker (SIGINT)');
    isRunning = false;
});
