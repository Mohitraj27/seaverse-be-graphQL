const nodemailer = require('nodemailer');
const NotificationType = require('../../notifications/notification_type.json');
const NotificationHelper = require('../../notifications/notification_helper');
const { User } = require("../user_model");
const { CustomError, ErrorName } = require('../../../util/error_helper');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_ENDPOINT,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT == 465,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
    },
    tls: {
        rejectUnauthorized: false
    }
});

const sendNodeEmail = async ({ receiverEmail, subject, htmlContent }) => {

    if (
        receiverEmail?.trim()?.length &&
        subject?.trim()?.length &&
        htmlContent?.trim()?.length
    ) {
        try {
            const mailOptions = {
                from: `"${process.env.SUBSCRIBER_NAME}" <${process.env.EMAIL_VERIFIED_SENDER}>`,
                to: receiverEmail,
                subject: subject,
                text: htmlContent,
                html: htmlContent
            };

            const response = await transporter.sendMail(mailOptions);

            return {
                status: "success",
                messageId: response.messageId,
                message: "Email sent successfully",
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

const sendNodeEmailBulk = async ({ receiverEmails, subject }) => {

    if (
        Array.isArray(receiverEmails) &&
        receiverEmails.length > 0 &&
        subject?.trim()?.length
    ) {
        try {
            const emailPromises = receiverEmails.map((receiverEmail) => {
                if (receiverEmail.email?.trim()?.length) {
                    const mailOptions = {
                        from: `"${process.env.SUBSCRIBER_NAME}" <${process.env.EMAIL_VERIFIED_SENDER}>`,
                        to: receiverEmail.email,
                        subject: subject,
                        text: `
    <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to SeaVerse</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #F4F4F4;
        }
        .email-container {
            max-width: 600px;
            margin: 20px auto;
            background: #FFFFFF;
            border: 1px solid #ddd;
            border-radius: 8px;
            overflow: hidden;
        }
        .header {
            background-color: #0056B3;
            color: #FFFFFF;
            text-align: center;
            padding: 20px;
        }
        .header h1 {
            margin: 0;
            font-size: 24px;
        }
        .content {
            padding: 20px;
        }
        .content p {
            margin: 0 0 15px;
        }
        .cta-button {
            display: inline-block;
            background-color: #0056B3;
            color: #FFFFFF;
            text-decoration: none;
            padding: 10px 20px;
            border-radius: 5px;
            font-size: 16px;
            margin: 20px 0;
            display: block;
            text-align: center;
        }
        .footer {
            text-align: center;
            padding: 10px;
            background: #F4F4F4;
            font-size: 12px;
            color: #555;
        }
        ul {
            padding-left: 20px;
        }
        ul li {
            margin-bottom: 10px;
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <h1>Welcome to SeaVerse!</h1>
        </div>
        <div class="content">
            <p>Dear <strong>${receiverEmail.userName}</strong>,</p>
            <p>Welcome aboard <strong>SeaVerse</strong>! We're thrilled to have you join us on this journey of learning and growth.</p>
            <p>To get started, log in with these details:</p>
            <p><strong>Email:</strong> ${receiverEmail.email}</p>
            <p><strong>Temporary Password:</strong> ${receiverEmail.password}</p>
            <p><em>Please set a new password upon your first login for security.</em></p>
            <a href="https://web.squadramedia.site/login" target="_blank" class="cta-button">Web Access</a>
            <p>Or, if you prefer learning on the go, download the SeaVerse app:</p>
            <ul>
                <li>
                    // <a href="https://play.google.com/store/games?hl=en&pli=1" target="_blank">
                    //     <img src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg" alt="Google Play Store" class="store-icon">
                    // </a>
                    <a href="https://play.google.com/store/games?hl=en&pli=1">
                        <img src="cid:playstore" alt="Google Play Store" style="width: 120px; height: auto;">
                    </a>
                </li>
                <li>
                    // <a href="https://www.apple.com/in/app-store/" target="_blank">
                    //     <img src="https://upload.wikimedia.org/wikipedia/commons/0/0d/Download_on_the_App_Store_Badge.svg" alt="App Store" class="store-icon">
                    // </a>
                    <a href="https://www.apple.com/in/app-store/">
                        <img src="cid:appstore" alt="App Store" style="width: 120px; height: auto;">
                    </a>
                </li>
            </ul>
            <p>Explore courses, track your progress, and unlock new skills today! For any assistance, feel free to reach out to our support team at <strong>[support email/phone]</strong>.</p>
        </div>
        <div class="footer">
            <p>Happy sailing and learning,</p>
            <p>The SeaVerse Team</p>
        </div>
    </div>
</body>
</html>
`,
                        html: `
    <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to SeaVerse</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #F4F4F4;
        }
        .email-container {
            max-width: 600px;
            margin: 20px auto;
            background: #FFFFFF;
            border: 1px solid #ddd;
            border-radius: 8px;
            overflow: hidden;
        }
        .header {
            background-color: #0056B3;
            color: #FFFFFF;
            text-align: center;
            padding: 20px;
        }
        .header h1 {
            margin: 0;
            font-size: 24px;
        }
        .content {
            padding: 20px;
        }
        .content p {
            margin: 0 0 15px;
        }
        .cta-button {
            display: inline-block;
            background-color: #0056B3;
            color: #FFFFFF;
            text-decoration: none;
            padding: 10px 20px;
            border-radius: 5px;
            font-size: 16px;
            margin: 20px 0;
            display: block;
            text-align: center;
        }
        .footer {
            text-align: center;
            padding: 10px;
            background: #F4F4F4;
            font-size: 12px;
            color: #555;
        }
        ul {
            padding-left: 20px;
        }
        ul li {
            margin-bottom: 10px;
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <h1>Welcome to SeaVerse!</h1>
        </div>
        <div class="content">
            <p>Dear <strong>${receiverEmail.userName}</strong>,</p>
            <p>Welcome aboard <strong>SeaVerse</strong>! We're thrilled to have you join us on this journey of learning and growth.</p>
            <p>To get started, log in with these details:</p>
            <p><strong>Email:</strong> ${receiverEmail.email}</p>
            <p><strong>Temporary Password:</strong> ${receiverEmail.password}</p>
            <p><em>Please set a new password upon your first login for security.</em></p>
            <a href="https://web.squadramedia.site/login" target="_blank" class="cta-button">Web Access</a>
            <p>Or, if you prefer learning on the go, download the SeaVerse app:</p>
            <ul>
                <li>
                    // <a href="https://play.google.com/store/games?hl=en&pli=1" target="_blank">
                    //     <img src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg" alt="Google Play Store" class="store-icon">
                    // </a>
                    <a href="https://play.google.com/store/games?hl=en&pli=1">
                        <img src="cid:playstore" alt="Google Play Store" style="width: 120px; height: auto;">
                    </a>
                </li>
                <li>
                    // <a href="https://www.apple.com/in/app-store/" target="_blank">
                    //     <img src="https://upload.wikimedia.org/wikipedia/commons/0/0d/Download_on_the_App_Store_Badge.svg" alt="App Store" class="store-icon">
                    // </a>
                    <a href="https://www.apple.com/in/app-store/">
                        <img src="cid:appstore" alt="App Store" style="width: 120px; height: auto;">
                    </a>
                </li>
            </ul>
            <p>Explore courses, track your progress, and unlock new skills today! For any assistance, feel free to reach out to our support team at <strong>[support email/phone]</strong>.</p>
        </div>
        <div class="footer">
            <p>Happy sailing and learning,</p>
            <p>The SeaVerse Team</p>
        </div>
    </div>
</body>
</html>
`
                    };

                    return transporter.sendMail(mailOptions);
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

        const mailRes = await sendNodeEmail({ receiverEmail: email, subject: "Reset Password", htmlContent });

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
    sendNodeEmail,
    sendNodeEmailBulk,
    generateRandomString,
    mailSenderHelper,
    sendNotificationOnDELETEREQUEST,
    sendNotificationOn
};