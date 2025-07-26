require('dotenv').config({ path: '../../.env' });

const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const { connectDb, closeDb } = require('../../util/child_process_db_helper');
const { createTrainingRegistrationBackgroundProcess } = require('../training-registrations/training_registration_helper');
const { ImportJob } = require('../user/employee/import_job_model');
const firebase_helper = require('../../util/firebase_helper');
const { updateCoursesCountAndProgressInElasticSearch } = require('../training-registrations/overall-course-progress/overall_progress_helper');

const QUEUE_URL = process.env.SQS_QUEUE_URL;

const sqsClient = new SQSClient({
    region: process.env.SQS_AWS_REGION,
    credentials: {
        accessKeyId: process.env.SQS_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.SQS_AWS_SECRET_ACCESS_KEY,
    },
});

let isRunning = true;

async function pollMessages() {
    console.log('✅ Course Enrollment Worker is ready (SQS)');

    while (isRunning) {
        try {
            const params = {
                QueueUrl: QUEUE_URL,
                MaxNumberOfMessages: 5,
                WaitTimeSeconds: 10,
                VisibilityTimeout: 30,
            };

            const data = await sqsClient.send(new ReceiveMessageCommand(params));
            // console.log(`📬 Received ${data.Messages ? data.Messages.length : 0} messages from LP SQS`);
            // console.log('data:', data?.Messages);

            if (data.Messages) {
                await Promise.all(
                    data.Messages.map(async (message) => {
                        console.log(`📥 Received Job ${message.MessageId}`);

                        try {
                            await connectDb();
                          firebase_helper.init();
                            const { batchedEnrollData, context, jobId } = message.Body ? JSON.parse(message.Body) : {};

                            if (!jobId) {
                                throw new Error(`Missing jobId in message body for Job ${message.MessageId}`);
                            }

                            console.log(`Processing batchedEnrollData for Job ${message.MessageId} (${jobId})`);

                            // const existingJob = await ImportJob.findOne({ jobId });
                            // if (existingJob && existingJob.importStatus === 'completed') {
                            //     console.log(`⚠️ Job ${jobId} already processed, skipping.`);
                            //     return;
                            // }

                            // ✅ Reserve the job if not already there
                        //  const res=   await ImportJob.updateOne(
                        //         { jobId },
                        //         {
                        //             $setOnInsert: {
                        //                 jobId,
                        //                 importStatus: 'in_progress',
                        //                 description: 'Course Enrollment Batch in progress',
                        //                 totalRecords: batchedEnrollData?.users?.length || 0,
                        //             },
                        //         },
                        //         { upsert: true }
                        //     );
                            // console.log(`Job ${jobId} reserved:`, res);
                                // console.log(batchedEnrollData,"batchedEnrollData");
                            // ✅ Do your enrollment processing
                            // console.log(`Processing batchedEnrollData for Job ${message.MessageId} (${jobId})`);
                            await createTrainingRegistrationBackgroundProcess(batchedEnrollData, context);

                            await updateCoursesCountAndProgressInElasticSearch(batchedEnrollData?.users, context?.session);

                            // ✅ Mark job as completed
                            // await ImportJob.updateOne(
                            //     { jobId },
                            //     { $set: { importStatus: 'completed' } }
                            // );

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
