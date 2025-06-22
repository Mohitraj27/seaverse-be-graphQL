require('dotenv').config({ path: '../../.env' });
const { Worker } = require('bullmq');
const redis = require('../../util/redis_helper');
const { connectDb, closeDb } = require('../../util/child_process_db_helper');
const { QUEUE_NAMES } = require('../queues/queue.enum');
const { createEmployeesBackgroundTask } = require('../user/employee/employee_helper');

let isReady = false;
const worker = new Worker(
    QUEUE_NAMES.CSV_IMPORT,
    async (job) => {
        console.log(`📥 ${QUEUE_NAMES.CSV_IMPORT} Job ${job.id} received`);

        try {
            await connectDb();

            const { jobId,
                users,
                emailsArray,
                empIdsArray,
                subscriberId,
                userId,
                userInfo,
                newFileName,
                saveCSV,
                context } = job.data;

                console.log(job.data," job data");

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
            console.log(`✅ Job ${job.id} (${jobId}) processed successfully`);
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
   if (!isReady) {
        console.log('✅ CSV Import Worker is ready');
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
    console.log('🛑 Shutting down csv worker (SIGTERM)');
    await worker.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 Shutting down csv worker (SIGINT)');
    await worker.close();
    process.exit(0);
});
