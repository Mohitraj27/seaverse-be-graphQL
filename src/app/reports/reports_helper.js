const { UploadHelper, escapeRegex } = require("../../util");
const { OverallTrainingProgress } = require("../training-registrations/overall-course-progress/overall_progress_model");
const Export = require("../user/exportUser/exportUser_model");
const { customEnrollmentReportQuery, customQuizReportQuery } = require("./reports_query_builder");
const XLSX = require('xlsx');
const path = require('path');
const NotificationEvent = require("../notifications/notification_event.json");
const aws_helper = require("../../util/aws_helper");
const NotificationType = require("../notifications/notification_type.json");
const notificationiconEnum = require("../notifications/notification_icon.json");
const { Notification } = require("../notifications/notification_model");
const { ObjectId } = require('mongodb');


const generateFileNameTimestamp = async () => {
    const now = new Date();

    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear().toString().slice(-2);
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    return `${day}-${month}-${year}_(${hours}:${minutes})`;
}

const getAppliedFilters = async (input) => {
    let appliedFilters = [];

    if (input.courseIds && Array.isArray(input.courseIds) && input.courseIds.length > 0) {
        appliedFilters.push("Course Names filter");
    }
    if (input.vesselName && Array.isArray(input.vesselName) && input.vesselName.length > 0) {
        appliedFilters.push("Vessel Name filter");
    }
    if (input.vesselType && Array.isArray(input.vesselType) && input.vesselType.length > 0) {
        appliedFilters.push("Vessel Type filter");
    }
    if (input.courseStatus && Array.isArray(input.courseStatus) && input.courseStatus.length > 0) {
        appliedFilters.push("Course Status filter");
    }
    if (input.learnerStatus && Array.isArray(input.learnerStatus) && input.learnerStatus.length > 0) {
        appliedFilters.push("Learner Status filter");
    }
    if (appliedFilters.length === 0) {
        return "No filters were applied.";
    }
    return `Filters applied: ${appliedFilters.join(', ')}`;
}

