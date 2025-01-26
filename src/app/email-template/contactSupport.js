function sendUserSupportAcknowledgment(email, subject, message) {
    return `
      <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Support Request Acknowledgment</title>
    <style>
        @media screen and (max-width: 600px) {
            .container {
                padding: 20px 10px !important;
            }
            .logo {
                padding: 20px 24px !important;
            }
            .content {
                width: 100% !important;
                border-radius: 0 !important;
            }
            .content-inner {
                padding: 20px 24px !important;
            }
        }
    </style>
</head>
<body style="font-family: Arial, sans-serif; background-color: #F7FBFF; margin: 0; padding: 0; width: 100%;">
    <table style="width: 100%; padding: 40px 20px;" align="center" border="0" cellpadding="0" cellspacing="0">
        <tr style="display: flex; justify-content: center; align-items: center; margin: auto;">
            <td style="padding: 40px 48px; text-align: center; margin: auto;" class="logo">
                <img src="https://squadra-media.s3.ap-south-1.amazonaws.com/Frame+1000003213.png" alt="Your LMS Logo">
            </td>
        </tr>
        <tr>
            <td>
                <table style="background-color: #FFFFFF; border-radius: 8px; margin: 0 auto; width: 640px;" border="0" cellpadding="0" cellspacing="0" class="content">
                    <tr>
                        <td style="padding: 40px 48px;" class="content-inner">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td style="font-family: 'Inter', sans-serif; font-weight: 700; font-size: 24px; line-height: 36px; color: #121A26;">
                                        We've Received Your Support Request
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        Hello 👋
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 0 0 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        Thank you for reaching out to our support team. We have received your query with the following details:
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 0 0 16px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        <strong>Email :</strong> ${email}
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 0 0 16px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        <strong>Subject:</strong> ${subject}
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 0 0 16px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        <strong>Description:</strong> ${message}
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 0 0 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        Our team is already looking into your request, and we will get back to you within 24 to 48 working hours. In the meantime, if you have any additional information to share, feel free to reply to this email.
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 0 0 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        <p>Thank you for your patience and understanding.</p>
                                        <p>Best regards,</p>
                                        <p>Your Seaverse Support Team</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
}
function sendAdminSupportNotification(email, subject, message) {
    return `
      <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Support Request</title>
    <style>
        @media screen and (max-width: 600px) {
            .container {
                padding: 20px 10px !important;
            }
            .logo {
                padding: 20px 24px !important;
            }
            .content {
                width: 100% !important;
                border-radius: 0 !important;
            }
            .content-inner {
                padding: 20px 24px !important;
            }
        }
    </style>
</head>
<body style="font-family: Arial, sans-serif; background-color: #F7FBFF; margin: 0; padding: 0; width: 100%;">
    <table style="width: 100%; padding: 40px 20px;" align="center" border="0" cellpadding="0" cellspacing="0">
        <tr style="display: flex; justify-content: center; align-items: center; margin: auto;">
            <td style="padding: 40px 48px; text-align: center; margin: auto;" class="logo">
                <img src="https://squadra-media.s3.ap-south-1.amazonaws.com/Frame+1000003213.png" alt="Your LMS Logo">
            </td>
        </tr>
        <tr>
            <td>
                <table style="background-color: #FFFFFF; border-radius: 8px; margin: 0 auto; width: 640px;" border="0" cellpadding="0" cellspacing="0" class="content">
                    <tr>
                        <td style="padding: 40px 48px;" class="content-inner">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td style="font-family: 'Inter', sans-serif; font-weight: 700; font-size: 24px; line-height: 36px; color: #121A26;">
                                        New Support Request
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        Hello 👋,
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 0 0 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        A new support request has been submitted. Below are the details:
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 0 0 16px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        <strong>User Email Address:</strong> ${email}
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 0 0 16px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        <strong>Subject:</strong> ${subject}
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 0 0 16px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        <strong>Description:</strong> ${message}
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 0 0 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        Please review this request and address it at the earliest convenience. Ensure a response is provided to the user within the stipulated 24 to 48 working hours.
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 0 0 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        <p>Thank you for your prompt action.</p>
                                        <p>Best regards,</p>
                                        <p>Your Seaverse Support Notification</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
}


module.exports = { sendUserSupportAcknowledgment, sendAdminSupportNotification };
