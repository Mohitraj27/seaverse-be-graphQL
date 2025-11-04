function DeleteRequestRejected(data) {
    return `
    <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Deletion Request Rejected</title>
  <style>
    @media screen and (max-width: 600px) {
      .content {
        padding: 20px !important;
      }
    }
  </style>
</head>

<body style="margin:0; padding:0; background-color:#f7f7f7; font-family: 'Inter', Arial, sans-serif;">

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" align="center" style="background-color:#f7f7f7; padding:20px 0;">
    <tr>
      <td align="center">

        <!-- LOGO -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="600" style="max-width:600px;">
          <tr>
            <td align="center" style="padding:40px 0;">
              <img src="https://squadra-media.s3.ap-south-1.amazonaws.com/9-01.png" 
                   alt="Company Logo" width="200" style="display:block; border:0; outline:none; text-decoration:none; height:auto; max-width:200px;">
            </td>
          </tr>
        </table>

        <!-- MAIN CONTAINER -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="600" style="max-width:600px; background-color:#ffffff; border:1px solid #e0e0e0; border-radius:8px; overflow:hidden;">
          <tr>
            <td style="padding:30px;" class="content">

              <!-- HEADER -->
              <h1 style="margin:0 0 20px 0; font-size:24px; font-weight:600; color:#111827;">
                Account Deletion Request Rejected!
              </h1>

              <!-- GREETING -->
              <p style="margin:0 0 16px 0; font-size:16px; color:#333333;">
                Hello ${data?.firstName},
              </p>

              <!-- MESSAGE -->
              <p style="margin:0 0 16px 0; font-size:16px; line-height:1.6; color:#4B5563;">
                We have reviewed your request to delete your account and unfortunately, it has not been approved.
              </p>

              <p style="margin:0 0 20px 0; font-size:16px; line-height:1.6; color:#4B5563;">
                If you wish to proceed with account deletion, you may submit a new request or contact us for more details.
              </p>

              <p style="margin:0 0 20px 0; font-size:16px; line-height:1.6; color:#4B5563;">
                Thanks,<br>
                <strong>Seaverse Team</strong>
              </p>

              <!-- SUPPORT BOX -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F3F4F6; border-radius:8px; margin-top:30px;">
                <tr>
                  <td style="padding:16px;">
                    <p style="margin:0 0 8px 0; font-size:16px; font-weight:500; color:#111827;">
                      Need Help?
                    </p>
                    <p style="margin:0 0 4px 0; font-size:14px; color:#4B5563;">
                      If you have any questions or need assistance, feel free to reach out:
                    </p>
                    <p style="margin:0; font-size:14px; color:#4B5563;">
                      Email: <a href="mailto:support@thesealearning.com" style="color:#1E3A8A; text-decoration:none;">support@thesealearning.com</a>
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding:20px 30px; border-top:1px solid #E5E7EB; background-color:#ffffff;">
              <p style="margin:0; font-size:12px; color:#6B7280; line-height:1.4;">
                Sent by Seaverse - Training for all courses.
              </p>
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
module.exports = { DeleteRequestRejected }; 