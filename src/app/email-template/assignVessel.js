function vesselAssignmentEmail(user) {
    return `
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Vessel Assignment</title>
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
                background-color: #fff;
                border-radius: 8px;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
            }
            .header {
                text-align: center;
                margin-bottom: 20px;
            }
            .header img {
                width: 150px;
            }
            .content {
                text-align: center;
                margin-bottom: 20px;
            }
            .content h1 {
                font-size: 24px;
                color: #2c3e50;
                margin-bottom: 10px;
            }
            .content p {
                font-size: 16px;
                color: #555;
                margin: 5px 0;
            }
            .button {
                display: inline-block;
                padding: 10px 20px;
                margin-top: 20px;
                font-size: 16px;
                color: #fff;
                background-color: #2c3e50;
                text-decoration: none;
                border-radius: 4px;
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
                <img src="https://yourcompanylogo.com/logo.png" alt="Seaverse Logo">
            </div>
            <div class="content">
                <h1>You Have Been Assigned to a Vessel</h1>
                <p>Hello <strong>${user.firstName}</strong> 👋</p>
                <p>You have been assigned to the <strong>${user.vesselName}</strong>.</p>
                <p>Please log in to your account to review your assignment details and access any relevant resources.</p>
                <br>
                <br>
                <a href="${process.env.EMPLOYEE_DOMAIN_URL}" class="button">Log In</a>
            </div>
            <div class="footer">
                Sent by Seaverse - Training for all courses.
            </div>
        </div>
    </body>
    </html>
    `;
}

function  vesselAssignmentEmailforAdmin(user) {
    return `
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Vessel Assignment</title>
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
                background-color: #fff;
                border-radius: 8px;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
            }
            .header {
                text-align: center;
                margin-bottom: 20px;
            }
            .header img {
                width: 150px;
            }
            .content {
                text-align: center;
                margin-bottom: 20px;
            }
            .content h1 {
                font-size: 24px;
                color: #2c3e50;
                margin-bottom: 10px;
            }
            .content p {
                font-size: 16px;
                color: #555;
                margin: 5px 0;
            }
            .button {
                display: inline-block;
                padding: 10px 20px;
                margin-top: 20px;
                font-size: 16px;
                color: #fff;
                background-color: #2c3e50;
                text-decoration: none;
                border-radius: 4px;
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
                <img src="https://yourcompanylogo.com/logo.png" alt="Seaverse Logo">
            </div>
            <div class="content">
                <h1>User Assigned to a Vessel</h1>
                <p>Hello <strong>${user.firstName}</strong> 👋</p>
                <p>The user <strong>${user.userName}</strong> has been successfully assigned to the <strong>${user.vesselName}</strong>.

                <p>You can review the user's assignments or make further updates by logging into the system. 
                Thanks,
                Synergy Marine Group
                </p>
              
            </div>
            <div class="footer">
                Sent by Seaverse - Training for all courses.
            </div>
        </div>
    </body>
    </html>
    `;
}
module.exports = {vesselAssignmentEmail, vesselAssignmentEmailforAdmin};
