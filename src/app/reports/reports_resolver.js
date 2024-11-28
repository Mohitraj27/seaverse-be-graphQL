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

const getMainLearnersReport = async ({ input }, context) => {
    const { subscriberId } = AuthUser(context);
    if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

    try {
        const matchStage = [];

        if (input && Object.keys(input).length > 0) {
            const filterInput = input.filterInput || {};
            const searchString = filterInput.search || ''; 
            if (searchString.trim() !== '') {
                const regexSearch = new RegExp(searchString.trim(), 'i'); 

                matchStage.push({
                    $match: {
                        $or: [
                            { 'userInfo.firstName': { $regex: regexSearch } },
                            { 'userInfo.lastName': { $regex: regexSearch } },
                            { 'employeeDesignation.name': { $regex: regexSearch } },
                            { 'userInfo.email': { $regex: regexSearch } },
                            { 'vesselDetails.name': { $regex: regexSearch } },
                            { 'vesselDetails.typeOfVessel': { $regex: regexSearch } }
                        ]
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
                matchStage.push({
                    $match: { 'userInfo.isDeleted': filterInput.isDeleted },
                });
            }

            const skip = (input.pageInput?.pageSize || 0) * ((input.pageInput?.pageNumber || 1) - 1);
            const limit = input.pageInput?.pageSize || 0;

            if (limit > 0) {
                matchStage.push({ $skip: skip }, { $limit: limit });
            }
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
                    name: {
                        $concat: [
                            { $ifNull: ['$userInfo.firstName', ''] },
                            ' ',
                            { $ifNull: ['$userInfo.lastName', ''] },
                        ],
                    },
                    isRegistered: '$userInfo.isRegistered',
                    isDeleted: '$userInfo.isDeleted',
                    EmployeeId: '$userInfo.civilIdOrPassport',
                    email: '$userInfo.email',
                    designation: '$employeeDesignation.name',
                    vesselName: '$vesselDetails.name',
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
            IsRegistered: item.isRegistered ? 'Yes' : 'No',
            IsDeleted: item.isDeleted ? 'Yes' : 'No',
            LastSeen: item.lastSeen ? new Date(item.lastSeen).toLocaleString() : 'N/A',
            CoursesCount: item.coursesCount,
            AverageProgressPercentage: item.averageProgressPercentage,
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
        throw Error(err.message);
    }
};

const getSingleLearnerReport = async ({ input }, context) => {
    const { subscriberId } = AuthUser(context);
    if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

    try {
        const matchStage = [];

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
                    dateFilter['$lte'] = new Date(endDate);
                }

                matchStage.push({
                    $match: {
                        createdAt: dateFilter,
                    },
                });
            }

            const skip = (input.pageInput?.pageSize || 0) * ((input.pageInput?.pageNumber || 1) - 1);
            const limit = input.pageInput?.pageSize || 0;

            if (limit > 0) {
                matchStage.push({ $skip: skip }, { $limit: limit });
            }
        }

        const learnerData = await OverallTrainingProgress.aggregate(
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
                    "$match": {
                        "user": ObjectId(input.learnerId) 
                    }
                },
                {
                    "$lookup": {
                        "from": "quizevaluations",
                        "localField": "training",
                        "foreignField": "trainingId",
                        "as": "quizevaluationInfo",
                        "pipeline": [
                            {
                                "$match": {
                                    "userId": ObjectId(input.learnerId)
                                }
                            },
                            {
                                "$sort": {
                                    "updatedAt": -1
                                }
                            },
                            {
                                "$limit": 1
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
                    "$lookup": {
                        "from": "trainingprogress",
                        "localField": "training",
                        "foreignField": "training",
                        "as": "trainingProgressInfo",
                        "pipeline": [
                            {
                                "$match": {
                                    "user": ObjectId(input.learnerId),
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
                    "$project": {
                        "courseName": {
                            "$arrayElemAt": ["$trainingInfo.title.value", 0] 
                        },
                        "createdAt": 1,
                        "completionDate": 1,
                        "status": 1,
                        "updatedAt": 1,
                        "firstName": "$userInfo.firstName",
                        "lastName": "$userInfo.lastName",
                        "quizPercentage": {
                            "$ifNull": ["$quizevaluationInfo.percentage", null]
                        },
                        "isPassed": {
                            "$ifNull": ["$quizevaluationInfo.isPassed", null]
                        },
                        "totalTimeSpent": {
                            "$sum": {
                                "$map": {
                                    "input": "$trainingProgressInfo.duration",
                                    "as": "duration",
                                    "in": { "$toDouble": "$$duration" }
                                }
                            }
                        }
                    }
                }
            ]
        );

        const learnerName = learnerData.length > 0 ? `${learnerData[0].firstName} ${learnerData[0].lastName}` : 'Unknown Learner';

        const data = learnerData.map(item => ({
            courseName: item.courseName ? item.courseName[0] : null,
            status: item.status,
            Enrollment_Date: item.createdAt,
            Completion_Date: item.completionDate ? item.completionDate : "Not Applicable",
            totalTimeSpent: item.totalTimeSpent ? item.totalTimeSpent : 0,
            LastSeen: item.updatedAt ? new Date(item.updatedAt).toLocaleString() : 'N/A',
        }));

        let s3PresignedUrl = "";

        if (input?.export) {
            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(workbook, worksheet, `L-CoursesReport-${Date.now()}`);
            const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
            const excelFilePath = await UploadHelper.uploadExcel({
                data: excelBuffer,
                folderName: `${learnerName}'s_Courses_Report_exports`,
                fileName: `learners_Report-${learnerName}-${Date.now()}.xlsx`,
                uploadType: UploadHelper.uploadType.exportLearnersCoursesReportAsExcel,
            });
            if (excelFilePath) {
                s3PresignedUrl = await aws_helper.fetchFile(excelFilePath);
            }
            return {
                filePath: s3PresignedUrl,
                fileName: path.basename(excelFilePath),
                learnerData,
            };
        }

        return {
            filePath: "",
            fileName: "",
            learnerData,
        };
    } catch (err) {
        throw Error(err.message);
    }
};

const getMainCoursesReport = async ({ input }, context) => {
    const { subscriberId } = AuthUser(context);
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

            const skip = (input.pageInput?.pageSize || 0) * ((input.pageInput?.pageNumber || 1) - 1);
            const limit = input.pageInput?.pageSize || 0;

            if (limit > 0) {
                matchStage.push({ $skip: skip }, { $limit: limit });
            }
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
        throw Error(err.message);
    }
};
const getSingleCourseEnrollmentReport = async ({ input }, context) => {
    const { subscriberId } = AuthUser(context);
    if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

    try {
        input = input || {};

        const matchStage = [];

        if (Object.keys(input).length > 0) {
            const filterInput = input.filter || {};

            if (filterInput.vesselName) {
                matchStage.push({
                    $match: {
                        'usersVesselInfo.name': { $regex: filterInput.vesselName, $options: 'i' },
                    },
                });
            }

            if (filterInput.vesselType) {
                matchStage.push({
                    $match: {
                        'vesselTypeInfo.name': { $regex: filterInput.vesselType, $options: 'i' },
                    },
                });
            }

            if (filterInput.designation) {
                matchStage.push({
                    $match: {
                        'designationInfo.name': { $regex: filterInput.designation, $options: 'i' },
                    },
                });
            }

            if (filterInput.status) {
                matchStage.push({
                    $match: {
                        'status': { $regex: filterInput.status, $options: 'i' },
                    },
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

            const skip = (input.pageInput?.pageSize || 0) * ((input.pageInput?.pageNumber || 1) - 1);
            const limit = input.pageInput?.pageSize || 0;

            if (limit > 0) {
                matchStage.push({ $skip: skip }, { $limit: limit });
            }
        }

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
                        as: "usersVesselBridge"
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
                        createdAt: 1,
                        completionDate: 1,
                        status: 1,
                        updatedAt: 1,
                        trainingTitle : "$trainingInfo.title",
                        firstName: "$userInfo.firstName",
                        lastName: "$userInfo.lastName",
                        email: '$userInfo.email',
                        empId: "$userInfo.civilIdOrPassport",
                        designation: "$designationInfo.name",
                        vesselName: "$usersVesselInfo.name",
                        vesselType: "$vesselTypeInfo.name",
                        quizPercentage: {
                            $ifNull: [
                                "$quizevaluationInfo.percentage",
                                null
                            ]
                        },
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
                learnerName: (item?.firstName ? item.firstName : "") +" "+(item?.lastName ? item.lastName : ""),
                employeeId: item.empId ? item.empId : null,
                trainingTitle : item?.trainingTitle,
                designation: item?.designation,
                email: item?.email,
                status: item?.status,
                currentVessel : item.vesselName,
                vesselType : item.vesselType,
                createdAt: new Date(item.createdAt).toLocaleString(),
                updatedAt: new Date(item.updatedAt).toLocaleString(),
                completionDate : new Date(item.endDate).toLocaleString(),
                timeSpent : item.totalTimeSpent,
                quizPercentage  : item.quizPercentage,
                isPassed : item.isPassed,
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
        return {
            coursesData: []
        }

    } catch (err) {
        throw Error(err.message);
    }
};

const getVesselMainReport = async ({ input }, context) => {
    const { subscriberId } = AuthUser(context);
    if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

    try {
        input = input || {};

        const matchStage = [];

        if (Object.keys(input).length > 0) {
            const filterInput = input.filterInput || {};

            if (filterInput.name) {
                matchStage.push({
                    $match: {
                        'name': { $regex: filterInput.name, $options: 'i' },
                    },
                });
            }

            if (filterInput.imoNumber) {
                matchStage.push({
                    $match: {
                        'imoNumber': { $regex: filterInput.imoNumber, $options: 'i' },
                    },
                });
            }

            if (filterInput.ownerName) {
                matchStage.push({
                    $match: {
                        'ownerName': { $regex: filterInput.ownerName, $options: 'i' },
                    },
                });
            }

            const skip = (input.pageInput?.pageSize || 0) * ((input.pageInput?.pageNumber || 1) - 1);
            const limit = input.pageInput?.pageSize || 0;

            if (limit > 0) {
                matchStage.push({ $skip: skip }, { $limit: limit });
            }
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
                    companyName:1,
                    vesselId: "$_id",
                    typeOfVessel: "$vesselType",
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
            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(workbook, worksheet, `Vessel_Progress_Report-${Date.now()}`);
            const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
            const excelFilePath = await UploadHelper.uploadExcel({
                data: excelBuffer,
                folderName: "Vessel_Progress_Reports",
                fileName: `Vessel_Progress_Report-${Date.now()}.xlsx`,
                uploadType: UploadHelper.uploadType.exportVesselProgressReportAsExcel,
            });
            if (excelFilePath) {
                s3PresignedUrl = await aws_helper.fetchFile(excelFilePath);
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
        throw Error(err.message);
    }
};



module.exports.queries = {
    getMainLearnersReport,
    getSingleLearnerReport,
    getMainCoursesReport,
    getSingleCourseEnrollmentReport,
    getVesselMainReport,
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
