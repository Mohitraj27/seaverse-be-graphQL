function signUpVerifyEmailTemplate(data) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
        .logo-container {
            text-align: center;
            padding: 24px;
            background-color: #ffffff;
        }
        .logo {
            height: 36px;
        }
        .content {
            padding: 32px;
            text-align: left;
        }
        .greeting {
            font-size: 16px;
            font-weight: 500;
            margin-bottom: 16px;
            color: #333333;
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
            /*color: #233570;*/
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
                padding: 24px 16px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo-container">
            <img src="https://squadra-media.s3.ap-south-1.amazonaws.com/f74ed9245e02b9e569df95efe7aab6b3f57014b0+(1).png" alt="Seaverse Logo">
        </div>
        <div class="content">
            <div class="message">
                Welcome to Seaverse! To complete your signup process,
                <span> please verify your email by entering the OTP below:</span>
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
</body>
</html>
`;
}

module.exports = { signUpVerifyEmailTemplate };