function createNewEmployeeEmailTemplate(user) {
    // Sanitize and validate input to prevent XSS
    const sanitizedFirstName = user.firstName ?
        user.firstName.replace(/[<>&"']/g, '') : 'New Employee';
    const sanitizedEmail = user.email ?
        user.email.replace(/[<>&"']/g, '') : '';
    const sanitizedPassword = user.templategeneratePassword ?
        user.templategeneratePassword.replace(/[<>&"']/g, '') : '';

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Seaverse</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .button { 
                display: inline-block; 
                background-color: #1E3A76; 
                color: white; 
                padding: 10px 20px; 
                text-decoration: none; 
                border-radius: 5px; 
            }
        </style>
    </head>
    <body>
        <div class="container">
            <img src="https://squadra-media.s3.ap-south-1.amazonaws.com/Frame+1000003213.png" alt="Seaverse Logo" style="max-width: 200px; margin: 0 auto; display: block;">
            
            <h1>Welcome to Seaverse!</h1>
            
            <p>Hello ${sanitizedFirstName} 👋</p>
            
            <p>Your account has been successfully created on our learning platform. Below are your login details:</p>
            
            <p>Username: ${sanitizedEmail}</p>
            <p>Password: ${sanitizedPassword}</p>
            
            <p>Click the button below to accept invite and start your learning journey:</p>
            
            <a href="${process.env.APP_URL}/login?isResetPasswordDialog=false" class="button">Accept Invite</a>
            
            <p>Thanks,<br>Synergy Marine Group</p>
            
            <p style="font-size: 0.8em; color: #666;">Sent by Seaverse - Training for all courses.</p>
        </div>
    </body>
    </html>
    `;
}

module.exports = createNewEmployeeEmailTemplate;