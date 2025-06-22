const { Queue } = require('bullmq');
const redis = require('../../util/redis_helper');
const { QUEUE_NAMES } = require('./queue.enum');

const csvImportQueue = new Queue(QUEUE_NAMES.CSV_IMPORT, {
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

module.exports = csvImportQueue;
