const { Moment, ObjectId, PubSubHelper, ConsoleLog } = require("../../tools");
const { CustomError, ErrorName, AuthUser, Role, UploadHelper, courseStatus } = require("../../util");
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { TrainingRegistration } = require("../training-registrations/training_registration_model");
const { Training } = require("../trainings/training_model");
const { Employee } = require("../user/employee/employee_model");
const Permission = require("../user/sub-roles/permission.json");
const aws_helper = require("../../util/aws_helper");
const { OverallTrainingProgress } = require("../training-registrations/overall-course-progress/overall_progress_model")
const { Vessel } = require("../vessle/vessel_model")
const {
    TrainingRegistrationInvoice,
} = require("../training-registrations/training-registration-invoices/training_registration_invoice_model");
const { SystemStatsEmailConfig } = require("./system_stats_email_config_model");

const SubRoleHelper = require("../user/sub-roles/sub_role_helper");
const NotificationType = require("../notifications/notification_type.json");
const notificationiconEnum = require("../notifications/notification_icon.json");
const NotificationHelper = require("../notifications/notification_helper");
const Export = require("../user/exportUser/exportUser_model");
const { User } = require("../user/user_model");
const ReportsHelper = require("./reports_helper");
const { pipeline } = require("stream");
const { decrypt, encrypt } = require("../../util/encryption_helper");
const { singleLearnerEnrollmentReportQuery, singleLearnerModuleReportQuery, customEnrollmentReportQuery, customQuizReportQuery } = require("./reports_query_builder");
const { fork } = require("child_process");
const NotificationEvent = require("../notifications/notification_event.json");
const { searchEmployeesFromElastic } = require("../../util/elastic_helper");

const getMainLearnersReport = async ({ input }, context) => {
    const { subscriberId, userInfo } = AuthUser(context);
    if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
    let selectVesselOrLearner = "VESSEL";
    if (input?.selectVesselOrLearner) {
        selectVesselOrLearner = input?.selectVesselOrLearner;
    }
    try {
        const matchStage = [];
        // let deteledUsersStage = [];
        let elasticFilterInput = {};
        if (input && Object.keys(input).length > 0) {
            const filterInput = input.filterInput || {};
            const searchString = filterInput.search || '';

            if (searchString.trim() !== '') {
                const regexSearch = new RegExp(searchString.trim(), 'i');

                const isRegisteredSearch = searchString.trim().toLowerCase() === 'true' ? true : searchString.trim().toLowerCase() === 'false' ? false : null;
                const searchConditions = [
                    { 'userInfo.firstName': { $regex: regexSearch } },
                    { 'userInfo.lastName': { $regex: regexSearch } },
                    { 'userInfo.civilIdOrPassport': { $regex: regexSearch } },
                    { 'employeeDesignation.name': { $regex: regexSearch } },
                    { 'userInfo.email': { $regex: regexSearch } },
                    { 'vesselDetails.name': { $regex: regexSearch } },
                ];

                if (isRegisteredSearch !== null) {
                    searchConditions.push({ 'userInfo.isRegistered': isRegisteredSearch });
                }

                matchStage.push({
                    $match: {
                        $or: searchConditions
                    }
                });
            }

            elasticFilterInput = {
                search: filterInput.search || '',
                vesselType : filterInput.vesselTypes || [],
                vesselName: filterInput.vesselIds || [],
                empDesignation: filterInput.designations || [],
                vesselStatus: filterInput.userVesselStatus || [],
                isRegistered: filterInput.isRegistered,
                includeDeletedUsers: input?.filterInput?.includeDeletedUsers,
            }

/* 
            if (filterInput.vesselTypes && Array.isArray(filterInput.vesselTypes) && filterInput.vesselTypes.length > 0) {
                matchStage.push({
                    $match: {
                        'vesselDetails.typeOfVessel': { $in: filterInput.vesselTypes },
                    },
                });
            }

            if (filterInput.vesselIds && Array.isArray(filterInput.vesselIds) && filterInput.vesselIds.length > 0) {
                matchStage.push({
                    $match: {
                        'vesselDetails._id': { $in: filterInput.vesselIds },
                    },
                });
            }

            if (filterInput.designations && Array.isArray(filterInput.designations) && filterInput.designations.length > 0) {
                matchStage.push({
                    $match: {
                        'employeeDesignation._id': { $in: filterInput.designations },
                    },
                });
            }

            if (filterInput.userVesselStatus && Array.isArray(filterInput.userVesselStatus) && filterInput.userVesselStatus.length > 0) {
                matchStage.push({
                    $match: {
                        'vesselInfo.vesselStatus': { $in: filterInput.userVesselStatus },
                    },
                });
            }

            if (filterInput.isRegistered !== undefined) {
                matchStage.push({
                    $match: { 'userInfo.isRegistered': filterInput.isRegistered },
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
                            $or: [
                                {
                                    "userInfo.isDeleted": {
                                        $ne: true
                                    }
                                },
                                {
                                    isDeleted: {
                                        $ne: true
                                    }
                                }
                            ]
                        }
                    },
                ];
            } */

        }

        // const sortingStage = [];
        const sortOrder = input?.sortInput?.sortOrder ?? 1;

        /* const fieldMapping = {
            "FIRST_NAME": "name",
            "LAST_SEEN": "lastSeen",
        }; */

        const field = input?.sortInput?.field ?? "FIRST_NAME";
        // const fieldPath = fieldMapping[field];
        //keeping this "FIRST_NAME" if-condition only for future reference (there is a chance that designations and vesselnames will come as sortable fields)
        /* if (field === "FIRST_NAME") {
            sortingStage.push({
                $addFields: {
                    [`lowercase${field}`]: { $toLower: `$${fieldPath}` }
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
                    lowercaseFirstname: { $toLower: "$name" }
                }
            });
            sortingStage.push({
                $sort: {
                    lowercaseFirstname: 1
                }
            });
        }
 */
        const skip = input?.pageInput?.skip ? input.pageInput.skip : 0;
        const limit = input?.pageInput?.limit ? input.pageInput.limit : 20;
        const pageLimit = [];
        if (limit > 0 && (!input?.export)) {
            pageLimit.push({ $skip: skip }, { $limit: limit });
        }
        console.time('getMainLearnersReport'); 
        const sortOrderMap = {
            "1": "asc",
            "-1": "desc",
        };
        const esFieldMapping = {
            "FIRST_NAME": "firstName.keyword",
            "LAST_SEEN": "lastLoginAt",
        };

        const sortElasticField = esFieldMapping[field] || "user.firstName.keyword";
        const sortElasticOrder = sortOrderMap[String(sortOrder)] || "asc";

        const employeesData = await searchEmployeesFromElastic({
            indexName: "users",
            filterInput: elasticFilterInput,
            sortField: sortElasticField,
            sortOrder: sortElasticOrder,
            skip: skip,
            limit: limit,
            reports: true,
        });
        const decryptedData = employeesData?.employees?.map(user => ({
            coursesCount: user.enrolledCourses ?? 0,
            averageProgressPercentage: user.averageCourseProgress ?? 0,
            latestUpdatedAt: new Date(user.updatedAt),

            name: (user.firstName || user.lastName)
                ? `${decrypt(user.firstName ?? '',true)} ${decrypt(user.lastName ?? '',true)}`.trim()
                : ' ',

            isRegistered: user.isRegistered ?? false,
            learnerId: user.userId ?? '',
            isDeleted: user.isDeleted ?? false,
            EmployeeId: user.civilIdOrPassport ? decrypt(user.civilIdOrPassport) : ' ',
            email: user.email ? decrypt(user.email) : ' ',
            designation: user.designation ?? '',
            designationId: user.empDesignation ?? '',
            lastSeen: user.lastLoginAt ? new Date(user.lastLoginAt) : null,
            vesselName : user.vesselName ?? null,
            vesselTypeName : user.typeOfVesselName ?? null,
            vesselId: user.currentVessel ?? null,
            vesselTypeId: user.tyepOfVesselId ?? null,
        }));
        console.timeEnd('getMainLearnersReport');
        
       
        let s3PresignedUrl = "";

        if (input?.export) {

            const data = employeesData?.map(item => ({
                Name: ((item.firstName && item.lastName) || item.firstName) ? `${decrypt(item.firstName)} ${decrypt(item?.lastName) ?? ''}` : ' ',
                EmployeeId: item.EmployeeId ? decrypt(item?.EmployeeId) : ' ',
                Designation: item.designation,
                VesselName: item.vesselName,
                RegistrationStatus: item.isRegistered ? 'REGISTERED' : 'UNREGISTERED',
                LastSeen: item.lastSeen ? new Date(item.lastSeen).toLocaleString() : ' ',
                IsDeleted: item.isDeleted ? 'Yes' : 'No',
                vesselTypeName: item.vesselTypeName,
                CoursesCount: item.coursesCount,
                AverageProgressPercentage: item?.averageProgressPercentage ? parseInt(item.averageProgressPercentage).toFixed(2) : 0,
            }));
            const workbook = XLSX.utils.book_new();
            let worksheet;
            if (data.length === 0) {

                worksheet = XLSX.utils.aoa_to_sheet([['Name', 'EmployeeId', 'Designation', 'VesselName', 'RegistrationStatus', 'LastSeen', 'IsDeleted', 'vesselTypeName', 'CoursesCount', 'AverageProgressPercentage']]);
            }
            else {
                worksheet = XLSX.utils.json_to_sheet(data);
            }
            XLSX.utils.book_append_sheet(workbook, worksheet, `OVERVIEW`);
            const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
            let fileNameStd = selectVesselOrLearner?.charAt(0).toUpperCase() + selectVesselOrLearner?.slice(1).toLowerCase();
            const excelFilePath = await UploadHelper.uploadExcel({
                data: excelBuffer,
                folderName: "All_learners_Report_exports",
                fileName: `${fileNameStd}_Report-${await ReportsHelper.generateFileNameTimestamp()}.xlsx`,
                uploadType: UploadHelper.uploadType.exportLearnersReportAsExcel,
            });
            if (excelFilePath) {
                s3PresignedUrl = await aws_helper.fetchFile(excelFilePath);
                await NotificationHelper.createNotificationhelper({
                    subscriber: subscriberId,
                    titleValue: `${fileNameStd} Report Exported Successfully`,
                    messageValue: `The ${selectVesselOrLearner} report has been successfully generated and exported by ${decrypt(userInfo?.firstName,true)} ${decrypt(userInfo?.lastName,true) ?? ""}.`,
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
                });
            }
            return {
                filePath: s3PresignedUrl,
                fileName: path.basename(excelFilePath),
                employeesData
            };
        }
        return {
            employeesData : decryptedData,
        };
    } catch (err) {
        if (input?.export) {
            await NotificationHelper.createNotificationhelper({
                subscriber: subscriberId,
                titleValue: `${input.selectVesselOrLearner} Report Export Failed`,
                messageValue: `An error occurred while generating the ${input.selectVesselOrLearner} report: ${err.message} by ${decrypt(userInfo?.firstName,true)} ${decrypt(userInfo?.lastName,true)}. `,
                notificationType: NotificationType.REPORT_EXPORT_FAILED,
                notifyAllAdmin: false,
                isNotificatonForAdmin: true,
                notifiers: [userInfo._id],
                status: 'FAILED',
                icon: notificationiconEnum.ERROR,
                createdBy: userInfo,
            });
        }
        throw Error(err.message);
    }
};

