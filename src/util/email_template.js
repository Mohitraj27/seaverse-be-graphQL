module.exports = {
    emailTemplate: (logo, subscriber, htmlContent) => {
        subscriber = {
            ...subscriber,
            name: process.env.SUBSCRIBER_NAME,
        };

        const imageUrl = process.env.FILES_URL;

        return `
            <!DOCTYPE html>
            <html lang="en">
                <body>
                    <div style="margin: 10px;">
                        <div style="width: 100%;">
                            <div style="display: block; text-align: center;">
                            ${
                                logo
                                    ? `<img src=${
                                          imageUrl + logo
                                      } style="width: auto; height: 50px"  alt="logo">`
                                    : ``
                            } 
                            
                            ${
                                subscriber?.name
                                    ? ` <h1 style="font-weight: 900; font-size: 20px; font-style: normal; font-family: sans-serif; color: #5928E5;">${subscriber.name}</h1>`
                                    : ``
                            }     
                               
                                <div style="width: 100%">
                                    <div  style="background-color: #9373ff26; border-radius: 10px; text-align: center;">
                                        ${htmlContent}
                                     </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </body>
            </html>
        `;
    },
};
