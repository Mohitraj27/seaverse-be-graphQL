const AWS = require("aws-sdk");
var path = require("path");
var fs = require('fs');


module.exports = {

    fetchFile: async (filePath) => {
        if (filePath) {
            // console.log('fetchFile', {
            //     AWS_ACCESS_KEY: process.env.AWS_ACCESS_KEY,
            //     AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
            //     AWS_REGION: process.env.AWS_REGION,
            //     S3_BUCKET: process.env.S3_BUCKET,
            //     filePath
            // });
            const s3 = new AWS.S3({
                accessKeyId: process.env.AWS_ACCESS_KEY?.trim(),
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim(),
                region: process.env.AWS_REGION?.trim(),
            });

            const signedUrl = await new Promise((resolve, reject) => {
                const params = {
                    Bucket: process.env.S3_BUCKET?.trim(),
                    Key: filePath?.trim(),
                    Expires: 60 * 60 * 5
                };

                s3.getSignedUrl('getObject', params, (error, url) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(url);
                    }
                });
            });

            return signedUrl;
        }
    },
    uploadFile: async ({ fileData, filePath, originalFileName, mimeType }) => {
        if (fileData && filePath) {
            const s3 = new AWS.S3({
                accessKeyId: process.env.AWS_ACCESS_KEY,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                region: process.env.AWS_REGION,
            });

            const location = await new Promise(resolve => {
                const params = {
                    Bucket: process.env.S3_BUCKET,
                    Key: filePath,
                    Body: fileData,
                    ContentType: mimeType,
                    Metadata: { originalFileName },
                    CacheControl: 'no-cache',
                    ContentDisposition: `attachment; filename="${originalFileName}"`
                };

                s3.upload(params, function (error, data) {
                    if (data) {
                        resolve(data.Location);
                    } else {
                        resolve();
                    }
                });
            });

            if (location) return filePath;
        }
    },
    deleteFile: async filePath => {
        if (filePath) {
            const s3 = new AWS.S3({
                accessKeyId: process.env.AWS_ACCESS_KEY,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                region: process.env.AWS_REGION,
            });

            const location = await new Promise(resolve => {
                const params = {
                    Bucket: process.env.S3_BUCKET,
                    Key: filePath,
                };

                s3.deleteObject(params, function (error, data) {
                    if (data) {
                        resolve(data);
                    } else {
                        resolve();
                    }
                });
            });

            if (location) return filePath;
        }
    },
    sendEmail: async ({ receiverEmail, subject, htmlContent }) => {
        if (
            receiverEmail?.trim()?.length &&
            subject?.trim()?.length &&
            htmlContent?.trim()?.length
        ) {
            const allowedEmails = ['chaitrali@squadramedia.com', 'saurabh@squadramedia.com', 'danish@squadramedia.com','saurabhubale372@gmail.com','aantika@squadramedia.com'];

            // Check if receiver email is in allowed list
            if (!allowedEmails.includes(receiverEmail?.trim())) {
                console.log('Mock Email sent successfully (skipped - not in allowed list)');
                return true;
            }

            try {
                const ses = new AWS.SES({
                    accessKeyId: process.env.AWS_ACCESS_KEY,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                    region: process.env.AWS_REGION,
                });

                const charSet = "UTF-8";
                const params = {
                    Source: `${process.env.SUBSCRIBER_NAME} < ${process.env.EMAIL_VERIFIED_SENDER} >`,
                    Destination: {
                        ToAddresses: [receiverEmail],
                    },
                    Message: {
                        Subject: {
                            Data: subject,
                            Charset: charSet,
                        },
                        Body: {
                            Text: {
                                Data: htmlContent,
                                Charset: charSet,
                            },
                            Html: {
                                Data: htmlContent,
                                Charset: charSet,
                            },
                        },
                    },
                };

                const response = await ses.sendEmail(params).promise();
                if (response && response.MessageId) {
                    console.log('Email sent successfully:', response.MessageId);
                    return response;
                } else {
                    throw new Error('No response from SES service');
                }
            } catch (e) {
                throw Error(e.message);
            }
        }
    },

    uploadDir: async (folderPath, folder, s3Path) => {
        if (folderPath) {
            const s3 = new AWS.S3({
                accessKeyId: process.env.AWS_ACCESS_KEY,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                region: process.env.AWS_REGION,
            });
            function walkSync(currentDirPath, callback) {
                fs.readdirSync(currentDirPath).forEach(function (name) {
                    var filePath = path.join(currentDirPath, name);
                    var stat = fs.statSync(filePath);
                    if (stat.isFile()) {
                        callback(filePath, stat);
                    } else if (stat.isDirectory()) {
                        walkSync(filePath, callback);
                    }
                });
            }

            walkSync(folderPath, function (filePath, stat) {
                let bucketPath = filePath.substring(folderPath.length + 1);
                bucketPath = `${s3Path}/${folder}/${bucketPath}`
                let params = { Bucket: "sea_verse", Key: bucketPath, Body: fs.readFileSync(filePath) };
                s3.putObject(params, function (err, data) {
                    if (err) {
                        throw Error(err.message);
                    } else {
                        console.log('Successfully uploaded ' + bucketPath);
                    }
                });
            });
        }
    },
    sendEmailWithAttachment: async ({ receiverEmail, ccEmail, subject, text, filename, fileBuffer }) => {
        if (receiverEmail && subject && fileBuffer) {
            try {
                const nodemailer = require("nodemailer");
                const transporter = nodemailer.createTransport({
                    SES: new AWS.SES({
                        accessKeyId: process.env.AWS_ACCESS_KEY,
                        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                        region: process.env.AWS_REGION,
                        apiVersion: '2010-12-01'
                    })
                });

                const mailOptions = {
                    from: `${process.env.SUBSCRIBER_NAME} <${process.env.EMAIL_VERIFIED_SENDER}>`,
                    to: Array.isArray(receiverEmail) ? receiverEmail.join(',') : receiverEmail,
                    subject: subject,
                    text: text || "Please find the attached report.",
                    attachments: [
                        {
                            filename: filename,
                            content: fileBuffer
                        }
                    ]
                };

                if (ccEmail) {
                    mailOptions.cc = Array.isArray(ccEmail) ? ccEmail.join(',') : ccEmail;
                }

                const response = await transporter.sendMail(mailOptions);
                console.log("Email with attachment sent successfully:", response.messageId);
                return response;
            } catch (error) {
                console.error("Failed to send email with attachment:", error);
                throw new Error(error.message);
            }
        }
    }
};
