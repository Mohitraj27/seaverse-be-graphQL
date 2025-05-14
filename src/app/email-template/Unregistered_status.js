function Unregistered_Status(user) {
    return `
  <html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Unregister Employee</title>
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
                <img src="https://squadra-media.s3.ap-south-1.amazonaws.com/9-01.png" alt="Company Logo" style="max-width: 200px; height: auto;">
            </td>
        </tr>
        <tr>
            <td>
                <table style="background-color: #FFFFFF; border-radius: 8px; margin: 0 auto; width: 640px;" border="0"
                    cellpadding="0" cellspacing="0" class="content">
                    <tr>
                        <td style="padding: 40px 48px;" class="content-inner">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td
                                        style="font-family: 'Inter', sans-serif; font-weight: 700; font-size: 24px; line-height: 36px; color: #121A26;">
                                        Unregistered Status
                                    </td>
                                </tr>
                                <tr>
                                    <td
                                        style="padding: 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        Hello <strong>${user.firstName}</strong> 👋
                                    </td>
                                </tr>
                                <tr>
                                    <td
                                        style="padding: 0 0 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        Your status is currently marked as Unregistered. This limits your access to features like the dashboard and courses.
                                    </td>
                                </tr>
                                <tr>
                                    <td
                                        style="padding: 0 0 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        Please contact your administrator to update your status and gain full access to the platform.
                                    </td>
                                </tr>
                                <tr>
                                    <td
                                        style="padding: 0 0 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; color: #384860;">
                                        <p>Thanks</p>
                                        <p></p>
                                        <p>Seaverse Team</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
        <tr>
            <td
                style="padding: 24px 0; text-align: center; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #202B3C;">
                Sent by Seaverse - Training for all courses.
            </td>
        </tr>
    </table>
</body>
</html>
    `;
}

module.exports = { Unregistered_Status };