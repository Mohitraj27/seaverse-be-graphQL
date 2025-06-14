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


/* const convertMinutesToHMS = (minutes) => {
    if (minutes == null || isNaN(minutes)) {
        console.log(`type of minutes is ${typeof(minutes)}`);
        return '00:00:00'; 
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = Math.floor(minutes % 60); 
    const remainingSeconds = Math.round((minutes % 1) * 60); 

    return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}; */

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

const customReportGenBackgroundProcess = async (matchStage) => {

    let data;
    let dataToExport = [];
    if (input?.reportType === "ENROLLMENT") {

        const customEnrollmentReportPipeline = customEnrollmentReportQuery(matchStage);
        data = await OverallTrainingProgress.aggregate(customEnrollmentReportPipeline);

        data.forEach(item => {
            const learnerName = `${item.firstName || ''} ${item.lastName || ''}`.trim() || "-";
            const enrollmentDate = item?.createdAt ? ReportsHelper.formatDate(item.createdAt) : "Not Applicable";
            const completionDate = item?.endDate ? ReportsHelper.formatDate(item.endDate) : "Not Applicable";
            const startDate = item?.startDate && item.startDate !== 'startDate'
                ? ReportsHelper.formatDate(item.startDate)
                : "Not Applicable";
            const country = item?.country || "Not Applicable";
            const vesselType = item?.vesselType || "Not Applicable";
            const currentVessel = item?.currentVessel || "Not Applicable";
            const unenrollmentDate = item?.unenrollmentDate ? ReportsHelper.formatDate(item.unenrollmentDate) : "Not Applicable";
            const quizScore = item.quizPercentage ? parseInt(item.quizPercentage) + "%" : "Not Applicable";
            const userState = item.isRegistered ? "Registered" : "Unregistered";
            const timeSpent = item.totalTimeSpent ? ReportsHelper.convertMinutesToHMS(item?.totalTimeSpent) : "00:00:00";
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
                        const contentType = content?.contentType || 'Not Applicable';
                        const quizScore = content?.percentage || 'Not Applicable';
                        const timeSpendInContent = content?.timeSpendInContent ? ReportsHelper.convertMinutesToHMS(content?.timeSpendInContent) : "00:00:00";
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
        fileName: `custom ${input?.reportType.toLowerCase() ?? ""} report - ${await ReportsHelper.generateFileNameTimestamp()}.xlsx`,
        uploadType: UploadHelper.uploadType.exportCustomQuizReport,
    });
    if (excelFilePath) {
        s3PresignedUrl = await aws_helper.fetchFile(excelFilePath);
        const notificationMessage = input?.reportType == 'ENROLLMENT' ? `Custom report is ready to download` : `Quiz report is ready to download`
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

}


module.exports = {
    generateFileNameTimestamp,
    getAppliedFilters,
    convertUnderscoreSeperatedStringToCamelCase,
    formatDate,
    generateSortingStage,
    convertMinutesToHMS,
    customReportGenBackgroundProcess
}