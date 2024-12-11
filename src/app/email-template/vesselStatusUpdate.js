function vesselStatusUpdateEmail(user) {
    return `
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Vessel Status Update</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                margin: 0;
                padding: 0;
                background-color: #f9fbfc;
            }
            .container {
                max-width: 600px;
                margin: 20px auto;
                padding: 20px;
                background-color: #ffffff;
                border-radius: 8px;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
            }
            .header {
                text-align: center;
                margin-bottom: 20px;
            }
            .header img {
                width: 120px;
            }
            .content {
                text-align: left;
                margin-bottom: 20px;
            }
            .content h1 {
                font-size: 22px;
                color: #2c3e50;
                margin-bottom: 10px;
            }
            .content p {
                font-size: 16px;
                color: #555;
                margin: 5px 0;
            }
            .content strong {
                color: #2c3e50;
            }
            .button {
                display: inline-block;
                padding: 12px 24px;
                margin: 20px 0;
                font-size: 16px;
                color: #ffffff;
                background-color: #003366;
                text-decoration: none;
                border-radius: 4px;
                text-align: center;
            }
            .footer {
                text-align: center;
                font-size: 12px;
                color: #888;
                margin-top: 20px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="https://yourlogo.com/seaverse-logo.png" alt="Seaverse Logo">
            </div>
            <div class="content">
                <h1>Vessel Status Update</h1>
                <p>Hello <strong>${user.firstName}</strong> 👋,</p>
                <p>
                    The status of the vessel <strong>${user.vesselName}</strong> you are assigned to 
                    has been updated to <strong>${user.vesselStatus}</strong>.
                </p>
                <p>
                    Please log in to your account to review the updated status or reach out to your 
                    administrator if you have any questions.
                </p>
                <a href="${process.env.VIEW_VESSEL_URL}" class="button">View Vessel</a>
            </div>
            <div class="footer">
                Sent by Seaverse - Training for Advanced Navigation Techniques
            </div>
        </div>
    </body>
    </html>
    `;
}
function vesselStatusUpdateEmailAdmin(user) {
    return `
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Vessel Status Update</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                margin: 0;
                padding: 0;
                background-color: #f9fbfc;
            }
            .container {
                max-width: 600px;
                margin: 20px auto;
                padding: 20px;
                background-color: #ffffff;
                border-radius: 8px;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
            }
            .header {
                text-align: center;
                margin-bottom: 20px;
            }
            .header img {
                width: 120px;
            }
            .content {
                text-align: left;
                margin-bottom: 20px;
            }
            .content h1 {
                font-size: 22px;
                color: #2c3e50;
                margin-bottom: 10px;
            }
            .content p {
                font-size: 16px;
                color: #555;
                margin: 5px 0;
            }
            .content strong {
                color: #2c3e50;
            }
            .button {
                display: inline-block;
                padding: 12px 24px;
                margin: 20px 0;
                font-size: 16px;
                color: #ffffff;
                background-color: #003366;
                text-decoration: none;
                border-radius: 4px;
                text-align: center;
            }
            .footer {
                text-align: center;
                font-size: 12px;
                color: #888;
                margin-top: 20px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="https://yourlogo.com/seaverse-logo.png" alt="Seaverse Logo">
            </div>
            <div class="content">
                <h1>Vessel Status Updated</h1>
                <p>Hello <strong>${user.firstName}</strong> 👋,</p>
                <p>
                The status of the vessel <strong>${user.vesselName}</strong> has been successfully updated to <strong>${user.vesselStatus}</strong>.
                If you require any additional information or need to make further changes, 
                please log in to the system or contact support.
                  </p>
                <a href="${process.env.VIEW_VESSEL_URL}" class="button">View Vessel</a>
            </div>
            <div class="footer">
                Sent by Seaverse - Training for Advanced Navigation Techniques
            </div>
        </div>
    </body>
    </html>
    `;
}

module.exports = { vesselStatusUpdateEmail, vesselStatusUpdateEmailAdmin };
