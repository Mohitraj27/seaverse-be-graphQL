const { Moment, ObjectId } = require("../../tools");
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

const getMainLearnersReport = async ({ input }, context) => {
    const { subscriberId, userInfo } = AuthUser(context);
    if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
    let selectVesselOrLearner = "VESSEL";
    if (input?.selectVesselOrLearner) {
        selectVesselOrLearner = input?.selectVesselOrLearner;
    }
    try {
        const matchStage = [];
        let deteledUsersStage = [];
        if (input?.export) {
            await NotificationHelper.createNotificationhelper({
                subscriber: subscriberId,
                titleValue: `Learners Report Exported In Progress`,
                messageValue: `The learners report has been started and exporting by ${userInfo.firstName} ${userInfo.lastName}.`,
                notificationType: NotificationType.EXPORT_IN_PROGRESS,
                notifyAdmin: true,
                status: 'SENT',
                createdBy: userInfo,
                icon: notificationiconEnum.PROGRESS
            });
        }

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
                            $and: [
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
            }

        }

        const skip = input?.pageInput?.skip ? input.pageInput.skip : 0;
        const limit = input?.pageInput?.limit ? input.pageInput.limit : 50;

        if (limit > 0 && (!input?.export)) {
            matchStage.push({ $skip: skip }, { $limit: limit });
        }

        const employeesData = await Employee.aggregate([
            {
                $lookup: {
                    from: 'users',
                    localField: 'user',
                    foreignField: '_id',
                    as: 'userInfo',
                    pipeline: [
                        {
                            $match: {
                                role: "LEARNER",
                                superAdmin: false
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
            ...deteledUsersStage, 
            {
                $lookup: {
                    from: 'designations',
                    localField: 'empDesignation',
                    foreignField: '_id',
                    as: 'employeeDesignation',
                },
            },
            {
                $unwind: {
                    path: '$employeeDesignation',
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $lookup: {
                    from: 'trainingregistrations',
                    localField: 'user',
                    foreignField: 'user',
                    as: 'trainingInfo',
                },
            },
            {
                $lookup: {
                    from: 'uservessels',
                    localField: 'user',
                    foreignField: 'user',
                    as: 'vesselInfo',
                    pipeline: [
                        { $match: { isActive: true } },
                        { $sort: { updatedAt: -1 } },
                        { $limit: 1 }
                    ]
                },
            },
            {
                $unwind: {
                    path: '$vesselInfo',
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $lookup: {
                    from: 'vessels',
                    localField: 'vesselInfo.vessel',
                    foreignField: '_id',
                    as: 'vesselDetails',
                },
            },
            {
                $unwind: {
                    path: '$vesselDetails',
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $lookup: {
                    from: "vesseltypes",
                    localField: "vesselDetails.typeOfVessel",
                    foreignField: "_id",
                    as: "vesselTypeInfo"
                }
            },
            {
                $unwind:
                {
                    path: "$vesselTypeInfo",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: 'overalltrainingprogresses',
                    localField: 'user',
                    foreignField: 'user',
                    as: 'trainingProgresses',
                    pipeline: [
                        {
                            $match: { isEnrolled: true }
                        },
                    ],
                },
            },
            {
                $addFields: {
                    coursesCount: { $size: '$trainingProgresses' },
                    averageProgressPercentage: {
                        $cond: {
                            if: { $gt: [{ $size: '$trainingProgresses' }, 0] },
                            then: { $toInt: { $avg: '$trainingProgresses.progressPercentage' } },
                            else: 0,
                        },
                    },
                },
            },
            {
                $addFields: {
                    latestUpdatedAt: {
                        $max: ["$updatedAt", "$userInfo.updatedAt"],
                    },
                },
            },
            ...matchStage,
            {
                $project: {
                    _id: 0,
                    name: {
                        $concat: [
                            { $ifNull: ['$userInfo.firstName', ''] },
                            ' ',
                            { $ifNull: ['$userInfo.lastName', ''] },
                        ],
                    },
                    isRegistered: '$userInfo.isRegistered',
                    learnerId: '$userInfo._id',
                    isDeleted: '$userInfo.isDeleted',
                    EmployeeId: '$userInfo.civilIdOrPassport',
                    email: '$userInfo.email',
                    designation: '$employeeDesignation.name',
                    designationId: '$employeeDesignation._id',
                    vesselName: '$vesselDetails.name',
                    vesselId: '$vesselDetails._id',
                    vesselTypeName: "$vesselTypeInfo.name",
                    vesselTypeId: '$vesselTypeInfo._id',
                    lastSeen: '$userInfo.lastLoginAt',
                    coursesCount: 1,
                    createdAt: 1,
                    latestUpdatedAt :1,
                    averageProgressPercentage: 1,
                },
            },
            {
                '$sort': {
                    'latestUpdatedAt': -1
                }
            }
        ]);


        const data = employeesData.map(item => ({
            Name: item.name,
            EmployeeId: item.EmployeeId,
            Designation: item.designation,
            VesselName: item.vesselName,
            RegistrationStatus: item.isRegistered ? 'REGISTERED' : 'UNREGISTERED',
            LastSeen: item.lastSeen ? new Date(item.lastSeen).toLocaleString() : ' ',
            IsDeleted: item.isDeleted ? 'Yes' : 'No',
            vesselTypeName: item.vesselTypeName,
            CoursesCount: item.coursesCount,
            AverageProgressPercentage: item?.averageProgressPercentage ? parseInt(item.averageProgressPercentage).toFixed(2) : 0,
        }));

        let s3PresignedUrl = "";

        if (input?.export) {
            const workbook = XLSX.utils.book_new();
            let worksheet;
            if (data.length === 0) {
                const message = `NO DATA AVAILABLE FOR ${selectVesselOrLearner.toUpperCase()} REPORTS`;
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
                    messageValue: `The ${selectVesselOrLearner} report has been successfully generated and exported by ${userInfo.firstName} ${userInfo.lastName}.`,
                    notificationType: NotificationType.REPORT_EXPORT_SUCCESS,
                    notifyAdmin: true,
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
            employeesData
        };
    } catch (err) {
        if (input?.export) {
            await NotificationHelper.createNotificationhelper({
                subscriber: subscriberId,
                titleValue: `${input.selectVesselOrLearner} Report Export Failed`,
                messageValue: `An error occurred while generating the ${input.selectVesselOrLearner} report: ${err.message}.`,
                notificationType: NotificationType.REPORT_EXPORT_FAILED,
                notifyAdmin: true,
                status: 'FAILED',
                icon: notificationiconEnum.ERROR,
                createdBy: userInfo,
            });
        }
        throw Error(err.message);
    }
};

const getSingleLearnerReport = async ({ input }, context) => {
    const { subscriberId, userInfo } = AuthUser(context);
    if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

    try {
        const matchStage = [];
        let learnerData = [];

        if (input?.export) {
            await NotificationHelper.createNotificationhelper({
                subscriber: subscriberId,
                titleValue: ` Learner's report export In Progress`,
                messageValue: `The learner's report export has been initiated by ${userInfo.firstName} ${userInfo.lastName}.`,
                notificationType: NotificationType.EXPORT_IN_PROGRESS,
                notifyAdmin: true,
                status: 'SENT',
                createdBy: userInfo,
                icon: notificationiconEnum.PROGRESS
            });
        }

        if (input && Object.keys(input).length > 0) {
            if (!input?.selectVesselOrLearner) input.selectVesselOrLearner = 'LEARNER';
            const filterInput = input.filter || {};
            if (filterInput.title) {
                matchStage.push({
                    $match: {
                        "trainingInfo.title.value": {
                            $regex: filterInput.title,
                            $options: 'i'
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

        const skip = input?.pageInput?.skip ? input.pageInput.skip : 0;
        const limit = input?.pageInput?.limit ? input.pageInput.limit : 50;

        if (limit > 0 && (!input?.export)) {
            matchStage.push({ $skip: skip }, { $limit: limit });
        }
        const learnerIds = Array.isArray(input.learnerIds) ? input.learnerIds : [input.learnerIds];

        let matchUsers = [];
        if (learnerIds.length > 0) {
            matchUsers.push(
                {
                    "$match": {
                        "user": { $in: learnerIds.map(id => ObjectId(id)) }
                    }
                }
            );
        }


        if (input.reportType === "ENROLLMENT") {
            const learnersReports = await OverallTrainingProgress.aggregate(
                [
                    {
                        "$lookup": {
                            "from": "trainings",
                            "localField": "training",
                            "foreignField": "_id",
                            "as": "trainingInfo"
                        }
                    },
                    {
                        "$lookup": {
                            "from": "users",
                            "localField": "user",
                            "foreignField": "_id",
                            "as": "userInfo"
                        }
                    },
                    {
                        "$lookup": {
                            "from": "employees",
                            "localField": "user",
                            "foreignField": "user",
                            "as": "employeeInfo"
                        }
                    },
                    {
                        "$match": {
                            isEnrolled: true
                        }
                    },
                    ...matchUsers,
                    {
                        $lookup: {
                            from: "trainingprogresses",
                            localField: "_id",
                            foreignField: "overallTrainingProgress",
                            as: "quizevaluationInfo",
                            let: {
                                attemptCount: "$attemptCount"
                            },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $eq: [
                                                "$attemptCount",
                                                "$$attemptCount"
                                            ]
                                        }
                                    }
                                },
                                {
                                    $lookup: {
                                        from: "trainingmodulecontents",
                                        localField: "trainingModuleContent",
                                        foreignField: "_id",
                                        as: "contentInfo",
                                        pipeline: [
                                            {
                                                $match: {
                                                    $expr: {
                                                        $eq: ["$contentType", "QUIZ"]
                                                    }
                                                }
                                            }
                                        ]
                                    }
                                },
                                {
                                    $unwind: {
                                        path: "$contentInfo",
                                        preserveNullAndEmptyArrays: false
                                    }
                                },
                                {
                                    $sort: {
                                        updatedAt: -1
                                    }
                                },
                                {
                                    $limit: 1
                                },
                                {
                                    $project: {
                                        percentage:
                                            "$quizAttemptDetails.percentage",
                                        isPassed:
                                            "$quizAttemptDetails.isPassed"
                                    }
                                }
                            ]
                        }
                    },
                    {
                        "$unwind": {
                            "path": "$quizevaluationInfo",
                            "preserveNullAndEmptyArrays": true
                        }
                    },
                    {
                        "$unwind": {
                            "path": "$userInfo",
                            "preserveNullAndEmptyArrays": true
                        }
                    },
                    {
                        "$unwind": {
                            "path": "$employeeInfo",
                            "preserveNullAndEmptyArrays": true
                        }
                    },
                    {
                        "$lookup":
                        {
                            "from": "designations",
                            "localField": "employeeInfo.empDesignation",
                            "foreignField": "_id",
                            "as": "designationInfo"
                        }
                    },
                    {
                        "$unwind":
                        {
                            "path": "$designationInfo",
                            "preserveNullAndEmptyArrays": true
                        }
                    },
                    {
                        "$lookup": {
                            "from": "trainingprogress",
                            "localField": "training",
                            "foreignField": "training",
                            "as": "trainingProgressInfo",
                            "pipeline": [
                                {
                                    "$match": {
                                        "user": { $in: learnerIds.map(id => ObjectId(id)) },
                                        "status": "COMPLETED"
                                    }
                                },
                                {
                                    "$lookup": {
                                        "from": "trainingmodulecontents",
                                        "localField": "trainingModuleContent",
                                        "foreignField": "_id",
                                        "as": "moduleContentInfo"
                                    }
                                },
                                {
                                    "$unwind": {
                                        "path": "$moduleContentInfo",
                                        "preserveNullAndEmptyArrays": true
                                    }
                                },
                                {
                                    "$project": {
                                        "duration": "$moduleContentInfo.duration"
                                    }
                                }
                            ]
                        }
                    },
                    ...matchStage,
                    {
                        '$project': {
                            'firstName': '$userInfo.firstName',
                            'lastName': '$userInfo.lastName',
                            'email': '$userInfo.email',
                            'employeeId': '$userInfo.civilIdOrPassport',
                            'designation': '$designationInfo.name',
                            "isRegistered": "$userInfo.isRegistered",
                            'courseName': {
                                '$arrayElemAt': [
                                    '$trainingInfo.title.value', 0
                                ]
                            },
                            'createdAt': 1,
                            'unenrolmentDate': '$unenrollmentDate',
                            'startDate': "$startDate",
                            'completionDate': "$endDate",
                            'status': 1,
                            'adminMarkedAsCompleted': 1,
                            'updatedAt': 1,
                            'quizPercentage': {
                                '$ifNull': [
                                    '$quizevaluationInfo.percentage', null
                                ]
                            },
                            'isPassed': {
                                '$ifNull': [
                                    '$quizevaluationInfo.isPassed', null
                                ]
                            },
                            'totalTimeSpent': "$timeSpend"
                        }
                    },
                    {
                        '$sort': {
                            'createdAt': -1
                        }
                    }
                ]
            );

            const learnerReportsByUser = {};
            if (input?.export) {
                learnersReports.forEach(item => {
                    const learnerName = `${item.firstName || ''} ${item.lastName || ''}`.trim() || "-";
                    if (!learnerReportsByUser[learnerName]) {
                        learnerReportsByUser[learnerName] = [];
                    }

                    const enrollmentDate = item?.createdAt ? ReportsHelper.formatDate(item.createdAt) : "Not Applicable";
                    const completionDate = item?.endDate ? ReportsHelper.formatDate(item.endDate) : "Not Applicable";
                    const startDate = item?.startDate && item.startDate !== 'startDate'
                        ? ReportsHelper.formatDate(item.startDate)
                        : "Not Applicable";
                    const unenrollmentDate = item?.unenrollmentDate ? ReportsHelper.formatDate(item.unenrollmentDate) : "Not Applicable";

                    const quizScore = (typeof item.quizPercentage === 'string')
                        ? item.quizPercentage
                        : (typeof item.quizPercentage === 'number' && !isNaN(item.quizPercentage))
                            ? item.quizPercentage.toFixed(2)
                            : null;
                    const userState = item.isRegistered ? "Registered" : "Unregistered";
                    const timeSpent = item.totalTimeSpent ? Math.round(item.totalTimeSpent) : 0;

                    learnerReportsByUser[learnerName].push({
                        Name: learnerName,
                        Email: item.email || null,
                        Designation: item.designation || null,
                        'Course Name': item.courseName ? item.courseName[0] : null,
                        Status: item.status || null,
                        'Admin Marked As Completed': item.adminMarkedAsCompleted ? 'Yes' : 'No',
                        'Enrollment Date': enrollmentDate,
                        'Unenrollment Date': unenrollmentDate,
                        'Completion Date': completionDate,
                        'Started Date': startDate,
                        'Quiz Score': quizScore,
                        userState: userState,
                        'Time Spent (mins)': timeSpent,
                    });
                });
            } else {
                learnersReports.forEach(item => {
                    const learnerName = `${item.firstName || ''} ${item.lastName || ''}`.trim() || "-";
                    if (!learnerReportsByUser[learnerName]) {
                        learnerReportsByUser[learnerName] = [];
                    }

                    learnerReportsByUser[learnerName].push({
                        courseName: item.courseName ? item.courseName[0] : null,
                        status: item.status,
                        Enrollment_Date: item.createdAt,
                        Completion_Date: item.completionDate || "Not Applicable",
                        totalTimeSpent: item.totalTimeSpent || 0,
                        LastSeen: item.updatedAt ? new Date(item.updatedAt).toLocaleString() : 'N/A',
                    });
                });
            }

            let s3PresignedUrl = "";

            if (input?.export  ) {
                const workbook = XLSX.utils.book_new();
                const combinedData = [];
                for (const learnerName in learnerReportsByUser) {
                    const data = learnerReportsByUser[learnerName];
                    combinedData.push(...data);
                    combinedData.push([]);
                }

                let worksheet;
                if (combinedData.length === 0) {
                    const message = "NO DATA AVAILABLE FOR SELECTED USER REPORTS";
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
                }
                else {
                    worksheet = XLSX.utils.json_to_sheet(combinedData, { header: [] });
                }

                XLSX.utils.book_append_sheet(workbook, worksheet, input.reportType);
                const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });


                const excelFilePath = await UploadHelper.uploadExcel({
                    data: excelBuffer,
                    folderName: `Multiple_Learners_Report_exports`,
                    fileName: `${(input.selectVesselOrLearner).toLowerCase()}-Report-${await ReportsHelper.generateFileNameTimestamp()}.xlsx`,
                    uploadType: UploadHelper.uploadType.exportLearnersCoursesReportAsExcel,
                });
                if (excelFilePath) {
                    s3PresignedUrl = await aws_helper.fetchFile(excelFilePath);

                    await NotificationHelper.createNotificationhelper({
                        subscriber: subscriberId,
                        titleValue: `Single Learner Report Exported Successfully`,
                        messageValue: `The single learner report has been successfully generated and exported by ${userInfo.firstName} ${userInfo.lastName}.`,
                        notificationType: NotificationType.REPORT_EXPORT_SUCCESS,
                        notifyAdmin: true,
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
            const learnersData = await OverallTrainingProgress.aggregate(
                [
                    {
                        $match:
                        {
                            user: { $in: input.learnerIds }
                        }
                    },
                    {
                        "$match": {
                            isEnrolled: true
                        }
                    },
                    {
                        $lookup: {
                            from: "trainings",
                            localField: "training",
                            foreignField: "_id",
                            as: "trainingInfo"
                        }
                    },
                    {
                        $unwind: {
                            path: "$trainingInfo",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $lookup: {
                            from: "users",
                            localField: "user",
                            foreignField: "_id",
                            as: "userInfo",
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
                        $unwind: {
                            path: "$userInfo",
                            preserveNullAndEmptyArrays: false
                        }
                    },
                    {
                        $lookup: {
                            from: "employees",
                            localField: "user",
                            foreignField: "user",
                            as: "employeeInfo",
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
                        $unwind: {
                            path: "$employeeInfo",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $lookup: {
                            from: "designations",
                            localField: "employeeInfo.empDesignation",
                            foreignField: "_id",
                            as: "designationInfo"
                        }
                    },
                    {
                        $unwind: {
                            path: "$designationInfo",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $lookup: {
                            from: "vessels",
                            localField: "userInfo.currentVessel",
                            foreignField: "_id",
                            as: "vesselInfo"
                        }
                    },
                    {
                        $unwind: {
                            path: "$vesselInfo",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $lookup: {
                            from: "vesseltypes",
                            localField: "vesselInfo.typeOfVessel",
                            foreignField: "_id",
                            as: "vesselTypeInfo"
                        }
                    },
                    {
                        $unwind: {
                            path: "$vesselTypeInfo",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $lookup: {
                            from: "trainingprogresses",
                            localField: "_id",
                            foreignField: "overallTrainingProgress",
                            as: "quizEvaluations",
                            let: {
                                attemptCount: "$attemptCount",
                                status: "$status"
                            },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $eq: [
                                                "$attemptCount",
                                                "$$attemptCount"
                                            ]
                                        }
                                    }
                                },
                                {
                                    $lookup: {
                                        from: "trainingmodules",
                                        localField: "trainingModule",
                                        foreignField: "_id",
                                        as: "moduleInfo"
                                    }
                                },
                                {
                                    $unwind: {
                                        path: "$moduleInfo",
                                        preserveNullAndEmptyArrays: true
                                    }
                                },
                                {
                                    $lookup: {
                                        from: "trainingmodulecontents",
                                        localField: "trainingModuleContent",
                                        foreignField: "_id",
                                        as: "contentInfo"
                                    }
                                },
                                {
                                    $unwind: {
                                        path: "$contentInfo",
                                        preserveNullAndEmptyArrays: true
                                    }
                                },
                                {
                                    $project: {
                                        moduleId: "$moduleInfo._id",
                                        moduleName: "$moduleInfo.title",
                                        contentName: "$contentInfo.title",
                                        displayOrder: "$moduleInfo.order",
                                        percentage:
                                            "$quizAttemptDetails.percentage",
                                        isPassed:
                                            "$quizAttemptDetails.isPassed",
                                        contentType:
                                            "$contentInfo.contentType",
                                        updatedAt: 1,
                                        contentStatus: {
                                            $cond: {
                                                if: {
                                                    $gt: [
                                                        {
                                                            $type: "$quizAttemptDetails"
                                                        },
                                                        "missing"
                                                    ]
                                                },
                                                then: "COMPLETED",
                                                else: "NOT_STARTED"
                                            }
                                        }
                                    }
                                },
                                {
                                    $sort: {
                                        displayOrder: -1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $lookup: {
                            from: "trainingcontentbridges",
                            localField: "training",
                            foreignField: "training",
                            as: "initialContents",
                            let: {
                                status: "$status",
                                adminMarkedAsCompleted: "$adminMarkedAsCompleted",
                            },
                            pipeline: [
                                {
                                    $match: {
                                        isDeleted: {
                                            $ne: true
                                        }
                                    }
                                },
                                {
                                    $match: {
                                        $expr: {
                                            $or: [
                                                { $eq: ["$$status", "NOT_STARTED"] },
                                                { $eq: ["$$adminMarkedAsCompleted", true] } 
                                            ]
                                        }
                                    }
                                },
                                {
                                    $lookup: {
                                        from: "trainingmodules",
                                        localField: "trainingModule",
                                        foreignField: "_id",
                                        as: "moduleInfo"
                                    }
                                },
                                {
                                    $unwind: {
                                        path: "$moduleInfo",
                                        preserveNullAndEmptyArrays: true
                                    }
                                },
                                {
                                    $lookup: {
                                        from: "trainingmodulecontents",
                                        localField: "trainingContent",
                                        foreignField: "_id",
                                        as: "contentInfo"
                                    }
                                },
                                {
                                    $unwind: {
                                        path: "$contentInfo",
                                        preserveNullAndEmptyArrays: true
                                    }
                                },
                                {
                                    $project: {
                                        moduleId: "$moduleInfo._id",
                                        moduleName: "$moduleInfo.title",
                                        contentName: "$contentInfo.title",
                                        contentStatus: "$contentInfo.status",
                                        displayOrder: "$moduleInfo.order",
                                        percentage:
                                            "$quizAttemptDetails.percentage",
                                        isPassed:
                                            "$quizAttemptDetails.isPassed",
                                        contentType:
                                            "$contentInfo.contentType",
                                        updatedAt: 1,
                                        contentStatus: {
                                            $cond: {
                                                if: {
                                                    $gt: [
                                                        {
                                                            $type: "$quizAttemptDetails"
                                                        },
                                                        "missing"
                                                    ]
                                                },
                                                then: "COMPLETED",
                                                else: "NOT_STARTED"
                                            }
                                        }
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            quizEvaluations: {
                                $cond: {
                                    if: {
                                        $or: [
                                          { $eq: ["$status", "NOT_STARTED"] },
                                          { $eq: ["$adminMarkedAsCompleted", true] } 
                                        ]
                                    },
                                    then: "$initialContents",
                                    else: "$quizEvaluations"
                                }
                            }
                        }
                    },
                    {
                        $unwind: {
                            path: "$quizEvaluations",
                            preserveNullAndEmptyArrays: false
                        }
                    },
                    ...matchStage,
                    {
                        $group: {
                            _id: {
                                userId: "$user",
                                moduleId: "$quizEvaluations.moduleId"
                            },
                            userId: {
                                $first: "$user"
                            },
                            startDate: {
                                $first: "$startDate"
                            },
                            endDate: {
                                $first: "$endDate"
                            },
                            unenrollmentDate: {
                                $first: "$unenrollmentDate"
                            },
                            timeSpend: {
                                $first: "$timeSpend"
                            },
                            training: {
                                $first: "$training"
                            },
                            trainingTitle: {
                                $first: "$trainingInfo.title"
                            },
                            userId: {
                                $first: "$userInfo._id"
                            },
                            firstName: {
                                $first: "$userInfo.firstName"
                            },
                            lastName: {
                                $first: "$userInfo.lastName"
                            },
                            email: {
                                $first: "$userInfo.email"
                            },
                            empId: {
                                $first: "$userInfo.civilIdOrPassport"
                            },
                            status: {
                                $first: "$status"
                            },
                            adminMarkedAsCompleted: {
                                $first: "$adminMarkedAsCompleted"
                            },
                            currentVessel: {
                                $first: "$vesselInfo.name"
                            },
                            vesselType: {
                                $first: "$vesselTypeInfo.name"
                            },
                            designation: {
                                $first: "$designationInfo.name"
                            },
                            createdAt: {
                                $first: "$createdAt"
                            },
                            lastSeen: {
                                $first: "$updatedAt"
                            },
                            moduleContents: {
                                $push: {
                                    $cond: {
                                        if: {
                                            $eq: [
                                                "$quizEvaluations.contentType",
                                                "QUIZ"
                                            ]
                                        },
                                        then: {
                                            moduleName:
                                                "$quizEvaluations.moduleName",
                                            contentName:
                                                "$quizEvaluations.contentName",
                                            percentage:
                                                "$quizEvaluations.percentage",
                                            order:
                                                "$quizEvaluations.displayOrder",
                                            isQuizPassed:
                                                "$quizEvaluations.isPassed",
                                            contentType:
                                                "$quizEvaluations.contentType",
                                            updatedAt:
                                                "$quizEvaluations.updatedAt",
                                            quizStatus:
                                                "$quizEvaluations.contentStatus"
                                        },
                                        else: {
                                            moduleName:
                                                "$quizEvaluations.moduleName",
                                            contentName:
                                                "$quizEvaluations.contentName",
                                            percentage: "NOT APPLICABLE",
                                            order:
                                                "$quizEvaluations.displayOrder",
                                            isQuizPassed:
                                                "$quizEvaluations.isPassed",
                                            contentType:
                                                "$quizEvaluations.contentType",
                                            updatedAt:
                                                "$quizEvaluations.updatedAt",
                                            quizStatus:
                                                "$quizEvaluations.contentStatus"
                                        }
                                    }
                                }
                            }
                        }
                    },
                    {
                        $group: {
                            _id: {
                                userId: "$userId",
                                trainingId: "$training"
                            },
                            firstName: {
                                $first: "$firstName"
                            },
                            lastName: {
                                $first: "$lastName"
                            },
                            trainingTitle: {
                                $first: "$trainingTitle"
                            },
                            email: {
                                $first: "$email"
                            },
                            empId: {
                                $first: "$empId"
                            },
                            status: {
                                $first: "$status"
                            },
                            adminMarkedAsCompleted: {
                                $first: "$adminMarkedAsCompleted"
                            },
                            currentVessel: {
                                $first: "$currentVessel"
                            },
                            vesselType: {
                                $first: "$vesselType"
                            },
                            designation: {
                                $first: "$designation"
                            },
                            createdAt: {
                                $first: "$createdAt"
                            },
                            startDate: {
                                $first: "$startDate"
                            },
                            endDate: {
                                $first: "$endDate"
                            },
                            unenrollmentDate: {
                                $first: "$unenrollmentDate"
                            },
                            lastSeen: {
                                $first: "$lastSeen"
                            },
                            modules: {
                                $push: {
                                    moduleName: "$moduleContents",
                                    hasQuiz: "$hasQuiz",
                                    moduleName: {
                                        $arrayElemAt: [
                                            "$moduleContents.moduleName",
                                            0
                                        ]
                                    },
                                    moduleId: {
                                        $arrayElemAt: [
                                            {
                                                $arrayElemAt: [
                                                    "$moduleContents.moduleName._id",
                                                    0
                                                ]
                                            },
                                            0
                                        ]
                                    },
                                    order: {
                                        $arrayElemAt: [
                                            "$moduleContents.order",
                                            0
                                        ]
                                    },
                                    moduleContents: "$moduleContents"
                                }
                            }
                        }
                    },
                    {
                        $project: {
                            courseId: "$_id.trainingId",
                            user: "$_id.userId",
                            firstName: 1,
                            lastName: 1,
                            email: 1,
                            designation: 1,
                            status: 1,
                            adminMarkedAsCompleted: 1,
                            createdAt: 1,
                            startDate: 1,
                            endDate: 1,
                            unenrollmentDate: 1,
                            empId: 1,
                            trainingTitle: 1,
                            modules: {
                                $sortArray: {
                                    input: "$modules",
                                    sortBy: {
                                        order: 1
                                    }
                                }
                            },
                            lastSeen: 1
                        }
                    },
                    {
                        $sort: {
                            createdAt: -1
                        }
                    },
                ]
            );

            let s3PresignedUrl = "";
            if (input?.export) {
                const flattenDataForSingleSheet = (learner) => {
                    const flattenedData = [];
                    if (learner) {

                        const email = learner?.email || '';
                        const designation = learner?.designation || '';
                        const firstName = learner?.firstName || '';
                        const lastName = learner?.lastName || '';
                        const status = learner?.status || 'NOT APPLICABLE';
                        const isAdminMarkedAsCompleted = learner?.adminMarkedAsCompleted ? 'Yes' : 'No';
                        const courseName = learner?.trainingTitle[0]?.value || 'Unknown Course';
                        const enrollmentDate = learner?.createdAt ? ReportsHelper.formatDate(learner.createdAt) : "Not Applicable";
                        const completionDate = learner?.endDate ? ReportsHelper.formatDate(learner.endDate) : "Not Applicable";
                        const startDate = learner?.startDate && learner.startDate !== 'startDate'
                            ? ReportsHelper.formatDate(learner.startDate)
                            : "Not Applicable";
                        const unenrollmentDate = learner?.unenrollmentDate ? ReportsHelper.formatDate(learner.unenrollmentDate) : "Not Applicable";


                        learner.modules.forEach((module, moduleIndex) => {
                            const moduleName = module?.moduleName[0]?.value || 'Unnamed Module';
                            const hasQuiz = module?.hasQuiz || false;


                            module?.moduleContents.forEach((content, contentIndex) => {
                                const contentName = content?.contentName[0]?.value || 'Unnamed Content';
                                const contentType = content?.contentType || 'NOT APPLICABLE';
                                const quizScore = content?.percentage || 'NOT APPLICABLE';


                                flattenedData.push({
                                    Name: `${firstName} ${lastName}`,
                                    Email: email,
                                    Designation: designation,
                                    'Course Name': courseName,
                                    'Course Status': status,
                                    'Admin Marked As Completed': isAdminMarkedAsCompleted,
                                    'Lesson Name': `(Lesson ${moduleIndex + 1})  ${moduleName}`,
                                    'Content Name': `(Content ${contentIndex + 1})  ${contentName}`,
                                    'Content Type': contentType,
                                    'Quiz Score': quizScore,
                                    'Enrollment Date': enrollmentDate,
                                    'Course Started Date': startDate,
                                    'Course Completion Date': completionDate,
                                    'Unenrollment Date': unenrollmentDate,
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
                        const message = "NO DATA AVAILABLE FOR SELECTED LEARNER REPORTS";
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
                    }
                    else {
                        worksheet = XLSX.utils.json_to_sheet(combinedData, { header: [] });
                    }
                    XLSX.utils.book_append_sheet(workbook, worksheet, input.reportType);
                    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

                    const excelFilePath = await UploadHelper.uploadExcel({
                        data: excelBuffer,
                        folderName: "Multiple_Learners_Report_exports",
                        fileName: `${(input.selectVesselOrLearner).toLowerCase()}_report-${await ReportsHelper.generateFileNameTimestamp()}.xlsx`,
                        uploadType: UploadHelper.uploadType.exportLearnersCoursesReportAsExcel,
                    });

                    return excelFilePath;
                };

                const excelFilePath = await exportToExcelWithMultipleSheets(learnersData);

                if (excelFilePath) {
                    s3PresignedUrl = await aws_helper.fetchFile(excelFilePath);
                    await NotificationHelper.createNotificationhelper({
                        subscriber: subscriberId,
                        titleValue: `Single Learner Report Exported Successfully`,
                        messageValue: `The single learner report has been successfully generated and exported by ${userInfo.firstName} ${userInfo.lastName}.`,
                        notificationType: NotificationType.REPORT_EXPORT_SUCCESS,
                        notifyAdmin: true,
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
            notifyAdmin: true,
            status: 'FAILED',
            icon: notificationiconEnum.ERROR,
            createdBy: userInfo,
        });
        throw Error(err.message);
    }
};

const getMainCoursesReport = async ({ input }, context) => {
    const { subscriberId, userInfo } = AuthUser(context);
    if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

    try {
        input = input || {};

        const matchStage = [];

        if (input?.export) {
            await NotificationHelper.createNotificationhelper({
                subscriber: subscriberId,
                titleValue: `Main Course Report Exported In Progress`,
                messageValue: `The main course report has been started generating and exporting by ${userInfo.firstName} ${userInfo.lastName}.`,
                notificationType: NotificationType.EXPORT_IN_PROGRESS,
                notifyAdmin: true,
                status: 'SENT',
                createdBy: userInfo,
                icon: notificationiconEnum.PROGRESS
            });
        }

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

        }

        const skip = input?.pageInput?.skip ? input.pageInput.skip : 0;
        const limit = input?.pageInput?.limit ? input.pageInput.limit : 50;
        const pageLimit = [];
        if (limit > 0 && (!input?.export)) {
            pageLimit.push({ $skip: skip }, { $limit: limit });
        }


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
                    pipeline : [
                      {
                        $match :{
                          isDeleted : false
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
            }
            else {
                worksheet = XLSX.utils.json_to_sheet(data);
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
                    messageValue: `The Courses report has been successfully generated and exported by ${userInfo.firstName} ${userInfo.lastName}.`,
                    notificationType: NotificationType.COURSE_REPORT_EXPORT_SUCCESS,
                    notifyAdmin: true,
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
                notifyAdmin: true,
                status: 'FAILED',
                icon: notificationiconEnum.ERROR,
                createdBy: userInfo,
            });
        }
        throw Error(err.message);
    }
};

const getSingleCourseReport = async ({ input }, context) => {
    const { subscriberId, userInfo } = AuthUser(context);
    if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

    try {
        input = input || {};

        const matchStage = [];
        const pageLimit = [];

        if (input?.export) {
            await NotificationHelper.createNotificationhelper({
                subscriber: subscriberId,
                titleValue: `Selected Course Report Export In Progress`,
                messageValue: `The single course report has been started generating and exporting by ${userInfo.firstName} ${userInfo.lastName}.`,
                notificationType: NotificationType.EXPORT_IN_PROGRESS,
                notifyAdmin: true,
                status: 'SENT',
                createdBy: userInfo,
                icon: notificationiconEnum.PROGRESS
            });
        }

        if (!input?.reportType) {
            throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Report Type is Required");
        }
        if (Object.keys(input).length > 0) {
            const filterInput = input.filter || {};
            const searchString = filterInput.search || '';
            if (searchString.trim() !== '') {
                const regexSearch = new RegExp(searchString.trim(), 'i');

                matchStage.push({
                    $match: {
                        $or: [
                            { 'usersVesselInfo.name': { $regex: regexSearch } },
                            { 'vesselTypeInfo.name': { $regex: regexSearch } },
                            { 'designationInfo.name': { $regex: regexSearch } },
                            { 'status': { $regex: regexSearch } }
                        ]
                    }
                });
            }


            if (filterInput.dateRange) {
                const { startDate, endDate } = filterInput.dateRange;

                if (!startDate && !endDate) {
                    throw Error("Both startDate and endDate cannot be missing when dateRange is provided.");
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

            if (filterInput.vesselType && Array.isArray(filterInput.vesselType) && filterInput.vesselType.length > 0) {
                matchStage.push({
                    $match: {
                        'vesselTypeInfo._id': { $in: filterInput.vesselType },
                    },
                });
            }

            if (filterInput.vesselName && Array.isArray(filterInput.vesselName) && filterInput.vesselName.length > 0) {
                matchStage.push({
                    $match: {
                        'usersVesselInfo._id': { $in: filterInput.vesselName },
                    },
                });
            }
            if (filterInput.designation && Array.isArray(filterInput.designation) && filterInput.designation.length > 0) {
                matchStage.push({
                    $match: {
                        'designationInfo._id': { $in: filterInput.designation },
                    },
                });
            }
            if (filterInput.courseStatus && Array.isArray(filterInput.courseStatus) && filterInput.courseStatus.length > 0) {
                matchStage.push({
                    $match: {
                        status: { $in: filterInput.courseStatus },
                    },
                });
            }
            if (filterInput.learnerIds && Array.isArray(filterInput.learnerIds) && filterInput.learnerIds.length > 0) {
                matchStage.push({
                    $match: {
                        user: { $in: filterInput.learnerIds },
                    },
                });
            }
        }

        const skip = input?.pageInput?.skip ? input.pageInput.skip : 0;
        const limit = input?.pageInput?.limit ? input.pageInput.limit : 50;

        if (limit > 0 && (!input?.export)) {
            pageLimit.push({ $skip: skip }, { $limit: limit });
        }

        if (input?.reportType === "ENROLLMENT") {
            const data = await OverallTrainingProgress.aggregate(
                [
                    {
                        $lookup: {
                            from: "trainings",
                            localField: "training",
                            foreignField: "_id",
                            as: "trainingInfo"
                        }
                    },
                    {
                        $unwind: {
                            path: "$trainingInfo",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $lookup: {
                            from: "users",
                            localField: "user",
                            foreignField: "_id",
                            as: "userInfo",
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
                        $unwind: {
                            path: "$userInfo",
                            preserveNullAndEmptyArrays: false
                        }
                    },
                    {
                        $match: {
                            training: ObjectId(input?.courseId)
                        }
                    },
                    {
                        $lookup: {
                            from: 'trainingprogresses',
                            localField: '_id',
                            foreignField: 'overallTrainingProgress',
                            as: 'quizevaluationInfo',
                            let: {
                                attemptCount: '$attemptCount',
                            },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $eq: ['$attemptCount', '$$attemptCount'],
                                        },
                                    },
                                },
                                {
                                    $lookup: {
                                        from: 'trainingmodulecontents',
                                        localField: 'trainingModuleContent',
                                        foreignField: '_id',
                                        as: 'contentInfo',
                                        pipeline: [
                                            {
                                                $match: {
                                                    $expr: {
                                                        $eq: ['$contentType', 'QUIZ'],
                                                    },
                                                },
                                            },
                                        ],
                                    },
                                },
                                {
                                    $unwind: {
                                        path: '$contentInfo',
                                        preserveNullAndEmptyArrays: false,
                                    },
                                },
                                {
                                    $sort: {
                                        updatedAt: -1,
                                    },
                                },
                                {
                                    $limit: 1,
                                },
                                {
                                    $project: {
                                        percentage: '$quizAttemptDetails.percentage',
                                        isPassed: '$quizAttemptDetails.isPassed',
                                    },
                                },
                            ],
                        },
                    },
                    {
                        $unwind: {
                            path: "$quizevaluationInfo",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $lookup: {
                            from: "employees",
                            localField: "user",
                            foreignField: "user",
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
                        $unwind: {
                            path: "$empDetails",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $lookup: {
                            from: "designations",
                            localField: "empDetails.empDesignation",
                            foreignField: "_id",
                            as: "designationInfo"
                        }
                    },
                    {
                        $unwind: {
                            path: "$designationInfo",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $lookup: {
                            from: "uservessels",
                            localField: "user",
                            foreignField: "user",
                            as: "usersVesselBridge",
                            pipeline: [
                                { $match: { isActive: true } },
                                { $sort: { updatedAt: -1 } },
                                { $limit: 1 }
                            ]
                        }
                    },
                    {
                        $unwind: {
                            path: "$usersVesselBridge",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $lookup: {
                            from: "vessels",
                            localField: "usersVesselBridge.vessel",
                            foreignField: "_id",
                            as: "usersVesselInfo"
                        }
                    },
                    {
                        $unwind: {
                            path: "$usersVesselInfo",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $lookup: {
                            from: "vesseltypes",
                            localField: "usersVesselInfo.typeOfVessel",
                            foreignField: "_id",
                            as: "vesselTypeInfo"
                        }
                    },
                    {
                        $unwind: {
                            path: "$vesselTypeInfo",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    ...matchStage,
                    {
                        $project: {
                            firstName: "$userInfo.firstName",
                            lastName: "$userInfo.lastName",
                            email: '$userInfo.email',
                            designation: "$designationInfo.name",
                            status: 1,
                            adminMarkedAsCompleted: 1,
                            createdAt: 1,
                            startDate: 1,
                            endDate: 1,
                            unenrollmentDate: 1,
                            updatedAt: 1,
                            quizPercentage: {
                                $ifNull: [
                                    "$quizevaluationInfo.percentage",
                                    null
                                ]
                            },
                            trainingTitle: "$trainingInfo.title",
                            empId: "$userInfo.civilIdOrPassport",
                            vesselName: "$usersVesselInfo.name",
                            vesselType: "$vesselTypeInfo.name",
                            isPassed: {
                                $ifNull: [
                                    "$quizevaluationInfo.isPassed",
                                    null
                                ]
                            },
                            totalTimeSpent: "$timeSpend"
                        }
                    },
                    {
                        $sort:
                        {
                            createdAt: -1
                        }
                    },
                    ...pageLimit
                ]

            );
            if (data.length > 0) {

                const coursesData = data.map(item => ({
                    _id: item._id,
                    learnerName: (item?.firstName ? item.firstName : "") + " " + (item?.lastName ? item.lastName : ""),
                    employeeId: item.empId ? item.empId : null,
                    trainingTitle: item?.trainingTitle,
                    designation: item?.designation,
                    email: item?.email,
                    status: item?.status,
                    currentVessel: item.vesselName,
                    vesselType: item.vesselType,
                    createdAt: item?.createdAt ? new Date(item.createdAt).toLocaleString() : null,
                    updatedAt: item?.updatedAt ? new Date(item.updatedAt).toLocaleString() : null,
                    completionDate: item?.endDate ? new Date(item.endDate).toLocaleString() : null,
                    timeSpent: item.totalTimeSpent,
                    quizPercentage: item.quizPercentage,
                    isPassed: item.isPassed,
                }));

                let s3PresignedUrl = "";

                if (input?.export) {
                    if (!data) throw CustomError(ErrorName.NOT_FOUND, "No there is no data present");
                    const parsedData = data.map(item => {

                        const learnerName = `${item.firstName || ''} ${item.lastName || ''}`;
                        const enrollmentDate = item?.createdAt ? ReportsHelper.formatDate(item.createdAt) : "Not Applicable";
                        const completionDate = item?.endDate ? ReportsHelper.formatDate(item.endDate) : "Not Applicable";
                        const startDate = item?.startDate && item?.startDate !== 'startDate'
                            ? ReportsHelper.formatDate(item?.startDate)
                            : "Not Applicable";
                        const unenrollmentDate = item?.unenrollmentDate ? ReportsHelper.formatDate(item?.unenrollmentDate) : "Not Applicable";
                        const timeSpent = item.totalTimeSpent ? item.totalTimeSpent+" mins" : '0 mins';
                        const quizScore = (typeof item.quizPercentage === 'string')
                            ? `${parseInt(item.quizPercentage, 10)}%`
                            : (typeof item.quizPercentage === 'number' && !isNaN(item.quizPercentage))
                                ? `${Math.round(item.quizPercentage)}%`
                                : 'Not Applicable';
                        const courseStatus = item.status || 'Not Started';

                        const currentVessel = item.vesselName || '';
                        const vesselType = item.vesselType || '';
                        const courseName = item?.trainingTitle[0].value;
                        const adminMarkedAsCompleted = item.adminMarkedAsCompleted ? 'Yes' : 'No';
                        const parsedItem = {
                            LearnerName: learnerName,
                            Email: item.email || '',
                            EmployeeId: item.empId || '',
                            Designation: item.designation || '',
                            CurrentVessel: currentVessel,
                            VesselType: vesselType,
                            CourseName: courseName,
                            CourseStatus: courseStatus,
                            'Admin Marked As Completed': adminMarkedAsCompleted,
                            TimeSpent: timeSpent,
                            QuizScore: quizScore,
                            'Course Enrollment Date': enrollmentDate,
                            'Course Started Date': startDate,
                            'Course Unenrollment Date': unenrollmentDate,
                            'Course Completion Date': completionDate,
                        };

                        return parsedItem;
                    });
                    const workbook = XLSX.utils.book_new();
                    const worksheet = XLSX.utils.json_to_sheet(parsedData);
                    XLSX.utils.book_append_sheet(workbook, worksheet, `${input?.reportType}`);
                    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

                    const excelFilePath = await UploadHelper.uploadExcel({
                        data: excelBuffer,
                        folderName: "COURSE-ENROLMENT-REPORT",
                        fileName: `COURSE-ENROLMENT-REPORT-${await ReportsHelper.generateFileNameTimestamp()}.xlsx`,
                        uploadType: UploadHelper.uploadType.exportLearnersCoursesReportAsExcel,
                    });
                    if (excelFilePath) {
                        s3PresignedUrl = await aws_helper.fetchFile(excelFilePath);
                        await NotificationHelper.createNotificationhelper({
                            subscriber: subscriberId,
                            titleValue: `Enrollment Report Exported Successfully`,
                            messageValue: `The Courses Enrollment report has been successfully generated and exported by ${userInfo.firstName} ${userInfo.lastName}.`,
                            notificationType: NotificationType.COURSE_ENROLLMENT_REPORT_EXPORT_SUCCESS,
                            notifyAdmin: true,
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
                        coursesData,
                    };
                }

                return {
                    coursesData,
                };
            } else if (data.length === 0 && input?.export) {

                const workbook = XLSX.utils.book_new();
                let worksheet;

                const message = "NO DATA AVAILABLE FOR THE SELECTED COURSE";
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

                XLSX.utils.book_append_sheet(workbook, worksheet, `${input?.reportType}`);
                const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

                const excelFilePath = await UploadHelper.uploadExcel({
                    data: excelBuffer,
                    folderName: "COURSE-ENROLMENT-REPORT",
                    fileName: `COURSE-ENROLMENT-REPORT-${await ReportsHelper.generateFileNameTimestamp()}.xlsx`,
                    uploadType: UploadHelper.uploadType.exportLearnersCoursesReportAsExcel,
                });
                if (excelFilePath) {
                    s3PresignedUrl = await aws_helper.fetchFile(excelFilePath);
                    await NotificationHelper.createNotificationhelper({
                        subscriber: subscriberId,
                        titleValue: `Enrollment Report Exported Successfully`,
                        messageValue: `The Courses Enrollment report has been successfully generated and exported by ${userInfo.firstName} ${userInfo.lastName}.`,
                        notificationType: NotificationType.COURSE_ENROLLMENT_REPORT_EXPORT_SUCCESS,
                        notifyAdmin: true,
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
                    coursesData: [],
                };
            }
        }
        else if (input?.reportType === "QUIZ") {
            const data = await OverallTrainingProgress.aggregate(
                [
                    {
                        '$match': {
                            'training': ObjectId(input?.courseId)
                        }
                    },
                    {
                        $lookup: {
                            from: "trainings",
                            localField: "training",
                            foreignField: "_id",
                            as: "trainingInfo"
                        }
                    },
                    {
                        $unwind: {
                            path: "$trainingInfo",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        '$lookup': {
                            'from': 'users',
                            'localField': 'user',
                            'foreignField': '_id',
                            'as': 'userInfo',
                            pipeline : [
                              {
                                $match :{
                                  isDeleted : false
                                }
                              }
                            ]
                        }
                    }, {
                        '$unwind': {
                            'path': '$userInfo',
                            'preserveNullAndEmptyArrays': false
                        }
                    }, {
                        // Get the employee details of not deleted users
                        '$lookup': {
                            'from': 'employees',
                            'localField': 'user',
                            'foreignField': 'user',
                            'as': 'employeeInfo',
                            pipeline: [
                                {
                                    $match: {
                                        isDeleted: false
                                    }
                                }
                            ]
                        }
                    }, {
                        '$unwind': {
                            'path': '$employeeInfo',
                            'preserveNullAndEmptyArrays': true
                        }
                    }, {
                        '$lookup': {
                            'from': 'designations',
                            'localField': 'employeeInfo.empDesignation',
                            'foreignField': '_id',
                            'as': 'designationInfo'
                        }
                    }, {
                        '$unwind': {
                            'path': '$designationInfo',
                            'preserveNullAndEmptyArrays': true
                        }
                    }, {
                        '$lookup': {
                            'from': 'vessels',
                            'localField': 'userInfo.currentVessel',
                            'foreignField': '_id',
                            'as': 'vesselInfo'
                        }
                    }, {
                        '$unwind': {
                            'path': '$vesselInfo',
                            'preserveNullAndEmptyArrays': true
                        }
                    }, {
                        '$lookup': {
                            'from': 'vesseltypes',
                            'localField': 'vesselInfo.typeOfVessel',
                            'foreignField': '_id',
                            'as': 'vesselTypeInfo'
                        }
                    }, {
                        '$unwind': {
                            'path': '$vesselTypeInfo',
                            'preserveNullAndEmptyArrays': true
                        }
                    },
                    {
                        // Get the quiz evaluation details from training progresses (Only for users who has started)
                        '$lookup': {
                            'from': 'trainingprogresses',
                            'localField': '_id',
                            'foreignField': 'overallTrainingProgress',
                            'as': 'quizEvaluations',
                            'let': {
                                'attemptCount': '$attemptCount',
                                'status': '$status'  
                            },
                            'pipeline': [
                                {
                                    '$match': {
                                        '$expr': {
                                            '$eq': ['$attemptCount', '$$attemptCount']
                                        }
                                    }
                                },
                                {
                                    '$lookup': {
                                        'from': 'trainingmodules',
                                        'localField': 'trainingModule',
                                        'foreignField': '_id',
                                        'as': 'moduleInfo'
                                    }
                                },
                                {
                                    '$unwind': {
                                        'path': '$moduleInfo',
                                        'preserveNullAndEmptyArrays': true
                                    }
                                },
                                {
                                    '$lookup': {
                                        'from': 'trainingmodulecontents',
                                        'localField': 'trainingModuleContent',
                                        'foreignField': '_id',
                                        'as': 'contentInfo'
                                    }
                                },
                                {
                                    '$unwind': {
                                        'path': '$contentInfo',
                                        'preserveNullAndEmptyArrays': true
                                    }
                                },
                                {
                                    '$project': {
                                        'moduleId': '$moduleInfo._id',
                                        'moduleName': '$moduleInfo.title',
                                        'displayOrder': "$moduleInfo.order",
                                        'percentage': '$quizAttemptDetails.percentage',
                                        'isPassed': '$quizAttemptDetails.isPassed',
                                        'contentType': '$contentInfo.contentType',
                                        'updatedAt': 1,
                                        'contentStatus': {
                                            '$cond': {
                                                'if': { '$gt': [{ '$type': '$quizAttemptDetails' }, 'missing'] },
                                                'then': 'COMPLETED',
                                                'else': 'NOT_STARTED'
                                            }
                                        }
                                    }
                                },
                                {
                                    '$sort': {
                                        'displayOrder': -1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        '$lookup': {
                            // Each content data of NOT STARTED users
                            'from': 'trainingcontentbridges',
                            'localField': 'training',
                            'foreignField': 'training',
                            'as': 'initialContents',
                            'let': {
                                'status': '$status',
                                'adminMarkedAsCompleted': "$adminMarkedAsCompleted",  
                            },
                            'pipeline': [
                                {
                                    $match: {
                                        isDeleted: {
                                            $ne: true
                                        }
                                    }
                                },
                                {
                                    "$match": {
                                        $expr: {
                                            $or: [
                                                { $eq: ["$$status", "NOT_STARTED"] },
                                                { $eq: ["$$adminMarkedAsCompleted", true] } 
                                            ]
                                        }
                                    }
                                },                                  
                                {
                                    '$lookup': {
                                        'from': 'trainingmodules',
                                        'localField': 'trainingModule',
                                        'foreignField': '_id',
                                        'as': 'moduleInfo'
                                    }
                                },
                                {
                                    '$unwind': {
                                        'path': '$moduleInfo',
                                        'preserveNullAndEmptyArrays': true
                                    }
                                },
                                {
                                    '$lookup': {
                                        'from': 'trainingmodulecontents',
                                        'localField': 'trainingContent',
                                        'foreignField': '_id',
                                        'as': 'contentInfo'
                                    }
                                },
                                {
                                    '$unwind': {
                                        'path': '$contentInfo',
                                        'preserveNullAndEmptyArrays': true
                                    }
                                },
                                {
                                    '$project': {
                                        'moduleId': '$moduleInfo._id',
                                        'moduleName': '$moduleInfo.title',
                                        'displayOrder' : "$moduleInfo.order",
                                        'percentage': '$quizAttemptDetails.percentage',
                                        'isPassed': '$quizAttemptDetails.isPassed',
                                        'contentType': '$contentInfo.contentType',
                                        'updatedAt': 1,
                                        'contentStatus': {
                                            '$cond': {
                                                'if': { '$gt': [{ '$type': '$quizAttemptDetails' }, 'missing'] },
                                                'then': 'COMPLETED',
                                                'else': 'NOT_STARTED'
                                            }
                                        }
                                    }
                                }
                            ]
                        }
                    },
                    {
                        // Add the initial contents to the quiz evaluations of NOT STARTED users
                        "$addFields": {
                            "quizEvaluations": {
                                "$cond": {
                                    "if": {
                                        "$or": [
                                            { "$eq": ["$status", "NOT_STARTED"] },
                                            { "$eq": ["$adminMarkedAsCompleted", true] }
                                        ]
                                    },
                                    "then": "$initialContents",
                                    "else": "$quizEvaluations"
                                }
                            }
                        }
                    },
                    {
                        '$unwind': {
                            'path': '$quizEvaluations',
                            'preserveNullAndEmptyArrays': false
                        }
                    },
                    ...matchStage,
                    // Group by user and module
                    {
                        '$group': {
                            '_id': {
                                "userId": "$user",
                                "moduleId": '$quizEvaluations.moduleId'
                            },
                            'training': {
                                '$first': '$training'
                            },
                            'trainingTitle': {
                                '$first': "$trainingInfo.title",
                            },
                            'userId': {
                                '$first': '$userInfo._id'
                            },
                            'firstName': {
                                '$first': '$userInfo.firstName'
                            },
                            'lastName': {
                                '$first': '$userInfo.lastName'
                            },
                            'email': {
                                '$first': '$userInfo.email'
                            },
                            'empId': {
                                '$first': '$userInfo.civilIdOrPassport'
                            },
                            'status': {
                                '$first': '$status'
                            },
                            'adminMarkedAsCompleted' : {
                                '$first' : '$adminMarkedAsCompleted'
                            },
                            'currentVessel': {
                                '$first': '$vesselInfo.name'
                            },
                            'vesselType': {
                                '$first': '$vesselTypeInfo.name'
                            },
                            'designation': {
                                '$first': '$designationInfo.name'
                            },
                            'createdAt': {
                                '$first': '$createdAt'
                            },
                            'startDate': {
                                '$first': '$startDate'
                            },
                            'endDate': {
                                '$first': '$endDate'
                            },
                            'unenrollmentDate': {
                                '$first': '$unenrollmentDate'
                            },
                            'lastSeen': {
                                '$first': '$updatedAt'
                            },
                            'moduleContents': {
                                '$push': {
                                    '$cond': {
                                        'if': {
                                            '$eq': [
                                                '$quizEvaluations.contentType', 'QUIZ'
                                            ]
                                        },
                                        'then': {
                                            'moduleName': '$quizEvaluations.moduleName',
                                            'percentage': '$quizEvaluations.percentage',
                                            'order' : "$quizEvaluations.displayOrder",
                                            'isQuizPassed': '$quizEvaluations.isPassed',
                                            'contentType': '$quizEvaluations.contentType',
                                            'updatedAt': '$quizEvaluations.updatedAt',
                                            'quizStatus': "$quizEvaluations.contentStatus",
                                        },
                                        'else': {
                                            'moduleName': '$quizEvaluations.moduleName',
                                            'percentage': 'NOT APPLICABLE',
                                            'order' : "$quizEvaluations.displayOrder",
                                            'isQuizPassed': "$quizEvaluations.isPassed",
                                            'contentType': '$quizEvaluations.contentType',
                                            'updatedAt': '$quizEvaluations.updatedAt',
                                            'quizStatus': "$quizEvaluations.contentStatus",
                                        }
                                    }
                                }
                            }
                        }
                    },
                    // Sort the module contents by order
                    {
                        $addFields: { 
                            moduleContents: {
                                $sortArray: {
                                    input: "$moduleContents",
                                    sortBy: { updatedAt: -1 } 
                                }
                            }
                        }
                    },
                    // Check if the user has a quiz
                    {
                        '$addFields': {
                            'hasQuiz': {
                                '$gt': [
                                    {
                                        '$size': {
                                            '$filter': {
                                                'input': '$moduleContents',
                                                'as': 'item',
                                                'cond': {
                                                    '$eq': [
                                                        '$$item.contentType', 'QUIZ'
                                                    ]
                                                }
                                            }
                                        }
                                    }, 0
                                ]
                            }
                        }
                    }, {
                        // Get the latest quiz content
                        '$addFields': {
                            'moduleContents': {
                                '$cond': {
                                    'if': {
                                        '$eq': ['$hasQuiz', true]
                                    },
                                    'then': {
                                        '$slice': [
                                            {
                                                '$filter': {
                                                    'input': '$moduleContents',
                                                    'as': 'module',
                                                    'cond': {
                                                        '$eq': [
                                                            '$$module.contentType', 'QUIZ'
                                                        ]
                                                    }
                                                }
                                            }, 1
                                        ]
                                    },
                                    'else': '$moduleContents'
                                }
                            }
                        }
                    }, 
                    //Group by user and training
                    {
                        '$group': {
                            '_id': {
                                'userId': '$userId',
                                'trainingId': '$training'
                            },
                            'firstName': {
                                '$first': '$firstName'
                            },
                            'lastName': {
                                '$first': '$lastName'
                            },
                            'trainingTitle': {
                                '$first': '$trainingTitle'
                            },
                            'email': {
                                '$first': '$email'
                            },
                            'empId': {
                                '$first': '$empId'
                            },
                            'status': {
                                '$first': '$status'
                            },
                            'adminMarkedAsCompleted': {
                                '$first': '$adminMarkedAsCompleted'
                            },
                            'currentVessel': {
                                '$first': '$currentVessel'
                            },
                            'vesselType': {
                                '$first': '$vesselType'
                            },
                            'designation': {
                                '$first': '$designation'
                            },
                            'createdAt': {
                                '$first': '$createdAt'
                            },
                            'startDate': {
                                '$first': '$startDate'
                            },
                            'endDate': {
                                '$first': '$endDate'
                            },
                            'unenrollmentDate': {
                                '$first': '$unenrollmentDate'
                            },
                            'lastSeen': {
                                '$first': '$lastSeen'
                            },
                            'modules': {
                                '$push': {
                                    'moduleName': '$moduleContents',
                                    'hasQuiz': '$hasQuiz',
                                    'moduleName': {
                                        '$arrayElemAt': [
                                            '$moduleContents.moduleName', 0
                                        ]
                                    },
                                    'moduleId': {
                                        '$arrayElemAt': [
                                            {
                                                '$arrayElemAt': [
                                                    '$moduleContents.moduleName._id', 0
                                                ]
                                            }, 0
                                        ]
                                    },
                                    'order': {
                                        '$arrayElemAt': ["$moduleContents.order", 0]
                                    },
                                    'percentage': {
                                        '$cond': {
                                            'if': {
                                                '$eq': ["$hasQuiz", false]
                                            },
                                            'then': "NOT APPLICABLE",
                                            'else': {
                                                '$cond': {
                                                    'if': {
                                                        '$eq': [
                                                            {
                                                                '$arrayElemAt': [
                                                                    "$moduleContents.quizStatus",
                                                                    0
                                                                ]
                                                            },
                                                            "NOT_STARTED"
                                                        ]
                                                    },
                                                    'then': "---",
                                                    'else': {
                                                        '$cond': {
                                                            'if': {
                                                                '$gt': [
                                                                    {
                                                                        '$size': "$moduleContents.percentage"
                                                                    },
                                                                    0
                                                                ]
                                                            },
                                                            'then': {
                                                                '$arrayElemAt': [
                                                                    "$moduleContents.percentage",
                                                                    0
                                                                ]
                                                            },
                                                            'else': {
                                                                '$ifNull': [
                                                                    {
                                                                        '$arrayElemAt': [
                                                                            "$moduleContents.percentage",
                                                                            0
                                                                        ]
                                                                    },
                                                                    0.0
                                                                ]
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    },
                                    'isPassed': {
                                        '$cond': {
                                            'if': {
                                                '$gt': [
                                                    {
                                                        '$size': '$moduleContents.isQuizPassed'
                                                    }, 0
                                                ]
                                            },
                                            'then': {
                                                '$arrayElemAt': [
                                                    '$moduleContents.isQuizPassed', 0
                                                ]
                                            },
                                            'else': false
                                        }
                                    }
                                }
                            }
                        }
                    }, {
                        '$project': {
                            '_id': 0,
                            'courseId': '$_id.trainingId',
                            'user': '$_id.userId',

                            'firstName': 1,
                            'lastName': 1,
                            'email': 1,
                            'designation': 1,
                            'status': 1,
                            'adminMarkedAsCompleted': 1,
                            'createdAt': 1,
                            'currentVessel': 1,
                            'vesselType': 1,
                            'empId': 1,
                            'status': 1,

                            'trainingTitle': 1,
                            'hasQuiz': 1,
                            'moduleName': 1,
                            'percentage': 1,
                            'iaPassed': 1,
                            'modules': {
                                '$sortArray': {
                                    'input': "$modules",
                                    'sortBy': { 'order': 1 }
                                }
                            },
                            'startDate': 1,
                            'endDate': 1,
                            'unenrollmentDate': 1,
                            'lastSeen': 1,
                        }
                    },
                    { $sort: { createdAt: -1 } },
                    ...pageLimit
                ]
            );
            if (data.length > 0) {

                const coursesData = data.map(item => ({
                    _id: item._id,
                    learnerName: (item?.firstName ? item.firstName : "") + " " + (item?.lastName ? item.lastName : ""),
                    trainingTitle: item?.trainingTitle,
                    employeeId: item.empId ? item.empId : "Not Found",
                    designation: item?.designation ? item?.designation : "Not Found",
                    createdAt: new Date(item.createdAt).toLocaleString(),
                    email: item?.email ? item?.email : "Not Found",
                    status: item?.status ? item?.status : "Not Found",
                    adminMarkedAsCompleted: item?.adminMarkedAsCompleted ? 'Yes' : 'No',
                    currentVessel: item?.currentVessel ? item?.currentVessel : "Not Found",
                    vesselType: item.vesselType ? item?.vesselType : "Not Found",
                    updatedAt: new Date(item.lastSeen).toLocaleString(),
                    modules: item?.modules,
                }));

                let s3PresignedUrl = "";

                if (input?.export) {
                    const flattenCourseDataForSingleSheet = (course) => {
                        const flattenedData = [];
                        if (course) {
                            const email = course?.email || '';
                            const designation = course?.designation || '';
                            const firstName = course?.firstName || '';
                            const lastName = course?.lastName || '';
                            const status = course?.status || 'N/A';
                            const courseName = course?.trainingTitle[0].value;
                            const adminMarkedAsCompleted = course?.adminMarkedAsCompleted ? 'Yes' : 'No';
                            const enrollmentDate = course?.createdAt ? ReportsHelper.formatDate(course.createdAt) : "Not Applicable";
                            const completionDate = course?.endDate ? ReportsHelper.formatDate(course.endDate) : "Not Applicable";
                            const startDate = course?.startDate && course.startDate !== 'startDate'
                                ? ReportsHelper.formatDate(course.startDate)
                                : "Not Applicable";
                            const unenrollmentDate = course?.unenrollmentDate ? ReportsHelper.formatDate(course.unenrollmentDate) : "Not Applicable";


                            course.modules.forEach(module => {
                                const moduleName = module.moduleName[0]?.value || '';
                                const hasQuiz = module.hasQuiz || false;
                                const quizScore = hasQuiz ? (module.percentage || 'N/A') : 'N/A';
                                flattenedData.push({
                                    Name: `${firstName} ${lastName}`,
                                    Email: email,
                                    Designation: designation,
                                    'Course Name': courseName,
                                    'Lesson Name': moduleName,
                                    'Quiz Score': quizScore,
                                    'Course Status': status,
                                    'Admin Marked As Completed': adminMarkedAsCompleted,
                                    'Enrollment Date': enrollmentDate,
                                    'Course Started Date': startDate,
                                    'Course Completion Date': completionDate,
                                    'Unenrollment Date': unenrollmentDate,
                                });
                            });
                        }
                        return flattenedData;
                    };
                    const exportToExcelWithSingleSheet = async (coursesData) => {
                        const workbook = XLSX.utils.book_new();
                        const combinedData = [];

                        coursesData.forEach(course => {
                            const courseData = flattenCourseDataForSingleSheet(course);
                            combinedData.push(...courseData);
                        });
                        const worksheet = XLSX.utils.json_to_sheet(combinedData);
                        XLSX.utils.book_append_sheet(workbook, worksheet, 'Course Quiz Report');
                        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
                        const excelFilePath = await UploadHelper.uploadExcel({
                            data: excelBuffer,
                            folderName: "COURSE-QUIZ-REPORT",
                            fileName: `COURSE-QUIZ-REPORT-${await ReportsHelper.generateFileNameTimestamp()}.xlsx`,
                            uploadType: UploadHelper.uploadType.exportLearnersCoursesReportAsExcel,
                        });
                        return excelFilePath;
                    };

                    const excelFilePath = await exportToExcelWithSingleSheet(data);
                    if (excelFilePath) {
                        s3PresignedUrl = await aws_helper.fetchFile(excelFilePath);
                        await NotificationHelper.createNotificationhelper({
                            subscriber: subscriberId,
                            titleValue: `Quiz Report Exported Successfully`,
                            messageValue: `The Courses Quiz Enrollment report has been successfully generated and exported by ${userInfo.firstName} ${userInfo.lastName}.`,
                            notificationType: NotificationType.COURSE_QUIZ_REPORT_EXPORT_SUCCESS,
                            notifyAdmin: true,
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
                        coursesData,
                    };
                }

                return {
                    coursesData,
                };
            } else if (data.length === 0 && input?.export) {

                const workbook = XLSX.utils.book_new();
                let worksheet;

                const message = "NO DATA AVAILABLE FOR THE SELECTED COURSE";
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

                XLSX.utils.book_append_sheet(workbook, worksheet, 'Course Quiz Report');
                const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
                const excelFilePath = await UploadHelper.uploadExcel({
                    data: excelBuffer,
                    folderName: "COURSE-QUIZ-REPORT",
                    fileName: `COURSE-QUIZ-REPORT-${await ReportsHelper.generateFileNameTimestamp()}.xlsx`,
                    uploadType: UploadHelper.uploadType.exportLearnersCoursesReportAsExcel,
                });
                if (excelFilePath) {
                    s3PresignedUrl = await aws_helper.fetchFile(excelFilePath);
                    await NotificationHelper.createNotificationhelper({
                        subscriber: subscriberId,
                        titleValue: `Quiz Report Exported Successfully`,
                        messageValue: `The Courses Quiz Enrollment report has been successfully generated and exported by ${userInfo.firstName} ${userInfo.lastName}.`,
                        notificationType: NotificationType.COURSE_QUIZ_REPORT_EXPORT_SUCCESS,
                        notifyAdmin: true,
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
                    coursesData : [],
                };
            }
        }
        return {
            coursesData: []
        }

    } catch (err) {
        if (input?.export) {
            await NotificationHelper.createNotificationhelper({
                subscriber: subscriberId,
                titleValue: `Single Course Report Export Failed`,
                messageValue: `An error occurred while generating the individual course report.`,
                notificationType: NotificationType.REPORT_EXPORT_FAILED,
                notifyAdmin: true,
                status: 'FAILED',
                icon: notificationiconEnum.ERROR,
                createdBy: userInfo,
            });
        }
        throw Error(err.message);
    }
};

const getVesselMainReport = async ({ input }, context) => {
    const { subscriberId , userInfo } = AuthUser(context);
    if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

    try {
        input = input || {};

        const matchStage = [];
        const pageLimit = [];

        if (input?.export) {
            await NotificationHelper.createNotificationhelper({
                subscriber: subscriberId,
                titleValue: `Main Vessel Report Exported In Progress`,
                messageValue: `The Vessel report has been started generating and exporting by ${userInfo.firstName} ${userInfo.lastName}.`,
                notificationType: NotificationType.EXPORT_IN_PROGRESS,
                notifyAdmin: true,
                status: 'SENT',
                createdBy: userInfo,
                icon: notificationiconEnum.PROGRESS
            });
        }

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

        const skip = input?.pageInput?.skip ? input.pageInput.skip : 0;
        const limit = input?.pageInput?.limit ? input.pageInput.limit : 50;

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
                                    isDeleted: false
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
                    messageValue: `The main vessel report has been successfully generated and exported by ${userInfo.firstName} ${userInfo.lastName}.`,
                    notificationType: NotificationType.REPORT_EXPORT_SUCCESS,
                    notifyAdmin: true,
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
            notifyAdmin: true,
            status: 'FAILED',
            icon: notificationiconEnum.ERROR,
            createdBy: userInfo,
        });
        throw Error(err.message);
    }
};

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

                if (input.vesselName && Array.isArray(input.vesselName) && input.vesselName.length > 0) {
                    const users = await User.find({ currentVessel: { $in: input.vesselName } }).select('_id');
                    matchStage.push({
                        $match: {
                            user: { $in: users.map(user => user._id) },
                        },
                    });
                }

                if (input.vesselType && Array.isArray(input.vesselType) && input.vesselType.length > 0) {
                    const vessels = await Vessel.find({ typeOfVessel: { $in: input.vesselType } }).select('_id');
                    const users = await User.find({ currentVessel: { $in: vessels.map(vessel => vessel._id) } }).select('_id');
                    matchStage.push({
                        $match: {
                            user: { $in: users.map(user => user._id) },
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
                if (input.learnerStatus && Array.isArray(input.learnerStatus) && input.learnerStatus.length > 0) {
                    matchStage.push({
                        $match: {
                            'userInfo.vesselStatus': { $in: input.learnerStatus },
                        },
                    });
                }
                if (input.designation && Array.isArray(input.designation) && input.designation.length > 0) {
                    matchStage.push( {
                        "$match": {
                            "employeeData.empDesignation": { "$in": input.designation }
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
            data = await OverallTrainingProgress.aggregate(
                [
                    {
                        "$lookup": {
                            "from": "trainings",
                            "localField": "training",
                            "foreignField": "_id",
                            "as": "trainingInfo"
                        }
                    },
                    {
                        "$lookup": {
                            "from": "users",
                            "localField": "user",
                            "foreignField": "_id",
                            "as": "userInfo",
                            "pipeline": [
                                {
                                    "$match": {
                                        "isDeleted": {
                                            $ne: true
                                        }
                                    }
                                }
                            ]
                        }
                    },
                    {
                        '$lookup': {
                            'from': 'uservessels',
                            'localField': 'user',
                            'foreignField': 'user',
                            'as': 'vesselInfo',
                            'pipeline': [
                                { '$match': { 'isActive': true } },
                                { '$sort': { 'updatedAt': -1 } },
                                { '$limit': 1 }
                            ]
                        },
                    },
                    {
                        '$unwind': {
                            'path': '$vesselInfo',
                            'preserveNullAndEmptyArrays': true,
                        },
                    },
                    {
                        '$lookup': {
                            'from': 'vessels',
                            'localField': 'vesselInfo.vessel',
                            'foreignField': '_id',
                            'as': 'vesselDetails',
                        },
                    },
                    {
                        '$unwind': {
                            'path': '$vesselDetails',
                            'preserveNullAndEmptyArrays': true,
                        },
                    },
                    {
                        '$lookup': {
                            'from': "vesseltypes",
                            'localField': "vesselDetails.typeOfVessel",
                            'foreignField': "_id",
                            'as': "vesselTypeInfo"
                        }
                    },
                    {
                        '$unwind':
                        {
                            'path': "$vesselTypeInfo",
                            'preserveNullAndEmptyArrays': true
                        }
                    },
                    {
                        "$lookup": {
                            "from": "employees",
                            "localField": "user",
                            "foreignField": "user",
                            "as": "employeeInfo"
                        }
                    },
                    {
                        $lookup: {
                            from: "trainingprogresses",
                            localField: "_id",
                            foreignField: "overallTrainingProgress",
                            as: "quizevaluationInfo",
                            let: {
                                attemptCount: "$attemptCount"
                            },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $eq: [
                                                "$attemptCount",
                                                "$$attemptCount"
                                            ]
                                        }
                                    }
                                },
                                {
                                    $lookup: {
                                        from: "trainingmodulecontents",
                                        localField: "trainingModuleContent",
                                        foreignField: "_id",
                                        as: "contentInfo",
                                        pipeline: [
                                            {
                                                $match: {
                                                    $expr: {
                                                        $eq: ["$contentType", "QUIZ"]
                                                    }
                                                }
                                            }
                                        ]
                                    }
                                },
                                {
                                    $unwind: {
                                        path: "$contentInfo",
                                        preserveNullAndEmptyArrays: true
                                    }
                                },
                                {
                                    $sort: {
                                        updatedAt: -1
                                    }
                                },
                                {
                                    $limit: 1
                                },
                                {
                                    $project: {
                                        percentage:
                                            "$quizAttemptDetails.percentage",
                                        isPassed:
                                            "$quizAttemptDetails.isPassed"
                                    }
                                }
                            ]
                        }
                    },
                    {
                        "$unwind": {
                            "path": "$quizevaluationInfo",
                            "preserveNullAndEmptyArrays": true
                        }
                    },
                    {
                        "$unwind": {
                            "path": "$userInfo",
                            "preserveNullAndEmptyArrays": false
                        }
                    },
                    {
                        "$unwind": {
                            "path": "$employeeInfo",
                            "preserveNullAndEmptyArrays": false
                        }
                    },
                    {
                        "$lookup":
                        {
                            "from": "designations",
                            "localField": "employeeInfo.empDesignation",
                            "foreignField": "_id",
                            "as": "designationInfo"
                        }
                    },
                    {
                        "$unwind":
                        {
                            "path": "$designationInfo",
                            "preserveNullAndEmptyArrays": true
                        }
                    },
                    {
                        "$lookup": {
                            "from": "trainingprogress",
                            "localField": "training",
                            "foreignField": "training",
                            "as": "trainingProgressInfo",
                            "pipeline": [
                                {
                                    "$match": {
                                        "status": "COMPLETED"
                                    }
                                },
                                {
                                    "$lookup": {
                                        "from": "trainingmodulecontents",
                                        "localField": "trainingModuleContent",
                                        "foreignField": "_id",
                                        "as": "moduleContentInfo"
                                    }
                                },
                                {
                                    "$unwind": {
                                        "path": "$moduleContentInfo",
                                        "preserveNullAndEmptyArrays": true
                                    }
                                },
                                {
                                    "$project": {
                                        "duration": "$moduleContentInfo.duration"
                                    }
                                }
                            ]
                        }
                    },
                    ...matchStage,
                    {
                        '$project': {
                            'firstName': '$userInfo.firstName',
                            'lastName': '$userInfo.lastName',
                            'email': '$userInfo.email',
                            'employeeId': '$userInfo.civilIdOrPassport',
                            'isRegistered': '$userInfo.isRegistered',
                            'designation': '$designationInfo.name',
                            'courseName': {
                                '$arrayElemAt': [
                                    '$trainingInfo.title.value', 0
                                ]
                            },
                            'createdAt': 1,
                            'startDate': "$startDate",
                            'completionDate': "$endDate",
                            unenrollmentDate: 1,
                            'status': 1,
                            'adminMarkedAsCompleted': 1,
                            'updatedAt': 1,
                            'quizPercentage': {
                                '$ifNull': [
                                    '$quizevaluationInfo.percentage', null
                                ]
                            },
                            'isPassed': {
                                '$ifNull': [
                                    '$quizevaluationInfo.isPassed', null
                                ]
                            },
                            'totalTimeSpent': "$timeSpend"
                        }
                    },
                    {
                        '$sort': {
                            'firstName': -1
                        }
                    }
                ]
            );

            data.forEach(item => {
                const learnerName = `${item.firstName || ''} ${item.lastName || ''}`.trim() || "-";
                const enrollmentDate = item?.createdAt ? ReportsHelper.formatDate(item.createdAt) : "Not Applicable";
                const completionDate = item?.endDate ? ReportsHelper.formatDate(item.endDate) : "Not Applicable";
                const startDate = item?.startDate && item.startDate !== 'startDate'
                    ? ReportsHelper.formatDate(item.startDate)
                    : "Not Applicable";
                const unenrollmentDate = item?.unenrollmentDate ? ReportsHelper.formatDate(item.unenrollmentDate) : "Not Applicable";
                const quizScore = item.quizPercentage ? parseInt(item.quizPercentage)+"%" : "N/A";
                const userState = item.isRegistered ? "Registered" : "Unregistered";
                const timeSpent = item.totalTimeSpent ? parseInt(item.totalTimeSpent)+" mins" : 0+" mins";
                const adminMarkedAsCompleted = item.adminMarkedAsCompleted ? "Yes" : "No";

                dataToExport.push({
                    Name: learnerName ?? "-",
                    Email: item.email || null,
                    Designation: item.designation || null,
                    'Course Name': item.courseName ? item.courseName[0] : null,
                    Status: item.status || null,
                    'Admin Marked As Completed': adminMarkedAsCompleted,
                    'Quiz Score': quizScore,
                    userState: userState,
                    'Time Spent (mins)': timeSpent,
                    'Enrollment Date': enrollmentDate,
                    'Course Started Date': startDate,
                    'Course Completion Date': completionDate,
                    'Unenrollment Date': unenrollmentDate,
                });
            });

        } else if (input?.reportType === "QUIZ") {
            data = await OverallTrainingProgress.aggregate(
                [
                    {
                        $lookup: {
                            from: "trainings",
                            localField: "training",
                            foreignField: "_id",
                            as: "trainingInfo"
                        }
                    },
                    {
                        $unwind: {
                            path: "$trainingInfo",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $lookup: {
                            from: "users",
                            localField: "user",
                            foreignField: "_id",
                            as: "userInfo",
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
                        $unwind: {
                            path: "$userInfo",
                            preserveNullAndEmptyArrays: false
                        }
                    },
                    {
                        $lookup: {
                            from: "employees",
                            localField: "user",
                            foreignField: "user",
                            as: "employeeData",
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
                        $unwind: {
                            path: "$employeeData",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $lookup: {
                            from: "designations",
                            localField: "employeeData.empDesignation",
                            foreignField: "_id",
                            as: "designationInfo"
                        }
                    },
                    {
                        $unwind: {
                            path: "$designationInfo",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $lookup: {
                            from: "vessels",
                            localField: "userInfo.currentVessel",
                            foreignField: "_id",
                            as: "vesselInfo"
                        }
                    },
                    {
                        $unwind: {
                            path: "$vesselInfo",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $lookup: {
                            from: "vesseltypes",
                            localField: "vesselInfo.typeOfVessel",
                            foreignField: "_id",
                            as: "vesselTypeInfo"
                        }
                    },
                    {
                        $unwind: {
                            path: "$vesselTypeInfo",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $lookup: {
                            from: "trainingprogresses",
                            localField: "_id",
                            foreignField: "overallTrainingProgress",
                            as: "quizEvaluations",
                            let: {
                                attemptCount: "$attemptCount",
                                status: "$status"
                            },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $eq: [
                                                "$attemptCount",
                                                "$$attemptCount"
                                            ]
                                        }
                                    }
                                },
                                {
                                    $lookup: {
                                        from: "trainingmodules",
                                        localField: "trainingModule",
                                        foreignField: "_id",
                                        as: "moduleInfo"
                                    }
                                },
                                {
                                    $unwind: {
                                        path: "$moduleInfo",
                                        preserveNullAndEmptyArrays: true
                                    }
                                },
                                {
                                    $lookup: {
                                        from: "trainingmodulecontents",
                                        localField: "trainingModuleContent",
                                        foreignField: "_id",
                                        as: "contentInfo"
                                    }
                                },
                                {
                                    $unwind: {
                                        path: "$contentInfo",
                                        preserveNullAndEmptyArrays: true
                                    }
                                },
                                {
                                    $project: {
                                        moduleId: "$moduleInfo._id",
                                        moduleName: "$moduleInfo.title",
                                        contentName: "$contentInfo.title",
                                        displayOrder: "$moduleInfo.order",
                                        percentage:
                                            "$quizAttemptDetails.percentage",
                                        isPassed:
                                            "$quizAttemptDetails.isPassed",
                                        contentType:
                                            "$contentInfo.contentType",
                                        updatedAt: 1,
                                        contentStatus: {
                                            $cond: {
                                                if: {
                                                    $gt: [
                                                        {
                                                            $type: "$quizAttemptDetails"
                                                        },
                                                        "missing"
                                                    ]
                                                },
                                                then: "COMPLETED",
                                                else: "NOT_STARTED"
                                            }
                                        }
                                    }
                                },
                                {
                                    $sort: {
                                        displayOrder: -1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $lookup: {
                            from: "trainingcontentbridges",
                            localField: "training",
                            foreignField: "training",
                            as: "initialContents",
                            let: {
                                status: "$status",
                                adminMarkedAsCompleted: "$adminMarkedAsCompleted",
                            },
                            pipeline: [
                                {
                                    $match: {
                                        isDeleted: {
                                            $ne: true
                                        }
                                    }
                                },
                                {
                                    $match: {
                                        $expr: {
                                            $or: [
                                                { $eq: ["$$status", "NOT_STARTED"] },
                                                { $eq: ["$$adminMarkedAsCompleted", true] } // Add your second condition here
                                            ]
                                        }
                                    }
                                },
                                {
                                    $lookup: {
                                        from: "trainingmodules",
                                        localField: "trainingModule",
                                        foreignField: "_id",
                                        as: "moduleInfo"
                                    }
                                },
                                {
                                    $unwind: {
                                        path: "$moduleInfo",
                                        preserveNullAndEmptyArrays: true
                                    }
                                },
                                {
                                    $lookup: {
                                        from: "trainingmodulecontents",
                                        localField: "trainingContent",
                                        foreignField: "_id",
                                        as: "contentInfo"
                                    }
                                },
                                {
                                    $unwind: {
                                        path: "$contentInfo",
                                        preserveNullAndEmptyArrays: true
                                    }
                                },
                                {
                                    $project: {
                                        moduleId: "$moduleInfo._id",
                                        moduleName: "$moduleInfo.title",
                                        contentName: "$contentInfo.title",
                                        contentStatus: "$contentInfo.status",
                                        displayOrder: "$moduleInfo.order",
                                        percentage:
                                            "$quizAttemptDetails.percentage",
                                        isPassed:
                                            "$quizAttemptDetails.isPassed",
                                        contentType:
                                            "$contentInfo.contentType",
                                        updatedAt: 1,
                                        contentStatus: {
                                            $cond: {
                                                if: {
                                                    $gt: [
                                                        {
                                                            $type: "$quizAttemptDetails"
                                                        },
                                                        "missing"
                                                    ]
                                                },
                                                then: "COMPLETED",
                                                else: "NOT_STARTED"
                                            }
                                        }
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            quizEvaluations: {
                                $cond: {
                                    if: {
                                        $or: [
                                            { $eq: ["$status", "NOT_STARTED"] },
                                            { $eq: ["$adminMarkedAsCompleted", true] }
                                        ]
                                    },
                                    then: "$initialContents",
                                    else: "$quizEvaluations"
                                }
                            }
                        }
                    },
                    {
                        $unwind: {
                            path: "$quizEvaluations",
                            preserveNullAndEmptyArrays: false
                        }
                    },
                    ...matchStage,
                    {
                        $group: {
                            _id: {
                                userId: "$user",
                                moduleId: "$quizEvaluations.moduleId"
                            },
                            userId: {
                                $first: "$user"
                            },
                            startDate: {
                                $first: "$startDate"
                            },
                            endDate: {
                                $first: "$endDate"
                            },
                            unenrollmentDate: {
                                $first: "$unenrollmentDate"
                            },
                            timeSpend: {
                                $first: "$timeSpend"
                            },
                            training: {
                                $first: "$training"
                            },
                            trainingTitle: {
                                $first: "$trainingInfo.title"
                            },
                            userId: {
                                $first: "$userInfo._id"
                            },
                            firstName: {
                                $first: "$userInfo.firstName"
                            },
                            lastName: {
                                $first: "$userInfo.lastName"
                            },
                            email: {
                                $first: "$userInfo.email"
                            },
                            empId: {
                                $first: "$userInfo.civilIdOrPassport"
                            },
                            status: {
                                $first: "$status"
                            },
                            adminMarkedAsCompleted: {
                                $first: "$adminMarkedAsCompleted"
                            },
                            currentVessel: {
                                $first: "$vesselInfo.name"
                            },
                            vesselType: {
                                $first: "$vesselTypeInfo.name"
                            },
                            designation: {
                                $first: "$designationInfo.name"
                            },
                            createdAt: {
                                $first: "$createdAt"
                            },
                            lastSeen: {
                                $first: "$updatedAt"
                            },
                            moduleContents: {
                                $push: {
                                    $cond: {
                                        if: {
                                            $eq: [
                                                "$quizEvaluations.contentType",
                                                "QUIZ"
                                            ]
                                        },
                                        then: {
                                            moduleName:
                                                "$quizEvaluations.moduleName",
                                            contentName:
                                                "$quizEvaluations.contentName",
                                            percentage:
                                                "$quizEvaluations.percentage",
                                            order:
                                                "$quizEvaluations.displayOrder",
                                            isQuizPassed:
                                                "$quizEvaluations.isPassed",
                                            contentType:
                                                "$quizEvaluations.contentType",
                                            updatedAt:
                                                "$quizEvaluations.updatedAt",
                                            quizStatus:
                                                "$quizEvaluations.contentStatus"
                                        },
                                        else: {
                                            moduleName:
                                                "$quizEvaluations.moduleName",
                                            contentName:
                                                "$quizEvaluations.contentName",
                                            percentage: "NOT APPLICABLE",
                                            order:
                                                "$quizEvaluations.displayOrder",
                                            isQuizPassed:
                                                "$quizEvaluations.isPassed",
                                            contentType:
                                                "$quizEvaluations.contentType",
                                            updatedAt:
                                                "$quizEvaluations.updatedAt",
                                            quizStatus:
                                                "$quizEvaluations.contentStatus"
                                        }
                                    }
                                }
                            }
                        }
                    },
                    {
                        $group: {
                            _id: {
                                userId: "$userId",
                                trainingId: "$training"
                            },
                            firstName: {
                                $first: "$firstName"
                            },
                            lastName: {
                                $first: "$lastName"
                            },
                            trainingTitle: {
                                $first: "$trainingTitle"
                            },
                            email: {
                                $first: "$email"
                            },
                            empId: {
                                $first: "$empId"
                            },
                            status: {
                                $first: "$status"
                            },
                            adminMarkedAsCompleted: {
                                $first: "$adminMarkedAsCompleted"
                            },
                            currentVessel: {
                                $first: "$currentVessel"
                            },
                            vesselType: {
                                $first: "$vesselType"
                            },
                            designation: {
                                $first: "$designation"
                            },
                            createdAt: {
                                $first: "$createdAt"
                            },
                            startDate: {
                                $first: "$startDate"
                            },
                            endDate: {
                                $first: "$endDate"
                            },
                            unenrollmentDate: {
                                $first: "$unenrollmentDate"
                            },
                            lastSeen: {
                                $first: "$lastSeen"
                            },
                            modules: {
                                $push: {
                                    moduleName: "$moduleContents",
                                    hasQuiz: "$hasQuiz",
                                    moduleName: {
                                        $arrayElemAt: [
                                            "$moduleContents.moduleName",
                                            0
                                        ]
                                    },
                                    moduleId: {
                                        $arrayElemAt: [
                                            {
                                                $arrayElemAt: [
                                                    "$moduleContents.moduleName._id",
                                                    0
                                                ]
                                            },
                                            0
                                        ]
                                    },
                                    order: {
                                        $arrayElemAt: [
                                            "$moduleContents.order",
                                            0
                                        ]
                                    },
                                    moduleContents: "$moduleContents"
                                }
                            }
                        }
                    },
                    {
                        $project: {
                            courseId: "$_id.trainingId",
                            user: "$_id.userId",
                            firstName: 1,
                            lastName: 1,
                            email: 1,
                            designation: 1,
                            status: 1,
                            adminMarkedAsCompleted: 1,
                            createdAt: 1,
                            startDate: 1,
                            endDate: 1,
                            unenrollmentDate: 1,
                            empId: 1,
                            trainingTitle: 1,
                            modules: {
                                $sortArray: {
                                    input: "$modules",
                                    sortBy: {
                                        order: 1
                                    }
                                }
                            },
                            lastSeen: 1
                        }
                    },
                    {
                        $sort: {
                            createdAt: -1
                        }
                    },
                ]
            );

            const flattenDataForSingleSheet = (learner) => {
                const flattenedData = [];
                if (learner) {

                    const email = learner?.email || '';
                    const designation = learner?.designation || '';
                    const firstName = learner?.firstName || '';
                    const lastName = learner?.lastName || '';
                    const status = learner?.status || 'NOT APPLICABLE';
                    const courseName = learner?.trainingTitle[0]?.value || 'Unknown Course';
                    const adminMarkedAsCompleted = learner?.adminMarkedAsCompleted ? 'Yes' : 'No';
                    const enrollmentDate = learner?.createdAt ? ReportsHelper.formatDate(learner.createdAt) : "Not Applicable";
                    const completionDate = learner?.endDate ? ReportsHelper.formatDate(learner.endDate) : "Not Applicable";
                    const startDate = learner?.startDate && learner.startDate !== 'startDate'
                        ? ReportsHelper.formatDate(learner.startDate)
                        : "Not Applicable";
                    const unenrollmentDate = learner?.unenrollmentDate ? ReportsHelper.formatDate(learner.unenrollmentDate) : "Not Applicable";


                    learner.modules.forEach((module, moduleIndex) => {
                        const moduleName = module?.moduleName[0]?.value || 'Unnamed Module';
                        const hasQuiz = module?.hasQuiz || false;


                        module?.moduleContents.forEach((content, contentIndex) => {
                            const contentName = content?.contentName[0]?.value || 'Unnamed Content';
                            const contentType = content?.contentType || 'NOT APPLICABLE';
                            const quizScore = content?.percentage || 'NOT APPLICABLE';


                            flattenedData.push({
                                Name: `${firstName} ${lastName}`,
                                Email: email,
                                Designation: designation,
                                'Course Name': courseName,
                                'Course Status': status,
                                'Admin Marked As Completed': adminMarkedAsCompleted,
                                'Lesson Name': `(Lesson ${moduleIndex + 1})  ${moduleName}`,
                                'Content Name': `(Content ${contentIndex + 1})  ${contentName}`,
                                'Content Type': contentType,
                                'Quiz Score': quizScore,
                                'Enrollment Date': enrollmentDate,
                                'Course Started Date': startDate,
                                'Course Completion Date': completionDate,
                                'Unenrollment Date': unenrollmentDate,
                            });
                        });
                    });
                }

                return flattenedData;
            };

            const flattenAllLearnersData = (learners) => {
                const allFlattenedData = [];
                learners.forEach(learner => {
                    const learnerData = flattenDataForSingleSheet(learner);
                    allFlattenedData.push(...learnerData);
                    allFlattenedData.push([]);
                });
                return allFlattenedData;
            };
            dataToExport = flattenAllLearnersData(data);
        }

        let s3PresignedUrl = "";

        const workbook = XLSX.utils.book_new();
        let worksheet;
        if (dataToExport.length === 0) {
            const message = "NO DATA AVAILABLE FOR CUSTOM REPORTS";
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
        }
        else {
            worksheet = XLSX.utils.json_to_sheet(dataToExport);
        }
        XLSX.utils.book_append_sheet(workbook, worksheet, `${input.reportType}`);
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
        const excelFilePath = await UploadHelper.uploadExcel({
            data: excelBuffer,
            folderName: "Custom-Quiz-Reports",
            fileName: `CUSTOM-REPORT_${await ReportsHelper.generateFileNameTimestamp()}.xlsx`,
            uploadType: UploadHelper.uploadType.exportCustomQuizReport,
        });
        if (excelFilePath) {
            s3PresignedUrl = await aws_helper.fetchFile(excelFilePath);
            await NotificationHelper.createNotificationhelper({
                subscriber: subscriberId,
                titleValue: ` Custom ${input?.reportType.toLowerCase()} Report Exported Successfully`,
                messageValue: `The Custom ${input?.reportType.toLowerCase()} report has been successfully generated and exported by ${userInfo.firstName} ${userInfo.lastName}.${await ReportsHelper.getAppliedFilters(input)}`,
                notificationType: NotificationType.CUSTOM_REPORT_EXPORT_SUCCESS,
                notifyAdmin: true,
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

        const newReport = new Export({
            filePath: excelFilePath,
            subscriberId: subscriberId,
            createdBy: userId,
            type_of_export: 'CUSTOM_REPORT_EXPORT',
            additionalData: [{
                key: "criteria",
                value: { ...input }
            }]
        })
        await newReport.save();
        return {
            status: true,
            fileName: path.basename(excelFilePath),
            filePath: s3PresignedUrl,
            message: "report generated successfully"
        };





    } catch (error) {
        await NotificationHelper.createNotificationhelper({
            subscriber: subscriberId,
            titleValue: `Custom Report Export Failed`,
            messageValue: `An error occurred while generating the custom report(${await ReportsHelper.getAppliedFilters(input)}). ${error?.message}.`,
            notificationType: NotificationType.REPORT_EXPORT_FAILED,
            notifyAdmin: true,
            status: 'FAILED',
            icon: notificationiconEnum.ERROR,
            createdBy: userInfo,
        });
        throw new Error(error.message);
    }
}

const getCustomReportLogs = async ({ pageInput, searchQuery }, context) => {
    const { subscriberId } = AuthUser(context);
    if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
    try {

        const skip = pageInput?.skip ? pageInput.skip : 0;
        const limit = pageInput?.limit ? pageInput.limit : 50;
        let matchStage = [];
        let pageLimit = [];
        if (limit > 0) {
            pageLimit.push({ $skip: skip });
            pageLimit.push({ $limit: limit });
        }


        if (searchQuery) {

            const searchTerms = searchQuery.split(/\s+/).map(term => term.trim()).filter(Boolean);


            if (searchTerms.length > 0) {
                matchStage.unshift({
                    $match: {
                        $or: [
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
                    generatedBy: {
                        $concat: [
                            { $ifNull: ["$usersInfo.firstName", ""] },
                            " ",
                            { $ifNull: ["$usersInfo.lastName", ""] }
                        ]
                    }
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
                    generatedBy: item?.generatedBy,
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

module.exports.queries = {
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
            limit = pageInput?.limit ?? 50;

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
            limit = pageInput?.limit ?? 50;

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
            limit = pageInput?.limit ?? 50;

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
            limit = pageInput?.limit ?? 50;

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
