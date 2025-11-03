function truncateString(str) {
    return str.length > 50 ? `${str.slice(0, 100)}...` : str;
}
function courseEnrollment({ firstName, courses, isAdmin }) {
    if(!Array.isArray(courses)) {
        courses = [courses];
    }
    const coursesHTML = courses
        .map(
            course => `

                    <tr>
                        <td style="padding: 1px 40px;" class="content-inner">
                            <table
                                style="margin: 0 auto; width: 100%; max-width: 560px; background-color: white; border-radius: 8px; border: 1px solid white;"
                                border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td
                                        style="padding: 8px 24px;  font-family: 'Inter', sans-serif; font-weight: 700; font-size: 16px; line-height: 24px; color: #121A26;">
                                        ${truncateString(course?.trainingTitle)}
                                    </td>
                                </tr> 
                            </table>
                            <hr>
                        </td>
                    </tr>
        `
        )
        .join("");
    return `
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Course Assignment</title>
          <style>
              @media screen and (max-width: 600px) {
                  .container {
                      padding: 20px 10px !important;
                  }

                  .logo {
                      padding: 20px 24px !important;
                  }

                  .content {
                      width: 100% !important;
                      border-radius: 0 !important;
                  }

                  .content-inner {
                      padding: 20px 24px !important;
                  }
              }
          </style>
      </head>

      <body style="font-family: Arial, sans-serif; background-color: #F7FBFF; margin: 0; padding: 0; width: 100%;">
          <table style="width: 100%; padding: 40px 20px;" align="center" border="0" cellpadding="0" cellspacing="0">
           <tr>
            <td align="center" style="padding: 40px 48px;" class="logo">
                <img src="https://squadra-media.s3.ap-south-1.amazonaws.com/9-01.png" 
                    alt="Company Logo"  width="200" style="display: block; border: 0; outline: none; text-decoration: none; height: auto; max-width: 200px;">
            </td>
        </tr>
              <tr>
                  <td>
                      <table style="background-color: #FFFFFF; border-radius: 8px; margin: 0 auto; width: 640px;" border="0"
                          cellpadding="0" cellspacing="0" class="content">
                          <tr>
                              <td style="padding: 32px 40px;" class="content-inner">
                                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                      <tr>
                                          <td
                                              style="padding: 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; color: #384860;">
                                              Hello <strong>${firstName}</strong> 👋
                                          </td>
                                      </tr>
                                      <tr>
                                          <td
                                              style="padding: 0 0 24px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #384860;">
                                              You have been assigned to a new course. Start learning today and stay on track to
                                              achieve your goals!
                                          </td>
                                      </tr>
                                  </table>
                              </td>
                          </tr>
                      </table>
                  </td>
              </tr>
              <tr>
                  <td style="padding: 13px 0 0 0;">
                      <table style="background-color: #FFFFFF; border-radius: 8px; margin: 0 auto; width: 640px;" border="0"
                          cellpadding="0" cellspacing="0" class="content">
                          <tr>
                              <td style="padding: 32px 40px;" class="content-inner">
                                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                      <tr>
                                          <td style="text-align: center;">
                                              <div
                                                  style="width: 364px; margin: 0 auto; font-family: 'Inter', sans-serif; font-weight: 700; font-size: 24px; line-height: 33.6px; color: #384860;">
                                                  Welcome! You’ve Been Assigned to New Course.
                                              </div>
                                          </td>
                                      </tr>
                                  </table>
                              </td>
                          </tr>
                          ${coursesHTML}
                       


                           <tr>
              <td align="center" style="padding: 32px 40px; text-align: center">
                <table
                  border="0"
                  cellpadding="0"
                  cellspacing="0"
                  align="center"
                >
                  <tr>
                    <td
                      align="center"
                      bgcolor="#1E3A76"
                      style="border-radius: 6px"
                    >
                      <a
                        href="${isAdmin ? `${process.env.APP_URL}/courses?learner=true` : `${process.env.APP_URL}/learner`}"
                        target="_blank"
                        style="
                          font-family: 'Inter', sans-serif;
                          font-size: 16px;
                          font-weight: 500;
                          line-height: 24px;
                          color: #ffffff;
                          text-decoration: none;
                          display: inline-block;
                          padding: 12px 24px;
                          border-radius: 6px;
                        "
                      >
                        Start Training
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
                      </table>
                  </td>
              </tr>
              <tr>
                  <td
                      style="padding: 24px 40px; text-align: center; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 16px; line-height: 24px; color: #202B3C;">
                      Sent by Seaverse - Training for Advanced Navigation Techniques
                  </td>
              </tr>
          </table>
      </body>
  
      </html>
    `;
}

module.exports = courseEnrollment;




/*  
// BACKUP CODE FOR DURATIONS IN HRS

const coursesHTML = courses
        .map(
            course => `
        <tr>
            <td style="padding: 10px 100px;" class="content-inner">
                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                        <td style="padding-left: 24px; vertical-align: top; width: 100%; max-width: 500px; justify-content: center; text-align: center;">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td style="text-align: center; justify-content: center; padding: 5px 0; font-family: 'Inter', sans-serif; font-weight: 700; font-size: 16px; line-height: 24px; color: #121A26;">
                                        ${truncateString(course.trainingTitle)}
                                    </td>
                                </tr>
                                <!--
                                <tr>
                                    <td style="text-align: center; padding: 5px 0; font-family: 'Inter', sans-serif; font-weight: 400; font-size: 14px; line-height: 21px; color: #727478;">
                                        Duration: ${course.durationHours} Hours
                                    </td>
                                </tr>
                                -->
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
      `
        )
        .join(""); 
        
*/