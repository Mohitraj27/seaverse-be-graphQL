const { connect, getChannel, close, QUEUES, EXCHANGES } = require('../../util/rabbitmq_helper');

const setupQueues = async () => {
    const channel = await getChannel();
    // remove this code before production
    console.log('Queue cleared');
    
    // Clear all queues
    await Promise.all(Object.keys(QUEUES).map(queueName => channel.assertQueue(queueName, { durable: true }).then(() => channel.purgeQueue(queueName))));
    // remove this code before production

    // Setup exchanges
    await channel.assertExchange(EXCHANGES.REPORT_GENERATION, 'direct', { durable: true });

    // Setup main queue with DLQ
    await channel.assertQueue(QUEUES.REPORT_GENERATION_DLQ, {
        durable: true,
        arguments: {
            'x-queue-type': 'classic',
            'x-message-ttl': 864000000 // 10 days
        }
    });

    await channel.assertQueue(QUEUES.REPORT_GENERATION, {
        durable: true,
        arguments: {
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': QUEUES.REPORT_GENERATION_DLQ,
            'x-max-retries': 3,
            'x-queue-type': 'classic'
        }
    });

    // Bind queues to exchanges
    await channel.bindQueue(QUEUES.REPORT_GENERATION, EXCHANGES.REPORT_GENERATION, 'reportGen');

    // Set prefetch to process one message at a time
    await channel.prefetch(1);

    console.log('RabbitMQ queues setup completed');
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
        
        console.log('before returning publishToExchange!');
        return channel.publish(exchange, routingKey, message, publishOptions);
    } catch (error) {
        console.error('Error publishing to exchange:', error);
        throw error;
    }
};

const publishMessagesOneByOne = async (queue, dataArray, delayMs = 10, options = {}) => {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    for (const data of dataArray) {
        try {
            await publishToQueue(queue, data, options);
            console.log(`Published to ${queue}: ${data?._id || '[data]'}`);
            await delay(delayMs);
        } catch (error) {
            console.error('Error in publishMessagesOneByOne:', error);
        }
    }

    console.log(`Finished publishing ${dataArray.length} messages to ${queue}`);
};

module.exports = {
    setupQueues,
    publishToQueue,
    publishToExchange,
    publishMessagesOneByOne
};
