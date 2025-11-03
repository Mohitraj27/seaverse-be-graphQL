function rejectionEmailTemplate(data) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Registration Rejected</title>
  <style>
    body {
      font-family: 'Inter', Arial, sans-serif;
      margin: 0;
      padding: 0;
      background-color: #f7f7f7;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      overflow: hidden;
    }
    .content {
      padding: 30px;
    }
    .header {
      font-size: 24px;
      font-weight: 600;
      color: #111827;
      margin-bottom: 20px;
    }
    .greeting {
      font-size: 16px;
      margin-bottom: 16px;
      color: #333333;
    }
    .message {
      font-size: 16px;
      line-height: 1.6;
      color: #4B5563;
      margin-bottom: 20px;
    }
    .support-box {
      background-color: #F3F4F6;
      padding: 16px;
      border-radius: 8px;
      margin-top: 30px;
    }
    .support-title {
      font-size: 16px;
      font-weight: 500;
      margin-bottom: 8px;
    }
    .support-text {
      font-size: 14px;
      color: #4B5563;
      margin-bottom: 4px;
    }
    .footer {
      font-size: 12px;
      color: #6B7280;
      text-align: left;
      padding: 20px 30px;
      border-top: 1px solid #E5E7EB;
    }
    @media screen and (max-width: 600px) {
      .content {
        padding: 20px;
      }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#f7f7f7;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f7f7f7;">
    <tr>
      <td align="center" style="padding:20px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" class="container" style="background-color:#ffffff; border:1px solid #e0e0e0; border-radius:8px;">

          <!-- LOGO SECTION -->
          <tr>
            <td align="center" style="padding: 40px 48px;" class="logo">
                <img src="https://squadra-media.s3.ap-south-1.amazonaws.com/9-01.png" 
                    alt="Company Logo"  width="200" style="display: block; border: 0; outline: none; text-decoration: none; height: auto; max-width: 200px;">
            </td>
        </tr>

          <!-- CONTENT -->
          <tr>
            <td class="content" style="padding:30px;">
              <h1 class="header" style="font-size:24px; font-weight:600; color:#111827; margin-bottom:20px;">
                Account Registration Rejected!
              </h1>

              <p class="greeting" style="font-size:16px; color:#333333; margin-bottom:16px;">
                Hello ${data?.firstName},
              </p>

              <p class="message" style="font-size:16px; line-height:1.6; color:#4B5563; margin-bottom:20px;">
                Thank you for registering on SeaVerse LMS. After reviewing your application, we regret to inform you that your account registration has not been approved. Your data will be automatically deleted from our system within the next 7 days.
              </p>

              <p class="message" style="font-size:16px; line-height:1.6; color:#4B5563;">
                Thanks,<br>Seaverse Team
              </p>

              <div class="support-box" style="background-color:#F3F4F6; padding:16px; border-radius:8px; margin-top:30px;">
                <p class="support-title" style="font-size:16px; font-weight:500; margin-bottom:8px;">Need Help?</p>
                <p class="support-text" style="font-size:14px; color:#4B5563; margin-bottom:4px;">
                  If you have any questions or need assistance, feel free to reach out:
                </p>
                <p class="support-text" style="font-size:14px; color:#4B5563;">Email: support@thesealearning.com</p>
              </div>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td class="footer" style="font-size:12px; color:#6B7280; text-align:left; padding:20px 30px; border-top:1px solid #E5E7EB;">
              Sent by Seaverse - Training for all courses.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = { rejectionEmailTemplate };