function courseEnrollment({firstName,trainingTitle,durationHours}) {
    return `
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Course Enrollment</title>
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
                width: 100px;
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
                <p>Hello <strong>${firstName}</strong> 👋</p>
                <p>You have been assigned to a new course. Start learning today and achieve your goals!</p>
            </div>
            <div class="content">
                <h2>Welcome! You've Been Assigned to a New Course.</h2>
            </div>
            <div class="course-card">
                <img src="https://via.placeholder.com/100" alt="Course Image" />
                <h3>${trainingTitle}</h3>
                <p>Duration: ${durationHours} hours</p>
                <a href="#" class="button">Start Learning</a>
            </div>
            <div class="footer">
                Sent by Seaverse - Training for Advanced Navigation Techniques
            </div>
        </div>
    </body>
    </html>
    `;
}

module.exports = courseEnrollment;
