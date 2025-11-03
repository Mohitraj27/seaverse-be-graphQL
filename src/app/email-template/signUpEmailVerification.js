function signUpVerifyEmailTemplate(data) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Email Verification</title>
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
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.05);
    }
    .content {
      padding: 32px;
      text-align: left;
    }
    .message {
      font-size: 14px;
      line-height: 1.5;
      color: #555555;
      margin-bottom: 24px;
    }
    .verification-label {
      font-size: 14px;
      font-weight: bold;
      text-align: center;
      margin-bottom: 8px;
    }
    .verification-code {
      font-size: 28px;
      font-weight: 600;
      letter-spacing: 8px;
      color: #233570;
      text-align: center;
      margin: 16px 0 24px;
    }
    .button-container {
      text-align: center;
      margin: 24px 0;
    }
    .verify-button {
      display: inline-block;
      background-color: #233570;
      color: #ffffff !important;
      font-size: 14px;
      font-weight: 500;
      text-decoration: none;
      padding: 10px 32px;
      border-radius: 4px;
    }
    .footer {
      font-size: 12px;
      color: #666666;
      text-align: center;
      padding: 16px;
      border-top: 1px solid #eeeeee;
    }
    @media screen and (max-width: 600px) {
      .content {
        padding: 24px 16px !important;
      }
    }
  </style>
</head>
<body>
  <!-- Outer wrapper to center the whole email -->
  <div style="background-color:#f7f7f7; padding:20px 0;">
    <!-- Table wrapper for better Outlook compatibility -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" align="center">
      <tr>
        <td align="center">
          <!-- main container (rounded white card) -->
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%; margin:0 auto;">
            <!-- logo row -->
           <tr>
            <td align="center" style="padding: 40px 48px;" class="logo">
                <img src="https://squadra-media.s3.ap-south-1.amazonaws.com/9-01.png" 
                    alt="Company Logo"  width="200" style="display: block; border: 0; outline: none; text-decoration: none; height: auto; max-width: 200px;">
            </td>
        </tr>

            <!-- white rounded card -->
            <tr>
              <td align="center">
                <div class="container" style="border-radius:8px; overflow:hidden;">
                  <div class="content">
                    <div class="message">
                      Welcome to Seaverse! To complete your signup process,
                      <span>please verify your email by entering the OTP below:</span>
                    </div>

                    <div class="verification-label">Signup verification code</div>
                    <div class="verification-code">${data?.otp}</div>

                    <div class="button-container">
                      <a href="${data?.verificationLink}" class="verify-button">Verify</a>
                    </div>
                  </div>

                  <div class="footer">
                    Sent by Seaverse - Training for Advanced Navigation Techniques
                  </div>
                </div>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>
`;
}

module.exports = { signUpVerifyEmailTemplate };