function courseCompletion(user) {
    return `
    <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Course Completion</title>
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
<body style="margin:0; padding:0; background-color:#F7FBFF; font-family: Arial, sans-serif; width:100%;">

  <!-- OUTER WRAPPER -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" align="center" style="background-color:#F7FBFF; padding:40px 20px;">
    <tr>
      <td align="center">

        <!-- LOGO -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="640" style="max-width:640px;">
          <tr>
            <td align="center" style="padding:40px 0;" class="logo">
              <img src="https://seaverse-prod.s3.eu-west-1.amazonaws.com/public/seaverse-logo.png" alt="Company Logo" width="200" style="display:block; border:0; outline:none; text-decoration:none; height:auto; max-width:200px;">
            </td>
          </tr>
        </table>

        <!-- CONTENT BLOCK 1 -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="640" style="background-color:#FFFFFF; border-radius:8px; max-width:640px;" class="content">
          <tr>
            <td style="padding:32px 40px;" class="content-inner">
              <p style="margin:0; padding:0; font-size:16px; line-height:24px; color:#384860;">
                Hello <strong>${user.firstName}</strong> 👋
              </p>
              <p style="margin:16px 0 0 0; font-size:16px; line-height:24px; color:#384860;">
                Congratulations on successfully completing the course <strong>${user.trainingTitle}</strong>!
              </p>
            </td>
          </tr>
        </table>

        <!-- CONTENT BLOCK 2 -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="640" style="background-color:#FFFFFF; border-radius:8px; margin-top:16px; max-width:640px;" class="content">
          <tr>
            <td style="padding:32px 40px;" class="content-inner" align="center">
              <h2 style="margin:0 0 16px 0; font-family:'Inter', sans-serif; font-weight:700; font-size:24px; line-height:33.6px; color:#384860;">
                Congratulations on Completing ${user.trainingTitle}!
              </h2>
              <p style="margin:0 0 24px 0; font-size:16px; line-height:24px; color:#384860;">
                ${user.certificatePresent 
                  ? 'Click on the button below to view and download your certificate:' 
                  : 'Click on the button below to view the course:'}
              </p>

              <!-- BUTTON -->
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center">
                <tr>
                  <td align="center" bgcolor="#1E3A76" style="border-radius:6px;">
                    <a href="${
                      user.certificatePresent 
                        ? `${process.env.APP_URL}/learner-profile?tab=certificates&userId=${user.userId}` 
                        : `${process.env.APP_URL}/course-preview/${user.courseId}`
                    }"
                      target="_blank"
                      style="display:inline-block; padding:12px 24px; font-family:'Inter', sans-serif; font-size:16px; font-weight:500; line-height:24px; color:#FFFFFF; text-decoration:none; border-radius:6px;">
                      ${user.certificatePresent ? 'View Certificate' : 'View Course'}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- FOOTER -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="640" style="max-width:640px;">
          <tr>
            <td align="center" style="padding:24px 0; font-family:'Inter', sans-serif; font-size:15px; line-height:22px; color:#202B3C;">
              Sent by Seaverse - Training for Advanced Navigation Techniques
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

module.exports = courseCompletion;
