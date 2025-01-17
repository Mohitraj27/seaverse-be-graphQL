const { sendContactSupportEmail } = require("./contact_support_helper");
const  ContactSupportUser  = require("./contact_support_model");
module.exports.mutations = {
    contactSupport: async ({input}) => {
        const { email, subject, message } = input;
        try{
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
                message: "Message sent successfully.We’ll get back to you shortly.",
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