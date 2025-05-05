function sendConsentsforAllAdminsInitalLogin(data) {
    return `<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Learner Rejected Terms</title>
        <style>
          @media screen and (max-width: 600px) {
            .content {
              width: 100% !important;
              padding: 24px !important;
            }
          }
        </style>
      </head>
      <body style="font-family: Arial, sans-serif; background-color: #F7FBFF; margin: 0; padding: 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 20px;">
          <tr>
            <td align="center" style="padding-bottom: 20px;">
              <img src="https://squadra-media.s3.ap-south-1.amazonaws.com/f74ed9245e02b9e569df95efe7aab6b3f57014b0+(1).png" alt="Seaverse Logo" style="height: 50px;" />
            </td>
          </tr>
          <tr>
            <td align="center">
              <table class="content" width="640" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; padding: 40px 48px; box-shadow: 0 0 10px rgba(0,0,0,0.05);">
                <tr>
                  <td style="font-weight: 700; font-size: 20px; color: #121A26; padding-bottom: 16px;">
                    Learner Rejected Terms and Conditions
                  </td>
                </tr>
                <tr>
                  <td style="font-size: 16px; color: #384860; padding-bottom: 16px;">
                    Hello ${data?.adminFirstName} 👋,
                  </td>
                </tr>
                <tr>
                  <td style="font-size: 16px; color: #384860; padding-bottom: 16px;">
                    Please note that the following learner has rejected the Terms and Conditions, and their account data is now scheduled for deletion as per our policy.
                  </td>
                </tr>
                <tr>
                  <td style="font-size: 16px; color: #384860; padding-bottom: 16px;">
                    <strong>Learner Details:</strong><br />
                    Full Name: <strong>${data?.learnerfirstName}</strong><br />
                    Email Address: <strong>${data?.learnerEmail}</strong>
                  </td>
                </tr>
                <tr>
                  <td style="font-size: 16px; color: #384860; padding-bottom: 16px;">
                    No further action is required at this time, as the system will automatically handle data deletion within 7 days of the rejection.
                  </td>
                </tr>
                <tr>
                  <td style="font-size: 16px; color: #384860; padding-bottom: 16px;">
                    If needed, you may contact the learner or the support team for further clarification.
                  </td>
                </tr>
                <tr>
                  <td style="font-size: 16px; color: #384860;">
                    Thanks,<br />
                    Synergy Marine Group
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
    </html>
    `;
}

module.exports = { sendConsentsforAllAdminsInitalLogin };