const AWS = require("aws-sdk");
var path = require("path");
var fs = require('fs');


module.exports = {
    
    fetchFile: async (filePath) => {
        if (filePath) {
            const s3 = new AWS.S3({
                accessKeyId: process.env.AWS_ACCESS_KEY,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                region: process.env.AWS_REGION,
            });

            const signedUrl = await new Promise((resolve, reject) => {
                const params = {
                    Bucket: process.env.S3_BUCKET,
                    Key: filePath,
                    Expires: 60 * 60 * 5
                };

                s3.getSignedUrl('getObject', params, (error, url) => {
                    if (error) {
                        console.log("aws_helper.fetchFile:error:", error);
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
                };

                s3.upload(params, function (error, data) {
                    if (data) {
                        resolve(data.Location);
                    } else {
                        console.log("aws_helper.uploadFile:error:", error);
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
                        console.log("aws_helper.deleteFile:error:", error);
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
                if (response) {
                    console.log("aws_helper.sendEmail:success");
                    return response;
                }
            } catch (e) {
                console.log("aws_helper.sendEmail:error:", e.message);
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
                        console.log(err)
                    } else {
                        console.log('Successfully uploaded ' + bucketPath);
                    }
                });
            });
        }
    },
};
