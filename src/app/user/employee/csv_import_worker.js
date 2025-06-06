const { connect, getChannel, QUEUES, EXCHANGES } = require('../../../util/rabbitmq_helper');
const { setupQueues, publishToExchange } = require('./rabbitMq_service');
const { createEmployeesBackgroundTask } = require('./employee_helper');
const { connectDb, closeDb } = require('../../../util/child_process_db_helper');
// const { connectDb } = require('../../../util/db_helper');
// ******************************************************* 
const { ImportJob } = require("./import_job_model"); // Make sure this is correctly imported
// ******************************************************* 

let consumerTag = null;

const processMessage = async (channel, message) => {
    const startTime = Date.now();
    let jobData;

    try {
        jobData = JSON.parse(message.content.toString());
        await connectDb();
        console.log(`Processing CSV import job: ${jobData.jobId}`);

        const {
            jobId,
            users,
            emailsArray,
            empIdsArray,
            subscriberId,
            userId,
            userInfo,
            newFileName,
            saveCSV,
            context
        } = jobData;

        // Update job status
        // await ImportJob.findOneAndUpdate(
        //     { jobId: jobId },
        //     {
        //         importStatus: "PROCESSING",
        //     }
        // );

        // Process the CSV import
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

        // Acknowledge message after successful processing
        await channel.ack(message);

        const processingTime = Date.now() - startTime;
        console.log(`Job ${jobId} completed in ${processingTime}ms`);

    } catch (error) {
        console.error('Error processing CSV import:', error);

        // Handle retry logic
        const retryCount = (message.properties.headers['x-retry-count'] || 0) + 1;
        const maxRetries = 3;

        if (retryCount < maxRetries) {
            console.log(`Retrying job ${jobData?.jobId}, attempt ${retryCount}`);

            // Requeue with retry count
            await channel.nack(message, false, false);

            // Publish with retry header
            await publishToExchange(
                EXCHANGES.CSV_IMPORT,
                'import',
                jobData,
                {
                    headers: {
                        'x-retry-count': retryCount,
                        'x-last-error': error.message
                    }
                }
            );
        } else {
            // Max retries reached, send to DLQ
            console.error(`Job ${jobData?.jobId} failed after ${maxRetries} attempts`);

            if (jobData?.jobId) {
                await ImportJob.findOneAndUpdate(
                    { jobId: jobData.jobId },
                    {
                        importStatus: "FAILED",
                        completedAt: new Date(),
                        description: `Failed after ${maxRetries} attempts: ${error.message}`
                    }
                );

                // Send failure notification
                await sendFailureNotification(jobData, error);
            }

            // Reject and don't requeue (will go to DLQ)
            await channel.nack(message, false, false);
        }
    }
};
const sendFailureNotification = async (jobData, error) => {
    await publishToExchange(
        EXCHANGES.NOTIFICATION,
        'notify',
        {
            type: 'BULK_IMPORT_FAILED',
            subscriberId: jobData.subscriberId,
            userId: jobData.userId,
            title: 'Bulk Import Failed',
            message: `Import job ${jobData.jobId} failed: ${error.message}`,
            icon: 'ERROR'
        }
    );
};

const startWorker = async () => {
    try {
        console.log('Reached inside startWorker');
        // await connectDb();
        await setupQueues();
        const channel = await getChannel();

        console.log('CSV Import Worker started, waiting for messages...');

        const result = await channel.consume(
            QUEUES.CSV_IMPORT,
            async (message) => {
                if (message) {
                    await processMessage(channel, message);
                }
            },
            { noAck: false }
        );

        consumerTag = result.consumerTag;
    } catch (error) {
        console.error('Error starting CSV Import Worker:', error);
        process.exit(1);
    }
};

const stopWorker = async () => {
    console.log('Stopping CSV Import Worker...');
    const channel = await getChannel();

    if (consumerTag) {
        await channel.cancel(consumerTag);
    }

    await closeDb();
    console.log('CSV Import Worker stopped');
};

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    await stopWorker();
    process.exit(0);
});

process.on('SIGINT', async () => {
    await stopWorker();
    process.exit(0);
});

// Start the worker
startWorker();

function createNotificationWorker() {
    let channel = null;
    let consumerTag = null;

    const start = async () => {
        channel = await rabbitmqConnection.getChannel();

        const { consumerTag: tag } = await channel.consume(QUEUES.NOTIFICATION, async (message) => {
            if (message) {
                try {
                    const data = JSON.parse(message.content.toString());

                    if (data.createdAt) data.createdAt = new Date(data.createdAt).getTime().toString();
                    if (data.updatedAt) data.updatedAt = new Date(data.updatedAt).getTime().toString();

                    await PubSubHelper.publish(NotificationEvent.ON_NOTIFICATION, { onNotification: data });
                    channel.ack(message);
                } catch (error) {
                    console.error('Error processing notification:', error);
                    channel.nack(message, false, false);
                }
            }
        });

        consumerTag = tag;
        console.log('Notification Worker started');
    };

    const stop = async () => {
        console.log('Stopping Notification Worker...');
        if (channel && consumerTag) {
            await channel.cancel(consumerTag);
            await channel.close();
        }
        console.log('Notification Worker stopped');
    };

    return { start, stop };
}

function createEmailWorker() {
    let channel = null;
    let consumerTag = null;

    const start = async () => {
        channel = await rabbitmqConnection.getChannel();

        const { consumerTag: tag } = await channel.consume(QUEUES.EMAIL, async (message) => {
            if (message) {
                try {
                    const data = JSON.parse(message.content.toString());

                    SqliteEmailHelper.insertEmails(data.email);
                    const emails = SqliteEmailHelper.fetchEmailBatch(); // optional usage check
                    await sendNodeEmailBulk({ subject: data.subject });

                    channel.ack(message);
                } catch (error) {
                    console.error('Error processing email:', error);
                    channel.nack(message, false, true); // requeue on failure
                }
            }
        });

        consumerTag = tag;
        console.log('Email Worker started');
    };

    const stop = async () => {
        console.log('Stopping Email Worker...');
        if (channel && consumerTag) {
            await channel.cancel(consumerTag);
            await channel.close();
        }
        console.log('Email Worker stopped');
    };

    return { start, stop };
}

module.exports = { createNotificationWorker, createEmailWorker };