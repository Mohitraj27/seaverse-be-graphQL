function moduleResetNotificationEmail(user) {
    return `
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Module Reset Notification</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                background-color: #f4f4f4;
                margin: 0;
                padding: 0;
            }
            .container {
                max-width: 600px;
                margin: 20px auto;
                padding: 20px;
                background-color: #fff;
                border-radius: 8px;
                border: 1px solid #ddd;
            }
            .header {
                text-align: center;
                padding-bottom: 20px;
            }
            .header img {
                width: 150px;
                margin-bottom: 10px;
            }
            .content {
                text-align: center;
                padding-bottom: 20px;
            }
            .content h2 {
                color: #333;
                font-size: 20px;
                margin-bottom: 20px;
            }
            .content p {
                font-size: 16px;
                color: #555;
                margin-bottom: 20px;
            }
            .content a {
                display: inline-block;
                background-color: #1d3557;
                color: white;
                padding: 10px 20px;
                border-radius: 5px;
                text-decoration: none;
            }
            .footer {
                text-align: center;
                font-size: 12px;
                color: #888;
                padding-top: 20px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="https://yourlogo-url.com/logo.png" alt="Seaverse Logo">
            </div>
            <div class="content">
                <h2>Module Reset Notification</h2>
                <p>Hello <strong>${user.firstName}</strong> 👋</p>
                <p>The module <strong>${user.courseTitle}</strong> has been successfully reset. You can now start the module again or revisit the content at your convenience.</p>
                <a href="https://seaverse.com" target="_blank">Start Module</a>
            </div>
            <div class="footer">
                Sent by Seaverse - Training for ${user.courseTitle}
            </div>
        </div>
    </body>
    </html>
    `;
}

module.exports = moduleResetNotificationEmail;
