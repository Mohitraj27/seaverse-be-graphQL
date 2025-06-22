require('dotenv').config({ path: '../../.env' });
const { Worker } = require('bullmq');
const redis = require('../../util/redis_helper');
const { connectDb, closeDb } = require('../../util/child_process_db_helper');
const { createTrainingRegistrationBackgroundProcess } = require('../training-registrations/training_registration_helper');
const { QUEUE_NAMES } = require('../queues/queue.enum');


let isReady = false;

const worker = new Worker(
    QUEUE_NAMES.COURSE_ENROLLMENT,
    async (job) => {
        console.log(`📥 ${QUEUE_NAMES.COURSE_ENROLLMENT} Job ${job.id} received`);

        try {
            await connectDb();
            const { batchedEnrollData, context } = job.data;

            await createTrainingRegistrationBackgroundProcess(batchedEnrollData, context);

            console.log(`✅ Job ${job.id} processed successfully`);
        } catch (err) {
            console.error(`❌ Job ${job.id} failed:`, err);
            throw err;
        } finally {
            await closeDb();
        }
    },
    {
        connection: redis,
        concurrency: 5, // Tune based on memory/CPU available
        removeOnComplete: true,
        removeOnFail: {
            count: 10 // keep last 10 failed jobs
        }
    }
);

worker.on('ready', () => {
if(!isReady) {
    console.log('✅ Course Enrollment Worker is ready');
        isReady = true;
    }
});

// Lifecycle events
worker.on('completed', (job) => {
    console.log(`🎉 Job ${job.id} (${job.data.jobId}) completed`);
});

worker.on('failed', (job, err) => {
    console.error(`💥 Job ${job.id} failed after ${job.attemptsMade} attempts:`, err.message);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 Shutting down worker (SIGTERM)');
    await worker.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 Shutting down worker (SIGINT)');
    await worker.close();
    process.exit(0);
});
