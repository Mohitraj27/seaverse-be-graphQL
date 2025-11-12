
const { CustomError, ErrorName, UploadHelper } = require("../../util");
const XLSX = require('xlsx');
const aws_helper = require("../../util/aws_helper");
const NotificationType = require("../notifications/notification_type.json");
const notificationiconEnum = require("../notifications/notification_icon.json");
const NotificationHelper = require("../notifications/notification_helper");
const ReportsHelper = require("./reports_helper");
const { decrypt, encrypt } = require("../../util/encryption_helper");
//Mongoose Models
const Export = require("../user/exportUser/exportUser_model");
const { OverallTrainingProgress } = require("../training-registrations/overall-course-progress/overall_progress_model");
const { connectDb, closeDb } = require("../../util/child_process_db_helper");
const { customEnrollmentReportQuery, customQuizReportQuery } = require("./reports_query_builder");
const { Types } = require('mongoose'); // If you're using Mongoose
const ObjectId = Types.ObjectId;

const performCustomReportGeneration = async ({ input, subscriberId, userId, userInfo }) => {
    if (!subscriberId) throw new Error("Forbidden: subscriberId is missing."); // Use standard Error here

    try {
        const matchStage = [];
        if (input && Object.keys(input).length > 0) {
            // if (input.dateRange) {
                // const { startDate, endDate } = input.dateRange;

                // if (!startDate || !endDate) {
                //     throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Both startDate and endDate are required when dateRange is provided.");
                // }

                // if (![input.courseIds, input.vesselType, input.vesselName, input.designation, input.learnerStatus, input.courseStatus].some(field => field && field.length > 0)) {
                //     throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Please enter one or more fields.");
                // }

                if (input.courseIds && Array.isArray(input.courseIds) && input.courseIds.length > 0) {
                    matchStage.push({
                        $match: {
                            training: { $in: input.courseIds.map(id => ObjectId(id)) },
                        },
                    });
                }
                if (input.vesselName && Array.isArray(input.vesselName) && input.vesselName.length > 0) {
                    matchStage.push({
                        $match: {
                            'userInfo.currentVessel': { $in: input?.vesselName.map(id => ObjectId(id)) },
                        },
                    });
                }
                if (input.vesselType && Array.isArray(input.vesselType) && input.vesselType.length > 0) {
                    matchStage.push({
                        $match: {
                            'vesselTypeInfo._id': { $in: input?.vesselType.map(id => ObjectId(id)) },
                        },
                    });
                }
                if (input.courseStatus && Array.isArray(input.courseStatus) && input.courseStatus.length > 0) {
                    matchStage.push({
                        $match: {
                            status: { $in: input.courseStatus },
                        },
                    });
                }
                if (input.learnerStatus && Array.isArray(input.learnerStatus) && input.learnerStatus.length > 0 && input.learnerStatus.length < 2) {
                    matchStage.push({
                        $match: {
                            'userInfo.vesselStatus': { $in: input.learnerStatus },
                        },
                    });
                }
                if (input.designation && Array.isArray(input.designation) && input.designation.length > 0) {
                    matchStage.push({
                        "$match": {
                            "employeeInfo.empDesignation": { "$in": input.designation.map(id => ObjectId(id)) }
                        }
                    });
                }
               /*  const dateFilter = {};
                if (startDate) dateFilter['$gte'] = new Date(startDate);
                if (endDate) {
                    const endDateObj = new Date(endDate);
                    endDateObj.setHours(23, 59, 59, 999);
                    dateFilter['$lte'] = endDateObj;
                }
                matchStage.push({ $match: { createdAt: dateFilter } }); */
            // }
        }
        let data;
        let dataToExport = [];
        if (input?.reportType === "ENROLLMENT") {
            const customEnrollmentReportPipeline = customEnrollmentReportQuery(matchStage); // Assume customEnrollmentReportQuery is imported or defined here
            data = await OverallTrainingProgress.aggregate(customEnrollmentReportPipeline);

            data.forEach(item => {
                const learnerName =
                    `${item.firstName ? decrypt(item.firstName, true) : ""} ${
                        item.lastName ? decrypt(item.lastName, true) : ""
                    }`.trim() || "-";
                const enrollmentDate = item?.createdAt
                    ? ReportsHelper.formatDate(item.createdAt)
                    : "Not Applicable";
                const completionDate = item?.endDate
                    ? ReportsHelper.formatDate(item.endDate)
                    : "Not Applicable";
                const startDate =
                    item?.startDate && item.startDate !== "startDate"
                        ? ReportsHelper.formatDate(item.startDate)
                        : "Not Applicable";
                const vesselType = item?.vesselType || "Not Applicable";
                const currentVessel = item?.currentVessel || "Not Applicable";
                const unenrollmentDate = item?.unenrollmentDate
                    ? ReportsHelper.formatDate(item.unenrollmentDate)
                    : "Not Applicable";
                const quizScore = item.quizPercentage
                    ? parseInt(item.quizPercentage) + "%"
                    : "Not Applicable";
                const userState = item.isRegistered ? "Registered" : "Unregistered";
                const timeSpent = item.totalTimeSpent
                    ? ReportsHelper.convertMinutesToHMS(item?.totalTimeSpent)
                    : "00:00:00";
                const adminMarkedAsCompleted = item.adminMarkedAsCompleted ? "Yes" : "No";

                dataToExport.push({
                    Name: learnerName ?? "-",
                    Email: item.email ? decrypt(item.email) : null,
                    "User Id": item.employeeId ? decrypt(item.employeeId) : null,
                    Designation: item.designation || null,
                    "Current Vessel": currentVessel,
                    "Vessel Type": vesselType,
                    "Course Name": item.courseName ? item.courseName[0] : null,
                    "Course Status": item.status || null,
                    "Admin Marked As Completed": adminMarkedAsCompleted,
                    "Course Enrollment Date & Time (UTC)": enrollmentDate,
                    "Course Unenrollment Date & Time (UTC)": unenrollmentDate,
                    "Course Started Date & Time (UTC)": startDate,
                    "Course Completion Date & Time (UTC)": completionDate,
                    "Quiz Score": quizScore,
                    "User State": userState,
                    "Time Spent": timeSpent,
                });
            });
        } else if (input?.reportType === "QUIZ") {
            const customQuizReportPipeline = customQuizReportQuery(matchStage); // Assume customQuizReportQuery is imported or defined here
            data = await OverallTrainingProgress.aggregate(customQuizReportPipeline);

            const flattenDataForSingleSheet = learner => {
                const flattenedData = [];
                if (learner) {
                    const email = learner?.email ? decrypt(learner?.email) : "";
                    const designation = learner?.designation || "";
                    const firstName = learner?.firstName ? decrypt(learner?.firstName, true) : "";
                    const lastName = learner?.lastName ? decrypt(learner?.lastName, true) : "";
                    const empId = learner?.empId ? decrypt(learner?.empId) : "";
                    const currentVessel = learner?.currentVessel || "Not Applicable";
                    const vesselType = learner?.vesselType || "Not Applicable";
                    const status = learner?.status || "Not Applicable";
                    const courseName = learner?.trainingTitle[0]?.value || "Unknown Course";
                    const adminMarkedAsCompleted = learner?.adminMarkedAsCompleted ? "Yes" : "No";
                    const enrollmentDate = learner?.createdAt
                        ? ReportsHelper.formatDate(learner.createdAt)
                        : "Not Applicable";
                    const completionDate = learner?.endDate
                        ? ReportsHelper.formatDate(learner.endDate)
                        : "Not Applicable";
                    const startDate =
                        learner?.startDate && learner.startDate !== "startDate"
                            ? ReportsHelper.formatDate(learner.startDate)
                            : "Not Applicable";
                    const unenrollmentDate = learner?.unenrollmentDate
                        ? ReportsHelper.formatDate(learner.unenrollmentDate)
                        : "Not Applicable";

                    learner.modules.forEach((module, moduleIndex) => {
                        const moduleName = module?.moduleName[0]?.value || "Unnamed Module";
                        const hasQuiz = module?.hasQuiz || false;

                        module?.moduleContents.forEach((content, contentIndex) => {
                            const contentName = content?.contentName[0]?.value || "Unnamed Content";
                            const contentType = content?.contentType || "Not Applicable";
                            const quizScore = content?.percentage || "Not Applicable";
                            const timeSpendInContent = content?.timeSpendInContent
                                ? ReportsHelper.convertMinutesToHMS(content?.timeSpendInContent)
                                : "00:00:00";
                            if (content.contentType === "QUIZ") {
                                flattenedData.push({
                                    Name: `${firstName} ${lastName}`,
                                    Email: email,
                                    "User Id": empId,
                                    Designation: designation,
                                    "Current Vessel": currentVessel,
                                    "Vessel Type": vesselType,
                                    "Course Name": courseName,
                                    "Course Status": status,
                                    "Admin Marked As Completed": adminMarkedAsCompleted,
                                    "Course Enrollment Date & Time (UTC) ": enrollmentDate,
                                    "Course Unenrollment Date & Time (UTC)": unenrollmentDate,
                                    "Course Started Date & Time (UTC)": startDate,
                                    "Course Completion Date & Time (UTC)": completionDate,
                                    "Lesson Name": `${moduleName}`,
                                    "Content Name": `${contentName}`,
                                    // 'Content Type': contentType,
                                    "Quiz Score": quizScore,
                                    "Time Spent": timeSpendInContent,
                                });
                            }
                        });
                    });
                }

                return flattenedData;
            };

            const flattenAllLearnersData = learners => {
                const allFlattenedData = [];
                learners.forEach(learner => {
                    const learnerData = flattenDataForSingleSheet(learner);

                    if (learnerData.length > 0) {
                        allFlattenedData.push(...learnerData);
                        allFlattenedData.push([]);
                    }
                });
                return allFlattenedData;
            };

            dataToExport = flattenAllLearnersData(data);
        }

        let s3PresignedUrl = "";
        const workbook = XLSX.utils.book_new();
        let worksheet;
        if (dataToExport.length === 0) {
           const enrollmentReportHeaders = [
                "Name",
                "Email",
                "User Id",
                "Designation",
                "Current Vessel",
                "Vessel Type",
                "Course Name",
                "Status",
                "Admin Marked As Completed",
                "Course Enrollment Date & Time (UTC)",
                "Course Unenrollment Date & Time (UTC)",
                "Course Started Date & Time (UTC)",
                "Course Completion Date & Time (UTC)",
                "Quiz Score",
                "userState",
                "Time Spent",
            ];

            const quizReportHeaders = [
                "Name",
                "Email",
                "User Id",
                "Designation",
                "Current Vessel",
                "Vessel Type",
                "Course Name",
                "Course Status",
                "Admin Marked As Completed",
                "Course Enrollment Date & Time (UTC)",
                "Course Unenrollment Date & Time (UTC)",
                "Course Started Date & Time (UTC)",
                "Course Completion Date & Time (UTC)",
                "Lesson Name",
                "Content Name",
                "Content Type",
                "Quiz Score",
                "Time Spent",
            ];

            const headers =
                input?.reportType === "ENROLLMENT" ? enrollmentReportHeaders : quizReportHeaders;
            worksheet = XLSX.utils.aoa_to_sheet([headers]);
        } else {
            worksheet = XLSX.utils.json_to_sheet(dataToExport);
        }
        XLSX.utils.book_append_sheet(workbook, worksheet, `${input.reportType}`);
        const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
        const excelFilePath = await UploadHelper.uploadExcel({
            data: excelBuffer,
            folderName: "Custom-Quiz-Reports",
            fileName: `custom ${
                input?.reportType.toLowerCase() ?? ""
            } report - ${await ReportsHelper.generateFileNameTimestamp()}.xlsx`,
            uploadType: UploadHelper.uploadType.exportCustomQuizReport,
        });

        if (excelFilePath) {
            s3PresignedUrl = await aws_helper.fetchFile(excelFilePath);
            // console.log("presignedUrl: ",s3PresignedUrl);
            const notificationMessage =
                input?.reportType == "ENROLLMENT"
                    ? `Custom report is ready to download`
                    : `Quiz report is ready to download`;
            /* await NotificationHelper.createNotificationhelper({
                subscriber: subscriberId,
                titleValue: notificationMessage,
                // messageValue: `The Custom ${input?.reportType.toLowerCase()} report has been successfully generated and exported by ${userInfo?.firstName} ${userInfo?.lastName}.${await ReportsHelper.getAppliedFilters(input)}`,
                notificationType: NotificationType.CUSTOM_REPORT_EXPORT_SUCCESS,
                notifyAllAdmin: false,
                isNotificatonForAdmin: true,
                notifiers: [userInfo._id],
                additionalInfo: [
                    {
                        infoType: "EXPORT_URL",
                        infoData: {
                            filePath: excelFilePath,
                        },
                    },
                ],
                status: "SENT",
                createdBy: userInfo,
                icon: notificationiconEnum.SUCCESS,
            }); */
            
            process.send({
                type: "REPORT_EXPORT_SUCCESS",
                payload: {
                    subscriber: subscriberId,
                    titleValue: notificationMessage,
                    notificationType: NotificationType.REPORT_EXPORT_SUCCESS,
                    notifyAllAdmin: false,
                    isNotificatonForAdmin: true,
                    notifiers: [userInfo._id],
                    additionalInfo: [
                        {
                            infoType: "EXPORT_URL",
                            infoData: {
                                filePath: excelFilePath,
                            },
                        },
                    ],
                    status: "COMPLETED",
                    icon: notificationiconEnum.SUCCESS,
                    createdBy: userInfo,
                    downloadLink: s3PresignedUrl,
                },
            });

        }

        const newReport = new Export({
            filePath: excelFilePath,
            subscriberId: subscriberId,
            createdBy: userId,
            type_of_export: "CUSTOM_REPORT_EXPORT",
            additionalData: [
                {
                    key: "criteria",
                    value: { ...input },
                },
            ],
        });
        await newReport.save();

        console.log("Child process finished successfully.");

    } catch (error) {
        console.error("Error in child process:", error);
        process.send({
            type: "REPORT_EXPORT_FAILED",
            payload: {
                subscriber: subscriberId,
                titleValue: `Custom Report Export Failed`,
                messageValue: `An error occurred while generating the custom report(${await ReportsHelper.getAppliedFilters(
                    input
                )}).`,
                notificationType: NotificationType.REPORT_EXPORT_FAILED,
                notifyAllAdmin: false,
                isNotificatonForAdmin: true,
                notifiers: [userInfo._id],
                status: "FAILED",
                icon: notificationiconEnum.ERROR,
                createdBy: userInfo,
            },
        });
    }
};

const monitorMemory = () => {
    const usage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    console.log(`[MEMORY] Heap used: ${usage}MB`);
    return usage;
};

const memoryInterval = setInterval(monitorMemory, 30000);  // Logs memory every 30 seconds

// This is the entry point for the child process
(async () => {
    // Establish DB connection when the process starts
    await connectDb()

    process.on('message', async (message) => {
        console.log('Child process received a message from parent.');
        const { payload } = message;
        try {
            if (global.gc) {
                global.gc();
                console.log('GC triggered before report generation');
            }

            console.info(`[MEMORY] Before: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
            await performCustomReportGeneration(payload);


            if (global.gc) {
                global.gc();
                console.log('GC triggered after report generation');
            }
            console.info(`[MEMORY] After: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);


        } catch (err) {
            console.error("Error:", err);
        } finally {
            clearInterval(memoryInterval);
            closeDb();
            process.exit(0);
        }
    });
})();

// Graceful shutdown and error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});