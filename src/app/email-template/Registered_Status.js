function registered_status(user) {
    return `
    <html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Register Employee</title>
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
                                        You're Now Registered!
                                    </td>
                                </tr>
                                <tr>
                                    <td
                                        style="padding: 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        Dear <strong>${user.firstName}</strong> 👋
                                    </td>
                                </tr>
                                <tr>
                                    <td
                                        style="padding: 0 0 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        Welcome aboard!
                                    </td>
                                </tr>
                                <tr>
                                    <td
                                        style="padding: 0 0 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        Your SeaVerse LMS account has been successfully registered. You can now log in and start exploring your courses. 
                                    </td>
                                </tr>
                                <tr>
                                    <td
                                        style="padding: 0 0 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        If you have any questions, feel free to reach out to us at support@thesealearning.com.
                                    </td>
                                </tr>
                                <tr>
                                    <td
                                        style="padding: 0 0 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; color: #384860;">
                                        <p>Thank you,</p>
                                        <p></p>
                                        <p>SeaVerse LMS Team</p>
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
function registered_statusforAdmin({ adminfirstName, userfirstName }) {
    return `
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Vessel Status Update</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                margin: 0;
                padding: 0;
                background-color: #f9fbfc;
            }
            .container {
                max-width: 600px;
                margin: 20px auto;
                padding: 20px;
                background-color: #ffffff;
                border-radius: 8px;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
            }
            .header {
                text-align: center;
                margin-bottom: 20px;
            }
            .header img {
                width: 120px;
            }
            .content {
                text-align: left;
                margin-bottom: 20px;
            }
            .content h1 {
                font-size: 22px;
                color: #2c3e50;
                margin-bottom: 10px;
            }
            .content p {
                font-size: 16px;
                color: #555;
                margin: 5px 0;
            }
            .content strong {
                color: #2c3e50;
            }
            .button {
                display: inline-block;
                padding: 12px 24px;
                margin: 20px 0;
                font-size: 16px;
                color: #ffffff;
                background-color: #003366;
                text-decoration: none;
                border-radius: 4px;
                text-align: center;
            }
            .footer {
                text-align: center;
                font-size: 12px;
                color: #888;
                margin-top: 20px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <tr style="display: flex; justify-content: center; align-items: center; margin: auto;">
            <td style="padding: 40px 48px; text-align: center; margin: auto;" class="logo">
                <img src="https://squadra-media.s3.ap-south-1.amazonaws.com/9-01.png" alt="Company Logo" style="max-width: 200px; height: auto;">
            </td>
             </tr>
            <div class="content">
                <h1>User Successfully Registered</h1>
                <p>Hello <strong>${adminfirstName}</strong> 👋,</p>
                <p>The user ${userfirstName} has been successfully registered in the system.</p>
                <br>
                <br>
                <p>You can now assign courses, groups, or roles to this user as required.</p>
                
                <p>
                Thanks,
                <p>Seaverse Team</p>

                </p>
                <br>
                <br>
                <a href="${process.env.APP_URL}/employee-management" class="button">View User</a>
            </div>
            <div class="footer">
                Sent by Seaverse - Training for Advanced Navigation Techniques
            </div>
        </div>
    </body>
    </html>
    `;
}
module.exports = { registered_status, registered_statusforAdmin };