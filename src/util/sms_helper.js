const { ApiHelper } = require("../tools");

module.exports = {
    sendSms: async ({ phone, message }) => {
        if (phone && message) {
            const response = await ApiHelper.get(
                `https://www.kwtsms.com/API/send/?username=${process.env.SMS_USERNAME}&password=${process.env.SMS_PASSWORD}&sender=${process.env.SMS_SENDER_ID}&mobile=${phone}&lang=2&message=requested+otp+is+${message}`
            ).catch(error => {
                console.error(
                    "sms_helper.sendSms:error:",
                    error.response && error.response.data ? error.response.data : error.message
                );
            });

            return response && response.status === 200;
        }
    },
};
