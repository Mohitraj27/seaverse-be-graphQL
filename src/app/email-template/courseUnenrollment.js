function courseUnenrollmentEmail(unenrolledUsers) {
    return `
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Course Unenrollment</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                margin: 0;
                padding: 0;
                background-color: #f4f4f4;
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
                height: auto;
                margin-bottom: 10px;
            }
            .content {
                text-align: center;
                padding-bottom: 20px;
            }
            .content h2 {
                color: #2c3e50;
            }
            .content p {
                font-size: 14px;
                color: #555;
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
            <div class="content">
                <h2>You Have Been Unenrolled from a Course</h2>
                <p>Hello <strong>${unenrolledUsers.firstName}</strong> 👋</p>
                <p>We regret to inform you that you have been unenrolled from the course <strong>${unenrolledUsers.courseTitle}</strong>.</p>
                <p>Please reach out to your administrator or contact us for further assistance.</p>
            </div>
            <div class="footer">
                Sent by Seaverse - Training for ${unenrolledUsers.courseTitle}
            </div>
        </div>
    </body>
    </html>
    `;
}

module.exports = courseUnenrollmentEmail;
