function courseCompletion(user) {
    return `
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Course Completion</title>
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
            .header p {
                font-size: 14px;
                color: #555;
            }
            .content {
                text-align: center;
                padding-bottom: 20px;
            }
            .content h2 {
                color: #2c3e50;
            }
            .course-card {
                margin: 20px 0;
                text-align: center;
                padding: 15px;
                border: 1px solid #ddd;
                border-radius: 8px;
                background-color: #fff;
            }
            .course-card img {
                width: 100%;
                height: auto;
                border-radius: 4px;
                margin-bottom: 10px;
            }
            .course-card h3 {
                font-size: 18px;
                margin: 5px 0;
                color: #2c3e50;
            }
            .course-card p {
                font-size: 14px;
                color: #666;
            }
            .button {
                padding: 10px 20px;
                font-size: 16px;
                color: #fff;
                background-color: #3498db;
                text-decoration: none;
                border-radius: 4px;
                display: inline-block;
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
                <p>Hello <strong>${user.firstName}</strong> 👋</p>
                <p>Congratulations on successfully completing the course <strong>${user.trainingTitle}</strong>!</p>
            </div>
            <div class="content">
                <h2>Congratulations on Completing '<strong>${user.trainingTitle}</strong>'!</h2>
            </div>
            <div class="course-card">
                 <img src="${user.courseImageUrl}" alt="Course Image" />
                <p>Click on the button below to view and download your certificate:</p>
                <a href="${user.certificateLink}" class="button">View Certificate</a>
            </div>
            <div class="footer">
                Sent by Seaverse - Training for ${user.trainingTitle}
            </div>
        </div>
    </body>
    </html>
    `;
}

module.exports = courseCompletion;
