
const  ContactSupportUser  = require("./contact_support_model");
const AWSHelper = require("../../util/aws_helper");
const {User} = require("../../app/user/user_model");
const { sendUserSupportAcknowledgment, sendAdminSupportNotification } = require('../../app/email-template/contactSupport');
const { encrypt } = require("../../util/encryption_helper");
module.exports.mutations = {
    contactSupport: async ({ input }) => {
        try {
            const { email, subject, message, consents } = input;
            const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
            // const useremail = await User.findOne({ email: email });
            // if (!useremail) {
            //     return {
            //         status: "error",
            //         message: "User not found",
            //     };
            // }
            if (!emailRegex.test(email)) {
                throw new Error(`Invalid email format: ${email}`);
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
            if (!consents || !Array.isArray(consents) || consents.length === 0) {
                return {
                    success: false,
                    message: "Consents are required",
                };
            }
            const invalidConsent = consents.find(consent => !consent.message || !consent.title || consent.status === undefined);
            if (invalidConsent) {
                return {
                    success: false,
                    message: "Each consent must have message, title and status fields",
                };
            }
            const processedConsents = consents.map(consent => ({
                ...consent,
                timestamp: new Date().toISOString()
            }));
            await AWSHelper.sendEmail({
                receiverEmail: process.env.SUPER_ADMIN_EMAIL,
                subject: `New Support Request`,
                htmlContent: sendAdminSupportNotification(email, subject, message),
            });
            await AWSHelper.sendEmail({
                receiverEmail: email,
                subject: "We've Received Your Support Request",
                htmlContent: sendUserSupportAcknowledgment(email, subject, message),
            });
            const contactSupportData = new ContactSupportUser({
                email: encrypt(email),
                subject,
                message,
                consents: processedConsents
            });

            await contactSupportData.save();  
            return {
                success: true,
                message: "Message sent successfully.We’ll get back to you shortly.",
                consents: processedConsents
            };
        } catch (error) {
            return {
                success: false,
                message: error.message,
            };
        }
    },


    sendTestMail: async ({ input }) => {
        const { email, subject, message } = input;
        try {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

            if (!emailRegex.test(email)) {
                throw new Error(`Invalid email format: ${email}`);
            }
            const emailResponse = await sendContactSupportEmail({
                receiverEmail: email,
                subject,
                message
            });
            if (emailResponse.status === "success") {
                const contactSupportData = new ContactSupportUser({
                    email,
                    subject,
                    message
                });

                await contactSupportData.save();
                return {
                    success: true,
                    message: "Support email sent successfully",
                };
            } else {
                return {
                    success: false,
                    message: `Failed to send email: ${emailResponse.message}`,
                };
            }
        } catch (error) {
            return {
                success: false,
                message: error.message,
            };
        }
    },
}