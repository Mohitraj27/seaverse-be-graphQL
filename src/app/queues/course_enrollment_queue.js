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
        removeOnComplete: true,
        removeOnFail: false
    }
});

module.exports = courseEnrollmentQueue;
