function registered_status(user) {
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
                <h1>Registered Status</h1>
                <p>Hello <strong>${user.firstName}</strong> 👋,</p>
                <p>
                Your status is currently marked as Registered. 
                </p>
                <p>

                Thanks,
                Synergy Marine Group

                </p>
        
            </div>
            <div class="footer">
                Sent by Seaverse - Training for Advanced Navigation Techniques
            </div>
        </div>
    </body>
    </html>
    `;
}
function registered_statusforAdmin({adminfirstName, userfirstName}) {
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
                <h1>User Successfully Registered</h1>
                <p>Hello <strong>${adminfirstName}</strong> 👋,</p>
                <p>The user ${userfirstName} has been successfully registered in the system.</p>
                <br>
                <br>
                <p>You can now assign courses, groups, or roles to this user as required.</p>
                
                <p>
                Thanks,
                Synergy Marine Group

                </p>
                <br>
                <br>
                <a href="${process.env.EMPLOYEE_DOMAIN_URL}" class="button">View User</a>
            </div>
            <div class="footer">
                Sent by Seaverse - Training for Advanced Navigation Techniques
            </div>
        </div>
    </body>
    </html>
    `;
}
module.exports = {registered_status,registered_statusforAdmin};
