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

const getMainLearnersReport = async ({ input }, context) => {
    const { subscriberId, userInfo } = AuthUser(context);
    if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

    try {
        const matchStage = [];

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

        let includeDeletedUsers = false;
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

            if (filterInput.isRegistered !== undefined) {
                matchStage.push({
                    $match: { 'userInfo.isRegistered': filterInput.isRegistered },
                });
            }

            if (filterInput.isDeleted !== undefined) {
                includeDeletedUsers = true;
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
                },
            },
            {
                $unwind: {
                    path: '$userInfo',
                    preserveNullAndEmptyArrays: true,
                },
            },
            ...(includeDeletedUsers
                ? [
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
                                $cond: [
                                    { $and: [{ $ne: ['$userInfo', null] }, { $ne: ['$userInfo._id', null] }] },
                                    '$userInfo',
                                    '$deletedUserInfo',
                                ],
                            },
                        },
                    },
                ]
                : [
                    {
                        $match: {
                            userInfo: { $ne: null },
                        },
                    },
                ]),
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
                            then: { $avg: '$trainingProgresses.progressPercentage' },
                            else: 0,
                        },
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
                    averageProgressPercentage: 1,
                },
            },
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
            AverageProgressPercentage: item?.averageProgressPercentage ? parseInt(item.averageProgressPercentage) : 0,
        }));

        let s3PresignedUrl = "";

        if (input?.export) {
            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(workbook, worksheet, `Learners Report-${Date.now()}`);
            const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
            const excelFilePath = await UploadHelper.uploadExcel({
                data: excelBuffer,
                folderName: "All_learners_Report_exports",
                fileName: `All_learners_Report-${Date.now()}.xlsx`,
                uploadType: UploadHelper.uploadType.exportLearnersReportAsExcel,
            });
            if (excelFilePath) {
                s3PresignedUrl = await aws_helper.fetchFile(excelFilePath);
                await NotificationHelper.createNotificationhelper({
                    subscriber: subscriberId,
                    titleValue: `Learners Report Exported Successfully`,
                    messageValue: `The learners report has been successfully generated and exported by ${userInfo.firstName} ${userInfo.lastName}.`,
                    notificationType: NotificationType.REPORT_EXPORT_SUCCESS,
                    notifyAdmin: true,
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
                titleValue: `Learners Report Export Failed`,
                messageValue: `An error occurred while generating the learners report: ${err.message}.`,
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
                titleValue: `SINGLE Learner Report Exported In Progress`,
                messageValue: `The single learner report has been started and exporting by ${userInfo.firstName} ${userInfo.lastName}.`,
                notificationType: NotificationType.EXPORT_IN_PROGRESS,
                notifyAdmin: true,
                status: 'SENT',
                createdBy: userInfo,
                icon: notificationiconEnum.PROGRESS
            });
        }

        if (input && Object.keys(input).length > 0) {
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
                            "user": { $in: learnerIds.map(id => ObjectId(id)) }
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
                            'unenrolmentDate': {
                                '$cond': {
                                    'if': {
                                        '$eq': [
                                            '$isEnrolled', false
                                        ]
                                    },
                                    'then': '$updatedAt',
                                    'else': null
                                }
                            },
                            'startDate': "$startDate",
                            'completionDate': "$endDate",
                            'status': 1,
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
                    }
                ]
            );

            const learnerReportsByUser = {};
            if (input?.export) {
                learnersReports.forEach(item => {
                    const learnerName = `${item.firstName} ${item.lastName}`;
                    if (!learnerReportsByUser[learnerName]) {
                        learnerReportsByUser[learnerName] = [];
                    }
                    const enrollmentDate = item.createdAt ? new Date(item.createdAt).toISOString() : null;
                    const completionDate = item.completionDate ? new Date(item.completionDate).toISOString() : null;
                    const startDate = item.startDate && item.startDate !== 'startDate' ? new Date(item.startDate).toISOString() : null;
                    const unenrollmentDate = item.unenrolmentDate ? new Date(item.unenrolmentDate).toISOString() : null;
                    const quizScore = (typeof item.quizPercentage === 'string')
                        ? item.quizPercentage
                        : (typeof item.quizPercentage === 'number' && !isNaN(item.quizPercentage))
                            ? item.quizPercentage.toFixed(2)
                            : null;
                    const userState = item.isRegistered ? "Registered" : "Unregistered";
                    const timeSpent = item.totalTimeSpent ? (item.totalTimeSpent / 60).toFixed(2) : 0;

                    learnerReportsByUser[learnerName].push({
                        Name: learnerName,
                        Email: item.email || null,
                        Designation: item.designation || null,
                        'Course Name': item.courseName ? item.courseName[0] : null,
                        Status: item.status || null,
                        'Enrollment Date / Unenrollment Date (UTC TimeZone)': enrollmentDate,
                        'Unenrollment Date (UTC TimeZone)': unenrollmentDate,
                        'Completion Date (UTC TimeZone)': completionDate,
                        'Started Date (UTC TimeZone)': startDate,
                        'Quiz Score': quizScore,
                        userState: userState,
                        'Time Spent (mins)': timeSpent,
                    });
                });
            } else {
                learnersReports.forEach(item => {
                    const learnerName = `${item.firstName} ${item.lastName}`;
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

            if (input?.export && learnersReports.length > 0) {
                const workbook = XLSX.utils.book_new();

                for (const learnerName in learnerReportsByUser) {
                    const data = learnerReportsByUser[learnerName];
                    const worksheet = XLSX.utils.json_to_sheet(data);
                    XLSX.utils.book_append_sheet(workbook, worksheet, `${learnerName}`);
                }

                const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
                const excelFilePath = await UploadHelper.uploadExcel({
                    data: excelBuffer,
                    folderName: `Multiple_Learners_Report_exports`,
                    fileName: `learners_Report-${Date.now()}.xlsx`,
                    uploadType: UploadHelper.uploadType.exportLearnersCoursesReportAsExcel,
                });

                if (excelFilePath) {
                    s3PresignedUrl = await aws_helper.fetchFile(excelFilePath);
                }

                return {
                    filePath: s3PresignedUrl,
                    fileName: path.basename(excelFilePath),
                    learnerData: learnersReports,
                };
            }
            else if (input?.export && learnersReports.length == 0) {
                throw CustomError(ErrorName.NOT_FOUND, "No data found for this user");
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
                        '$sort': {
                            'createdAt': -1
                        }
                    },
                    {
                        '$lookup': {
                            'from': 'users',
                            'localField': 'user',
                            'foreignField': '_id',
                            'as': 'userInfo'
                        }
                    },
                    {
                        "$match": {
                            "user": { $in: learnerIds.map(id => ObjectId(id)) }
                        }
                    },
                    {
                        '$lookup': {
                            'from': 'trainings',
                            'localField': 'training',
                            'foreignField': '_id',
                            'as': 'trainingInfo'
                        }
                    }, {
                        '$unwind': {
                            'path': '$userInfo',
                            'preserveNullAndEmptyArrays': true
                        }
                    }, {
                        '$lookup': {
                            'from': 'employees',
                            'localField': 'user',
                            'foreignField': 'user',
                            'as': 'employeeData'
                        }
                    }, {
                        '$unwind': {
                            'path': '$employeeData',
                            'preserveNullAndEmptyArrays': true
                        }
                    }, {
                        '$lookup': {
                            'from': 'designations',
                            'localField': 'employeeData.empDesignation',
                            'foreignField': '_id',
                            'as': 'designationData'
                        }
                    }, {
                        '$unwind': {
                            'path': '$designationData',
                            'preserveNullAndEmptyArrays': true
                        }
                    }, {
                        '$unwind': {
                            'path': '$trainingInfo',
                            'preserveNullAndEmptyArrays': true
                        }
                    }, {
                        '$unwind': {
                            'path': '$contentData',
                            'preserveNullAndEmptyArrays': true
                        }
                    }, {
                        '$unwind': {
                            'path': '$contentData.contentIds',
                            'preserveNullAndEmptyArrays': true
                        }
                    }, {
                        '$lookup': {
                            'from': 'trainingmodulecontents',
                            'localField': 'contentData.contentIds',
                            'foreignField': '_id',
                            'as': 'contentDetails'
                        }
                    }, {
                        '$unwind': {
                            'path': '$contentDetails',
                            'preserveNullAndEmptyArrays': true
                        }
                    }, {
                        '$lookup': {
                            'from': 'trainingmodules',
                            'localField': 'contentData.moduleId',
                            'foreignField': '_id',
                            'as': 'moduleInfo'
                        }
                    }, {
                        '$unwind': {
                            'path': '$moduleInfo',
                            'preserveNullAndEmptyArrays': true
                        }
                    }, {
                        '$lookup': {
                            'from': 'trainingprogresses',
                            'localField': '_id',
                            'foreignField': 'overallTrainingProgress',
                            'as': 'contentProgress'
                        }
                    }, {
                        '$unwind': {
                            'path': '$contentProgress',
                            'preserveNullAndEmptyArrays': true
                        }
                    }, {
                        '$match': {
                            '$expr': {
                                '$and': [
                                    {
                                        '$eq': [
                                            '$contentProgress.trainingModuleContent', '$contentData.contentIds'
                                        ]
                                    }, {
                                        '$eq': [
                                            '$attemptCount', '$contentProgress.attemptCount'
                                        ]
                                    }
                                ]
                            }
                        }
                    }, {
                        '$project': {
                            'userId': '$user',
                            'user': {
                                '$concat': [
                                    {
                                        '$ifNull': [
                                            '$userInfo.firstName', ''
                                        ]
                                    }, ' ', {
                                        '$ifNull': [
                                            '$userInfo.lastName', ''
                                        ]
                                    }
                                ]
                            },
                            'email': '$userInfo.email',
                            'designation': '$designationInfo.name',
                            'empId': '$userInfo.civilIdOrPassport',
                            'userStatus': '$userInfo.isRegistered',
                            'attemptCount': '$attemptCount',
                            'progress': '$progressPercentage',
                            'training': '$trainingInfo.title',
                            'courseStatus': '$status',
                            'lesson': '$moduleInfo.title',
                            'content': '$contentDetails.title',
                            'contentType': '$contentDetails.contentType',
                            'contentStatus': '$contentProgress.status',
                            'enrollmentDate': '$createdAt',
                            'quizPercentage': '$contentProgress.quizAttemptDetails.percentage',
                            'timeSpent': {
                                '$ifNull': [
                                    '$timeSpent', 0
                                ]
                            },
                            'startDate': '$startDate',
                            'completionDate': '$completionDate'
                        }
                    }, {
                        '$group': {
                            '_id': {
                                'userId': '$userId',
                                'trainingTitle': '$training',
                                'lessonTitle': '$lesson'
                            },
                            'userName': {
                                '$first': '$user'
                            },
                            'enrollmentDate': {
                                '$first': '$enrollmentDate'
                            },
                            'email': {
                                '$first': '$email'
                            },
                            'designation': {
                                '$first': '$designation'
                            },
                            'employeeId': {
                                '$first': '$empId'
                            },
                            'userStatus': {
                                '$first': '$userStatus'
                            },
                            'courseStatus': {
                                '$first': '$courseStatus'
                            },
                            'progress': {
                                '$first': '$progress'
                            },
                            'timeSpent': {
                                '$first': '$timeSpent'
                            },
                            'startDate': {
                                '$first': '$startDate'
                            },
                            'completionDate': {
                                '$first': '$completionDate'
                            },
                            'contents': {
                                '$push': {
                                    'contentTitle': '$content',
                                    'contentType': '$contentType',
                                    'contentStatus': '$contentStatus',
                                    'quiz_score': '$quizPercentage'
                                }
                            }
                        }
                    }, {
                        '$group': {
                            '_id': '$_id.userId',
                            'userName': {
                                '$first': '$userName'
                            },
                            'enrollmentDate': {
                                '$first': '$enrollmentDate'
                            },
                            'email': {
                                '$first': '$email'
                            },
                            'designation': {
                                '$first': '$designation'
                            },
                            'employeeId': {
                                '$first': '$employeeId'
                            },
                            'userStatus': {
                                '$first': '$userStatus'
                            },
                            'startDate': {
                                '$first': '$startDate'
                            },
                            'completionDate': {
                                '$first': '$completionDate'
                            },
                            'trainings': {
                                '$push': {
                                    'trainingTitle': '$_id.trainingTitle',
                                    'courseStatus': '$courseStatus',
                                    'progress': '$progress',
                                    'timeSpent': '$timeSpent',
                                    'lessons': [
                                        {
                                            'lessonTitle': '$_id.lessonTitle',
                                            'contents': '$contents'
                                        }
                                    ]
                                }
                            }
                        }
                    }, {
                        '$unwind': '$trainings'
                    }, {
                        '$unwind': '$trainings.lessons'
                    }, {
                        '$group': {
                            '_id': '$_id',
                            'userName': {
                                '$first': '$userName'
                            },
                            'enrollmentDate': {
                                '$first': '$enrollmentDate'
                            },
                            'email': {
                                '$first': '$email'
                            },
                            'designation': {
                                '$first': '$designation'
                            },
                            'employeeId': {
                                '$first': '$employeeId'
                            },
                            'userState': {
                                '$first': '$userStatus'
                            },
                            'courses': {
                                '$push': '$trainings'
                            },
                            'startDate': {
                                '$first': '$startDate'
                            },
                            'completionDate': {
                                '$first': '$completionDate'
                            }
                        }
                    }, {
                        '$project': {
                            'email': 1,
                            'userState': 1,
                            'employeeId': 1,
                            'designation': 1,
                            'userName': 1,
                            'enrollmentDate': 1,
                            'startDate': 1,
                            'courses': 1,
                            'completionDate': 1,
                            '_id': 0
                        }
                    }
                ]
            );
            let s3PresignedUrl = "";
            if (input?.export) {
                const flattenLearnerDataForSingleSheet = (learner) => {
                    const flattenedData = [];

                    if (learner) {
                        const email = learner?.email || '';
                        const designation = learner?.designation || '';
                        const employeeId = learner?.employeeId || '';
                        const userState = learner?.userState ? 'Active' : 'Inactive';
                        const enrollmentDate = learner?.enrollmentDate ? new Date(learner.enrollmentDate).toLocaleDateString() : '';
                        const startDate = learner?.startDate ? new Date(learner.startDate).toLocaleDateString() : 'NA';
                        const completionDate = learner?.completionDate ? new Date(learner.completionDate).toLocaleDateString() : 'NA';

                        if (Array.isArray(learner.courses)) {
                            learner.courses.forEach(course => {
                                const courseName = course?.trainingTitle?.[0]?.value || '';
                                const courseStatus = course?.courseStatus || '';

                                if (Array.isArray(course.lessons?.contents)) {
                                    if (course.lessons.contents.length === 0) {
                                        flattenedData.push({
                                            userName: learner?.userName || '',
                                            email: email,
                                            designation: designation,
                                            employeeId: employeeId,
                                            userState: userState,
                                            enrollmentDate: enrollmentDate,
                                            startDate: startDate,
                                            completionDate: completionDate,
                                            courseStatus: courseStatus,
                                            courseName: courseName,
                                            lessonName: '',
                                            contentName: '',
                                            contentType: '',
                                            quizScore: '',
                                        });
                                    } else {
                                        course.lessons.contents.forEach(content => {
                                            if (Array.isArray(content?.contentTitle)) {
                                                content.contentTitle.forEach(contentTitle => {
                                                    const contentName = contentTitle.value || '';
                                                    const contentType = content.contentType || '';
                                                    const quizScore = (contentType === 'QUIZ' && content.contentStatus === 'COMPLETED') ? 'Score not available' : '';

                                                    flattenedData.push({
                                                        userName: learner?.userName || '',
                                                        email: email,
                                                        designation: designation,
                                                        employeeId: employeeId,
                                                        userState: userState,
                                                        enrollmentDate: enrollmentDate,
                                                        startDate: startDate,
                                                        completionDate: completionDate,
                                                        courseStatus: courseStatus,
                                                        courseName: courseName,
                                                        lessonName: course?.lessons?.lessonTitle?.[0]?.value || '',
                                                        contentName: contentName,
                                                        contentType: contentType,
                                                        quizScore: quizScore,
                                                    });
                                                });
                                            } else {
                                                flattenedData.push({
                                                    userName: learner?.userName || '',
                                                    email: email,
                                                    designation: designation,
                                                    employeeId: employeeId,
                                                    userState: userState,
                                                    enrollmentDate: enrollmentDate,
                                                    startDate: startDate,
                                                    completionDate: completionDate,
                                                    courseStatus: courseStatus,
                                                    courseName: courseName,
                                                    lessonName: course?.lessons?.lessonTitle?.[0]?.value || '',
                                                    contentName: '',
                                                    contentType: '',
                                                    quizScore: '',
                                                });
                                            }
                                        });
                                    }
                                } else {
                                    flattenedData.push({
                                        userName: learner?.userName || '',
                                        email: email,
                                        designation: designation,
                                        employeeId: employeeId,
                                        userState: userState,
                                        enrollmentDate: enrollmentDate,
                                        startDate: startDate,
                                        completionDate: completionDate,
                                        courseStatus: courseStatus,
                                        courseName: courseName,
                                        lessonName: course?.lessons?.lessonTitle?.[0]?.value || '',
                                        contentName: '',
                                        contentType: '',
                                        quizScore: '',
                                    });
                                }
                            });
                        }
                    }

                    return flattenedData;
                };


                const exportToExcelWithMultipleSheets = async (learnersData) => {
                    const workbook = XLSX.utils.book_new();

                    learnersData.forEach(learner => {
                        const learnerData = flattenLearnerDataForSingleSheet(learner);
                        const sheetName = learner?.userName || `Learner_${learner.userId?.toString() || Date.now()}`;
                        const worksheet = XLSX.utils.json_to_sheet(learnerData);
                        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
                    });


                    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });


                    const excelFilePath = await UploadHelper.uploadExcel({
                        data: excelBuffer,
                        folderName: "Multiple_Learners_Report_exports",
                        fileName: `learners_Report-${Date.now()}.xlsx`,
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
            messageValue: `An error occurred while generating the learners report: ${err.message}.`,
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

        if (limit > 0 && (!input?.export)) {
            matchStage.push({ $skip: skip }, { $limit: limit });
        }


        const data = await Training.aggregate([
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
                },
            },
            {
                $unwind: {
                    path: '$userInfo',
                    preserveNullAndEmptyArrays: true,
                },
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
                $group: {
                    _id: '$_id',
                    title: { $first: '$title' },
                    updatedAt: { $first: '$updatedAt' },
                    updatedBy: { $first: '$updatedByUser.firstName' },
                    updatedByLastName: { $first: '$updatedByUser.lastName' },
                    uniqueUsers: { $addToSet: '$progress.user' },
                    usersByStatus: { $push: { user: '$progress.user', status: '$progress.status' } },
                },
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
            const worksheet = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(workbook, worksheet, `Courses Report-${Date.now()}`);
            const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
            const excelFilePath = await UploadHelper.uploadExcel({
                data: excelBuffer,
                folderName: "Courses_Report_exports",
                fileName: `Courses_Report-${Date.now()}.xlsx`,
                uploadType: UploadHelper.uploadType.exportCoursesReportAsExcel,
            });
            if (excelFilePath) {
                s3PresignedUrl = await aws_helper.fetchFile(excelFilePath);
                await NotificationHelper.createNotificationhelper({
                    subscriber: subscriberId,
                    titleValue: `Courses Report Exported Successfully`,
                    messageValue: `The Courses report has been successfully generated and exported by ${userInfo.firstName} ${userInfo.lastName}.`,
                    notificationType: NotificationType.COURSE_REPORT_EXPORT_SUCCESS,
                    notifyAdmin: true,
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
                messageValue: `An error occurred while generating the Main Course report: ${err.message}.`,
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

        if (input?.export) {
            await NotificationHelper.createNotificationhelper({
                subscriber: subscriberId,
                titleValue: `Single Course Report Exported In Progress`,
                messageValue: `The single course report has been started generating and exporting by ${userInfo.firstName} ${userInfo.lastName}.`,
                notificationType: NotificationType.EXPORT_IN_PROGRESS,
                notifyAdmin: true,
                status: 'SENT',
                createdBy: userInfo,
                icon: notificationiconEnum.PROGRESS
            });
        }
        
        if (!input?.reportType) throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Report Type is Required");

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
                    dateFilter['$lte'] = new Date(endDate);
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
        }

        const skip = input?.pageInput?.skip ? input.pageInput.skip : 0;
        const limit = input?.pageInput?.limit ? input.pageInput.limit : 50;

        if (limit > 0 && (!input?.export)) {
            matchStage.push({ $skip: skip }, { $limit: limit });
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
                            as: "userInfo"
                        }
                    },
                    {
                        $match: {
                            training: ObjectId(input?.courseId)
                        }
                    },
                    {
                        $lookup: {
                            from: "quizevaluations",
                            localField: "training",
                            foreignField: "trainingId",
                            as: "quizevaluationInfo",
                            pipeline: [
                                {
                                    $match: {
                                        training: ObjectId(input?.courseId)
                                    }
                                },
                                {
                                    $sort: {
                                        updatedAt: -1
                                    }
                                },
                                {
                                    $limit: 1
                                }
                            ]
                        }
                    },
                    {
                        $unwind: {
                            path: "$quizevaluationInfo",
                            preserveNullAndEmptyArrays: true
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
                            from: "trainingprogress",
                            localField: "training",
                            foreignField: "training",
                            as: "trainingProgressInfo",
                            pipeline: [
                                {
                                    $match: {
                                        user: "$userInfo._id",
                                        status: "COMPLETED"
                                    }
                                },
                                {
                                    $lookup: {
                                        from: "trainingmodulecontents",
                                        localField: "trainingModuleContent",
                                        foreignField: "_id",
                                        as: "moduleContentInfo"
                                    }
                                },
                                {
                                    $unwind: {
                                        path: "$moduleContentInfo",
                                        preserveNullAndEmptyArrays: true
                                    }
                                },
                                {
                                    $project: {
                                        duration: "$moduleContentInfo.duration"
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $lookup: {
                            from: "employees",
                            localField: "user",
                            foreignField: "user",
                            as: "empDetails"
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
                            createdAt: 1,
                            endDate: 1,
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
                            totalTimeSpent: {
                                $sum: {
                                    $map: {
                                        input: "$trainingProgressInfo.duration",
                                        as: "duration",
                                        in: {
                                            $toDouble: "$$duration"
                                        }
                                    }
                                }
                            }
                        }
                    }
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
                    createdAt: new Date(item.createdAt).toLocaleString(),
                    updatedAt: new Date(item.updatedAt).toLocaleString(),
                    completionDate: new Date(item.endDate).toLocaleString(),
                    timeSpent: item.totalTimeSpent,
                    quizPercentage: item.quizPercentage,
                    isPassed: item.isPassed,
                }));

                let s3PresignedUrl = "";

                if (input?.export) {
                    if (!data) throw CustomError(ErrorName.NOT_FOUND, "No there is no data present");
                    const parsedData = data.map(item => {

                        const learnerName = `${item.firstName || ''} ${item.lastName || ''}`;

                        const enrollmentDate = item.createdAt ? new Date(item.createdAt).toISOString() : null;
                        const completionDate = item.endDate ? new Date(item.endDate).toISOString() : null;
                        const timeSpent = item.totalTimeSpent ? (item.totalTimeSpent / 60).toFixed(2) : '0';

                        const quizScore = (typeof item.quizPercentage === 'string')
                            ? item.quizPercentage
                            : (typeof item.quizPercentage === 'number' && !isNaN(item.quizPercentage))
                                ? item.quizPercentage.toFixed(2)
                                : 'Not Applicable';

                        const courseStatus = item.status || 'Not Started';
                        const currentVessel = item.vesselName || '';
                        const vesselType = item.vesselType || '';

                        const parsedItem = {
                            LearnerName: learnerName,
                            Email: item.email || '',
                            EmployeeId: item.empId || '',
                            Designation: item.designation || '',
                            CourseStatus: courseStatus,
                            CurrentVessel: currentVessel,
                            VesselType: vesselType,
                            EnrolledDate: enrollmentDate,
                            CompletionDate: completionDate,
                            TimeSpent: timeSpent,
                            QuizScore: quizScore,
                        };

                        return parsedItem;
                    });
                    const workbook = XLSX.utils.book_new();
                    const worksheet = XLSX.utils.json_to_sheet(parsedData);
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
                            titleValue: `Enrollment Report Exported Successfully`,
                            messageValue: `The Courses Enrollment report has been successfully generated and exported by ${userInfo.firstName} ${userInfo.lastName}.`,
                            notificationType: NotificationType.COURSE_ENROLLMENT_REPORT_EXPORT_SUCCESS,
                            notifyAdmin: true,
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
                        '$lookup': {
                            'from': 'users',
                            'localField': 'user',
                            'foreignField': '_id',
                            'as': 'userInfo'
                        }
                    }, {
                        '$unwind': {
                            'path': '$userInfo',
                            'preserveNullAndEmptyArrays': true
                        }
                    }, {
                        '$lookup': {
                            'from': 'employees',
                            'localField': 'user',
                            'foreignField': 'user',
                            'as': 'employeeInfo'
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
                    }, {
                        '$lookup': {
                            'from': 'trainingprogresses',
                            'localField': '_id',
                            'foreignField': 'overallTrainingProgress',
                            'as': 'quizEvaluations',
                            'let': {
                                'attemptCount': '$attemptCount'
                            },
                            'pipeline': [
                                {
                                    '$match': {
                                        '$expr': {
                                            '$eq': [
                                                '$attemptCount', '$$attemptCount'
                                            ]
                                        }
                                    }
                                }, {
                                    '$lookup': {
                                        'from': 'trainingmodules',
                                        'localField': 'trainingModule',
                                        'foreignField': '_id',
                                        'as': 'moduleInfo'
                                    }
                                }, {
                                    '$unwind': {
                                        'path': '$moduleInfo',
                                        'preserveNullAndEmptyArrays': true
                                    }
                                }, {
                                    '$lookup': {
                                        'from': 'trainingmodulecontents',
                                        'localField': 'trainingModuleContent',
                                        'foreignField': '_id',
                                        'as': 'contentInfo'
                                    }
                                }, {
                                    '$unwind': {
                                        'path': '$contentInfo',
                                        'preserveNullAndEmptyArrays': true
                                    }
                                }, {
                                    '$project': {
                                        'moduleId': '$moduleInfo._id',
                                        'moduleName': '$moduleInfo.title',
                                        'percentage': '$quizAttemptDetails.percentage',
                                        'isPassed': '$quizAttemptDetails.isPassed',
                                        'contentType': '$contentInfo.contentType',
                                        'updatedAt': 1
                                    }
                                }
                            ]
                        }
                    }, {
                        '$unwind': {
                            'path': '$quizEvaluations',
                            'preserveNullAndEmptyArrays': false
                        }
                    },
                    ...matchStage,
                    {
                        '$group': {
                            '_id': {
                                "userId": "$user",
                                "moduleId": '$quizEvaluations.moduleId'
                            },
                            'training': {
                                '$first': '$training'
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
                            'currentVessel': {
                                '$first': '$vesselInfo.name'
                            },
                            'vesselType': {
                                '$first': '$vesselTypeInfo.name'
                            },
                            'designation': {
                                '$first': '$designationInfo.name'
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
                                            'isQuizPassed': '$quizEvaluations.isPassed',
                                            'contentType': '$quizEvaluations.contentType',
                                            'updatedAt': '$quizEvaluations.updatedAt'
                                        },
                                        'else': {
                                            'moduleName': '$quizEvaluations.moduleName',
                                            'percentage': 'NOT APPLICABLE',
                                            'isQuizPassed': false,
                                            'contentType': '$quizEvaluations.contentType'
                                        }
                                    }
                                }
                            }
                        }
                    }, {
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
                        '$addFields': {
                            'moduleContents': {
                                '$cond': {
                                    'if': {
                                        '$eq': [
                                            '$hasQuiz', true
                                        ]
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
                    }, {
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
                            'email': {
                                '$first': '$email'
                            },
                            'empId': {
                                '$first': '$empId'
                            },
                            'status': {
                                '$first': '$status'
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
                                    'percentage': {
                                        '$cond': {
                                            'if': {
                                                '$eq': [
                                                    '$hasQuiz', false
                                                ]
                                            },
                                            'then': 'NOT APPLICABLE',
                                            'else': {
                                                '$cond': {
                                                    'if': {
                                                        '$gt': [
                                                            {
                                                                '$size': '$moduleContents.percentage'
                                                            }, 0
                                                        ]
                                                    },
                                                    'then': '---',
                                                    'else': {
                                                        '$ifNull': [
                                                            {
                                                                '$arrayElemAt': [
                                                                    '$moduleContents.percentage', 0
                                                                ]
                                                            }, 0.0
                                                        ]
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
                                                        '$size': '$moduleContents.isPassed'
                                                    }, 0
                                                ]
                                            },
                                            'then': {
                                                '$arrayElemAt': [
                                                    '$moduleContents.isPassed', 0
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
                            'status': 1,
                            'designation': 1,
                            'hasQuiz': 1,
                            'moduleName': 1,
                            'percentage': 1,
                            'iaPassed': 1,
                            'email': 1,
                            'currentVessel': 1,
                            'vesselType': 1,
                            'modules': 1,
                            'empId': 1,
                            'lastSeen': 1,
                            'status': 1
                        }
                    }
                ]
            );
            if (data.length > 0) {

                const coursesData = data.map(item => ({
                    _id: item._id,
                    learnerName: (item?.firstName ? item.firstName : "") + " " + (item?.lastName ? item.lastName : ""),
                    employeeId: item.empId ? item.empId : "Not Found",
                    designation: item?.designation ? item?.designation : "Not Found",
                    email: item?.email ? item?.email : "Not Found",
                    status: item?.status ? item?.status : "Not Found",
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
                            course.modules.forEach(module => {
                                const moduleName = module.moduleName[0]?.value || '';
                                const hasQuiz = module.hasQuiz || false;
                                const quizScore = hasQuiz ? (module.percentage || 'N/A') : 'N/A';
                                flattenedData.push({
                                    Name: `${firstName} ${lastName}`,
                                    Email: email,
                                    Designation: designation,
                                    Status: status,
                                    Module: moduleName,
                                    'Quiz Score': quizScore
                                });
                            });
                        }
                        return flattenedData;
                    };
                    const exportToExcelWithMultipleSheets = async (coursesData) => {
                        const workbook = XLSX.utils.book_new();

                        coursesData.forEach(courses => {
                            const coursesData = flattenCourseDataForSingleSheet(courses);
                            const sheetName = `${courses.firstName} ${courses.lastName}` || `Learner_${courses.userId?.toString() || Date.now()}`;
                            const worksheet = XLSX.utils.json_to_sheet(coursesData);
                            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
                        });
                        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
                        const excelFilePath = await UploadHelper.uploadExcel({
                            data: excelBuffer,
                            folderName: "COURSE-QUIZ-REPORT",
                            fileName: `COURSE-QUIZ-REPORT-${Date.now()}.xlsx`,
                            uploadType: UploadHelper.uploadType.exportLearnersCoursesReportAsExcel,
                        });

                        return excelFilePath;
                    };

                    const excelFilePath = await exportToExcelWithMultipleSheets(data);
                    if (excelFilePath) {
                        s3PresignedUrl = await aws_helper.fetchFile(excelFilePath);
                        await NotificationHelper.createNotificationhelper({
                            subscriber: subscriberId,
                            titleValue: `Quiz Report Exported Successfully`,
                            messageValue: `The Courses Quiz Enrollment report has been successfully generated and exported by ${userInfo.firstName} ${userInfo.lastName}.`,
                            notificationType: NotificationType.COURSE_QUIZ_REPORT_EXPORT_SUCCESS,
                            notifyAdmin: true,
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
                messageValue: `An error occurred while generating the Single Course report: ${err.message}.`,
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
    const { subscriberId } = AuthUser(context);
    if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

    try {
        input = input || {};

        const matchStage = [];

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
            matchStage.push({ $skip: skip }, { $limit: limit });
        }

        const data = await Vessel.aggregate([
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
                    as: "userVesselsInfo"
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "userVesselsInfo.user",
                    foreignField: "_id",
                    as: "userInfo"
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
                    as: "trainingProgressInfo"
                }
            },
            {
                $project: {
                    name: 1,
                    imoNumber: 1,
                    companyName: 1,
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
                                                        $eq: [
                                                            "$$userVessel.vesselStatus",
                                                            "ONBOARDED"
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
                    },
                    filteredTrainingProgress: {
                        $filter: {
                            input: "$trainingProgressInfo",
                            as: "training",
                            cond: {
                                $in: [
                                    "$$training.user",
                                    {
                                        $ifNull: [
                                            {
                                                $map: {
                                                    input: "$onboardedUsers",
                                                    as: "user",
                                                    in: "$$user"
                                                }
                                            },
                                            []
                                        ]
                                    }
                                ]
                            }
                        }
                    },
                    averageProgress: {
                        $cond: {
                            if: {
                                $gt: [
                                    {
                                        $size: {
                                            $ifNull: [
                                                "$filteredTrainingProgress",
                                                []
                                            ]
                                        }
                                    },
                                    0
                                ]
                            },
                            then: {
                                $avg: "$filteredTrainingProgress.progressPercentage"
                            },
                            else: 0
                        }
                    }
                }
            },
            {
                $project: {
                    vesselName: "$name",
                    imoNumber: 1,
                    companyName: 1,
                    vesselId: "$_id",
                    typeOfVessel: "$vesselType",
                    vesselTypeId: "$vesselTypeId",
                    ownerName: 1,
                    onboardedCount: {
                        $size: {
                            $ifNull: ["$onboardedUsers", []]
                        }
                    },
                    progress: "$averageProgress"
                }
            },
            {
                $group: {
                    _id: "$_id",
                    vesselName: { $first: "$vesselName" },
                    vesselTypeId: { $first: "$vesselTypeId" },
                    imoNumber: { $first: "$imoNumber" },
                    companyName: { $first: "$companyName" },
                    vesselId: { $first: "$vesselId" },
                    typeOfVessel: { $first: "$typeOfVessel" },
                    ownerName: { $first: "$ownerName" },
                    onboardedCount: { $first: "$onboardedCount" },
                    progress: { $avg: "$progress" },
                }
            },
            ...matchStage
        ]);

        let s3PresignedUrl = "";

        if (input?.export) {


            const parsedData = data.map(item => {
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
            const worksheet = XLSX.utils.json_to_sheet(parsedData);
            XLSX.utils.book_append_sheet(workbook, worksheet, `Main-Vessel-Report`);
            const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
            const excelFilePath = await UploadHelper.uploadExcel({
                data: excelBuffer,
                folderName: "Vessel_Progress_Reports",
                fileName: `Vessel_Progress_Report-${Date.now()}.xlsx`,
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
            messageValue: `An error occurred while generating the main vessel report: ${err.message}.`,
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
    const { subscriberId, userId } = AuthUser(context);
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

                const dateFilter = {};

                if (startDate) {
                    dateFilter['$gte'] = new Date(startDate);
                }

                if (endDate) {
                    dateFilter['$lte'] = new Date(endDate);
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
                            "as": "userInfo"
                        }
                    },
                    ...(input?.learnerStatus
                        ? [
                            {
                                "$match": {
                                    "userInfo.isRegistered": input.learnerStatus
                                }
                            }
                        ]
                        : []
                    ),
                    {
                        "$lookup": {
                            "from": "vessels",
                            "localField": "user.currentVessel",
                            "foreignField": "_id",
                            "as": "vesselInfo"
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
                    ...(input?.designation
                        ? [
                            {
                                "$match": {
                                    "employeeInfo.empDesignation": { "$in": input.designation }
                                }
                            }
                        ]
                        : []
                    ),
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
                            "preserveNullAndEmptyArrays": true
                        }
                    },
                    {
                        "$unwind": {
                            "path": "$vesselInfo",
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
                            'unenrolmentDate': {
                                '$cond': {
                                    'if': {
                                        '$eq': [
                                            '$isEnrolled', false
                                        ]
                                    },
                                    'then': '$updatedAt',
                                    'else': null
                                }
                            },
                            'startDate': "$startDate",
                            'completionDate': "$endDate",
                            'status': 1,
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
                    }
                ]
            );

            data.forEach(item => {
                const learnerName = `${item.firstName} ${item.lastName}`;
                const enrollmentDate = item.createdAt ? new Date(item.createdAt).toISOString() : null;
                const completionDate = item.completionDate ? new Date(item.completionDate).toISOString() : null;
                const startDate = item.startDate && item.startDate !== 'startDate' ? new Date(item.startDate).toISOString() : null;
                const unenrollmentDate = item.unenrolmentDate ? new Date(item.unenrolmentDate).toISOString() : null;
                const quizScore = (typeof item.quizPercentage === 'string')
                    ? item.quizPercentage
                    : (typeof item.quizPercentage === 'number' && !isNaN(item.quizPercentage))
                        ? item.quizPercentage.toFixed(2)
                        : null;
                const userState = item.isRegistered ? "Registered" : "Unregistered";
                const timeSpent = item.totalTimeSpent ? (item.totalTimeSpent / 60).toFixed(2) : 0;

                dataToExport.push({
                    Name: learnerName,
                    Email: item.email || null,
                    Designation: item.designation || null,
                    'Course Name': item.courseName ? item.courseName[0] : null,
                    Status: item.status || null,
                    'Enrollment Date (UTC TimeZone)': enrollmentDate,
                    'Unenrollment Date (UTC TimeZone)': unenrollmentDate,
                    'Completion Date (UTC TimeZone)': completionDate,
                    'Started Date (UTC TimeZone)': startDate,
                    'Quiz Score': quizScore,
                    userState: userState,
                    'Time Spent (mins)': timeSpent,
                });
            });

        } else if (input?.reportType === "QUIZ") {
            data = await OverallTrainingProgress.aggregate(
                [
                    {
                        '$sort': {
                            'updatedAt': -1
                        }
                    },
                    {
                        '$lookup': {
                            'from': 'users',
                            'localField': 'user',
                            'foreignField': '_id',
                            'as': 'userInfo'
                        }
                    },
                    // ...(input?.learnerStatus
                    //     ? [
                    //         {
                    //             "$match": {
                    //                 "userInfo.isRegistered": input.learnerStatus
                    //             }
                    //         }
                    //     ]
                    //     : []
                    // ),
                    // {
                    //     "$match": {
                    //         "user": { $in: learnerIds.map(id => ObjectId(id)) }
                    //     }
                    // },
                    {
                        '$lookup': {
                            'from': 'trainings',
                            'localField': 'training',
                            'foreignField': '_id',
                            'as': 'trainingInfo'
                        }
                    },
                    {
                        '$unwind': {
                            'path': '$userInfo',
                            'preserveNullAndEmptyArrays': true
                        }
                    },
                    {
                        '$lookup': {
                            'from': 'employees',
                            'localField': 'user',
                            'foreignField': 'user',
                            'as': 'employeeData'
                        }
                    },
                    // ...(input?.designation
                    //     ? [
                    //         {
                    //             "$match": {
                    //                 "employeeInfo.empDesignation": { "$in": input.designation }
                    //             }
                    //         }
                    //     ]
                    //     : []
                    // ),
                    {
                        '$unwind': {
                            'path': '$employeeData',
                            'preserveNullAndEmptyArrays': true
                        }
                    },
                    {
                        '$lookup': {
                            'from': 'designations',
                            'localField': 'employeeData.empDesignation',
                            'foreignField': '_id',
                            'as': 'designationData'
                        }
                    },
                    {
                        '$unwind': {
                            'path': '$designationData',
                            'preserveNullAndEmptyArrays': true
                        }
                    },
                    {
                        '$unwind': {
                            'path': '$trainingInfo',
                            'preserveNullAndEmptyArrays': true
                        }
                    },
                    {
                        '$unwind': {
                            'path': '$contentData',
                            'preserveNullAndEmptyArrays': true
                        }
                    },
                    {
                        '$unwind': {
                            'path': '$contentData.contentIds',
                            'preserveNullAndEmptyArrays': true
                        }
                    },
                    {
                        '$lookup': {
                            'from': 'trainingmodulecontents',
                            'localField': 'contentData.contentIds',
                            'foreignField': '_id',
                            'as': 'contentDetails'
                        }
                    },
                    {
                        '$unwind': {
                            'path': '$contentDetails',
                            'preserveNullAndEmptyArrays': true
                        }
                    },
                    {
                        '$lookup': {
                            'from': 'trainingmodules',
                            'localField': 'contentData.moduleId',
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
                            'from': 'trainingprogresses',
                            'localField': '_id',
                            'foreignField': 'overallTrainingProgress',
                            'as': 'contentProgress'
                        }
                    },
                    {
                        '$unwind': {
                            'path': '$contentProgress',
                            'preserveNullAndEmptyArrays': true
                        }
                    },
                    {
                        '$match': {
                            '$expr': {
                                '$and': [
                                    {
                                        '$eq': [
                                            '$contentProgress.trainingModuleContent', '$contentData.contentIds'
                                        ]
                                    }, {
                                        '$eq': [
                                            '$attemptCount', '$contentProgress.attemptCount'
                                        ]
                                    }
                                ]
                            }
                        }
                    },
                    {
                        '$project': {
                            'userId': '$user',
                            'user': {
                                '$concat': [
                                    {
                                        '$ifNull': [
                                            '$userInfo.firstName', ''
                                        ]
                                    }, ' ', {
                                        '$ifNull': [
                                            '$userInfo.lastName', ''
                                        ]
                                    }
                                ]
                            },
                            'email': '$userInfo.email',
                            'designation': '$designationData.name',
                            'empId': '$userInfo.civilIdOrPassport',
                            'userStatus': '$userInfo.isRegistered',
                            'attemptCount': '$attemptCount',
                            'progress': '$progressPercentage',
                            'training': '$trainingInfo.title',
                            'courseStatus': '$status',
                            'lesson': '$moduleInfo.title',
                            'content': '$contentDetails.title',
                            'contentType': '$contentDetails.contentType',
                            'contentStatus': '$contentProgress.status',
                            'enrollmentDate': '$createdAt',
                            'quizPercentage': '$contentProgress.quizAttemptDetails.percentage',
                            'timeSpent': {
                                '$ifNull': [
                                    '$timeSpent', 0
                                ]
                            },
                            'startDate': '$startDate',
                            'completionDate': '$completionDate'
                        }
                    },
                    {
                        '$group': {
                            '_id': {
                                'userId': '$userId',
                                'trainingTitle': '$training',
                                'lessonTitle': '$lesson'
                            },
                            'userName': {
                                '$first': '$user'
                            },
                            'enrollmentDate': {
                                '$first': '$enrollmentDate'
                            },
                            'email': {
                                '$first': '$email'
                            },
                            'designation': {
                                '$first': '$designation'
                            },
                            'employeeId': {
                                '$first': '$empId'
                            },
                            'userStatus': {
                                '$first': '$userStatus'
                            },
                            'courseStatus': {
                                '$first': '$courseStatus'
                            },
                            'progress': {
                                '$first': '$progress'
                            },
                            'timeSpent': {
                                '$first': '$timeSpent'
                            },
                            'startDate': {
                                '$first': '$startDate'
                            },
                            'completionDate': {
                                '$first': '$completionDate'
                            },
                            'contents': {
                                '$push': {
                                    'contentTitle': '$content',
                                    'contentType': '$contentType',
                                    'contentStatus': '$contentStatus',
                                    'quiz_score': '$quizPercentage'
                                }
                            }
                        }
                    },
                    {
                        '$group': {
                            '_id': '$_id.userId',
                            'userName': {
                                '$first': '$userName'
                            },
                            'enrollmentDate': {
                                '$first': '$enrollmentDate'
                            },
                            'email': {
                                '$first': '$email'
                            },
                            'designation': {
                                '$first': '$designation'
                            },
                            'employeeId': {
                                '$first': '$employeeId'
                            },
                            'userStatus': {
                                '$first': '$userStatus'
                            },
                            'startDate': {
                                '$first': '$startDate'
                            },
                            'completionDate': {
                                '$first': '$completionDate'
                            },
                            'trainings': {
                                '$push': {
                                    'trainingTitle': '$_id.trainingTitle',
                                    'courseStatus': '$courseStatus',
                                    'progress': '$progress',
                                    'timeSpent': '$timeSpent',
                                    'lessons': [
                                        {
                                            'lessonTitle': '$_id.lessonTitle',
                                            'contents': '$contents'
                                        }
                                    ]
                                }
                            }
                        }
                    },
                    {
                        '$unwind': '$trainings'
                    },
                    {
                        '$unwind': '$trainings.lessons'
                    },
                    {
                        '$group': {
                            '_id': '$_id',
                            'userName': {
                                '$first': '$userName'
                            },
                            'enrollmentDate': {
                                '$first': '$enrollmentDate'
                            },
                            'email': {
                                '$first': '$email'
                            },
                            'designation': {
                                '$first': '$designation'
                            },
                            'employeeId': {
                                '$first': '$employeeId'
                            },
                            'userState': {
                                '$first': '$userStatus'
                            },
                            'courses': {
                                '$push': '$trainings'
                            },
                            'startDate': {
                                '$first': '$startDate'
                            },
                            'completionDate': {
                                '$first': '$completionDate'
                            }
                        }
                    },
                    {
                        '$project': {
                            'email': 1,
                            'userState': 1,
                            'employeeId': 1,
                            'designation': 1,
                            'userName': 1,
                            'enrollmentDate': 1,
                            'startDate': 1,
                            'courses': 1,
                            'completionDate': 1,
                            '_id': 0
                        }
                    }
                ]
            );

            const flattenLearnerDataForSingleSheet = (learner) => {
                const flattenedData = [];

                if (learner) {
                    const email = learner?.email || '';
                    const designation = learner?.designation || '';
                    const employeeId = learner?.employeeId || '';
                    const userState = learner?.userState ? 'Active' : 'Inactive';
                    const enrollmentDate = learner?.enrollmentDate ? new Date(learner.enrollmentDate).toLocaleDateString() : '';
                    const startDate = learner?.startDate ? new Date(learner.startDate).toLocaleDateString() : 'NA';
                    const completionDate = learner?.completionDate ? new Date(learner.completionDate).toLocaleDateString() : 'NA';

                    if (Array.isArray(learner.courses)) {
                        learner.courses.forEach(course => {
                            const courseName = course?.trainingTitle?.[0]?.value || '';
                            const courseStatus = course?.courseStatus || '';

                            if (Array.isArray(course.lessons?.contents)) {
                                if (course.lessons.contents.length === 0) {
                                    flattenedData.push({
                                        userName: learner?.userName || '',
                                        email: email,
                                        designation: designation,
                                        employeeId: employeeId,
                                        userState: userState,
                                        enrollmentDate: enrollmentDate,
                                        startDate: startDate,
                                        completionDate: completionDate,
                                        courseStatus: courseStatus,
                                        courseName: courseName,
                                        lessonName: '',
                                        contentName: '',
                                        contentType: '',
                                        quizScore: '',
                                    });
                                } else {
                                    course.lessons.contents.forEach(content => {
                                        if (Array.isArray(content?.contentTitle)) {
                                            content.contentTitle.forEach(contentTitle => {
                                                const contentName = contentTitle.value || '';
                                                const contentType = content.contentType || '';
                                                const quizScore = (contentType === 'QUIZ' && content.contentStatus === 'COMPLETED') ? 'Score not available' : '';

                                                flattenedData.push({
                                                    userName: learner?.userName || '',
                                                    email: email,
                                                    designation: designation,
                                                    employeeId: employeeId,
                                                    userState: userState,
                                                    enrollmentDate: enrollmentDate,
                                                    startDate: startDate,
                                                    completionDate: completionDate,
                                                    courseStatus: courseStatus,
                                                    courseName: courseName,
                                                    lessonName: course?.lessons?.lessonTitle?.[0]?.value || '',
                                                    contentName: contentName,
                                                    contentType: contentType,
                                                    quizScore: quizScore,
                                                });
                                            });
                                        } else {
                                            flattenedData.push({
                                                userName: learner?.userName || '',
                                                email: email,
                                                designation: designation,
                                                employeeId: employeeId,
                                                userState: userState,
                                                enrollmentDate: enrollmentDate,
                                                startDate: startDate,
                                                completionDate: completionDate,
                                                courseStatus: courseStatus,
                                                courseName: courseName,
                                                lessonName: course?.lessons?.lessonTitle?.[0]?.value || '',
                                                contentName: '',
                                                contentType: '',
                                                quizScore: '',
                                            });
                                        }
                                    });
                                }
                            } else {
                                flattenedData.push({
                                    userName: learner?.userName || '',
                                    email: email,
                                    designation: designation,
                                    employeeId: employeeId,
                                    userState: userState,
                                    enrollmentDate: enrollmentDate,
                                    startDate: startDate,
                                    completionDate: completionDate,
                                    courseStatus: courseStatus,
                                    courseName: courseName,
                                    lessonName: course?.lessons?.lessonTitle?.[0]?.value || '',
                                    contentName: '',
                                    contentType: '',
                                    quizScore: '',
                                });
                            }
                        });
                    }
                }

                return flattenedData;
            };

            dataToExport = flattenLearnerDataForSingleSheet(data);

            return {
                status: true,
                fileName: "",
                filePath: "",
                message: "report generated successfully"
            };
        }

        if (data.length > 0) {
            let s3PresignedUrl = "";

            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            XLSX.utils.book_append_sheet(workbook, worksheet, `Courses Report-${Date.now()}`);
            const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
            const excelFilePath = await UploadHelper.uploadExcel({
                data: excelBuffer,
                folderName: "Custom_Report_exports",
                fileName: `CUSTOM-REPORT.xlsx`,
                uploadType: UploadHelper.uploadType.exportLearnersCoursesReportAsExcel,
            });
            if (excelFilePath) {
                s3PresignedUrl = await aws_helper.fetchFile(excelFilePath);
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

        } else {
            throw CustomError(ErrorName.NOT_FOUND, "No data found");
        }

    } catch (error) {
        throw new Error(error.message);
    }
}

const getCustomReportLogs = async ({ pageInput }, context) => {
    const { subscriberId } = AuthUser(context);
    if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
    try {

        const skip = pageInput?.skip ? pageInput.skip : 0;
        const limit = pageInput?.limit ? pageInput.limit : 50;
        let matchStage = [];
        if (limit > 0) {
            matchStage.push({ $skip: skip }, { $limit: limit });
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
            }
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

module.exports.queries = {
    getMainLearnersReport,
    getSingleLearnerReport,
    getMainCoursesReport,
    getSingleCourseReport,
    getVesselMainReport,
    generateCustomReport,
    getCustomReportLogs,
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
