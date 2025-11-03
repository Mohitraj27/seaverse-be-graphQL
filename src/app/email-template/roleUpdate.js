const { decrypt } = require("../../util/encryption_helper");

function roleUpdateNotifyLearner(user) {
    return `
   <!DOCTYPE html>
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
         <tr>
            <td align="center" style="padding: 40px 48px;" class="logo">
                <img src="https://squadra-media.s3.ap-south-1.amazonaws.com/9-01.png" 
                    alt="Company Logo"  width="200" style="display: block; border: 0; outline: none; text-decoration: none; height: auto; max-width: 200px;">
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
                                        Your Role Has Been Updated
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        Hello <strong>${decrypt(user[0].firstName)}</strong> 👋
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 0 0 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        Your role within the system has been updated to Admin. This change may affect the features and permissions available to you.
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 0 0 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        <p>Thanks</p>
                                        <p></p>
                                        <p>Seaverse Team</p>
                                    </td>
                                </tr>
                                <tr>
                                    <td>
                                        <a href="${process.env.APP_URL}/login" style="text-decoration: none;">
                                            <table border="0" cellpadding="0" cellspacing="0">
                                                <tr>
                                                    <td align="center" bgcolor="#1E3A76" style="border-radius: 6px;">
                                                        <a href="${process.env.APP_URL}/login" target="_blank" style="font-family: 'Inter', sans-serif; font-size: 16px; font-weight: 500; line-height: 24px; color: #FFFFFF; text-decoration: none; display: inline-block; padding: 12px 24px; border-radius: 6px;">Log In</a>
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
                Sent by Seaverse - Training for all courses.
            </td>
        </tr>
    </table>
</body>
</html>

    `;
}

function roleUpdateNotifyAdmin(user) {
    const updatedUserNames = user.usersUpdated
        .map((u) => u.user)
        .join(', ');
    return `
    <html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>User Role Updated</title>
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
        <tr>
            <td align="center" style="padding: 40px 48px;" class="logo">
                <img src="https://squadra-media.s3.ap-south-1.amazonaws.com/9-01.png" 
                    alt="Company Logo"  width="200" style="display: block; border: 0; outline: none; text-decoration: none; height: auto; max-width: 200px;">
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
                                        User Role Updated
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
                                        The role for  ${updatedUserNames} has been successfully updated to Admin.
                                        If you need further assistance, please contact support or adjust the role in the
                                        system.
                                    </td>
                                </tr>
                                <tr>
                                    <td
                                        style="padding: 0 0 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; color: #384860;">
                                        <p>Thanks,</p>
                                        <p></p>
                                        <p>Seaverse Team</p>
                                    </td>
                                </tr>
                                <tr>
                                    <td>
                                        <a href="${process.env.APP_URL}/employee-management" style="text-decoration: none;">
                                            <table border="0" cellpadding="0" cellspacing="0">
                                                <tr>
                                                    <td align="center" bgcolor="#1E3A76" style="border-radius: 6px;">
                                                        <a href="${process.env.APP_URL}/employee-management" target="_blank"
                                                            style="font-family: 'Inter', sans-serif; font-size: 16px; font-weight: 500; line-height: 24px; color: #FFFFFF; text-decoration: none; display: inline-block; padding: 12px 24px; border-radius: 6px;">View User Details</a>
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

module.exports = { roleUpdateNotifyLearner, roleUpdateNotifyAdmin };