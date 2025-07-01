require('dotenv').config({ path: '../../.env' });
const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');

const { connectDb, closeDb } = require('../../util/child_process_db_helper');
const { createTrainingRegistrationBackgroundProcess } = require('../training-registrations/training_registration_helper');

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
            console.log(`📬 Received ${data.Messages ? data.Messages.length : 0} messages from LP SQS`);
            // console.log('data:', data?.Messages);
            if (data.Messages) {
                await Promise.all(
                    data.Messages.map(async (message) => {
                        console.log(`📥 Received Job ${message.MessageId}`);

                        try {
                            await connectDb();
                           

                            const { batchedEnrollData, context } = message.Body ? JSON.parse(message.Body) : {};
                               console.log(`Processing batchedEnrollData for Job ${message.MessageId}`, batchedEnrollData);
                             await createTrainingRegistrationBackgroundProcess(batchedEnrollData, context);

                            console.log(`✅ Job ${message.MessageId} processed successfully`);

                            // Delete the message after successful processing
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
                         await closeDb();
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
