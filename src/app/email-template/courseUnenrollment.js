function courseUnenrollmentEmail(unenrolledUsers) {
    return `
    <html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Course Unenrollment</title>
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
                <img src="https://seaverse-prod.s3.eu-west-1.amazonaws.com/public/seaverse-logo.png" 
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
                                        You Have Been Unenrolled from a Course
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        Hello <strong>${unenrolledUsers.firstName}</strong> 👋
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 0 0 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        We regret to inform you that you have been unenrolled from the course <strong>${unenrolledUsers.courseTitle}</strong>.
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 0 0 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                        Please reach out to your administrator or contact us for further assistance.
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

module.exports = courseUnenrollmentEmail;
