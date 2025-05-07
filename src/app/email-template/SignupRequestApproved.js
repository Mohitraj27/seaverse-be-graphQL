function approvalEmailTemplate(data) {
    return `<!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
          .logo-container {
              text-align: center;
              padding: 20px;
            
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
          .button-container {
              margin: 24px 0;
          }
          .login-button {
              display: inline-block;
              background-color: #1E3A8A;
              color: white;
              font-size: 16px;
              font-weight: 500;
              text-decoration: none;
              padding: 10px 24px;
              border-radius: 4px;
          }
            .logo-section {
            display: flex;
            justify-content: center;
            align-items: center;
            margin: 20px auto;
            text-align: center;
        }
        .logo {
            max-width: 200px;
            height: auto;
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
  <body>
          <div class="logo-section">
        <img src="https://squadra-media.s3.ap-south-1.amazonaws.com/9-01.png" alt="Company Logo" class="logo">
         </div>
      <div class="container">
          
          <div class="content">
              <h1 class="header">Account registration approved!</h1>
              
              <p class="greeting">Hello ${data?.firstName},</p>
              
              <p class="message">
                  Welcome to Seaverse! 🎉 We're excited to have you on board. Your signup request has been approved, and you can now access your account.
              </p>
              
              <p class="message">
                  Start exploring courses and begin your learning journey today!
              </p>
              
              <p class="message">
                  Thanks<br>
                  
              </p>
              
              <div class="button-container">
                  <a href="${data?.loginLink || '#'}" class="login-button">Log In</a>
              </div>
              
              <div class="support-box">
                  <p class="support-title">Need Help?</p>
                  <p class="support-text">If you have any questions or need assistance, feel free to reach out:</p>
                  <p class="support-text">Email: support@seaverse.com</p>
              </div>
          </div>
          
          <div class="footer">
              Sent by Seaverse - Training for all courses.
          </div>
      </div>
  </body>
  </html>`;
}
module.exports = { approvalEmailTemplate }; 