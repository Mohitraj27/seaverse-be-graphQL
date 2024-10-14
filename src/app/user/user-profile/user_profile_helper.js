const nodemailer = require('nodemailer');

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

function generateRandomString(length = 30) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length }, () => characters[Math.floor(Math.random() * characters.length)]).join('');
}

module.exports = {
    sendNodeEmail,
    generateRandomString
};