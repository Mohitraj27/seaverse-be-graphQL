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

const getSystemStatsPerVessel = async () => {
    try {
        // 0️⃣ Fetch all vessels with company info
        const vessels = await Vessel.aggregate([
            {
                $match: { isDeleted: false, isActive: true },
            },
            {
                $lookup: {
                    from: "companies",
                    localField: "companyName",
                    foreignField: "name",
                    as: "company",
                },
            },
            {
                $unwind: { path: "$company", preserveNullAndEmptyArrays: true },
            },
            {
                $project: {
                    _id: 1,
                    vesselName: "$name",
                    companyName: "$companyName",
                },
            },
        ]);

        // 1️⃣ Fetch all users with vessel and minimal info
        const users = await User.aggregate([
            {
                $match: { isDeleted: false, isActive: true },
            },
            {
                $lookup: {
                    from: "vessels",
                    localField: "currentVessel",
                    foreignField: "_id",
                    as: "vessel",
                },
            },
            { $unwind: { path: "$vessel", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1,
                    email: 1,
                    isResetPasswordDialog: 1,
                    vesselId: "$vessel._id",
                    vesselName: "$vessel.name",
                    companyName: "$vessel.companyName",
                },
            },
        ]);
        const totalUsersInSystem = users.length;
        console.log("Total active users in system:", totalUsersInSystem);
        // 2️⃣ Fetch all overall training progress docs once (lightweight projection)
        const progresses = await OverallTrainingProgress.aggregate([
            {
                $match: { isDeleted: { $ne: true } },
            },
            {
                $project: {
                    user: 1,
                    status: 1,
                },
            },
        ]);

        // Build a fast lookup map for userId → progress status
        const userProgressMap = new Map();

        for (const p of progresses) {
            if (!userProgressMap.has(String(p.user))) {
                userProgressMap.set(String(p.user), []);
            }
            userProgressMap.get(String(p.user)).push(p.status);
        }

        // 3️⃣ Compute per company → vessel grouping
        const stats = {};

        for (const v of vessels) {
            const key = `${v.companyName || "No Company"}||${v.vesselName || "No Vessel"}`;
            stats[key] = {
                companyName: v.companyName || "No Company",
                vesselName: v.vesselName || "No Vessel",
                totalUsers: 0,
                isPasswordResetTrue: 0,
                isPasswordResetFalse: 0,
                totalEnrolledUsers: 0,
                usersStartedCourses: 0,
                usersWithNoEnrollment: 0,
            };
        }

        for (const user of users) {
            const company = user.companyName || "No Company";
            const vessel = user.vesselName || "No Vessel";
            const key = `${company}||${vessel}`;

            if (!stats[key]) {
                stats[key] = {
                    companyName: company,
                    vesselName: vessel,
                    totalUsers: 0,
                    isPasswordResetTrue: 0,
                    isPasswordResetFalse: 0,
                    totalEnrolledUsers: 0,
                    usersStartedCourses: 0,
                    usersWithNoEnrollment: 0,
                };
            }

            const s = stats[key];
            s.totalUsers++;

            if (user.isResetPasswordDialog) s.isPasswordResetTrue++;
            else s.isPasswordResetFalse++;

            const progress = userProgressMap.get(String(user._id));

            if (progress && progress.length > 0) {
                s.totalEnrolledUsers++;
                if (progress.some(st => ["IN_PROGRESS", "COMPLETED"].includes(st))) {
                    s.usersStartedCourses++;
                }
            }
        }

        // Include vessels that might not have appeared in user loop
        for (const key in stats) {
            const s = stats[key];
            s.usersWithNoEnrollment = s.totalUsers - s.totalEnrolledUsers;
        }

        // 4️⃣ Sort by company name and vessel name
        const orderedStats = Object.values(stats).sort((a, b) => {
            if (a.companyName === b.companyName) {
                return a.vesselName.localeCompare(b.vesselName);
            }
            return a.companyName.localeCompare(b.companyName);
        });

        return orderedStats;
    } catch (err) {
        console.error("Error fetching system stats per vessel:", err);
        throw err;
    }
};

