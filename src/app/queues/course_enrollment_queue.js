const { Queue } = require('bullmq');
const redis = require('../../util/redis_helper');
const { QUEUE_NAMES } = require('./queue.enum');

const courseEnrollmentQueue = new Queue(QUEUE_NAMES.COURSE_ENROLLMENT, {
    connection: redis,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 3000
        },
        removeOnComplete: {
            age: 3600, // keep completed jobs for 1 hour
            count: 100 // keep last 100 completed jobs
        },
        removeOnFail: false,
        // Add timeout to prevent hanging jobs
        timeout: 300000 // 5 minutes per jobF
    }
});

courseEnrollmentQueue.on('error', (error) => {
    console.error('❌ Queue error:', error);
});

courseEnrollmentQueue.on('failed', (job, error) => {
    console.error(`❌ Job ${job.id} failed:`, error);
    console.error('Failed job data:', JSON.stringify(job.data, null, 2));
});

module.exports = courseEnrollmentQueue;
