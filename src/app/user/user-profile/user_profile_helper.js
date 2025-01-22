
const NotificationType = require('../../notifications/notification_type.json');
const NotificationHelper = require('../../notifications/notification_helper');
const { User } = require("../user_model");
const { CustomError, ErrorName } = require('../../../util/error_helper');
const aws_helper = require('../../../util/aws_helper');

const sendNodeEmailBulk = async ({ receiverEmails, subject }) => {

    if (
        Array.isArray(receiverEmails) &&
        receiverEmails.length > 0 &&
        subject?.trim()?.length
    ) {
        try {
            const emailPromises = receiverEmails.map(async (receiverEmail) => {
                if (receiverEmail.email?.trim()?.length) {
                    const generatePassword = generateRandomString(10);
                    const emailContentforNewEmployee = createNewEmployeeEmailTemplate({
                        firstName: receiverEmail.userName,
                        email: receiverEmail.email,
                        templategeneratePassword: generatePassword,
                    });
                    const mailOptions = {
                        receiverEmail: receiverEmail.email,
                        subject: subject,
                        htmlContent: emailContentforNewEmployee,
                    };
                    return await aws_helper.sendEmail(mailOptions);
                } else {
                    return Promise.reject(new Error("Invalid email address"));
                }
            });

            const results = await Promise.allSettled(emailPromises);

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
    } else {
        return {
            status: "error",
            message: "Invalid input parameters",
        };
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
        const { firstName, lastName, civilIdOrPassport,email } = notificationData.user;
        const { reasonForDelete } = notificationData;
        const adminUsers = await User.find({ role: "ADMIN" });
        const notification = {
            subscriber: notificationData.subscriber,
            title: [{ lang: "en", value: `DELETE_REQUEST ${notificationData.action}` }],
            notificationType: NotificationType.DELETE_APPROVAL_REQUEST,
            notifyAdmin: true,
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
                        firstName: notificationData.createdBy.firstName,
                        lastName: notificationData.createdBy.lastName,
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
                    value: `${notificationData.createdBy.firstName} ${notificationData.createdBy.lastName}'s account has been deleted. FullName: ${firstName} ${lastName} Employee ID: ${civilIdOrPassport} Email: ${email}. Reason: ${reasonForDelete}`,
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
    const { message } = notificationData;
    const notificationMessage = {
        subscriber: notificationData.subscriber,
        title: [{ lang: "en", value: `DELETE_REQUEST ${notificationData.action.toUpperCase()}` }],
        notificationType: NotificationType[`DELETE_${notificationData.action.toUpperCase()}`],
        notifyAdmin: false,
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
    sendNotificationOn
};