const convertUnderscoreSeperatedStringToCamelCase = async (str) => {
    if (str == null) {
        return null;
    }

    return str
        .split('_')
        .map((word, index) => {

            if (index === 0) {
                return word.toLowerCase();
            }
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join('');
}

const formatDate = (date) => {
    if (date) {
        const formattedDate = new Date(date);

        // Get day, month, year, hours, minutes, and seconds
        const day = String(formattedDate.getUTCDate()).padStart(2, '0');
        const month = String(formattedDate.getUTCMonth() + 1).padStart(2, '0'); // Month is 0-indexed
        const year = formattedDate.getUTCFullYear();
        const hours = String(formattedDate.getUTCHours()).padStart(2, '0');
        const minutes = String(formattedDate.getUTCMinutes()).padStart(2, '0');
        const seconds = String(formattedDate.getUTCSeconds()).padStart(2, '0');

        // Format the date as "DD-MM-YYYY HH.MM.SS"
        return `${day}-${month}-${year} ${hours}.${minutes}.${seconds}`;
    }
    return null;
};

const generateSortingStage = async (fieldMapping, lowercaseFields = [], defaultField = "FIRST_NAME", sortInput) => {
    const sortingStage = [];
    const sortOrder = sortInput?.sortOrder ?? 1;

    const field = sortInput?.field ?? defaultField;
    const fieldPath = fieldMapping[field];

    if (fieldPath) {
        // if the field is a text value, we need to sort by lowercase value for consistency
        const isLowercaseRequired = lowercaseFields.includes(field);

        if (isLowercaseRequired) {
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
        } else {
            sortingStage.push({
                $sort: {
                    [fieldPath]: sortOrder
                }
            });
        }
    } else {
        // If the fieldPath doesn't exist in fieldMapping, apply default sorting (by defaultField)
        sortingStage.push({
            $addFields: {
                [`lowercase${defaultField}`]: { $toLower: `$${fieldMapping[defaultField]}` }
            }
        });
        sortingStage.push({
            $sort: {
                [`lowercase${defaultField}`]: sortOrder
            }
        });
    }

    return sortingStage;
}

const convertMinutesToHMS = (minutes) => {
    if (typeof (minutes) === 'string' && parseInt(minutes) !== NaN) {
        minutes = parseInt(minutes);
    }
    if (minutes == null || isNaN(minutes)) {
        return '00:00:00';
    }

    const wholeMinutes = Math.floor(minutes);
    const decimalPart = +(minutes % 1).toFixed(2);
    const secondsFromDecimal = Math.round(decimalPart * 60);

    // Add overflow seconds to minutes
    const totalSeconds = wholeMinutes * 60 + secondsFromDecimal;

    const hours = Math.floor(totalSeconds / 3600);
    const minutesPart = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${String(hours).padStart(2, '0')}:${String(minutesPart).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const customReportGenBackgroundProcess = async (matchStage, input, subscriberId, userInfo, userId) => {

    let data;
    let dataToExport = [];
    if (input?.reportType === "ENROLLMENT") {

        const customEnrollmentReportPipeline = customEnrollmentReportQuery(matchStage);
        data = await OverallTrainingProgress.aggregate(customEnrollmentReportPipeline);

        data.forEach(item => {
            const learnerName = `${item.firstName || ''} ${item.lastName || ''}`.trim() || "-";
            const enrollmentDate = item?.createdAt ? formatDate(item.createdAt) : "Not Applicable";
            const completionDate = item?.endDate ? formatDate(item.endDate) : "Not Applicable";
            const startDate = item?.startDate && item.startDate !== 'startDate'
                ? formatDate(item.startDate)
                : "Not Applicable";
            const country = item?.country || "Not Applicable";
            const vesselType = item?.vesselType || "Not Applicable";
            const currentVessel = item?.currentVessel || "Not Applicable";
            const unenrollmentDate = item?.unenrollmentDate ? formatDate(item.unenrollmentDate) : "Not Applicable";
            const quizScore = item.quizPercentage ? parseInt(item.quizPercentage) + "%" : "Not Applicable";
            const userState = item.isRegistered ? "Registered" : "Unregistered";
            const timeSpent = item.totalTimeSpent ? convertMinutesToHMS(item?.totalTimeSpent) : "00:00:00";
            const adminMarkedAsCompleted = item.adminMarkedAsCompleted ? "Yes" : "No";

            dataToExport.push({
                Name: learnerName ?? "-",
                Email: item.email || null,
                Country: country,
                'User Id': item.employeeId || null,
                Designation: item.designation || null,
                'Current Vessel': currentVessel,
                'Vessel Type': vesselType,
                'Course Name': item.courseName ? item.courseName[0] : null,
                'Course Status': item.status || null,
                'Admin Marked As Completed': adminMarkedAsCompleted,
                'Course Enrollment Date & Time (UTC)': enrollmentDate,
                'Course Unenrollment Date & Time (UTC)': unenrollmentDate,
                'Course Started Date & Time (UTC)': startDate,
                'Course Completion Date & Time (UTC)': completionDate,
                'Quiz Score': quizScore,
                'User State': userState,
                'Time Spent': timeSpent,
            });
        });

    } else if (input?.reportType === "QUIZ") {
        const customQuizReportPipeline = customQuizReportQuery(matchStage);
        data = await OverallTrainingProgress.aggregate(customQuizReportPipeline);

        const flattenDataForSingleSheet = (learner) => {
            const flattenedData = [];
            if (learner) {
                const email = learner?.email || '';
                const designation = learner?.designation || '';
                const country = learner?.country || 'Not Applicable';
                const firstName = learner?.firstName || '';
                const lastName = learner?.lastName || '';
                const empId = learner?.empId || '';
                const currentVessel = learner?.currentVessel || 'Not Applicable';
                const vesselType = learner?.vesselType || 'Not Applicable';
                const status = learner?.status || 'Not Applicable';
                const courseName = learner?.trainingTitle[0]?.value || 'Unknown Course';
                const adminMarkedAsCompleted = learner?.adminMarkedAsCompleted ? 'Yes' : 'No';
                const enrollmentDate = learner?.createdAt ? formatDate(learner.createdAt) : "Not Applicable";
                const completionDate = learner?.endDate ? formatDate(learner.endDate) : "Not Applicable";
                const startDate = learner?.startDate && learner.startDate !== 'startDate'
                    ? formatDate(learner.startDate)
                    : "Not Applicable";
                const unenrollmentDate = learner?.unenrollmentDate ? formatDate(learner.unenrollmentDate) : "Not Applicable";


                learner.modules.forEach((module, moduleIndex) => {
                    const moduleName = module?.moduleName[0]?.value || 'Unnamed Module';
                    const hasQuiz = module?.hasQuiz || false;


                    module?.moduleContents.forEach((content, contentIndex) => {
                        const contentName = content?.contentName[0]?.value || 'Unnamed Content';
                        const contentType = content?.contentType || 'Not Applicable';
                        const quizScore = content?.percentage || 'Not Applicable';
                        const timeSpendInContent = content?.timeSpendInContent ? convertMinutesToHMS(content?.timeSpendInContent) : "00:00:00";
                        if (learner.contentType === 'QUIZ') {
                            flattenedData.push({
                                Name: `${firstName} ${lastName}`,
                                Email: email,
                                Country: country,
                                'User Id': empId,
                                Designation: designation,
                                'Current Vessel': currentVessel,
                                'Vessel Type': vesselType,
                                'Course Name': courseName,
                                'Course Status': status,
                                'Admin Marked As Completed': adminMarkedAsCompleted,
                                'Course Enrollment Date & Time (UTC) ': enrollmentDate,
                                'Course Unenrollment Date & Time (UTC)': unenrollmentDate,
                                'Course Started Date & Time (UTC)': startDate,
                                'Course Completion Date & Time (UTC)': completionDate,
                                'Lesson Name': `${moduleName}`,
                                'Content Name': `${contentName}`,
                                // 'Content Type': contentType,
                                'Quiz Score': quizScore,
                                'Time Spent': timeSpendInContent,
                            });
                        }
                    });
                });
            }

            return flattenedData;
        };

        const flattenAllLearnersData = (learners) => {
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
        ]

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
        ]

        const headers = input?.reportType === 'ENROLLMENT' ? enrollmentReportHeaders : quizReportHeaders;
        worksheet = XLSX.utils.aoa_to_sheet([
            headers
        ]);


    }
    else {
        worksheet = XLSX.utils.json_to_sheet(dataToExport);
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, `${input.reportType}`);
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    
    const excelFilePath = await UploadHelper.uploadExcel({
        data: excelBuffer,
        folderName: "Custom-Quiz-Reports",
        fileName: `custom ${input?.reportType.toLowerCase() ?? ""} report - ${await generateFileNameTimestamp()}.xlsx`,
        uploadType: UploadHelper.uploadType.exportCustomQuizReport,
    });
    
    if (excelFilePath) {
        s3PresignedUrl = await aws_helper.fetchFile(excelFilePath);
        
        const notificationMessage = input?.reportType == 'ENROLLMENT' ? `Custom report is ready to download` : `Quiz report is ready to download`
            
            await sendNotificationOnBULK({
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
                            filePath: excelFilePath
                        }
                    }
                ],
                status: 'SENT',
                createdBy: userInfo,
                icon: notificationiconEnum.SUCCESS
            })
            
        // await NotificationHelper.createNotificationhelper({
        //     subscriber: subscriberId,
        //     titleValue: notificationMessage,
        //     // messageValue: `The Custom ${input?.reportType.toLowerCase()} report has been successfully generated and exported by ${userInfo?.firstName} ${userInfo?.lastName}.${await ReportsHelper.getAppliedFilters(input)}`,
        //     notificationType: NotificationType.CUSTOM_REPORT_EXPORT_SUCCESS,
        //     notifyAllAdmin: false,
        //     isNotificatonForAdmin: true,
        //     notifiers: [userInfo._id],
        //     additionalInfo: [
        //         {
        //             infoType: "EXPORT_URL",
        //             infoData: {
        //                 filePath: excelFilePath
        //             }
        //         }
        //     ],
        //     status: 'SENT',
        //     createdBy: userInfo,
        //     icon: notificationiconEnum.SUCCESS
        // });

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

}

const sendNotificationOnBULK = async notificationData => {

    try {
        
        
        const notification = {
            subscriber: notificationData.subscriber,
            title: [{ lang: "en", value: `${notificationData.titleValue}` }],
            notifyAllAdmin: false,
            isNotificatonForAdmin: true,
            notifiers: notificationData.notifiers,
            createdBy: notificationData.createdBy,
            notificationType: notificationData.notificationType,
            status: notificationData.status,
            icon: notificationData.icon,
            additionalInfo: notificationData.additionalInfo
        };
        

        const createdNotification = await Notification.create(notification);

        process.send({
            type: 'NOTIFICATION',
            event: NotificationEvent.ON_NOTIFICATION,
            data: { onNotification: createdNotification }
        });

    } catch (error) {
        throw Error(error.message);
    }

}


function buildLearnerAggregationPipelineFilterStages(input = {}) {
    const matchStage = [];
    const matchUsers = [];
    const matchUsersFromTrainingProgresses = [];
    const sortingStage = [];
    let deletedUsersStage = [];
    const pageLimit = [];

    // Default values
    const filterInput = input.filter || {};
    const learnerIds = Array.isArray(input.learnerIds)
        ? input.learnerIds
        : input.learnerIds
        ? [input.learnerIds]
        : [];

    // 1. Title filter

    if (filterInput?.title) {
        const escapedTitle = escapeRegex(filterInput.title);

        matchStage.push({
            $match: {
                "trainingInfo.title.value": {
                    $regex: escapedTitle,
                    $options: "i",
                },
            },
        });
    }

    // 2. Course ID filter
    if (filterInput?.courseIds?.length > 0) {
        matchStage.push({
            $match: {
                training: {
                    $in: Array.isArray(filterInput.courseIds)
                        ? filterInput.courseIds
                        : [filterInput.courseIds],
                },
            },
        });
    }

    // 3. Status filter
    if (filterInput.courseStatuses !== undefined) {
        const statusFilter = Array.isArray(filterInput.courseStatuses)
            ? { $in: filterInput.courseStatuses }
            : filterInput.courseStatuses;

        matchStage.push({ $match: { status: statusFilter } });
    }

    // 4. Date range filter
    if (filterInput.dateRange) {
        const { startDate, endDate } = filterInput.dateRange;
        if (!startDate && !endDate)
            throw Error("Both startDate and endDate cannot be missing when dateRange is provided.");

        const dateFilter = {};
        if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            dateFilter["$gte"] = start;
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            dateFilter["$lte"] = end;
        }

        matchStage.push({ $match: { createdAt: dateFilter } });
    }

    // 5. isRegistered
    if (filterInput?.isRegistered !== undefined) {
        matchStage.push({
            $match: { "userInfo.isRegistered": filterInput.isRegistered },
        });
    }

    // 6. Vessel types
    if (Array.isArray(filterInput.vesselTypes) && filterInput.vesselTypes.length > 0) {
        matchStage.push({
            $match: { "vesselInfo.typeOfVessel": { $in: filterInput.vesselTypes } },
        });
    }

    // 7. Vessel IDs
    if (Array.isArray(filterInput.vesselIds) && filterInput.vesselIds.length > 0) {
        matchStage.push({
            $match: { "vesselInfo._id": { $in: filterInput.vesselIds } },
        });
    }

    // 8. Designations
    if (Array.isArray(filterInput.designations) && filterInput.designations.length > 0) {
        matchStage.push({
            $match: { "designationInfo._id": { $in: filterInput.designations } },
        });
    }

    // 9. Vessel status
    if (Array.isArray(filterInput.vesselStatus) && filterInput.vesselStatus.length > 0) {
        matchStage.push({
            $match: { "userInfo.vesselStatus": { $in: filterInput.vesselStatus } },
        });
    }

    // 10. Deleted users handling
    if (input?.filterInput?.includeDeletedUsers) {
        deletedUsersStage = [
            {
                $lookup: {
                    from: "deletedusers",
                    localField: "user",
                    foreignField: "_id",
                    as: "deletedUserInfo",
                },
            },
            {
                $unwind: {
                    path: "$deletedUserInfo",
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $addFields: {
                    userInfo: {
                        $mergeObjects: ["$userInfo", "$deletedUserInfo"],
                    },
                },
            },
        ];
    } else {
        deletedUsersStage = [
            {
                $match: {
                    $and: [
                        { "userInfo.isDeleted": { $ne: true } },
                        { "employeeInfo.isDeleted": { $ne: true } },
                    ],
                },
            },
        ];
    }

    // 11. Sorting
    const fieldMapping = {
        COURSE_NAME: { $arrayElemAt: ["$courseName", 0] },
        COURSE_STATUS: "$status",
        LAST_SEEN: "updatedAt",
    };
    const sortOrder = input?.sortInput?.sortOrder ?? 1;
    const field = input?.sortInput?.field ?? "COURSE_NAME";
    const fieldPath = fieldMapping[field];

    if (field === "COURSE_STATUS" || field === "COURSE_NAME") {
        sortingStage.push({
            $addFields: {
                [`lowercase${field}`]: { $toLower: fieldPath },
            },
        });
        sortingStage.push({
            $sort: { [`lowercase${field}`]: sortOrder },
        });
    } else if (fieldPath) {
        sortingStage.push({
            $sort: { [fieldPath]: sortOrder },
        });
    } else {
        sortingStage.push({
            $addFields: {
                lowercaseCourseName: {
                    $toLower: { $arrayElemAt: ["$courseName", 0] },
                },
            },
        });
        sortingStage.push({ $sort: { lowercaseCourseName: 1 } });
    }

    // 12. Pagination
    const skip = input?.pageInput?.skip ?? 0;
    const limit = input?.pageInput?.limit ?? 200;
    if (limit > 0 && !input?.export) {
        pageLimit.push({ $skip: skip }, { $limit: limit });
    }

    // 13. Learner filtering
    const objectIds = learnerIds
        .filter(Boolean)
        .map(id => {
            try {
                return new ObjectId(id);
            } catch (e) {
                console.error(`Invalid ObjectId: ${id}`, e);
                return null;
            }
        })
        .filter(Boolean);

    if (objectIds.length > 0) {
        matchUsers.push({ $match: { user: { $in: objectIds } } });
        matchUsersFromTrainingProgresses.push({
            $match: {
                user: { $in: objectIds },
                status: "COMPLETED",
            },
        });
    } else {
        matchUsersFromTrainingProgresses.push({ $match: { status: "COMPLETED" } });
    }

    // Final return
    return {
        matchStage,
        deletedUsersStage,
        matchUsers,
        matchUsersFromTrainingProgresses,
        sortingStage,
        pageLimit,
    };
}


module.exports = {
    generateFileNameTimestamp,
    getAppliedFilters,
    convertUnderscoreSeperatedStringToCamelCase,
    formatDate,
    generateSortingStage,
    convertMinutesToHMS,
    customReportGenBackgroundProcess,
    buildLearnerAggregationPipelineFilterStages
}



/* 
const formatDate = (date) => {
    if (date) {
        const formattedDate = new Date(date);
        return formattedDate.toLocaleString('en-GB', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZone: 'UTC',
        });
    }
    return null;
};
*/