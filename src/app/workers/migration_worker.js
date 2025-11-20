require('dotenv').config({ path: '../../.env' });

const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const { connectDb, closeDb } = require('../../util/child_process_db_helper');
const { dataMigrationBackground } = require('../trainings/training_helper');
const { MigrationJob } = require('../trainings/migration_job_model');

const sqsClient = new SQSClient({
    region: process.env.SQS_AWS_REGION,
    credentials: {
        accessKeyId: process.env.SQS_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.SQS_AWS_SECRET_ACCESS_KEY,
    },
});

const QUEUE_URL = process.env.SQS_MIGRATION_QUEUE_URL;
console.log(`✅ Queue URL: ${QUEUE_URL}`);

let isRunning = true;

async function pollMessages() {
    console.log('✅ Migration Worker is ready (SQS)');

    while (isRunning) {
        try {
            const params = {
                QueueUrl: QUEUE_URL,
                MaxNumberOfMessages: 10,
                WaitTimeSeconds: 10,
                VisibilityTimeout: 60,
            };

            const data = await sqsClient.send(new ReceiveMessageCommand(params));

            if (data.Messages) {
                await Promise.all(
                    data.Messages.map(async (message) => {
                        console.log(`📥 Migration Job ${message.MessageId} received`);

                        try {
                            await connectDb();

                            const {
                                jobId,
                                users,
                                trainingId
                            } = message.Body ? JSON.parse(message.Body) : {};

                            console.log(`🔍 Processing Migration Job ${message.MessageId} (${jobId})`);

                            if (!jobId) {
                                throw new Error('Missing jobId in message payload');
                            }

                            await dataMigrationBackground(users, trainingId, jobId);

                            const fetchJob = await MigrationJob.findOne({ jobId: jobId });
                            const processedCount = fetchJob?.processedCount || 0;
                            const totalRecords = fetchJob?.totalRecords || 0;
                            const progressCompleted = fetchJob?.progressCompleted;

                            console.log(`\n Migration Job ${jobId} - Processed: ${processedCount}, Total: ${totalRecords}, Progress Completed: ${progressCompleted}`);

                            if (processedCount === totalRecords) console.log(`\n🎉 Migration Job ${jobId} completed successfully.`);
                            else console.log(`\n⏳ Migration Job ${jobId} is still in progress...`);

                            console.log(`✅ Migration Job ${message.MessageId} (${jobId}) processed successfully`);

                            await sqsClient.send(
                                new DeleteMessageCommand({
                                    QueueUrl: QUEUE_URL,
                                    ReceiptHandle: message.ReceiptHandle,
                                })
                            );
                            console.log(`🗑️ Deleted Migration Job ${message.MessageId}`);
                        } catch (err) {
                            console.error(`❌ Migration Job ${message.MessageId} failed:`, err);
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

    console.log('🛑 Migration Worker stopped polling');
}

// Start polling
pollMessages();

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Shutting down Migration Worker (SIGTERM)');
});

process.on('SIGINT', () => {
    console.log('🛑 Shutting down Migration Worker (SIGINT)');
});