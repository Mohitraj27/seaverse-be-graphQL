
const NotificationType = require('../../notifications/notification_type.json');
const NotificationHelper = require('../../notifications/notification_helper');
const { User } = require("../user_model");
const { CustomError, ErrorName } = require('../../../util/error_helper');
const { sendEmailToLearner } = require('../../email-template/sendWelcomeEmail');
const AwsHelper = require("../../../util/aws_helper");
const { SqliteEmailHelper } = require('../../../util');
const { decrypt } = require('../../../util/encryption_helper');
const { updateByQueryToElasticSearch } = require('../../../util/elastic_helper');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const sendWithRetry = async (emailBatch, retryCount = 0) => {
    try {

        const emailPromises = emailBatch.map(async (receiverEmail) => {

            if (receiverEmail.email?.trim()?.length) {
                return await AwsHelper.sendEmail({ receiverEmail: receiverEmail.email, subject: "Welcome to Seaverse!", htmlContent: sendEmailToLearner(receiverEmail) });
            } else {
                return Promise.reject(new Error("Invalid email address"));
            }

        });

        return await Promise.allSettled(emailPromises);

    } catch (error) {

        if (error.message.includes("Maximum sending rate exceeded") && retryCount < 5) {
            await delay(2 ** retryCount * 1000);
            return sendWithRetry(receiverEmail, retryCount + 1);
        }
        throw error;

    }
};

const sendNodeEmailBulk = async ({ subject }) => {

    if (subject?.trim()?.length) {

        try {
            let results = [];
            while (true) {

                const emailBatch = await SqliteEmailHelper.fetchEmailBatch();

                if (emailBatch.length === 0) {
                    break;
                }

                const batchResults = await sendWithRetry(emailBatch);

                results = results.concat(batchResults);

                await delay(200);

                const emailIds = emailBatch.map(email => email.id);

                await SqliteEmailHelper.deleteEmailBatch(emailIds);

            }

            const success = results.filter(res => res.status === "fulfilled");
            const errors = results.filter(res => res.status === "rejected");

            return {
                status: "success",
                successCount: success.length,
                errorCount: errors.length,
                errors: errors.map(err => err.reason.message),
                message: `${success.length} emails sent successfully, ${errors.length} failed.`,
            };
        } catch (error) {
            return {
                status: "error",
                message: error.message,
            };
        }

    }
};

const deleteProfilePictureHelper = async (url, userId) => {
    console.log(url, userId);
    if (url?.trim()?.length && userId) {
        try {
            const existingUser = await User.findById(userId);
            if (!existingUser) {
                throw CustomError(ErrorName.NOT_FOUND, "User not found");
            }
            existingUser.avatar = null;
           const result = await AwsHelper.deleteFile(url);
            await existingUser.save();
            try {
                await updateByQueryToElasticSearch(
                "users", 
                `
                    ctx._source.avatar = params.avatar;
                `,
                {
                    term: { userId: existingUser._id.toString() }
                },
                {
                    avatar: null,
                }
                );
                } catch (error) {
                    throw CustomError(ErrorName.NOT_FOUND);
                }
            return result;

        } catch (error) {
            console.error("Error deleting profile picture:", error);
        }
    }
};
const mailSenderHelper = async (token, email, existingUser, errors) => {

    const htmlContent = `
                <!DOCTYPE html>
                <html lang="en">
                    <head>
                        <meta charset="UTF-8" />
                        <title>Reset Password</title>
                    </head>
                    <body>
                        <div style="width: 600px; margin: 0 auto; text-align: center">
    
                            <p>Please visit the link below to reset your password</p>
    
                            <a href="${process.env.APP_URL}/reset-password/${token}}" target="_blank">
                                Click Here
                            </a>
                        </div>
                    </body>
                </html>
            `;

    existingUser.resetPasswordToken = token;
    existingUser.resetPasswordExpires = Date.now() + 21600000;

    const addTokenToUser = await existingUser.save();

    if (addTokenToUser) {

        const mailRes = await aws_helper.sendEmail({ receiverEmail: email, subject: "Reset Password", htmlContent });

        if (mailRes.status === 'success') {
            return true
        } else {
            errors.push('Failed to send email');
            return false;
        }

    } else {
        errors.push('Failed to reset password');
        return false;
    }
}

function generateRandomString(length = 30) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length }, () => characters[Math.floor(Math.random() * characters.length)]).join('');
}
const sendNotificationOnDELETEREQUEST = async (notificationData) => {
    try {
        const { firstName, lastName, civilIdOrPassport, email } = notificationData.user;
        const { reasonForDelete } = notificationData;
        const adminUsers = await User.find({ role: "ADMIN" });
        const notification = {
            subscriber: notificationData.subscriber,
            title: [{ lang: "en", value: `DELETE_REQUEST ${notificationData.action}` }],
            notificationType: NotificationType.DELETE_APPROVAL_REQUEST,
            notifyAllAdmin: true,
            isNotificatonForAdmin: true,
            notifiers: adminUsers.map(admin => admin._id),
            employeeNotifiers: [],
            affected: [
                {
                    targetRef: "User",
                    target: notificationData.user._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "USER_DELETE_REQUEST_INFO",
                    infoData: {
                        firstName: decrypt(notificationData.createdBy.firstName),
                        lastName: notificationData.createdBy.lastName ? decrypt(notificationData.createdBy.lastName) : '',
                        civilIdOrPassport: civilIdOrPassport,
                        email: email
                    },
                },

            ],
            createdBy: notificationData.createdBy,
        };
        if (notification.notificationType === NotificationType.DELETE_APPROVAL_REQUEST) {
            notification.message = [
                {
                    lang: "en",
                    value: `${decrypt(notificationData.createdBy.firstName)} ${notificationData.createdBy.lastName ? decrypt(notificationData.createdBy.lastName) : ''}'s account has been deleted. FullName: ${firstName} ${lastName} Employee ID: ${civilIdOrPassport} Email: ${email}. Reason: ${reasonForDelete}`,
                },
            ];
        }
        await NotificationHelper.createNotification(notification);
    } catch (error) {
        console.error(error);
        throw new CustomError(ErrorName.FAILED);
    }
}
const sendNotificationOn = async (notificationData) => {
    const { firstName, lastName, civilIdOrPassport, email } = notificationData.user;
    notificationData.user.firstName = decrypt(firstName);
    notificationData.user.lastName = lastName ? decrypt(lastName) : '';
    notificationData.user.email = decrypt(email);
    const { message } = notificationData;
    const notificationMessage = {
        subscriber: notificationData.subscriber,
        title: [{ lang: "en", value: `DELETE_REQUEST ${notificationData.action.toUpperCase()}` }],
        notificationType: NotificationType[`DELETE_${notificationData.action.toUpperCase()}`],
        notifyAllAdmin: false,
        notifiers: [],
        employeeNotifiers: [],
        affected: [
            {
                targetRef: "User",
                target: notificationData.user._id,
            },
        ],
        additionalInfo: [
            {
                infoType: "USER_DELETE_REQUEST_INFO",
                infoData: {
                    firstName,
                    lastName,
                    civilIdOrPassport,
                    email,
                },
            },
        ],
        message: [
            {
                lang: "en",
                value: message,
            },
        ],
        createdBy: notificationData.createdBy,
    };
    await NotificationHelper.createNotification(notificationMessage);
};

module.exports = {
    sendNodeEmailBulk,
    generateRandomString,
    mailSenderHelper,
    sendNotificationOnDELETEREQUEST,
    deleteProfilePictureHelper,
    sendNotificationOn
};