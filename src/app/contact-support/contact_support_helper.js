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


const sendContactSupportEmail = async ({ receiverEmail, subject, message }) => {
    if (!receiverEmail?.trim()?.length || !subject?.trim()?.length || !message?.trim()?.length) {
        return {
            status: "error",
            message: "Invalid input parameters",
        };
    }
    
    if (subject.length > 500) {
        return {
            status: "error",
            message: "Subject cannot be more than 500 characters",
        };
    }
    
    if (message.length > 200) {
        return {
            status: "error",
            message: "Message cannot be more than 200 characters",
        };
    }

    try {
        const mailOptions = {
            from: `"${process.env.SUBSCRIBER_NAME}" <${process.env.EMAIL_VERIFIED_SENDER}>`,
            to: receiverEmail,
            subject: subject,
            text: message,
            html: message,
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
};

module.exports = {
    sendContactSupportEmail,
};
