const { connect, getChannel, close, QUEUES, EXCHANGES } = require('../../../util/rabbitmq_helper');

const setupQueues = async () => {
    const channel = await getChannel();

    console.log('reached inside setupQueues!');

    // Setup exchanges
    await channel.assertExchange(EXCHANGES.CSV_IMPORT, 'direct', { durable: true });
    await channel.assertExchange(EXCHANGES.NOTIFICATION, 'direct', { durable: true });
    await channel.assertExchange(EXCHANGES.EMAIL, 'direct', { durable: true });

    // Setup main queue with DLQ
    await channel.assertQueue(QUEUES.CSV_IMPORT_DLQ, {
        durable: true,
        arguments: {
            'x-queue-type': 'classic',
            'x-message-ttl': 864000000 // 10 days
        }
    });

    await channel.assertQueue(QUEUES.CSV_IMPORT, {
        durable: true,
        arguments: {
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': QUEUES.CSV_IMPORT_DLQ,
            'x-max-retries': 3,
            'x-queue-type': 'classic'
        }
    });

    // Setup notification and email queues
    await channel.assertQueue(QUEUES.NOTIFICATION, { durable: true });
    await channel.assertQueue(QUEUES.EMAIL, { durable: true });

    // Bind queues to exchanges
    await channel.bindQueue(QUEUES.CSV_IMPORT, EXCHANGES.CSV_IMPORT, 'import');
    await channel.bindQueue(QUEUES.NOTIFICATION, EXCHANGES.NOTIFICATION, 'notify');
    await channel.bindQueue(QUEUES.EMAIL, EXCHANGES.EMAIL, 'send');

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

module.exports = {
    setupQueues,
    publishToQueue,
    publishToExchange
};
