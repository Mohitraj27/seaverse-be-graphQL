const { connect, getChannel, close, QUEUES, EXCHANGES } = require('../../util/rabbitmq_helper');

const setupQueues = async () => {
    const channel = await getChannel();

    // Setup exchanges
    await channel.assertExchange(EXCHANGES.COURSE_ENROLLMENT, 'direct', { durable: true });
    
    // Setup main queue with DLQ
    await channel.assertQueue(QUEUES.COURSE_ENROLLMENT_DLQ, {
        durable: true,
        arguments: {
            'x-queue-type': 'classic',
            'x-message-ttl': 864000000 // 10 days
        }
    });

    await channel.assertQueue(QUEUES.COURSE_ENROLLMENT, {
        durable: true,
        arguments: {
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': QUEUES.COURSE_ENROLLMENT_DLQ,
            'x-max-retries': 3,
            'x-queue-type': 'classic'
        }
    });

    // Bind queues to exchanges
    await channel.bindQueue(QUEUES.COURSE_ENROLLMENT, EXCHANGES.COURSE_ENROLLMENT, 'courseEnrollment');

    // Set prefetch to process one message at a time
    await channel.prefetch(1);
};

const publishToQueue = async (queue, data, options = {}) => {
    try {
        const channel = await getChannel();
        const message = Buffer.from(JSON.stringify(data));

        const publishOptions = {
            persistent: true,
            ...options
        };

        return channel.sendToQueue(queue, message, publishOptions);
    } catch (error) {
        console.error('Error publishing to queue:', error);
        throw error;
    }
};

const publishToExchange = async (exchange, routingKey, data, options = {}) => {
    try {
        const channel = await getChannel();
        const message = Buffer.from(JSON.stringify(data));
        
        const publishOptions = {
            persistent: true,
            ...options
        };
        
        return channel.publish(exchange, routingKey, message, publishOptions);
    } catch (error) {
        console.error('Error publishing to exchange:', error);
        throw error;
    }
};

module.exports = {
    setupQueues,
    publishToQueue,
    publishToExchange
};