module.exports.queries = {
    getSystemStatsPerVessel,
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


/**
 * All reports backup code before implementatio of background tasks
 */

//---------Custom Reports-------------
/* 
const generateCustomReport = async ({ input }, context) => {
    const { subscriberId, userId, userInfo } = AuthUser(context);
    if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

    try {
        const matchStage = [];
        if (input && Object.keys(input).length > 0) {
            if (input.dateRange) {
                const { startDate, endDate } = input.dateRange;

                if (!startDate || !endDate) {
                    throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Both startDate and endDate are required when dateRange is provided.");
                }

                if (![input.courseIds, input.vesselType, input.vesselName, input.designation, input.learnerStatus, input.courseStatus].some(field => field && field.length > 0)) {
                    throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Please enter one or more fields.");
                }

                if (input.courseIds && Array.isArray(input.courseIds) && input.courseIds.length > 0) {
                    matchStage.push({
                        $match: {
                            training: { $in: input.courseIds },
                        },
                    });
                }

                //filter with vessel names(vesselId accepted from FE)
                if (input.vesselName && Array.isArray(input.vesselName) && input.vesselName.length > 0) {
                    matchStage.push({
                        $match: {
                            'userInfo.currentVessel': { $in: input?.vesselName },
                        },
                    });
                }

                //filter with vessel types (vesselTypeId accepted from FE)
                if (input.vesselType && Array.isArray(input.vesselType) && input.vesselType.length > 0) {
                    matchStage.push({
                        $match: {
                            'vesselTypeInfo._id': { $in: input?.vesselType },
                        },
                    });
                }

                //filter with course status (status accepted from FE as array of strings)
                if (input.courseStatus && Array.isArray(input.courseStatus) && input.courseStatus.length > 0) {
                    matchStage.push({
                        $match: {
                            status: { $in: input.courseStatus },
                        },
                    });
                }

                //filter with learner status (status accepted from FE as array of strings)
                if (input.learnerStatus && Array.isArray(input.learnerStatus) && input.learnerStatus.length > 0 && input.learnerStatus.length < 2) {
                    matchStage.push({
                        $match: {
                            'userInfo.vesselStatus': { $in: input.learnerStatus },
                        },
                    });
                }
                //filter with designation (designationId accepted from FE)
                if (input.designation && Array.isArray(input.designation) && input.designation.length > 0) {
                    matchStage.push({
                        "$match": {
                            "employeeInfo.empDesignation": { "$in": input.designation }
                        }
                    });
                }


                const dateFilter = {};

                if (startDate) {
                    dateFilter['$gte'] = new Date(startDate);
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
        }
        let data;
        let dataToExport = [];
        if (input?.reportType === "ENROLLMENT") {
            const customEnrollmentReportPipeline = customEnrollmentReportQuery(matchStage);
            data = await OverallTrainingProgress.aggregate(customEnrollmentReportPipeline);

            data.forEach(item => {
                const learnerName = `${item.firstName? decrypt(item.firstName,true) : ""} ${item.lastName ? decrypt(item.lastName,true) : ""}`.trim() || "-";
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
                const country = item?.country || "Not Applicable";
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
                    Country: country,
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
            const customQuizReportPipeline = customQuizReportQuery(matchStage);
            data = await OverallTrainingProgress.aggregate(customQuizReportPipeline);

            const flattenDataForSingleSheet = learner => {
                const flattenedData = [];
                if (learner) {
                    const email = learner?.email ? decrypt(learner?.email) : "";
                    const designation = learner?.designation || "";
                    const country = learner?.country || "Not Applicable";
                    const firstName = learner?.firstName ? decrypt(learner?.firstName,true) : "";
                    const lastName = learner?.lastName ? decrypt(learner?.lastName,true) : "";
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
                            if (learner.contentType === "QUIZ") {
                                flattenedData.push({
                                    Name: `${firstName} ${lastName}`,
                                    Email: email,
                                    Country: country,
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
                "Country",
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
            const notificationMessage =
                input?.reportType == "ENROLLMENT"
                    ? `Custom report is ready to download`
                    : `Quiz report is ready to download`;
            await NotificationHelper.createNotificationhelper({
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
        return {
            status: true,
            fileName: path.basename(excelFilePath),
            filePath: s3PresignedUrl,
            message: "report generated successfully",
        };


    } catch (error) {
        await NotificationHelper.createNotificationhelper({
            subscriber: subscriberId,
            titleValue: `Custom Report Export Failed`,
            messageValue: `An error occurred while generating the custom report(${await ReportsHelper.getAppliedFilters(input)}). ${error?.message}.`,
            notificationType: NotificationType.REPORT_EXPORT_FAILED,
            notifyAllAdmin: false,
            isNotificatonForAdmin: true,
            notifiers: [userInfo._id],
            status: 'FAILED',
            icon: notificationiconEnum.ERROR,
            createdBy: userInfo,
        });
        throw new Error(error.message);
    }
}
*/
// ------------------------------------

//------------------SINGLE LEARNER REPORTS

/* 

const getSingleLearnerReport = async ({ input }, context) => {
    const { subscriberId, userInfo } = AuthUser(context);
    if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

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

                    await NotificationHelper.createNotificationhelper({
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
                    });
                }
                return {
                    filePath: s3PresignedUrl,
                    fileName: path.basename(excelFilePath),
                    learnerData: learnersReports,
                };
            }

            return {
                filePath: "",
                fileName: "",
                learnerData: learnersReports,
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
                    await NotificationHelper.createNotificationhelper({
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
                    });
                }

                return {
                    filePath: s3PresignedUrl,
                    fileName: path.basename(excelFilePath),
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

        await NotificationHelper.createNotificationhelper({
            subscriber: subscriberId,
            titleValue: `Learners Report Export Failed`,
            messageValue: `An error occurred while generating the learners report`,
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

*/

//---------------------------------------
















