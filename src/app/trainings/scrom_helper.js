var fs = require('fs');
const path = require('path');
const extract = require('extract-zip-promise');
const aws_helper = require('../../util/aws_helper');
const { v4: uuidv4 } = require('uuid')
const xpath = require('xpath');
const Xmldom = require('xmldom').DOMParser;
const { promisify } = require('util');
const { accessSafe } = require('access-safe');
const _ = require('lodash');
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const urljoin = require('url-join');
const ScormCloud = require('@rusticisoftware/scormcloud-api-v2-client-javascript');
const { CustomError, ErrorName } = require("../../util");


const APP_ID = "EKGGVZJ3NK";
const SECRET_KEY = "c2Kepfv5vSoz3PO9UcFnZH7ZszY9onBiE3LUb0PU";

const saveResponses = async (uploadPath) => {
    return new Promise(async (resolve, reject) => {
        try {
            const fullPath = path.join(uploadPath, 'uploads.json');
            if (!fs.existsSync(fullPath)) {
                const uploads = {};
                uploads.lastUpdated = new Date();
                uploads.scorms = [];
                uploads.scorms.push(response);
                await writeFile(fullPath, JSON.stringify(uploads)).then(resolve());
            } else {
                await readFile(fullPath).then(async (data) => {
                    const uploads = JSON.parse(data);
                    uploads.scorms.push(response);
                    uploads.lastUpdated = new Date();
                    await writeFile(fullPath, JSON.stringify(uploads)).then(resolve());
                });
            }
        } catch (error) {
            reject(error);
        }
    });
};
module.exports = {
    extractScromPackage: async (input) => {
        if (input.scorm) {
            var dir = './tmp';
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir);
            }

            const { filename, mimetype, createReadStream } = await input.scorm.url;

            const filePath = path.join(__dirname, `../../../tmp/${filename}`)
            const writeStream = fs.createWriteStream(filePath)
            const stream = createReadStream();
            let savedFile = ""
            let id = uuidv4();
            const fileExtractPath = `D:\\hsems\\hsems-api\\uploads\\${id}`
            let bucketFilePath = `files/scrom/${id}`
            await new Promise((resolve, reject) => {
                stream
                    .pipe(
                        writeStream
                    ).on('finish', () => {
                        savedFile = filePath
                        resolve()
                    })
                    .on('error', (err) => {
                        debugger
                        reject()
                    })
            })



            if (!fs.existsSync(fileExtractPath)) {
                fs.mkdirSync(fileExtractPath);
            }

            extract(savedFile, { dir: fileExtractPath }).then(async () => {
                aws_helper.uploadDir(fileExtractPath, id, "files/scrom")
            })
            return bucketFilePath;
        }
        return null;
    },

    cleanUpCourse(courseId, registrationId) {
        const APP_NORMAL = ScormCloud.ApiClient.instance.authentications['APP_NORMAL'];
        APP_NORMAL.username = APP_ID;
        APP_NORMAL.password = SECRET_KEY;
        const courseApi = new ScormCloud.CourseApi();
        courseApi.deleteCourse(courseId, function (error) {
            if (error) {
                throw error;
            }
        });
    },

    uploadToScormCloud: async (scorm) => {
        if (scorm) {
            var dir = './tmp';
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir);
            }

            const { filename, mimetype, createReadStream } = await scorm;

            const filePath = path.join(__dirname, `../../../tmp/${filename}`)
            const writeStream = fs.createWriteStream(filePath)
            const stream = createReadStream();
            let savedFile = ""
            await new Promise((resolve, reject) => {
                stream
                    .pipe(
                        writeStream
                    ).on('finish', () => {
                        savedFile = filePath
                        resolve()
                    })
                    .on('error', (err) => {
                        debugger
                        reject()
                    })
            })

            let id = uuidv4();

            const APP_NORMAL = ScormCloud.ApiClient.instance.authentications['APP_NORMAL'];
            APP_NORMAL.username = APP_ID;
            APP_NORMAL.password = SECRET_KEY;
            const courseApi = new ScormCloud.CourseApi();


            let fileUploaded = fs.createReadStream(savedFile);
            const data = await new Promise((resolve, reject) => {
                courseApi.createUploadAndImportCourseJob(id, { file: fileUploaded }, (error, data) => {
                    if (error) {
                        return reject("Error");
                    }
                    resolve(data);
                });
            });

            const jobId = data.result;

            const courseInfo = await new Promise((resolve, reject) => {
                const interval = setInterval(() => {
                    courseApi.getImportJobStatus(jobId, (error, data) => {
                        if (error) {
                            clearInterval(interval);
                            return reject(error);
                        }

                        if (data.status === ScormCloud.ImportJobResultSchema.StatusEnum.RUNNING) {
                            return;
                        }

                        clearInterval(interval);

                        if (data.status === ScormCloud.ImportJobResultSchema.StatusEnum.ERROR) {
                            return reject(new CustomError(ErrorName.FORBIDDEN));
                        }

                        resolve(data);
                    });
                }, 1000);
            });
            if (courseInfo && courseInfo.status === ScormCloud.ImportJobResultSchema.StatusEnum.COMPLETE) {
                return {
                    courseId: courseInfo.importResult.course.id,
                }
            }
        }
    },
    buildLaunchUrl: async (input) => {
        const APP_NORMAL = ScormCloud.ApiClient.instance.authentications['APP_NORMAL'];
        APP_NORMAL.username = APP_ID;
        APP_NORMAL.password = SECRET_KEY;
        const registrationApi = new ScormCloud.RegistrationApi();

        const learner = { id: input.learnerId };
        const registration = {
            courseId: input.courseId,
            learner: learner,
            registrationId: input.registrationId ? input.registrationId : uuidv4(),
        };

        if (!input.registrationId) {
            await new Promise((resolve, reject) => {
                registrationApi.createRegistration(registration, {}, (error) => {
                    if (error) {
                        return reject("Error");
                    }
                    resolve();
                });
            });
        }

        const launchLink = await new Promise((resolve, reject) => {
            const settings = { redirectOnExitUrl: "Message" };
            registrationApi.buildRegistrationLaunchLink(
                registration.registrationId,
                settings,
                function (error, data) {
                    if (error) {
                        return reject("Error");
                    }
                    resolve(data.launchLink);
                }
            );
        });
        return { launchLink: launchLink, registrationId: registration.registrationId };
    },
    checkScormCourseStatus: async (registrationId) => {
        const APP_NORMAL = ScormCloud.ApiClient.instance.authentications['APP_NORMAL'];
        APP_NORMAL.username = APP_ID;
        APP_NORMAL.password = SECRET_KEY;
        const registrationApi = new ScormCloud.RegistrationApi();

        const response = await new Promise((resolve, reject) => {
            registrationApi.getRegistrationProgress(registrationId, {}, function (error, data) {
                if (error) {
                    reject(error)
                }
                resolve(data)
            });

        });
        return response;
    }
}