/**
 * Handles the synchronous, paginated request for an enrollment report.
 */
const getPaginatedEnrollmentReport = async (pipeline) => {
    try {
        const learnersReports = (await OverallTrainingProgress.aggregate(pipeline)).map(item => ({
            ...item,
            firstName: item?.firstName ? decrypt(item?.firstName, true) : '',
            lastName: item?.lastName ? decrypt(item?.lastName, true) : '',
        }));

        return {
            filePath: "",
            fileName: "",
            learnerData: learnersReports,
        };
    } catch (error) {
        console.error("Error in getPaginatedEnrollmentReport:", error);
        return {
            filePath: "",
            fileName: "",
            learnerData: [],
        };
    }
};

const getSingleLearnerReport = async ({ input }, context) => {
    const { subscriberId, userInfo } = AuthUser(context);
    if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

    const isExportRequired = !!input?.export;

    // --- If an export is requested, delegate to the child process ---
    if (isExportRequired) {
        try {
            // Fork a new process, giving it the path to our exporter script
            const child = fork(path.resolve(__dirname, "learner_report_generator.js"),[],{execArgv : ["--expose-gc"]}); // expose gc is used to expose the garbage collector in the child process

            // Handle any errors during the creation of the child process
            child.on("error", err => {
                console.error("Failed to start child process.", err);
                // You might want to send a failure notification here as a fallback
            });

            // Optional: listen for the child process to exit
            child.on("exit", code => {
                console.log(`Child process exited with code ${code}`);
            });

            child.on("message", async msg => {
                if (msg.type === "REPORT_EXPORT_SUCCESS" || msg.type === "REPORT_EXPORT_FAILED") {
                    try {
                        await NotificationHelper.createNotificationhelper(msg.payload);
                    } catch (err) {
                        console.error("Failed to send notification from parent:", err);
                    }
                }
            });

            // Send the necessary data to the child process
            child.send({
                input,
                userInfo,
                subscriberId,
                reportType: input.reportType,
            });

            // Immediately return a response to the user
            return {
                filePath: "",
                fileName: "",
                learnerData: [],
            };
        } catch (forkError) {
            // Handle case where the process fails to even start
            
            // await NotificationHelper.createNotificationhelper({
            //     /* ... failure notification ... */
            // });

            throw new Error(`Failed to start the report generation process: ${forkError.message}`);
        }
    }

    // --- If no export is required, handle the request synchronously on the main thread ---
    // (Only Enrollment report supports non-export paginated view in this design)
    /* if (input.reportType !== "ENROLLMENT") {
        throw new Error("Module reports are available for export only.");
    } */

    try {

        const {
            matchStage,
            deletedUsersStage,
            matchUsers,
            matchUsersFromTrainingProgresses,
            sortingStage,
            pageLimit,
        } = ReportsHelper.buildLearnerAggregationPipelineFilterStages(input);

        const enrollmentPipeline = singleLearnerEnrollmentReportQuery({
            matchStage,
            deletedUsersStage,
            matchUsers,
            matchUsersFromTrainingProgresses,
            sortingStage,
            pageLimit,
        });

        return await getPaginatedEnrollmentReport(enrollmentPipeline);
    } catch (err) {
        console.error("Error in getSingleLearnerReport:", err);
        // This catch block now only handles errors from the synchronous (non-export) path
        // The child process handles its own errors and notifications.
        throw Error(err.message);
    }
};

