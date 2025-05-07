function consentsforLearnerInitalLogin(data) {
   return  `<!DOCTYPE html>
<html lang="en" style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f2f4f6;">
  <head>
    <meta charset="UTF-8" />
    <title>Your Sign-Up Was Not Complete</title>
  </head>
  <body style="margin: 0; padding: 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr style="display: flex; justify-content: center; align-items: center; margin: auto;">
            <td style="padding: 40px 48px; text-align: center; margin: auto;" class="logo">
                <img src="https://squadra-media.s3.ap-south-1.amazonaws.com/9-01.png" alt="Company Logo" style="max-width: 200px; height: auto;">
            </td>
        </tr>
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 0 10px rgba(0,0,0,0.05);">
            <tr>
              <td>
                <h2 style="color: #000000; margin-bottom: 20px;">Your Sign-Up Was Not Complete</h2>
                <p style="font-size: 16px; color: #333;">Hello ${data?.firstName}👋,</p>
                <p style="font-size: 16px; color: #333;">
                  We noticed that you have rejected the Terms and Conditions during the sign-up process.
                </p>
                <p style="font-size: 16px; color: #333;">
                  As a result, your registration could not be completed, and your data will be <strong>automatically deleted from our system within the next 7 days</strong>.
                </p>
                <p style="font-size: 16px; color: #333;">
                  If this was unintentional or you would like to proceed with your registration, please revisit the sign-up process and accept the Terms and Conditions.
                </p>
                <p style="font-size: 16px; color: #333;">
                  <strong>Note:</strong> Your privacy and data security are important to us. No further action is required if you do not wish to continue.
                </p>
                <p style="font-size: 16px; color: #333;">Thank you,<br/>Seaverse Team</p>
              </td>
            </tr>
            <tr>
              <td style="padding-top: 30px;">
                <div style="background-color: #f9f9f9; padding: 20px; border-radius: 6px; font-size: 14px; color: #555;">
                  <strong>Need Help?</strong><br/>
                  If you need assistance or have any questions, feel free to reach out to our support team after logging in, or contact us at <a href="mailto:support@thesealearning.com" style="color: #007bff;">support@thesealearning.com</a>.
                </div>
              </td>
            </tr>
          </table>
          <p style="font-size: 12px; color: #888888; padding: 20px 0;">
            Sent by Seaverse – Training for all courses.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

module.exports = { consentsforLearnerInitalLogin };