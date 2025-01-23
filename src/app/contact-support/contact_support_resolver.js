
const  ContactSupportUser  = require("./contact_support_model");
const AWSHelper = require("../../util/aws_helper");
const {User} = require("../../app/user/user_model");
module.exports.mutations = {
    contactSupport: async ({ input }) => {
        try {
            const { email, subject, message } = input;
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
            await AWSHelper.sendEmail({
                receiverEmail: process.env.SUPER_ADMIN_EMAIL,
                subject,
                htmlContent: message,
            });
            await AWSHelper.sendEmail({
                receiverEmail: email,
                subject,
                htmlContent: message,
            });
            const contactSupportData = new ContactSupportUser({
                email,
                subject,
                message
            });

            await contactSupportData.save();  
            return {
                success: true,
                message: "Message sent successfully.We’ll get back to you shortly.",
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