// const amqp = require('amqplib/callback_api');
const amqp = require('amqplib');
require('dotenv').config();
let connection = null;
let channel = null;
const {
    RABBITMQ_PROTOCOL,
    RABBITMQ_USER,
    RABBITMQ_PASSWORD,
    RABBITMQ_HOST,
    RABBITMQ_PORT,
} = process.env;

const connectionUrl = `${RABBITMQ_PROTOCOL}://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@${RABBITMQ_HOST}:${RABBITMQ_PORT}`;
// const connectionUrl = `amqps://seaverse:seaverse-lms@b-3aa1cd35-a840-4b89-9566-5af7f4ccd108.mq.ap-south-1.on.aws:5671`
// const connectionUrl = process.env.RABBITMQ_URL || 'amqp://127.0.0.1:5672';
const retryInterval = 5000;

const connect = async () => {
    try {
        connection = await amqp.connect(connectionUrl);
        channel = await connection.createChannel();
        
        // Handle connection events
        connection.on('error', (err) => {
            console.error('RabbitMQ connection error:', err);
            reconnect();
        });
        
        connection.on('close', () => {
            console.log('RabbitMQ connection closed');
            reconnect();
        });
        
        console.log('RabbitMQ connected successfully');
        return channel;
    } catch (error) {
        console.error('Failed to connect to RabbitMQ:', error);
        throw error;
    }
};

const reconnect = () => {
    console.log('Attempting to reconnect to RabbitMQ...');
    setTimeout(() => {
        connect();
    }, retryInterval);
};

const getChannel = async () => {
    if (!channel) {
        await connect();
    }
    return channel;
};

const close = async () => {
    if (channel) await channel.close();
    if (connection) await connection.close();
};

const QUEUES = {
    CSV_IMPORT: 'csv_import_queue',
    CSV_IMPORT_DLQ: 'csv_import_dlq', // Dead Letter Queue
    NOTIFICATION: 'notification_queue',
    EMAIL: 'email_queue',
    COURSE_ENROLLMENT: 'course_enrollment_queue',
    COURSE_ENROLLMENT_DLQ: 'course_enrollment_dlq',
    REPORT_GENERATION: 'report_generation_queue',
    REPORT_GENERATION_DLQ: 'report_generation_dlq'
};

const EXCHANGES = {
    CSV_IMPORT: 'csv_import_exchange',
    NOTIFICATION: 'notification_exchange',
    EMAIL: 'email_exchange',
    COURSE_ENROLLMENT: 'course_enrollment_exchange',
    REPORT_GENERATION: 'report_generation_exchange'
};

module.exports = {
    connect,
    getChannel,
    close,
    QUEUES,
    EXCHANGES
};