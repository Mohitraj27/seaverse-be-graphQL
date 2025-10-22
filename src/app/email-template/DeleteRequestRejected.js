function DeleteRequestRejected(data) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Deletion Request Rejected</title>
  <style>
    body {
      font-family: 'Inter', sans-serif;
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
    .login-button {
      display: inline-block;
      background-color: #1E3A8A;
      color: #ffffff !important;
      font-size: 16px;
      font-weight: 500;
      text-decoration: none;
      padding: 10px 24px;
      border-radius: 4px;
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
        padding: 20px !important;
      }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#f7f7f7;">
  <div style="padding:20px 0;">

    <!-- ✅ Responsive logo table for Outlook Mobile -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td align="center" style="padding: 20px 0;">
          <img 
            src="https://squadra-media.s3.ap-south-1.amazonaws.com/9-01.png"
            alt="Company Logo"
            width="160"
            style="display:block; width:160px; max-width:80%; height:auto; margin:0 auto;"
          />
        </td>
      </tr>
    </table>

    <!-- Email main content container -->
    <div class="container">
      <div class="content">
        <h1 class="header">Account Deletion Request Rejected!</h1>

        <p class="greeting">Hello ${data?.firstName},</p>

        <p class="message">
          We have reviewed your request to delete your account and unfortunately, it has not been approved.
        </p>

        <p class="message">
          If you wish to proceed with account deletion, you may submit a new request or contact us for more details.
        </p>

        <p class="message">
          Thanks,<br>
          <strong>Seaverse Team</strong>
        </p>

        <div class="support-box">
          <p class="support-title">Need Help?</p>
          <p class="support-text">If you have any questions or need assistance, feel free to reach out:</p>
          <p class="support-text">Email: support@thesealearning.com</p>
        </div>
      </div>

      <div class="footer">
        Sent by Seaverse - Training for all courses.
      </div>
    </div>
  </div>
</body>
</html>`;
}
module.exports = { DeleteRequestRejected }; 