const amqp = require('amqplib');
require('dotenv').config();

let connection = null;
let channel = null;
let isConnecting = false;
const retryInterval = 5000;

const {
    RABBITMQ_PROTOCOL,
    RABBITMQ_USER,
    RABBITMQ_PASSWORD,
    RABBITMQ_HOST,
    RABBITMQ_PORT,
} = process.env;

const connectionUrl = `${RABBITMQ_PROTOCOL}://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@${RABBITMQ_HOST}:${RABBITMQ_PORT}`;

// Helper to establish connection and channel
const connect = async () => {
    if (isConnecting || (connection && connection.connection?.stream?.writable)) {
        return channel;
    }

    isConnecting = true;

    try {
        console.log('Connecting to RabbitMQ...');
        connection = await amqp.connect(connectionUrl);
        channel = await connection.createChannel();

        connection.on('error', (err) => {
            console.error('RabbitMQ connection error:', err.message);
        });

        connection.on('close', () => {
            console.warn('RabbitMQ connection closed. Attempting to reconnect...');
            connection = null;
            channel = null;
            setTimeout(connect, retryInterval);
        });

        channel.on('error', (err) => {
            console.error('RabbitMQ channel error:', err.message);
        });

        console.log('RabbitMQ connected successfully');
        return channel;
    } catch (error) {
        console.error('Failed to connect to RabbitMQ:', error.message);
        setTimeout(connect, retryInterval);
        throw error;
    } finally {
        isConnecting = false;
    }
};

// Always returns a valid channel (waits if necessary)
const getChannel = async () => {
    if (!channel) {
        await connect();
    }
    return channel;
};

// Graceful shutdown
const close = async () => {
    try {
        if (channel) {
            await channel.close();
            console.log('RabbitMQ channel closed');
        }
        if (connection) {
            await connection.close();
            console.log('RabbitMQ connection closed');
        }
    } catch (err) {
        console.error('Error closing RabbitMQ connection/channel:', err.message);
    } finally {
        channel = null;
        connection = null;
    }
};

// Queue & Exchange Definitions
const QUEUES = {
    CSV_IMPORT: 'csv_import_queue',
    CSV_IMPORT_DLQ: 'csv_import_dlq',
    NOTIFICATION: 'notification_queue',
    EMAIL: 'email_queue',
    COURSE_ENROLLMENT: 'course_enrollment_queue',
    COURSE_ENROLLMENT_DLQ: 'course_enrollment_dlq',
    REPORT_GENERATION: 'report_generation_queue',
    REPORT_GENERATION_DLQ: 'report_generation_dlq',
};

const EXCHANGES = {
    CSV_IMPORT: 'csv_import_exchange',
    NOTIFICATION: 'notification_exchange',
    EMAIL: 'email_exchange',
    COURSE_ENROLLMENT: 'course_enrollment_exchange',
    REPORT_GENERATION: 'report_generation_exchange',
};

module.exports = {
    connect,
    getChannel,
    close,
    QUEUES,
    EXCHANGES,
};



// const connectionUrl = process.env.RABBITMQ_URL || 'amqp://127.0.0.1:5672';
