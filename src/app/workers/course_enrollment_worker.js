require('dotenv').config({ path: '../../.env' });

const {
    SQSClient,
    ReceiveMessageCommand,
    DeleteMessageCommand,
} = require('@aws-sdk/client-sqs');
const { connectDb, closeDb } = require('../../util/child_process_db_helper');
const {
    createTrainingRegistrationBackgroundProcess,
} = require('../training-registrations/training_registration_helper');
const firebase_helper = require('../../util/firebase_helper');
const {
    updateCoursesCountAndProgressInElasticSearch,
} = require('../training-registrations/overall-course-progress/overall_progress_helper');

const QUEUE_URL = process.env.SQS_QUEUE_URL;

const sqsClient = new SQSClient({
    region: process.env.SQS_AWS_REGION,
    credentials: {
        accessKeyId: process.env.SQS_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.SQS_AWS_SECRET_ACCESS_KEY,
    },
});

const MAX_MESSAGES_PER_POLL = 2;
const MAX_RETRIES = 4;

let isRunning = true;

async function deleteMessage(message) {
    await sqsClient.send(
        new DeleteMessageCommand({
            QueueUrl: QUEUE_URL,
            ReceiptHandle: message.ReceiptHandle,
        })
    );
}

async function processMessage(message) {
    const messageId = message.MessageId;

    const receiveCount =
        parseInt(message.Attributes?.ApproximateReceiveCount || '1', 10) || 1;

    console.log(`📩 Processing Job ${messageId} (Attempt ${receiveCount})`);

    let payload;
    try {
        payload = JSON.parse(message.Body);
    } catch (e) {
        console.error(`❌ JSON Parse Error: ${messageId}`, e);
    }

    try {
        if (payload) {
            const { batchedEnrollData, context } = payload;

            await createTrainingRegistrationBackgroundProcess(batchedEnrollData, context);

            await updateCoursesCountAndProgressInElasticSearch(
                batchedEnrollData?.users,
                context?.session
            );

            console.log(`✅ Success: ${messageId}`);
            await deleteMessage(message);
            return;
        }
    } catch (err) {
        console.error(`⚠️ Fail: ${messageId}`, err);
    }

    if (receiveCount >= MAX_RETRIES) {
        console.error(`❌ Max retries reached (${MAX_RETRIES}). Deleting ${messageId}`);
        await deleteMessage(message);
    } else {
        console.log(`🔁 Will retry message later: ${messageId}`);
        // do NOT delete → SQS will return again after visibility timeout
    }
}

async function pollMessages() {
    console.log('🚀 Worker polling SQS started...');

    while (isRunning) {
        try {
            const params = {
                QueueUrl: QUEUE_URL,
                MaxNumberOfMessages: MAX_MESSAGES_PER_POLL,
                WaitTimeSeconds: 10,
                VisibilityTimeout: 60,
                AttributeNames: ['ApproximateReceiveCount'], // 👈 needed for retries
            };

            const data = await sqsClient.send(new ReceiveMessageCommand(params));
            const messages = data.Messages || [];

            for (const msg of messages) {
                if (!isRunning) break;
                await processMessage(msg);
                global.gc && global.gc();
            }
        } catch (err) {
            console.error('💥 Error polling SQS:', err);
            await new Promise((res) => setTimeout(res, 3000));
        }
    }

    console.log('⏹️ Worker stopped');
}

async function start() {
    try {
        console.log('🔌 Connecting DB + Firebase once...');
        await connectDb();
        firebase_helper.init();
        pollMessages();
    } catch (e) {
        console.error('❌ Worker initialization failed:', e);
        process.exit(1);
    }
}

async function shutdown(signal) {
    console.log(`🛑 Received ${signal}, shutting down...`);
    isRunning = false;
    setTimeout(async () => {
        await closeDb().catch(() => { });
        process.exit(0);
    }, 2000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