const getMainCoursesReport = async ({ input }, context) => {
    const { subscriberId, userInfo } = AuthUser(context);
    if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

    try {
        input = input || {};

        const matchStage = [];
        if (Object.keys(input).length > 0) {
            const filterInput = input.filterInput || {};

            if (filterInput.name) {
                matchStage.push({
                    $match: {
                        'title.value': { $regex: filterInput.name, $options: 'i' },
                    },
                });
            }

            if (filterInput.isDeleted !== undefined) {
                matchStage.push({ $match: { 'trainingInfo.isDeleted': filterInput.isDeleted } });
            }

            if (filterInput?.ids?.length > 0) {
                matchStage.push({
                    $match: {
                        _id: { $in: filterInput.ids },
                    },
                });
            }

        }

        const skip = input?.pageInput?.skip ? input.pageInput.skip : 0;
        const limit = input?.pageInput?.limit ? input.pageInput.limit : 20;
        const pageLimit = [];
        if (limit > 0 && (!input?.export)) {
            pageLimit.push({ $skip: skip }, { $limit: limit });
        }


        const fieldMapping = {
            "COURSE_NAME": "lowercaseTitle",
            "LAST_MODIFIED": "updatedAt",
            "TOTAL_ENROLLMENTS": "totalUsers",
        };
        const sortStage = await ReportsHelper.generateSortingStage(fieldMapping, [], "COURSE_NAME", input?.sortInput);
        const data = await Training.aggregate([
            {
                $sort: {
                    updatedAt: -1,
                }
            },
            {
                $match: {
                    status: "PUBLISHED"
                }
            },
            {
                $lookup: {
                    from: 'overalltrainingprogresses',
                    localField: '_id',
                    foreignField: 'training',
                    as: 'progress',
                },
            },
            {
                $unwind: {
                    path: '$progress',
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'progress.user',
                    foreignField: '_id',
                    as: 'userInfo',
                    pipeline: [
                        {
                            $match: {
                                isDeleted: false,
                                isSignupAdminAprroved: { $ne: false }
                            }
                        }
                    ]
                },
            },
            {
                $unwind: {
                    path: '$userInfo',
                    preserveNullAndEmptyArrays: false,
                },
            },
            {
                $lookup:
                {
                    from: "employees",
                    localField: "progress.user",
                    foreignField: "_id",
                    as: "empDetails",
                    pipeline: [
                        {
                            $match: {
                                isDeleted: false
                            }
                        }
                    ]
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'updatedBy',
                    foreignField: '_id',
                    as: 'updatedByUser',
                },
            },
            {
                $unwind: {
                    path: '$updatedByUser',
                    preserveNullAndEmptyArrays: true,
                },
            },
            ...matchStage,
            {
                $sort: {
                    updatedAt: -1,
                }
            },
            {
                $project: {
                    id: 1,
                    title: 1,
                    updatedAt: 1,
                    training: "$progress.training",
                    updatedBy: "$updatedByUser.firstName",
                    updatedByLastName:
                        "$updatedByUser.lastName",
                    user: "$progress.user",
                    status: "$progress.status"
                }
            },
            {
                $group: {
                    _id: "$training",
                    title: {
                        $first: "$title"
                    },
                    updatedAt: {
                        $max: "$updatedAt"
                    },
                    updatedBy: {
                        $first: "$updatedBy"
                    },
                    updatedByLastName: {
                        $first: "$updatedByLastName"
                    },
                    uniqueUsers: {
                        $addToSet: "$user"
                    },
                    usersByStatus: {
                        $push: {
                            user: "$user",
                            status: "$status"
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 1,
                    title: 1,
                    lowercaseTitle: {
                        $toLower: { $arrayElemAt: ["$title.value", 0] }
                    },
                    updatedAt: 1,
                    updatedBy: {
                        $concat: [
                            '$updatedBy',
                            ' ',
                            '$updatedByLastName',
                        ],
                    },
                    totalUsers: { $size: '$uniqueUsers' },
                    statusCounts: {
                        NOT_STARTED: {
                            $size: {
                                $filter: {
                                    input: '$usersByStatus',
                                    as: 'entry',
                                    cond: { $eq: ['$$entry.status', 'NOT_STARTED'] },
                                },
                            },
                        },
                        IN_PROGRESS: {
                            $size: {
                                $filter: {
                                    input: '$usersByStatus',
                                    as: 'entry',
                                    cond: { $eq: ['$$entry.status', 'IN_PROGRESS'] },
                                },
                            },
                        },
                        COMPLETED: {
                            $size: {
                                $filter: {
                                    input: '$usersByStatus',
                                    as: 'entry',
                                    cond: { $eq: ['$$entry.status', 'COMPLETED'] },
                                },
                            },
                        },
                    },
                },
            },
            {
                $sort: {
                    updatedAt: -1,
                }
            },
            ...sortStage,
            ...pageLimit,
        ]);
        const coursesData = data.map(item => ({
            _id: item._id,
            title: item.title,
            updatedAt: new Date(item.updatedAt).toLocaleString(),
            updatedBy: item.updatedBy,
            totalUsers: item.totalUsers,
            NOT_STARTED: item.statusCounts.NOT_STARTED,
            IN_PROGRESS: item.statusCounts.IN_PROGRESS,
            COMPLETED: item.statusCounts.COMPLETED,
        }));

        let s3PresignedUrl = "";

        if (input?.export) {
            const workbook = XLSX.utils.book_new();
            let worksheet;
            if (data.length === 0) {
                /*
                const message = "NO DATA AVAILABLE FOR COURSE REPORTS";
                worksheet = XLSX.utils.aoa_to_sheet([
                    [message]
                ]);
    
                const columnSpan = 20;
    
                const range = { s: { r: 0, c: 0 }, e: { r: 0, c: columnSpan - 1 } };
                if (!worksheet['!merges']) worksheet['!merges'] = [];
                worksheet['!merges'].push(range);
    
    
                worksheet['A1'].s = {
                    font: {
                        bold: true,
                        size: 14,
                    },
                    alignment: {
                        horizontal: 'center',
                        vertical: 'center',
                    }
                };
    
                worksheet['!rows'] = [{ hpt: 30 }]; 
                */

                worksheet = XLSX.utils.aoa_to_sheet([
                    [
                        "title",
                        "updatedAt",
                        "updatedBy",
                        "totalUsers",
                        "NOT_STARTED",
                        "IN_PROGRESS",
                        "COMPLETED"
                    ]
                ]);
            }
            else {
                worksheet = XLSX.utils.json_to_sheet(coursesData);
            }
            XLSX.utils.book_append_sheet(workbook, worksheet, `Courses Report-${Date.now()}`);
            const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
            const excelFilePath = await UploadHelper.uploadExcel({
                data: excelBuffer,
                folderName: "Courses_Report_exports",
                fileName: `Courses_Report-${Date.now()}.xlsx`,
                uploadType: UploadHelper.uploadType.exportLearnersCoursesReportAsExcel,
            });
            if (excelFilePath) {
                s3PresignedUrl = await aws_helper.fetchFile(excelFilePath);
                await NotificationHelper.createNotificationhelper({
                    subscriber: subscriberId,
                    titleValue: `Courses Report Exported Successfully`,
                    messageValue: `The Courses report has been successfully generated and exported by ${decrypt(userInfo?.firstName, true)} ${decrypt(userInfo?.lastName,true) ?? ""}.`,
                    notificationType: NotificationType.COURSE_REPORT_EXPORT_SUCCESS,
                    notifyAllAdmin: false,
                    isNotificatonForAdmin: true,
                    notifiers: [userInfo._id],
                    additionalInfo: [
                        {
                            infoType: "EXPORT_URL",
                            infoData: {
                                filePath: excelFilePath
                            },
                        }
                    ],
                    status: 'SENT',
                    createdBy: userInfo,
                    icon: notificationiconEnum.SUCCESS
                });
            }
            return {
                filePath: s3PresignedUrl,
                fileName: path.basename(excelFilePath),
                coursesData,
            };
        }

        return {
            coursesData,
        };

    } catch (err) {
        if (input?.export) {
            await NotificationHelper.createNotificationhelper({
                subscriber: subscriberId,
                titleValue: `Main Course Report Export Failed`,
                messageValue: `An error occurred while generating Course report.`,
                notificationType: NotificationType.REPORT_EXPORT_FAILED,
                notifyAllAdmin: false,
                isNotificatonForAdmin: true,
                notifiers: [userInfo._id],
                status: 'FAILED',
                icon: notificationiconEnum.ERROR,
                createdBy: userInfo,
            });
        }
        throw Error(err.message);
    }
};

const getSingleCourseReport = async ({ input }, context) => {
    const { subscriberId, userInfo, userId } = AuthUser(context);
    if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

    // Basic input validation can also stay here
    if (!input || !input.reportType) {
        throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Report type is required.");
    }
     if (input.dateRange) {
        const { startDate, endDate } = input.dateRange;
        if (!startDate || !endDate) {
            throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Both startDate and endDate are required when dateRange is provided.");
        }
         if (![input.courseIds, input.vesselType, input.vesselName, input.designation, input.learnerStatus, input.courseStatus].some(field => field && field.length > 0)) {
            throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Please enter one or more fields.");
        }
    }


    // 2. Fork the child process
    console.log("Forking a child process for report generation...");
    const child = fork(path.resolve(__dirname, 'course_report_generator.js'),[],{execArgv : ["--expose-gc"]}); // expose gc is used to expose the garbage collector in the child process

    // Handle any errors during the creation of the child process
    child.on('error', (err) => {
        console.error('Failed to start child process.', err);
        // You might want to send a failure notification here as a fallback
    });
    
    // Optional: listen for the child process to exit
    child.on('exit', (code) => {
        console.log(`Child process exited with code ${code}`);
    });

    child.on("message", async msg => {
        if (msg.type === "REPORT_EXPORT_SUCCESS" || msg.type === "REPORT_EXPORT_FAILED") {
            try {
                await NotificationHelper.createNotificationhelper(msg.payload);
            } catch (err) {
                console.error("Failed to send notification from parent:", err);
            }
        }
    });

    // 3. Prepare the payload. It must be serializable (no functions, complex classes).
    // The `userInfo` object should be a plain JSON object.
    const payload = {
        input,
        subscriberId: subscriberId.toString(), // Ensure IDs are strings
        userId: userId.toString(),
        userInfo // This must be a serializable object
    };

    // 4. Send the payload to the child process
    child.send({ payload });

    // 5. Immediately return a response to the user
    return {
        status: true,
        message: "Report generation has started. You will be notified when the report is ready for download.",
        // No fileName or filePath is returned here anymore
        fileName: '',
        filePath: '',
    };
};

const getVesselMainReport = async ({ input }, context) => {
    const { subscriberId, userInfo } = AuthUser(context);
    if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

    try {
        input = input || {};

        const matchStage = [];
        const pageLimit = [];

        if (Object.keys(input).length > 0) {
            const filterInput = input.filterInput || {};

            if (filterInput?.search) {
                const search = filterInput.search;
                matchStage.push({
                    $match: {
                        $or: [
                            { 'vesselName': { $regex: search, $options: 'i' } },
                            { 'imoNumber': { $regex: search, $options: 'i' } },
                            { 'ownerName': { $regex: search, $options: 'i' } },
                            { 'companyName': { $regex: search, $options: 'i' } },
                        ],
                    },
                });
            }

            if (filterInput.ownerName && Array.isArray(filterInput.ownerName) && filterInput.ownerName.length > 0) {
                matchStage.push({
                    $match: {
                        'ownerName': {
                            $in: filterInput.ownerName.map(name => new RegExp(name, 'i'))
                        }
                    },
                });
            }
            if (filterInput.companyName && Array.isArray(filterInput.companyName) && filterInput.companyName.length > 0) {
                matchStage.push({
                    $match: {
                        'companyName': {
                            $in: filterInput.companyName.map(name => new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
                        }
                    },
                });
            }

            if (filterInput.vesselTypeIds && Array.isArray(filterInput.vesselTypeIds) && filterInput.vesselTypeIds.length > 0) {
                matchStage.push({
                    $match: {
                        'vesselTypeId': { $in: filterInput.vesselTypeIds },
                    },
                });
            }

            if (filterInput.vesselNameIds && Array.isArray(filterInput.vesselNameIds) && filterInput.vesselNameIds.length > 0) {
                matchStage.push({
                    $match: {
                        '_id': { $in: filterInput.vesselNameIds },
                    },
                });
            }
        }

        const fieldMapping = {
            "VESSEL_NAME": "vesselName",
            "OWNER_NAME": "ownerName",
        };
        const sortStage = await ReportsHelper.generateSortingStage(fieldMapping, ["VESSEL_NAME", "OWNER_NAME"], "VESSEL_NAME", input?.sortInput);

        const skip = input?.pageInput?.skip ? input.pageInput.skip : 0;
        const limit = input?.pageInput?.limit ? input.pageInput.limit : 20;

        if (limit > 0 && (!input?.export)) {
            pageLimit.push({ $skip: skip }, { $limit: limit });
        }

        const data = await Vessel.aggregate(
            [
                {
                    $sort:
                    {
                        createdAt: -1
                    }
                },
                {
                    $match: {
                        isActive: true,
                        isDeleted: false
                    }
                },
                {
                    $lookup: {
                        from: "vesseltypes",
                        localField: "typeOfVessel",
                        foreignField: "_id",
                        as: "vesselTypesInfo"
                    }
                },
                {
                    $unwind: {
                        path: "$vesselTypesInfo",
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $lookup: {
                        from: "uservessels",
                        localField: "_id",
                        foreignField: "vessel",
                        as: "userVesselsInfo",
                        pipeline: [
                            {
                                $lookup: {
                                    from: "employees",
                                    localField: "user",
                                    foreignField: "user",
                                    as: "employeeInfo"
                                }
                            },
                            {
                                $unwind: {
                                    path: "$employeeInfo",
                                    preserveNullAndEmptyArrays: false
                                }
                            },
                            {
                                $match: {
                                    $expr: {
                                        $eq: [
                                            "$employeeInfo.isDeleted",
                                            false
                                        ]
                                    }
                                }
                            }
                        ]
                    }
                },
                {
                    $lookup: {
                        from: "users",
                        localField: "userVesselsInfo.user",
                        foreignField: "_id",
                        as: "userInfo",
                        pipeline: [
                            {
                                $match: {
                                    isDeleted: false,
                                    isSignupAdminAprroved: { $ne: false }
                                }
                            },
                            {
                                $match: {
                                    vesselStatus: "ONBOARDED"
                                }
                            }
                        ]
                    }
                },
                {
                    $unwind: {
                        path: "$userInfo",
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $lookup: {
                        from: "overalltrainingprogresses",
                        localField: "userInfo._id",
                        foreignField: "user",
                        as: "trainingProgressInfo",
                        pipeline: [
                            {
                                $match: {
                                    isEnrolled: true
                                }
                            }
                        ]
                    }
                },
                {
                    $project: {
                        name: 1,
                        imoNumber: 1,
                        companyName: 1,
                        createdAt: 1,
                        ownerName: 1,
                        vesselType: "$vesselTypesInfo.name",
                        vesselTypeId: "$vesselTypesInfo._id",
                        onboardedUsers: {
                            $ifNull: [
                                {
                                    $setUnion: [
                                        {
                                            $map: {
                                                input: {
                                                    $filter: {
                                                        input: "$userVesselsInfo",
                                                        as: "userVessel",
                                                        cond: {
                                                            $and: [
                                                                {
                                                                    $eq: [
                                                                        "$$userVessel.vesselStatus",
                                                                        "ONBOARDED"
                                                                    ]
                                                                },
                                                                {
                                                                    $eq: [
                                                                        "$$userVessel.isActive",
                                                                        true
                                                                    ]
                                                                }
                                                            ]
                                                        }
                                                    }
                                                },
                                                as: "userVessel",
                                                in: "$$userVessel.user"
                                            }
                                        },
                                        []
                                    ]
                                },
                                []
                            ]
                        }
                    }
                },
                {
                    $unwind:

                    {
                        path: "$onboardedUsers",
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $lookup:

                    {
                        from: "overalltrainingprogresses",
                        localField: "onboardedUsers",
                        foreignField: "user",
                        as: "trainingProgress",
                        pipeline: [
                            {
                                $match: {
                                    isEnrolled: true
                                }
                            }
                        ]
                    }
                },
                {
                    $unwind:

                    {
                        path: "$trainingProgress",
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $group: {
                        _id: "$_id",
                        name: {
                            $first: "$name"
                        },
                        imoNumber: {
                            $first: "$imoNumber"
                        },
                        companyName: {
                            $first: "$companyName"
                        },
                        createdAt: {
                            $first: "$createdAt"
                        },
                        vesselType: {
                            $first: "$vesselType"
                        },
                        vesselTypeId: {
                            $first: "$vesselTypeId"
                        },
                        ownerName: {
                            $first: "$ownerName"
                        },
                        onboardedUsers: {
                            $addToSet: "$onboardedUsers"
                        },
                        trainingProgresses: {
                            $push: "$trainingProgress"
                        }



                    }
                },
                {
                    $sort:

                    {
                        createdAt: -1
                    }
                },
                {
                    $project: {
                        vesselName: "$name",
                        imoNumber: 1,
                        companyName: 1,
                        createdAt: 1,
                        vesselId: "$_id",
                        typeOfVessel: "$vesselType",
                        vesselTypeId: "$vesselTypeId",
                        ownerName: 1,
                        onboardedCount: {
                            $size: {
                                $ifNull: ["$onboardedUsers", []]
                            }
                        },
                        progress: {
                            $cond: {
                                if: {
                                    $gt: [
                                        {
                                            $size: {
                                                $ifNull: [
                                                    "$trainingProgresses",
                                                    []
                                                ]
                                            }
                                        },
                                        0
                                    ]
                                },
                                then: {
                                    $trunc: [
                                        {
                                            $avg: "$trainingProgresses.progressPercentage"
                                        }

                                    ]
                                },
                                else: 0
                            }
                        }
                    }
                },
                {
                    $group: {
                        _id: "$vesselId",
                        vesselName: {
                            $first: "$vesselName"
                        },
                        vesselTypeId: {
                            $first: "$vesselTypeId"
                        },
                        imoNumber: {
                            $first: "$imoNumber"
                        },
                        companyName: {
                            $first: "$companyName"
                        },
                        vesselId: {
                            $first: "$vesselId"
                        },
                        typeOfVessel: {
                            $first: "$typeOfVessel"
                        },
                        ownerName: {
                            $first: "$ownerName"
                        },
                        onboardedCount: {
                            $sum: "$onboardedCount"
                        },
                        progress: {
                            $first: "$progress"
                        },
                        createdAt: {
                            $max: "$createdAt"
                        }
                    }
                },
                ...matchStage,
                {
                    $sort: {
                        createdAt: -1
                    }
                },
                ...sortStage,
                ...pageLimit,
            ]
        );

        let s3PresignedUrl = "";

        if (input?.export) {

            const dataToExport = data.map(item => {
                const parsedItem = { ...item };
                parsedItem.quizPercentage = parsedItem.quizPercentage ? parsedItem.quizPercentage : 'Not Applicable'
                parsedItem.ownerName = parsedItem.ownerName ? parsedItem.ownerName : 'NIL'
                parsedItem.companyName = parsedItem.companyName ? parsedItem.companyName : 'NIL'

                delete parsedItem.isPassed;
                delete parsedItem._id;
                delete parsedItem.vesselId;
                delete parsedItem.vesselTypeId;

                return parsedItem;
            });

            const workbook = XLSX.utils.book_new();
            let worksheet;

            if (dataToExport.length === 0) {
                /* 
                const message = "NO DATA AVAILABLE FOR VESSELS";
                worksheet = XLSX.utils.aoa_to_sheet([
                    [message]
                ]);

                const columnSpan = 20;

                const range = { s: { r: 0, c: 0 }, e: { r: 0, c: columnSpan - 1 } };
                if (!worksheet['!merges']) worksheet['!merges'] = [];
                worksheet['!merges'].push(range);

                worksheet['A1'].s = {
                    font: {
                        bold: true,
                        size: 14,
                    },
                    alignment: {
                        horizontal: 'center',
                        vertical: 'center',
                    }
                };

                worksheet['!rows'] = [{ hpt: 30 }]; 
                */

                worksheet = XLSX.utils.aoa_to_sheet([
                    [
                        "vesselName",
                        "imoNumber",
                        "companyName",
                        "typeOfVessel",
                        "ownerName",
                        "onboardedCount",
                        "progress",
                        "createdAt",
                        "quizPercentage"
                    ]
                ]);
            }
            else {
                worksheet = XLSX.utils.json_to_sheet(dataToExport);
            }
            XLSX.utils.book_append_sheet(workbook, worksheet, `Main-Vessel-Report`);
            const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
            const excelFilePath = await UploadHelper.uploadExcel({
                data: excelBuffer,
                folderName: "Vessel_Progress_Reports",
                fileName: `Vessel_Report-${await ReportsHelper.generateFileNameTimestamp()}.xlsx`,
                uploadType: UploadHelper.uploadType.exportLearnersCoursesReportAsExcel,
            });
            if (excelFilePath) {
                s3PresignedUrl = await aws_helper.fetchFile(excelFilePath);
                await NotificationHelper.createNotificationhelper({
                    subscriber: subscriberId,
                    titleValue: `Main Vessel Report Exported Successfully`,
                    messageValue: `The main vessel report has been successfully generated and exported by ${decrypt(userInfo?.firstName)} ${userInfo?.lastName ? decrypt(userInfo?.lastName) : ''}.`,
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
                });
            }
            return {
                filePath: s3PresignedUrl,
                fileName: path.basename(excelFilePath),
                vesselData: data,
            };
        }

        return {
            vesselData: data,
        };

    } catch (err) {
        await NotificationHelper.createNotificationhelper({
            subscriber: subscriberId,
            titleValue: `Main Vessel Report Export Failed`,
            messageValue: `An error occurred while generating the vessel report.`,
            notificationType: NotificationType.REPORT_EXPORT_FAILED,
            notifyAllAdmin: false,
            isNotificatonForAdmin: true,
            notifiers: [userInfo._id],
            status: 'FAILED',
            icon: notificationiconEnum.ERROR,
            createdBy: userInfo,
        });
        throw Error(err.message);
    }
};

const generateCustomReport = async ({ input }, context) => {
    // 1. Perform quick authentication and validation in the parent
    const { subscriberId, userId, userInfo } = AuthUser(context);
    if (!subscriberId) {
        throw CustomError(ErrorName.FORBIDDEN);
    }

    // Basic input validation can also stay here
    if (!input || !input.reportType) {
        throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Report type is required.");
    }
    if (!input.vesselName || input.vesselName.length === 0) {
        throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Vessel ids are required.");
    }
    if (![input.courseIds, input.vesselType, input.vesselName, input.designation, input.learnerStatus, input.courseStatus].some(field => field && field.length > 0)) {
        throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Please enter one or more fields.");
    }

     /* if (input.dateRange) {
        // const { startDate, endDate } = input.dateRange;
        if (!startDate || !endDate) {
            throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Both startDate and endDate are required when dateRange is provided.");
        }
         if(![input.courseIds, input.vesselType, input.vesselName, input.designation, input.learnerStatus, input.courseStatus].some(field => field && field.length > 0)) {
            throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Please enter one or more fields.");
        }
    } */


    // 2. Fork the child process
    console.log("Forking a child process for report generation...");
    const child = fork(path.resolve(__dirname, 'custom_report_generator.js'),[],{execArgv : ["--expose-gc"]}); // expose gc is used to expose the garbage collector in the child process

    // Handle any errors during the creation of the child process
    child.on('error', (err) => {
        console.error('Failed to start child process.', err);
        // You might want to send a failure notification here as a fallback
    });
    
    // Optional: listen for the child process to exit
    child.on('exit', (code) => {
        console.log(`Child process exited with code ${code}`);
    });

    child.on("message", async msg => {
        if (msg.type === "REPORT_EXPORT_SUCCESS" || msg.type === "REPORT_EXPORT_FAILED") {
            try {
                await NotificationHelper.createNotificationhelper(msg.payload);
            } catch (err) {
                console.error("Failed to send notification from parent:", err);
            }
        }
    });

    // 3. Prepare the payload. It must be serializable (no functions, complex classes).
    // The `userInfo` object should be a plain JSON object.
    const payload = {
        input,
        subscriberId: subscriberId.toString(), // Ensure IDs are strings
        userId: userId.toString(),
        userInfo // This must be a serializable object
    };

    // 4. Send the payload to the child process
    child.send({ payload });

    // 5. Immediately return a response to the user
    return {
        status: true,
        message: "Report generation has started. You will be notified when the report is ready for download.",
        // No fileName or filePath is returned here anymore
        fileName: '',
        filePath: '',
    };
};

const getCustomReportLogs = async ({ pageInput, searchQuery }, context) => {
    const { subscriberId } = AuthUser(context);
    if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
    try {

        const skip = pageInput?.skip ? pageInput.skip : 0;
        const limit = pageInput?.limit ? pageInput.limit : 20;
        let matchStage = [];
        let pageLimit = [];
        if (limit > 0) {
            pageLimit.push({ $skip: skip });
            pageLimit.push({ $limit: limit });
        }


        if (searchQuery) {

            const searchTerms = searchQuery.split(/\s+/).map(term => encrypt(term.trim())).filter(Boolean);


            if (searchTerms.length > 0) {
                matchStage.unshift({
                    $match: {
                        $or: [
                            {
                                $or: [
                                    {
                                        "usersInfo.firstName": {
                                            $regex: `.*${searchTerms[0]}.*`,
                                            $options: "i"
                                        }
                                    },
                                    {
                                        $and: [
                                            {
                                                "usersInfo.firstName": {
                                                    $regex: `.*${searchTerms[0]}.*`,
                                                    $options: "i"
                                                }
                                            },
                                            {
                                                "usersInfo.lastName": {
                                                    $regex: `.*${searchTerms[1] || ""}.*`,
                                                    $options: "i"
                                                }
                                            }
                                        ]
                                    }
                                ]
                            },
                            {
                                $and: [
                                    {
                                        "usersInfo.firstName": {
                                            $regex: `.*${searchTerms[1] || ""}.*`,
                                            $options: "i"
                                        }
                                    },
                                    {
                                        "usersInfo.lastName": {
                                            $regex: `.*${searchTerms[0]}.*`,
                                            $options: "i"
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                });
            }
        }

        const data = await Export.aggregate([
            {
                $match: {
                    type_of_export: "CUSTOM_REPORT_EXPORT"
                }
            },
            {
                $unwind: {
                    path: "$additionalData",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $unwind: {
                    path: "$additionalData.value.dateRange",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "createdBy",
                    foreignField: "_id",
                    as: "usersInfo"
                }
            },
            {
                $unwind: {
                    path: "$usersInfo",
                    preserveNullAndEmptyArrays: true
                }
            },
            ...matchStage,
            {
                $project: {
                    from: {
                        $ifNull: ["$additionalData.value.dateRange.startDate", null]
                    },
                    to: {
                        $ifNull: ["$additionalData.value.dateRange.endDate", null]
                    },
                    createdAt: 1,
                    filePath: 1,
                    generatedByFirstName: {
                        $ifNull: ["$usersInfo.firstName", null]
                    },
                    generatedByLastName: {
                        $ifNull: ["$usersInfo.lastName", null]
                    },
                }
            },
            {
                $sort: {
                    createdAt: -1
                }
            },
            ...pageLimit,
        ]);

        if (data.length > 0) {
            const customReportLogs = await Promise.all(data.map(async (item) => {
                const signedUrl = await aws_helper.fetchFile(item.filePath);
                return {
                    _id: item._id,
                    generatedBy: `${decrypt(item?.generatedByFirstName,true)} ${decrypt(item?.generatedByLastName,true)}`.trim() || "N/A",
                    generatedAt: new Date(item?.createdAt).toLocaleString(),
                    from: item?.from ? new Date(item?.from).toLocaleString() : null,
                    to: item?.to ? new Date(item?.to).toLocaleString() : null,
                    filePath: { url: signedUrl },
                };
            }));
            return customReportLogs;
        }
        return [];
    } catch (error) {
        throw new Error(error.message);
    }
};

const getS3FilePath = async ({ filePath }, context) => {
    const { subscriberId } = AuthUser(context);
    if (!subscriberId) {
        throw CustomError(ErrorName.FORBIDDEN);
    }
    try {
        if (!filePath) {
            throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "filePath is required")
        }
        const signedUrl = await aws_helper.fetchFile(filePath);
        return {
            url: signedUrl
        };
    } catch (error) {
        throw new Error(error.message);
    }
};

const getSystemStatsPerVessel = async (args, context) => {
    const { subscriberId, userId, userInfo } = AuthUser(context);
    if (!subscriberId) {
        throw CustomError(ErrorName.FORBIDDEN);
    }

    try {
        console.log("Forking child process for system stats...");
        const child = fork(path.resolve(__dirname, 'system_stats_generator.js'), [], { execArgv: ["--expose-gc"] });

        child.on('error', (err) => {
            console.error('Failed to start child process.', err);
        });

        child.on('exit', (code) => {
            console.log(`Child process exited with code ${code}`);
        });

        child.on("message", async msg => {
            if (msg.type === "REPORT_EXPORT_SUCCESS") {
                // Log to console as requested
                console.log("Parent received success.");
            } else if (msg.type === "REPORT_EXPORT_FAILED") {
                console.error("Parent received failure:", msg.payload.messageValue);
            }
        });

        const payload = {
            subscriberId: subscriberId.toString(),
            userId: userId.toString(),
            userInfo
        };

        child.send({ payload });

        return {
            status: true,
            message: "System stats report generation has started. Please check the server console for the download link.",
            fileName: '',
            filePath: '',
        };

    } catch (err) {
        console.error("Error initiating system stats generation:", err);
        throw err;
    }
};

module.exports.queries = {
    getSystemStatsPerVessel,
    getSystemStatsEmailConfig: async (parent, { type }, context) => {
        const { subscriberId } = AuthUser(context);
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

        const queryType = type || "SYSTEM_STATS";
        const config = await SystemStatsEmailConfig.findOne({ subscriber: subscriberId, type: queryType }).populate('updatedBy');
        return config;
    },
    getMainLearnersReport,
    getSingleLearnerReport,
    getMainCoursesReport,
    getSingleCourseReport,
    getVesselMainReport,
    generateCustomReport,
    getCustomReportLogs,
    getS3FilePath,
    getRevenueReports: async ({ pageInput, filterInput }, context) => {
        const { role, userPermissions, subscriberId, isOrganizationManager } = AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.GET_REVENUE_REPORTS,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 20;

        let filterConditions = { subscriber: subscriberId };

        if (filterInput) {
            if (filterInput.dateFrom || filterInput.dateTo) {
                filterConditions.createdAt = {};

                if (filterInput.dateFrom)
                    filterConditions.createdAt.$gte = Moment(filterInput.dateFrom)
                        .startOf("day")
                        .toDate();

                if (filterInput.dateTo)
                    filterConditions.createdAt.$lte = Moment(filterInput.dateTo)
                        .endOf("day")
                        .toDate();
            }
        }

        const fetchResult = async pipeline => {
            return TrainingRegistrationInvoice.aggregatePaginate(
                TrainingRegistrationInvoice.aggregate(pipeline),
                {
                    offset: skip,
                    limit,
                    sort: { createdAt: "descending" },
                    customLabels: {
                        docs: "revenueReports",
                        totalDocs: "totalCount",
                        offset: "skip",
                    },
                    pagination: limit !== 0,
                    allowDiskUse: true,
                }
            );
        };

        if (context.platform === Role.ADMIN) {
            const pipeline = [
                {
                    $match: filterConditions,
                },
                {
                    $lookup: {
                        from: "trainingregistrationinvoices",
                        localField: "_id",
                        foreignField: "_id",
                        as: "trainingRegistrationInvoice",
                    },
                },
                {
                    $unwind: "$trainingRegistrationInvoice",
                },
                {
                    $lookup: {
                        from: "trainingregistrations",
                        localField: "_id",
                        foreignField: "invoice",
                        pipeline: [
                            {
                                $lookup: {
                                    from: "organizations",
                                    localField: "organization",
                                    foreignField: "_id",
                                    as: "organization",
                                },
                            },
                            {
                                $lookup: {
                                    from: "trainings",
                                    localField: "training",
                                    foreignField: "_id",
                                    as: "training",
                                },
                            },
                            {
                                $lookup: {
                                    from: "employees",
                                    localField: "employee",
                                    foreignField: "_id",
                                    pipeline: [
                                        {
                                            $lookup: {
                                                from: "users",
                                                localField: "user",
                                                foreignField: "_id",
                                                pipeline: [
                                                    {
                                                        $project: {
                                                            firstName: true,
                                                            lastName: true,
                                                            avatar: true,
                                                        },
                                                    },
                                                ],
                                                as: "user",
                                            },
                                        },
                                        {
                                            $project: {
                                                user: true,
                                            },
                                        },
                                        {
                                            $set: {
                                                user: {
                                                    $first: "$user",
                                                },
                                            },
                                        },
                                    ],
                                    as: "employee",
                                },
                            },
                            {
                                $set: {
                                    organization: {
                                        $first: "$organization",
                                    },
                                },
                            },
                            {
                                $set: {
                                    training: {
                                        $first: "$training",
                                    },
                                },
                            },
                            {
                                $set: {
                                    employee: {
                                        $first: "$employee",
                                    },
                                },
                            },
                        ],
                        as: "trainingRegistration",
                    },
                },
                {
                    $addFields: {
                        totalRegistrations: {
                            $size: "$trainingRegistration",
                        },
                        organization: {
                            $arrayElemAt: ["$trainingRegistration.organization", 0],
                        },
                        training: { $arrayElemAt: ["$trainingRegistration.training", 0] },
                        employee: { $arrayElemAt: ["$trainingRegistration.employee", 0] },
                    },
                },
                ...(filterInput?.organization
                    ? [
                        {
                            $match: {
                                "organization._id": filterInput.organization,
                            },
                        },
                    ]
                    : []),
                ...(filterInput?.training
                    ? [
                        {
                            $match: {
                                "training._id": filterInput.training,
                            },
                        },
                    ]
                    : []),
                ...(filterInput?.employee
                    ? [
                        {
                            $match: {
                                "employee._id": filterInput.employee,
                            },
                        },
                    ]
                    : []),
                ...(filterInput?.search
                    ? [
                        {
                            $match: {
                                $or: [
                                    {
                                        "organization.name.value": {
                                            $regex: ".*" + filterInput.search + ".*",
                                            $options: "i",
                                        },
                                    },
                                    {
                                        "training.title.value": {
                                            $regex: ".*" + filterInput.search + ".*",
                                            $options: "i",
                                        },
                                    },
                                ],
                            },
                        },
                    ]
                    : []),
            ];

            return await fetchResult(pipeline);
        }

        throw CustomError(ErrorName.FORBIDDEN);
    },
    getQuizReports: async ({ pageInput, filterInput }, context) => {
        const { role, userPermissions, subscriberId, isOrganizationManager, managingOrganization } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.GET_QUIZ_REPORTS,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 20;

        let filterConditions = { subscriber: subscriberId };

        if (filterInput) {
            if (filterInput.employee) filterConditions.employee = filterInput.employee;
            if (filterInput.training) filterConditions.training = filterInput.training;
            if (filterInput.organization) filterConditions.organization = filterInput.organization;
        }

        const fetchResult = async pipeline => {
            return TrainingRegistration.aggregatePaginate(
                TrainingRegistration.aggregate(pipeline),
                {
                    offset: skip,
                    limit,
                    sort: { createdAt: "descending" },
                    customLabels: {
                        docs: "quizReports",
                        totalDocs: "totalCount",
                        offset: "skip",
                    },
                    pagination: limit !== 0,
                    allowDiskUse: true,
                }
            );
        };

        if (context.platform === Role.ADMIN) {
            if (isOrganizationManager) {
                filterConditions.organization = managingOrganization;
            }

            const pipeline = [
                {
                    $match: filterConditions,
                },
                {
                    $lookup: {
                        from: "trainings",
                        localField: "training",
                        foreignField: "_id",
                        pipeline: [
                            ...(filterInput?.trainingCategory
                                ? [
                                    {
                                        $match: {
                                            trainingCategories: filterInput.trainingCategory,
                                        },
                                    },
                                ]
                                : []),
                            {
                                $project: {
                                    title: true,
                                    images: true,
                                    trainingCategories: true,
                                },
                            },
                        ],
                        as: "training",
                    },
                },
                {
                    $set: {
                        training: {
                            $first: "$training",
                        },
                    },
                },
                {
                    $lookup: {
                        from: "employees",
                        localField: "employee",
                        foreignField: "_id",
                        pipeline: [
                            {
                                $lookup: {
                                    from: "users",
                                    localField: "user",
                                    foreignField: "_id",
                                    pipeline: [
                                        {
                                            $project: {
                                                firstName: true,
                                                lastName: true,
                                                avatar: true,
                                            },
                                        },
                                    ],
                                    as: "user",
                                },
                            },
                            {
                                $project: {
                                    user: true,
                                },
                            },
                            {
                                $set: {
                                    user: {
                                        $first: "$user",
                                    },
                                },
                            },
                        ],
                        as: "employee",
                    },
                },
                {
                    $set: {
                        employee: {
                            $first: "$employee",
                        },
                    },
                },
                ...(filterInput?.search
                    ? [
                        {
                            $match: {
                                $or: [
                                    {
                                        "employee.user.firstName": {
                                            $regex: ".*" + filterInput.search + ".*",
                                            $options: "i",
                                        },
                                    },
                                    {
                                        "employee.user.lastName": {
                                            $regex: ".*" + filterInput.search + ".*",
                                            $options: "i",
                                        },
                                    },
                                    {
                                        "training.title.value": {
                                            $regex: ".*" + filterInput.search + ".*",
                                            $options: "i",
                                        },
                                    },
                                ],
                            },
                        },
                    ]
                    : []),

                {
                    $lookup: {
                        from: "trainingprogresses",
                        localField: "_id",
                        foreignField: "trainingRegistration",
                        pipeline: [
                            {
                                $lookup: {
                                    from: "trainingmodulecontents",
                                    localField: "trainingModuleContent",
                                    foreignField: "_id",
                                    pipeline: [
                                        {
                                            $project: {
                                                trainingModule: true,
                                                contentType: true,
                                                title: true,
                                                quizContent: true,
                                            },
                                        },
                                        {
                                            $lookup: {
                                                from: "quizcontents",
                                                localField: "quizContent",
                                                foreignField: "_id",
                                                as: "quizContent",
                                            },
                                        },
                                        {
                                            $unwind: "$quizContent",
                                        },
                                        {
                                            $lookup: {
                                                from: "trainingmodules",
                                                localField: "trainingModule",
                                                foreignField: "_id",
                                                as: "trainingModule",
                                            },
                                        },
                                        {
                                            $unwind: "$trainingModule",
                                        },
                                    ],
                                    as: "trainingModuleContent",
                                },
                            },
                            {
                                $unwind: "$trainingModuleContent",
                            },
                            {
                                $project: {
                                    trainingModuleContent: true,
                                    quizAttempts: true,
                                },
                            },
                            {
                                $match: {
                                    $and: [
                                        {
                                            "trainingModuleContent.contentType": "QUIZ",
                                        },
                                        {
                                            "quizAttempts.0": { $exists: true },
                                        },
                                    ],
                                },
                            },
                            {
                                $set: {
                                    totalAttempts: {
                                        $size: "$quizAttempts",
                                    },
                                    quizAttempts: {
                                        $last: "$quizAttempts",
                                    },
                                },
                            },
                        ],
                        as: "trainingProgresses",
                    },
                },
                {
                    $unwind: "$trainingProgresses",
                },
                {
                    $project: {
                        employee: true,
                        trainingProgresses: true,
                    },
                },
            ];

            return await fetchResult(pipeline);
        }
    },
    getFeedbackReports: async ({ pageInput, filterInput }, context) => {
        const { role, userPermissions, subscriberId, isOrganizationManager, managingOrganization } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.GET_FEEDBACK_REPORTS,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 20;

        let filterConditions = { subscriber: subscriberId, feedback: { $exists: true, $ne: null } };
        let trainingData = null;
        if (filterInput) {
            if (filterInput.dateFrom || filterInput.dateTo) {
                filterConditions.startDate = {};

                if (filterInput.dateFrom)
                    filterConditions.startDate.$gte = Moment(filterInput.dateFrom)
                        .startOf("day")
                        .toDate();

                if (filterInput.dateTo)
                    filterConditions.startDate.$lte = Moment(filterInput.dateTo)
                        .endOf("day")
                        .toDate();
            }
            if (filterInput.training) {
                filterConditions.training = filterInput.training;
                trainingData = await Training.findOne({
                    _id: filterInput.training,
                    subscriber: subscriberId,
                });
            }
            if (filterInput.organization) filterConditions.organization = filterInput.organization;
        }

        const fetchResult = async pipeline => {
            let feedbackReportsData = await TrainingRegistration.aggregatePaginate(
                TrainingRegistration.aggregate(pipeline),
                {
                    offset: skip,
                    limit,
                    sort: { startDate: "descending" },
                    customLabels: {
                        docs: "feedbackReports",
                        totalDocs: "totalCount",
                        offset: "skip",
                    },
                    pagination: limit !== 0,
                    allowDiskUse: true,
                }
            );
            feedbackReportsData.training = trainingData;

            return feedbackReportsData;
        };

        if (context.platform === Role.ADMIN) {
            if (isOrganizationManager) {
                filterConditions.organization = managingOrganization;
            }

            const pipeline = [
                {
                    $match: filterConditions,
                },
                {
                    $lookup: {
                        from: "employees",
                        localField: "trainer",
                        foreignField: "_id",
                        pipeline: [
                            {
                                $lookup: {
                                    from: "users",
                                    localField: "user",
                                    foreignField: "_id",
                                    pipeline: [
                                        {
                                            $project: {
                                                firstName: true,
                                                lastName: true,
                                                avatar: true,
                                            },
                                        },
                                    ],
                                    as: "user",
                                },
                            },
                            {
                                $project: {
                                    user: true,
                                },
                            },
                            {
                                $set: {
                                    user: {
                                        $first: "$user",
                                    },
                                },
                            },
                        ],
                        as: "trainer",
                    },
                },
                {
                    $set: {
                        trainer: {
                            $first: "$trainer",
                        },
                    },
                },
                {
                    $lookup: {
                        from: "trainings",
                        localField: "training",
                        foreignField: "_id",
                        pipeline: [
                            {
                                $project: {
                                    trainingCategories: true,
                                },
                            },
                        ],
                        as: "training",
                    },
                },
                {
                    $set: {
                        training: {
                            $first: "$training",
                        },
                    },
                },
                ...(filterInput?.trainingCategory
                    ? [
                        {
                            $match: {
                                "training.trainingCategories": filterInput.trainingCategory,
                            },
                        },
                    ]
                    : []),
                {
                    $lookup: {
                        from: "employees",
                        localField: "employee",
                        foreignField: "_id",
                        pipeline: [
                            {
                                $lookup: {
                                    from: "users",
                                    localField: "user",
                                    foreignField: "_id",
                                    pipeline: [
                                        {
                                            $project: {
                                                firstName: true,
                                                lastName: true,
                                                avatar: true,
                                            },
                                        },
                                    ],
                                    as: "user",
                                },
                            },
                            {
                                $project: {
                                    user: true,
                                },
                            },
                            {
                                $set: {
                                    user: {
                                        $first: "$user",
                                    },
                                },
                            },
                        ],
                        as: "employee",
                    },
                },
                {
                    $set: {
                        employee: {
                            $first: "$employee",
                        },
                    },
                },
                ...(filterInput?.search
                    ? [
                        {
                            $match: {
                                $or: [
                                    {
                                        "employee.user.firstName": {
                                            $regex: ".*" + filterInput.search + ".*",
                                            $options: "i",
                                        },
                                    },
                                    {
                                        "employee.user.lastName": {
                                            $regex: ".*" + filterInput.search + ".*",
                                            $options: "i",
                                        },
                                    },
                                    {
                                        "training.title.value": {
                                            $regex: ".*" + filterInput.search + ".*",
                                            $options: "i",
                                        },
                                    },
                                ],
                            },
                        },
                    ]
                    : []),

                {
                    $project: {
                        employee: true,
                        trainer: true,
                        feedback: true,
                        startDate: true,
                    },
                },
            ];

            return await fetchResult(pipeline);
        }
    },
    getTrainingMatrixReports: async ({ pageInput, filterInput }, context) => {
        const { role, userPermissions, subscriberId, isOrganizationManager, managingOrganization } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.GET_TRAINING_MATRIX_REPORTS,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 20;

        let filterConditions = { subscriber: subscriberId };

        if (filterInput) {
            if (filterInput.organization) filterConditions.organization = filterInput.organization;
        }

        const fetchResult = async pipeline => {
            return Employee.aggregatePaginate(Employee.aggregate(pipeline), {
                offset: skip,
                limit,
                sort: { createdAt: "descending" },
                customLabels: {
                    docs: "trainingMatrixReports",
                    totalDocs: "totalCount",
                    offset: "skip",
                },
                pagination: limit !== 0,
                allowDiskUse: true,
            });
        };

        if (context.platform === Role.ADMIN) {
            if (isOrganizationManager) {
                filterConditions.organization = managingOrganization;
            }

            const pipeline = [
                {
                    $match: filterConditions,
                },
                {
                    $lookup: {
                        from: "users",
                        localField: "user",
                        foreignField: "_id",
                        as: "user",
                        pipeline: [
                            {
                                $match: { role: Role.EMPLOYEE },
                            },
                        ],
                    },
                },
                {
                    $unwind: "$user",
                },
                ...(filterInput?.search
                    ? [
                        {
                            $match: {
                                $or: [
                                    {
                                        "user.firstName": {
                                            $regex: ".*" + filterInput.search + ".*",
                                            $options: "i",
                                        },
                                    },
                                    {
                                        "user.lastName": {
                                            $regex: ".*" + filterInput.search + ".*",
                                            $options: "i",
                                        },
                                    },
                                ],
                            },
                        },
                    ]
                    : []),
                {
                    $set: {
                        employee: "$$ROOT",
                    },
                },
                {
                    $lookup: {
                        from: "trainingregistrations",
                        localField: "_id",
                        foreignField: "employee",
                        pipeline: [
                            {
                                $lookup: {
                                    from: "trainingcertificates",
                                    localField: "_id",
                                    foreignField: "trainingRegistration",
                                    as: "trainingCertificate",
                                },
                            },
                            {
                                $set: {
                                    trainingCertificate: {
                                        $first: "$trainingCertificate",
                                    },
                                },
                            },
                        ],
                        as: "trainingRegistrations",
                    },
                },
                {
                    $set: {
                        trainingRegistrations: "$trainingRegistrations",
                    },
                },
            ];

            return await fetchResult(pipeline);
        }

        throw CustomError(ErrorName.FORBIDDEN);
    },
};

module.exports.mutations = {
    updateSystemStatsEmailConfig: async ({ input }, context) => {
        const { subscriberId, userInfo } = AuthUser(context);
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

        const { to, cc, type } = input;

        const config = await SystemStatsEmailConfig.findOneAndUpdate(
            { subscriber: subscriberId, type },
            {
                $set: {
                    to,
                    cc,
                    type,
                    updatedBy: userInfo._id
                }
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        ).populate('updatedBy');

        return config;
    },
    deleteSystemStatsEmailConfig: async ({ type }, context) => {
        const { subscriberId } = AuthUser(context);
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

        const result = await SystemStatsEmailConfig.deleteOne({ subscriber: subscriberId, type });
        return result.deletedCount > 0;
    }
};
