const XLSX = require("xlsx");
const { CustomError, ErrorName, AuthUser, Role, UploadHelper, courseStatus } = require("../../util");
const { connectDb, closeDb } = require("../../util/child_process_db_helper");
const ReportsHelper = require("./reports_helper");
const { singleLearnerEnrollmentReportQuery, singleLearnerModuleReportQuery } = require("./reports_query_builder");
const aws_helper = require("../../util/aws_helper");
const NotificationType = require("../notifications/notification_type.json");
const notificationiconEnum = require("../notifications/notification_icon.json");
const { decrypt } = require("../../util/encryption_helper");
const { Types } = require('mongoose'); // If you're using Mongoose
const ObjectId = Types.ObjectId;

const { OverallTrainingProgress } = require("../training-registrations/overall-course-progress/overall_progress_model");

let memoryInterval;



const performLearnerReportGeneration = async (payload) => {
    const { input, userInfo, subscriberId, reportType } = payload;

    try {

         const matchStage = [];
        let learnerData = [];
        let deteledUsersStage = [];
        let matchUsersFromTrainingProgresses = [];
        if (input && Object.keys(input).length > 0) {
            if (!input?.selectVesselOrLearner) input.selectVesselOrLearner = 'LEARNER';
            const filterInput = input.filter || {};
            if (filterInput?.title) {
                matchStage.push({
                    $match: {
                        "trainingInfo.title.value": {
                            $regex: filterInput.title,
                            $options: 'i'
                        }
                    },
                });
            }

            if (filterInput?.courseIds?.length > 0) {
                matchStage.push({
                    $match: {
                        "training": {
                            $in: Array.isArray(filterInput?.courseIds) ? filterInput?.courseIds : [filterInput?.courseIds],
                        }
                    },
                });
            }

            if (filterInput.courseStatuses !== undefined) {
                if (Array.isArray(filterInput.courseStatuses)) {
                    matchStage.push({
                        $match: {
                            status: { $in: filterInput.courseStatuses }
                        }
                    });
                } else {
                    matchStage.push({
                        $match: { status: filterInput.courseStatuses }
                    });
                }
            }

            if (filterInput.dateRange) {
                const { startDate, endDate } = filterInput.dateRange;

                if (!startDate && !endDate) {
                    throw Error("Both startDate and endDate cannot be missing when dateRange is provided.");
                }

                const dateFilter = {};

                if (startDate) {
                    const startDateObj = new Date(startDate);
                    startDateObj.setHours(0, 0, 0, 0);
                    dateFilter['$gte'] = startDateObj;
                }

                if (endDate) {
                    const endDateObj = new Date(endDate);
                    endDateObj.setHours(23, 59, 59, 999);
                    dateFilter['$lte'] = endDateObj;
                }

                matchStage.push({
                    $match: {
                        createdAt: dateFilter,
                    },
                });
            }

            //on select all and export from main learner funciton use export with this filter
            // is Registered
            if (filterInput?.isRegistered !== undefined) {
                matchStage.push({
                    $match: { 'userInfo.isRegistered': filterInput.isRegistered },
                });
            }

            //current vessel type
            if (filterInput.vesselTypes && Array.isArray(filterInput.vesselTypes) && filterInput.vesselTypes.length > 0) {
                matchStage.push({
                    $match: {
                        'vesselInfo.typeOfVessel': { $in: filterInput.vesselTypes },
                    },
                });
            }
            //current vessel 
            if (filterInput.vesselIds && Array.isArray(filterInput.vesselIds) && filterInput.vesselIds.length > 0) {
                matchStage.push({
                    $match: {
                        'vesselInfo._id': { $in: filterInput.vesselIds },
                    },
                });
            }
            //employee designation
            if (filterInput.designations && Array.isArray(filterInput.designations) && filterInput.designations.length > 0) {
                matchStage.push({
                    $match: {
                        'designationInfo._id': { $in: filterInput.designations },
                    },
                });
            }
            // one users vesselStatus
            if (filterInput.vesselStatus && Array.isArray(filterInput.vesselStatus) && filterInput.vesselStatus.length > 0) {
                matchStage.push({
                    $match: {
                        'userInfo.vesselStatus': { $in: filterInput.vesselStatus },
                    },
                });
            }

            if (input?.filterInput?.includeDeletedUsers) {
                deteledUsersStage = [
                    {
                        $lookup: {
                            from: 'deletedusers',
                            localField: 'user',
                            foreignField: '_id',
                            as: 'deletedUserInfo',
                        },
                    },
                    {
                        $unwind: {
                            path: '$deletedUserInfo',
                            preserveNullAndEmptyArrays: true,
                        },
                    },
                    {
                        $addFields: {
                            userInfo: {
                                $mergeObjects: ['$userInfo', '$deletedUserInfo']
                            }
                        },
                    },
                ];
            } else {
                deteledUsersStage = [
                    {
                        $match: {
                            $and: [
                                {
                                    "userInfo.isDeleted": {
                                        $ne: true
                                    }
                                },
                                {
                                    "employeeInfo.isDeleted": {
                                        $ne: true
                                    }
                                }
                            ]
                        }
                    },
                ];
            }

        }


        //NOT USING THE HELPER FUNCTION SINCE COURSE NAME IS AN ARRAY
        const fieldMapping = {
            "COURSE_NAME": {                // since courseName is an array at the end of aggregation
                $arrayElemAt: [
                    '$courseName', 0
                ]
            },
            "COURSE_STATUS": "$status",
            "LAST_SEEN": "updatedAt",
        };
        const sortingStage = [];
        const sortOrder = input?.sortInput?.sortOrder ?? 1;
        const field = input?.sortInput?.field ?? "COURSE_NAME";
        const fieldPath = fieldMapping[field];


        if (field === "COURSE_STATUS" || field === "COURSE_NAME") {
            sortingStage.push({
                $addFields: {
                    [`lowercase${field}`]: { $toLower: fieldPath }
                }
            });
            sortingStage.push({
                $sort: {
                    [`lowercase${field}`]: sortOrder
                }
            });
        } else if (fieldPath) {
            sortingStage.push({
                $sort: {
                    [fieldPath]: sortOrder
                }
            });
        } else {
            sortingStage.push({
                $addFields: {
                    lowercaseCourseName: {
                        $toLower: {
                            $arrayElemAt: ["$courseName", 0]
                        }
                    }
                }
            });
            sortingStage.push({
                $sort: {
                    lowercaseCourseName: 1
                }
            });
        }
        //-------------------------------

        const skip = input?.pageInput?.skip ? input.pageInput.skip : 0;
        const limit = input?.pageInput?.limit ? input.pageInput.limit : 200;
        const pageLimit = [];
        if (limit > 0 && (!input?.export)) {
            pageLimit.push({ $skip: skip }, { $limit: limit });
        }
        const learnerIds = Array.isArray(input.learnerIds) ? input.learnerIds : input.learnerIds ? [input.learnerIds] : [];

        let matchUsers = [];
        if (learnerIds.length > 0) {
            matchUsers.push(
                {
                    "$match": {
                        "user": { $in: learnerIds.map(id => ObjectId(id)) }
                    }
                }
            );

            matchUsersFromTrainingProgresses.push(
                {
                    "$match": {
                        "user": { $in: learnerIds.map(id => ObjectId(id)) },
                        "status": "COMPLETED"
                    }
                }
            );
        } else {
            matchUsersFromTrainingProgresses.push(
                {
                    "$match": {
                        "status": "COMPLETED"
                    }
                }
            )
        }

        if (input.reportType === "ENROLLMENT") {

            const singleLearnerEnrollmentPipeline = singleLearnerEnrollmentReportQuery({
                matchStage,
                deteledUsersStage,
                matchUsers,
                matchUsersFromTrainingProgresses,
                sortingStage,
                pageLimit,
            });
            console.time('getSingleLearnerReport');
            const learnersReports = (await OverallTrainingProgress.aggregate(singleLearnerEnrollmentPipeline)).map( item => ({
                ...item,
                firstName: item?.firstName ? decrypt(item?.firstName,true) : '',
                lastName: item?.lastName ? decrypt(item?.lastName,true) : '',
            }));
            console.timeEnd('getSingleLearnerReport');
            const learnerReportsByUser = {};
            if (input?.export) {
                learnersReports.forEach(item => {
                    const learnerName = `${item.firstName || ''} ${item.lastName || ''}`.trim() || "-";
                    if (!learnerReportsByUser[learnerName]) {
                        learnerReportsByUser[learnerName] = [];
                    }

                    const enrollmentDate = item?.createdAt ? ReportsHelper.formatDate(item.createdAt) : "Not Applicable";
                    const completionDate = item?.completionDate ? ReportsHelper.formatDate(item.completionDate) : "Not Applicable";
                    const startDate = item?.startDate && item.startDate !== 'startDate'
                        ? ReportsHelper.formatDate(item.startDate)
                        : "Not Applicable";
                    const unenrollmentDate = item?.unenrollmentDate ? ReportsHelper.formatDate(item.unenrollmentDate) : "Not Applicable";

                    const quizScore = (typeof item.quizPercentage === 'string')
                        ? item.quizPercentage
                        : (typeof item.quizPercentage === 'number' && !isNaN(item.quizPercentage))
                            ? item.quizPercentage.toFixed(2)
                            : 'Not Applicable';
                    const userState = item.isRegistered ? "Registered" : "Unregistered";
                    const timeSpent = item.totalTimeSpent ? ReportsHelper.convertMinutesToHMS(item.totalTimeSpent) : '00:00:00';

                    learnerReportsByUser[learnerName].push({
                        Name: learnerName,
                        Email: item?.email ? decrypt(item.email):'' || null,
                        'Country': item.country || 'Not Applicable',
                        'User Id': item.employeeId ? decrypt(item.employeeId) : '' || null,
                        Designation: item.designation || null,
                        'Current Vessel': item.vesselName || 'Not Applicable',
                        'Vessel Type': item.vesselTypeName || 'Not Applicable',
                        'Course Name': item.courseName ? item.courseName[0] : null,
                        'Course Status': item.status || null,
                        'Admin Marked As Completed': item.adminMarkedAsCompleted ? 'Yes' : 'No',
                        'Course Enrollment Date & Time (UTC) ': enrollmentDate,
                        'Course Unenrollment Date & Time (UTC)': unenrollmentDate,
                        'Course Started Date & Time (UTC)': startDate,
                        'Course Completion Date & Time (UTC)': completionDate,
                        'Quiz Score': quizScore,
                        'User State': userState,
                        'Time Spent': timeSpent,
                    });
                });
            } else {
                learnersReports.forEach(item => {
                    const learnerName = `${item.firstName || ''} ${item.lastName ?? ''}`.trim() || "-";
                    if (!learnerReportsByUser[learnerName]) {
                        learnerReportsByUser[learnerName] = [];
                    }

                    learnerReportsByUser[learnerName].push({
                        courseName: item.courseName ? item.courseName[0] : null,
                        status: item.status,
                        Enrollment_Date: item.createdAt,
                        Completion_Date: item.completionDate || "Not Applicable",
                        totalTimeSpent: item.totalTimeSpent || 0,
                        LastSeen: item.updatedAt ? new Date(item.updatedAt).toLocaleString() : 'Not Applicable',
                    });
                });
            }

            let s3PresignedUrl = "";

            if (input?.export) {
                const workbook = XLSX.utils.book_new();
                const combinedData = [];
                for (const learnerName in learnerReportsByUser) {
                    const data = learnerReportsByUser[learnerName];
                    combinedData.push(...data);
                    combinedData.push([]);
                }

                let worksheet;
                if (combinedData.length === 0) {

                    const headers = [
                        "Name",
                        "Email",
                        "Country",
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
                        "Quiz Score",
                        "User State",
                        "Time Spent",
                    ]
                    worksheet = XLSX.utils.aoa_to_sheet([headers]);
                }
                else {
                    worksheet = XLSX.utils.json_to_sheet(combinedData, { header: [] });
                }

                XLSX.utils.book_append_sheet(workbook, worksheet, input.reportType);
                const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });


                const excelFilePath = await UploadHelper.uploadExcel({
                    data: excelBuffer,
                    folderName: `Multiple_Learners_Report_exports`,
                    fileName: `${(input.selectVesselOrLearner).toLowerCase()} enrollment report - ${await ReportsHelper.generateFileNameTimestamp()}.xlsx`,
                    uploadType: UploadHelper.uploadType.exportLearnersCoursesReportAsExcel,
                });
                if (excelFilePath) {
                    s3PresignedUrl = await aws_helper.fetchFile(excelFilePath);
                    console.log("S3 Presigned URL of Enrollment Report\t:", s3PresignedUrl);

                    //SEND NOTIFICATION TO MAIN THREAD

                    const notificationData = {
                        subscriber: subscriberId,
                        titleValue: `Enrollment report is ready to download`,
                        // messageValue: `The selected learner's enrollment report has been successfully generated and exported by ${userInfo?.firstName} ${userInfo?.lastName}.`,
                        notificationType: NotificationType.REPORT_EXPORT_SUCCESS,
                        notifyAllAdmin: false,
                        isNotificatonForAdmin: true,
                        notifiers: [userInfo._id],
                        additionalInfo: [{
                            infoType: "EXPORT_URL",
                            infoData: {
                                filePath: excelFilePath
                            }
                        }],
                        status: 'SENT',
                        createdBy: userInfo,
                        icon: notificationiconEnum.SUCCESS
                    }

                    process.send({
                        type: "REPORT_EXPORT_SUCCESS",
                        payload: notificationData,
                    });
                }
                return {
                    filePath: "",
                    fileName: "",
                    learnerData:[],
                };
            }

            return {
                filePath: "",
                fileName: "",
                learnerData: [],
            };
        }
        else if (input.reportType === "MODULE") {

            const singleLearnerModulePipeline = singleLearnerModuleReportQuery({
                matchUsers,
                matchStage,
                deteledUsersStage,
            });

            const learnersData = await OverallTrainingProgress.aggregate(singleLearnerModulePipeline);
            let s3PresignedUrl = "";
            if (input?.export) {
                const flattenDataForSingleSheet = (learner) => {
                    const flattenedData = [];
                    if (learner) {

                        const email = learner?.email ? decrypt(learner?.email) : '';
                        const designation = learner?.designation || '';
                        const firstName = learner?.firstName ? decrypt(learner?.firstName,true) : '';
                        const lastName = learner?.lastName ? decrypt(learner?.lastName,true) : '';
                        const country = learner?.country || 'Not Applicable';
                        const currentVessel = learner?.currentVessel || 'Not Applicable';
                        const vesselType = learner?.vesselType || 'Not Applicable';
                        const status = learner?.status || 'Not Applicable';
                        const isAdminMarkedAsCompleted = learner?.adminMarkedAsCompleted ? 'Yes' : 'No';
                        const courseName = learner?.trainingTitle[0]?.value || 'Unknown Course';
                        const enrollmentDate = learner?.createdAt ? ReportsHelper.formatDate(learner?.createdAt) : "Not Applicable";
                        const completionDate = learner?.endDate ? ReportsHelper.formatDate(learner?.endDate) : "Not Applicable";
                        const startDate = learner?.startDate && learner?.startDate !== 'startDate'
                            ? ReportsHelper.formatDate(learner?.startDate)
                            : "Not Applicable";
                        const unenrollmentDate = learner?.unenrollmentDate ? ReportsHelper.formatDate(learner?.unenrollmentDate) : "Not Applicable";


                        learner.modules.forEach((module, moduleIndex) => {
                            const moduleName = module?.moduleName[0]?.value || 'Unnamed Module';
                            const hasQuiz = module?.hasQuiz || false;


                            module?.moduleContents.forEach((content, contentIndex) => {
                                const contentName = content?.contentName[0]?.value || 'Unnamed Content';
                                const contentType = content?.contentType || 'NOT APPLICABLE';
                                const quizScore = content?.percentage || 'NOT APPLICABLE';
                                const timeSpendInContent = content?.timeSpendInContent ? ReportsHelper.convertMinutesToHMS(content?.timeSpendInContent) : '00:00:00';

                                flattenedData.push({
                                    Name: `${firstName} ${lastName}`,
                                    Email: email,
                                    Country: country,
                                    'User Id': learner?.empId ? decrypt(learner?.empId) :'Not Applicable',
                                    Designation: designation,
                                    'Current Vessel': currentVessel,
                                    'Vessel Type': vesselType,
                                    'Course Name': courseName,
                                    'Course Status': status,
                                    'Admin Marked As Completed': isAdminMarkedAsCompleted,
                                    'Course Enrollment Date & Time (UTC) ': enrollmentDate,
                                    'Course Unenrollment Date & Time (UTC)': unenrollmentDate,
                                    'Course Started Date & Time (UTC)': startDate,
                                    'Course Completion Date & Time (UTC)': completionDate,
                                    'Lesson Name': `${moduleName}`,
                                    'Content Name': `${contentName}`,
                                    'Content Type': contentType,
                                    'Quiz Score': quizScore,
                                    'Time Spent': timeSpendInContent,
                                });
                            });
                        });
                    }

                    return flattenedData;
                };
                const exportToExcelWithMultipleSheets = async (learnersData) => {
                    const workbook = XLSX.utils.book_new();

                    const combinedData = [];

                    learnersData.forEach(learner => {
                        const learnerData = flattenDataForSingleSheet(learner);
                        combinedData.push(...learnerData);
                        combinedData.push([]);
                    });

                    let worksheet;
                    if (learnersData.length === 0) {

                        worksheet = XLSX.utils.aoa_to_sheet([
                            [
                                "Name",
                                "Email",
                                "Country",
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
                            ]
                        ]);
                    }
                    else {
                        worksheet = XLSX.utils.json_to_sheet(combinedData, { header: [] });
                    }
                    XLSX.utils.book_append_sheet(workbook, worksheet, input.reportType);
                    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

                    const excelFilePath = await UploadHelper.uploadExcel({
                        data: excelBuffer,
                        folderName: "Multiple_Learners_Report_exports",
                        fileName: `${(input.selectVesselOrLearner).toLowerCase()} module level report - ${await ReportsHelper.generateFileNameTimestamp()}.xlsx`,
                        uploadType: UploadHelper.uploadType.exportLearnersCoursesReportAsExcel,
                    });

                    return excelFilePath;
                };

                const excelFilePath = await exportToExcelWithMultipleSheets(learnersData);

                if (excelFilePath) {
                    s3PresignedUrl = await aws_helper.fetchFile(excelFilePath);
                    console.log("S3 Presigned URL of Module Level Report\t:", s3PresignedUrl);

                    //SEND NOTIFICATION TO MAIN THREAD
                    const notificationData = {
                        subscriber: subscriberId,
                        titleValue: `Module level report is ready to download`,
                        // messageValue: `The selected learner's module wise report has been successfully generated and exported by ${userInfo?.firstName} ${userInfo?.lastName}.`,
                        notificationType: NotificationType.REPORT_EXPORT_SUCCESS,
                        notifyAllAdmin: false,
                        isNotificatonForAdmin: true,
                        notifiers: [userInfo._id],
                        additionalInfo: [
                            {
                                infoType: "EXPORT_URL",
                                infoData: {
                                    filePath: excelFilePath
                                }
                            }
                        ],
                        status: 'SENT',
                        createdBy: userInfo,
                        icon: notificationiconEnum.SUCCESS
                    }

                    process.send({
                        type: "REPORT_EXPORT_SUCCESS",
                        payload: notificationData,
                    });

                }

                

                return {
                    filePath: '',
                    fileName: '',
                    learnerData: [],
                };
            }

            return {
                filePath: "",
                fileName: "",
                learnerData: [],
            };
        }
       
    } catch (err) {
        console.error("Error during report generation:", err);

        const notificationData = {
            subscriber: subscriberId,
            titleValue: `Learners Report Export Failed`,
            messageValue: `An error occurred while generating the learners report: ${err.message}`,
            notificationType: NotificationType.REPORT_EXPORT_FAILED,
            notifiers: [userInfo._id],
            status: 'FAILED',
            icon: notificationiconEnum.ERROR,
            createdBy: userInfo,
        };

        process.send({
            type: "REPORT_EXPORT_FAILED",
            payload: notificationData,
        });
    }
};

// Main execution
(async () => {
    await connectDb();

    memoryInterval = setInterval(() => {
        const used = process.memoryUsage().heapUsed / 1024 / 1024;
        console.info(`[MEMORY] Interval: ${Math.round(used)}MB`);
    }, 15000); // Optional monitoring interval

    process.on('message', async (message) => {
        console.log('Child process received a message from parent.');
        const  payload  = message;
        console.log('Payload:', message);
        try {
            if (global.gc) {
                global.gc();
                console.log('GC triggered before report generation');
            }

            console.info(`[MEMORY] Before: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
            await performLearnerReportGeneration(payload);

            if (global.gc) {
                global.gc();
                console.log('GC triggered after report generation');
            }

            console.info(`[MEMORY] After: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
        } catch (err) {
            console.error("Error in child process:", err);
        } finally {
            clearInterval(memoryInterval);
            closeDb();
            process.exit(0);
        }
    });
})();
