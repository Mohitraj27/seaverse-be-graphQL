function rejectionEmailTemplate(data) {
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
          .logo {
              height: 120px;
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
  <body>
      <div class="logo-container">
              <img src="https://squadra-media.s3.ap-south-1.amazonaws.com/Screenshot+2025-03-29+221025-Photoroom.png" alt="Seaverse Logo" class="logo">
          </div>
      <div class="container">
          
          <div class="content">
              <h1 class="header">Account Registration Rejected!</h1>
              
              <p class="greeting">Hello ${data?.firstName},</p>
              
              <p class="message">
                  Thank you for registering on SeaVerse LMS. After reviewing your application, we regret to inform you that your account registration has not been approved.
              </p>
              
              <p class="message">
                  Thanks<br>
                  
              </p>
              
              <div class="support-box">
                  <p class="support-title">Need Help?</p>
                  <p class="support-text">If you have any questions or need assistance, feel free to reach out:</p>
                  <p class="support-text">Email: support@seaverse.com</p>
              </div>
          </div>
          
          <div class="footer">
              Sent by Lynk - Training for all courses.
          </div>
      </div>
  </body>
  </html>`;
  }
  
  module.exports = { rejectionEmailTemplate };