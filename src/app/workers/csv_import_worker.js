require('dotenv').config({ path: '../../.env' });

const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const { connectDb, closeDb } = require('../../util/child_process_db_helper');
const { createEmployeesBackgroundTask } = require('../user/employee/employee_helper');
const { ImportJob } = require('../user/employee/import_job_model');
const EmployeeHelper = require("../user/employee/employee_helper");
const { ImportLog } = require('../user/import-log/import_log_model');
const notificationiconEnum = require("../notifications/notification_icon.json");

const QUEUE_URL = process.env.SQS_CSV_IMPORT_QUEUE_URL;
// console.log('CSV_IMPORT_QUEUE_URL:', QUEUE_URL);

const sqsClient = new SQSClient({
    region: process.env.SQS_AWS_REGION,
    credentials: {
        accessKeyId: process.env.SQS_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.SQS_AWS_SECRET_ACCESS_KEY,
    },
});

let isRunning = true;

async function pollMessages() {
    console.log('✅ CSV Import Worker is ready (SQS)');

    while (isRunning) {
        try {
            const params = {
                QueueUrl: QUEUE_URL,
                MaxNumberOfMessages: 10,
                WaitTimeSeconds: 10,
                VisibilityTimeout: 60,
            };

            const data = await sqsClient.send(new ReceiveMessageCommand(params));
            // console.log(`📬 Received ${data.Messages ? data.Messages.length : 0} messages from CSV SQS`);
            // console.log('data:', data?.Messages);

            if (data.Messages) {
                await Promise.all(
                    data.Messages.map(async (message) => {
                        console.log(`📥 CSV Import Job ${message.MessageId} received`);

                        try {
                            await connectDb();

                            const {
                                jobId,
                                users,
                                emailsArray,
                                empIdsArray,
                                subscriberId,
                                userId,
                                newFileName,
                                saveCSV,
                                context,
                            } = message.Body ? JSON.parse(message.Body) : {};

                            console.log(`🔍 Processing CSV Import Job ${message.MessageId} (${jobId})`);

                            if (!jobId) {
                                throw new Error('Missing jobId in message payload');
                            }

                            await createEmployeesBackgroundTask(
                                users,
                                emailsArray,
                                empIdsArray,
                                subscriberId,
                                userId,
                                newFileName,
                                saveCSV,
                                jobId,
                                context
                            );

                            const fetchJob = await ImportJob.findOne({ jobId: jobId });
                            const insertedCount = fetchJob?.processedBatches?.insertedCount || 0;
                            const updatedCount = fetchJob?.processedBatches?.updatedCount || 0;
                            const totalRecords = fetchJob?.totalRecords || 0;
                            const progressCompleted = fetchJob?.progressCompleted;

                            if ((insertedCount + updatedCount === totalRecords) && progressCompleted) {

                                if (insertedCount > 0 && updatedCount === 0) {

                                    await EmployeeHelper.sendNotificationOnBULK({
                                        subscriber: subscriberId,
                                        action: "Bulk Import Success",
                                        createdBy: userId,
                                        uploadedBy: userId,
                                        isError: false,
                                        description: `${insertedUsers?.length ?? 0} user${insertedUsers.length === 1 ? '' : 's'} have been added successfully`,
                                        notificationType: 'BULK_IMPORT_SUCCESS',
                                        status: "SUCCESS",
                                        icon: notificationiconEnum.SUCCESS,
                                        creatorId: userId,
                                    })

                                    const createImportLog = await ImportLog.create({
                                        subscriber: subscriberId,
                                        usersCount: insertedCount,
                                        uploadedBy: userId,
                                        fileName: newFileName,
                                        filePath: { url: saveCSV },
                                        importStatus: "SUCCESS",
                                        description: `Successfully created ${insertedUsers.length} user(s)`
                                    })
                                    if (!createImportLog) throw CustomError(ErrorName.FAILED, 'Failed to create import log');

                                }

                                if ((updatedCount > 0) && insertedCount === 0) {

                                    await EmployeeHelper.sendNotificationOnBULK({
                                        subscriber: subscriberId,
                                        action: "Bulk Import Success",
                                        createdBy: userId,
                                        uploadedBy: userId,
                                        isError: false,
                                        description: `${updatedCount ?? 0} user${updatedCount === 1 ? '' : 's'} have been updated successfully`,
                                        // description: `Successfully created ${insertedUsers.length} user(s) and updated ${updatedUsersByEmail.length + updatedUsersById.length} user(s)`,
                                        notificationType: 'BULK_IMPORT_SUCCESS',
                                        status: "SUCCESS",
                                        icon: notificationiconEnum.SUCCESS,
                                        creatorId: userId,
                                    })

                                    const createImportLog = await ImportLog.create({
                                        subscriber: subscriberId,
                                        usersCount: 0,
                                        uploadedBy: userId,
                                        fileName: newFileName,
                                        filePath: { url: saveCSV },
                                        importStatus: "SUCCESS",
                                        description: `Successfully updated ${updatedCount ?? 0} user(s)`
                                    })
                                    if (!createImportLog) throw CustomError(ErrorName.FAILED, 'Failed to create import log');

                                }

                                if ((insertedCount > 0) && (updatedCount > 0)) {

                                    await EmployeeHelper.sendNotificationOnBULK({
                                        subscriber: subscriberId,
                                        action: "Bulk Import Success",
                                        createdBy: userId,
                                        uploadedBy: userId,
                                        isError: false,
                                        description: `Successfully created ${insertedCount} user(s) and updated ${updatedCount} user(s)`,
                                        notificationType: 'BULK_IMPORT_SUCCESS',
                                        status: "SUCCESS",
                                        icon: notificationiconEnum.SUCCESS,
                                        creatorId: userId,
                                    })

                                    const createImportLog = await ImportLog.create({
                                        subscriber: subscriberId,
                                        usersCount: `${insertedCount}`,
                                        uploadedBy: userId,
                                        fileName: newFileName,
                                        filePath: { url: saveCSV },
                                        importStatus: "SUCCESS",
                                        description: `Successfully created ${insertedCount} user(s) and updated ${updatedCount} user(s)`
                                    })

                                    if (!createImportLog) throw CustomError(ErrorName.FAILED, 'Failed to create import log');

                                }

                            }

                            console.log(`✅ CSV Import Job ${message.MessageId} (${jobId}) processed successfully`);

                            await sqsClient.send(
                                new DeleteMessageCommand({
                                    QueueUrl: QUEUE_URL,
                                    ReceiptHandle: message.ReceiptHandle,
                                })
                            );
                            console.log(`🗑️ Deleted CSV Import Job ${message.MessageId}`);
                        } catch (err) {
                            console.error(`❌ CSV Import Job ${message.MessageId} failed:`, err);
                        } finally {
                            // await closeDb();
                        }
                    })
                );
            }
        } catch (err) {
            console.error('💥 Error polling SQS:', err);
        }
    }

    console.log('🛑 CSV Import Worker stopped polling');
}

// Start polling
pollMessages();

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Shutting down CSV Import Worker (SIGTERM)');
    isRunning = false;
});

process.on('SIGINT', () => {
    console.log('🛑 Shutting down CSV Import Worker (SIGINT)');
    isRunning = false;
});
