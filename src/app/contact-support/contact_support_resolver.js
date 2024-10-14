const { sendContactSupportEmail } = require("./contact_support_helper");
const  ContactSupportUser  = require("./contact_support_model");
module.exports.mutations = {
    contactSupport: async ({input}) => {
         const { email, subject, message } = input;
        
        const emailResponse = await sendContactSupportEmail({ 
            receiverEmail: email, 
            subject, 
            message
        });
        console.log(emailResponse);
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
    },
}