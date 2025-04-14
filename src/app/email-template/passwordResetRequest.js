function resetPasswordRequest(user, token) {
    return `
   <html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset Request</title>
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
                <img src="https://squadra-media.s3.ap-south-1.amazonaws.com/Frame+1000003213.png" alt="Seaverse Logo">
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
                                        Password Reset Request
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        Hello <strong>${user.firstName}</strong> 👋
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 0 0 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        We received a request to reset your password. If you made this request, please click the link below to reset your password:
                                    </td>
                                </tr>
                               
                                <tr>
                                    <td>
                                        <a href="${process.env.APP_URL}/resetpassword?token=${token}" style="text-decoration: none;">
                                            <table border="0" cellpadding="0" cellspacing="0">
                                                <tr>
                                                    <td align="center" bgcolor="#1E3A76" style="border-radius: 6px;">
                                                        <a href="${process.env.APP_URL}/resetpassword?token=${token}" target="_blank" style="font-family: 'Inter', sans-serif; font-size: 16px; font-weight: 500; line-height: 24px; color: #FFFFFF; text-decoration: none; display: inline-block; padding: 12px 24px; border-radius: 6px;">Reset Password</a>
                                                    </td>
                                                </tr>
                                            </table>
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
        <tr>
            <td style="padding: 24px 0; text-align: center; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #202B3C;">
                Sent by Seaverse - Training for Advanced Navigation Techniques
            </td>
        </tr>
    </table>
</body>
</html>    
    `;
}

function resetPasswordRequestforAdmin(user, token) {
    return `
    <html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset Request</title>
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
                <img src="https://squadra-media.s3.ap-south-1.amazonaws.com/Frame+1000003213.png" alt="Seaverse Logo">
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
                                        Password Reset Request
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        Hello <strong>${user.firstName}</strong> 👋
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 0 0 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        We received a request to reset your password. If you made this request, please click the link below to reset your password:
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 0 0 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        <p>Best Regards,</p>
                                        <p></p>
                                    </td>
                                </tr>
                                <tr>
                                    <td>
                                        <a href="${process.env.APP_URL}/resetpassword?token=${token}" style="text-decoration: none;">
                                            <table border="0" cellpadding="0" cellspacing="0">
                                                <tr>
                                                    <td align="center" bgcolor="#1E3A76" style="border-radius: 6px;">
                                                        <a href="${process.env.APP_URL}/resetpassword?token=${token}" target="_blank" style="font-family: 'Inter', sans-serif; font-size: 16px; font-weight: 500; line-height: 24px; color: #FFFFFF; text-decoration: none; display: inline-block; padding: 12px 24px; border-radius: 6px;">Reset Password</a>
                                                    </td>
                                                </tr>
                                            </table>
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
        <tr>
            <td style="padding: 24px 0; text-align: center; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #202B3C;">
                Sent by Seaverse - Training for Advanced Navigation Techniques
            </td>
        </tr>
    </table>
</body>
</html>    `;
}
module.exports = { resetPasswordRequest, resetPasswordRequestforAdmin };
