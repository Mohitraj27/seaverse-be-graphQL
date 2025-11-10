function sendPasswordResetReminderEmail(user) {
    const stepByStepGuideLink = 'https://seaverse-prod.s3.eu-west-1.amazonaws.com/public/Seaverse+Walkthrough+14-10-25+V2.mp4';
    return `
    <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome Mail</title>
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

  <!-- Outer Wrapper -->
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#F7FBFF" align="center" style="margin:0; padding:40px 0;">
    <tr>
      <td align="center" valign="top">

        <!--[if mso]>
        <table role="presentation" border="0" cellspacing="0" cellpadding="0" width="640">
        <tr>
        <td align="center" valign="top">
        <![endif]-->

        <!-- Inner Container -->
        <table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%" style="max-width:640px; margin:0 auto;" class="container">

          <!-- LOGO -->
          <tr>
            <td align="center" style="padding: 20px 0 10px 0;" class="logo">
              <img src="https://seaverse-prod.s3.eu-west-1.amazonaws.com/public/seaverse-logo.png"
                   alt="Company Logo"
                   width="180"
                   style="display:block; border:0; outline:none; text-decoration:none; height:auto; max-width:180px;">
            </td>
          </tr>

          <!-- CONTENT BOX -->
          <tr>
            <td align="center" valign="top">
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%"
                     style="max-width:640px; background-color:#FFFFFF; border-radius:8px;" class="content">
                <tr>
                  <td style="padding:36px 44px;" class="content-inner">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">

                      <tr>
                        <td style="font-family: 'Inter', Arial, sans-serif; font-weight: 700; font-size: 24px; line-height: 36px; color: #121A26;">
                          Welcome to Seaverse!
                        </td>
                      </tr>

                      <tr>
                        <td style="padding: 20px 0; font-family: 'Inter', Arial, sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                          Hello <strong>${user.firstName}</strong> 👋
                        </td>
                      </tr>

                      <tr>
                        <td style="padding-bottom: 20px; font-family: 'Inter', Arial, sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                          Your account has been successfully created on our learning platform. Below are your login details:
                        </td>
                      </tr>

                      <tr>
                        <td style="padding-bottom: 20px; font-family: 'Inter', Arial, sans-serif; font-weight: 400; font-size: 16px; color: #384860;">
                          <p style="margin:0;">Username: ${user.email}</p>
                          <p style="margin:0;">Password: ${user.temp_password}</p>
                        </td>
                      </tr>

                      <tr>
                        <td style="padding-bottom: 20px; font-family: 'Inter', Arial, sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                          In case of any difficulty, here is your 
                          <a href="${stepByStepGuideLink}" target="_blank"
                             style="font-weight:700; color:#FFFFFF; text-decoration:none; background-color:#1E3A76; border-radius:4px; padding:2px 6px; display:inline-block; line-height:1;">
                             Step-by-Step Guide
                          </a>.
                        </td>
                      </tr>

                      <tr>
                        <td style="padding-bottom: 20px; font-family: 'Inter', Arial, sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                          Click the button below to log in and start your learning journey:
                        </td>
                      </tr>

                      <tr>
                        <td align="center">
                          <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center">
                            <tr>
                              <td align="center" bgcolor="#1E3A76" style="border-radius:6px;">
                                <a href="${user.buttonLink}" target="_blank"
                                   style="font-family: 'Inter', Arial, sans-serif; font-size:16px; font-weight:500; line-height:24px; color:#FFFFFF; text-decoration:none; display:inline-block; padding:12px 24px; border-radius:6px;">
                                   Accept Invite
                                </a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>

                      <tr>
                        <td style="padding-top: 20px; font-family: 'Inter', Arial, sans-serif; font-weight:400; font-size:16px; color:#384860;">
                          Thanks,<br>Seaverse Team
                        </td>
                      </tr>

                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td align="center"
                style="padding: 20px 0; text-align: center; font-family: 'Inter', Arial, sans-serif; font-weight: 400; font-size: 15px; line-height: 22px; color: #202B3C;">
              Sent by Seaverse - Training for all courses.
            </td>
          </tr>
        </table>

        <!--[if mso]>
        </td>
        </tr>
        </table>
        <![endif]-->

      </td>
    </tr>
  </table>

</body>
</html>
    `;
}

module.exports = { sendPasswordResetReminderEmail };