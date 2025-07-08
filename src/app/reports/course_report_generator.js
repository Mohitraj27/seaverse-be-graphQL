
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
const { ObjectId } = require("../../tools");

const performCourseReportGeneration = async ({ input, subscriberId, userId, userInfo }) => {
    if (!subscriberId) throw new Error("Forbidden: subscriberId is missing."); // Use standard Error here

    console.log("Child process------------>", input);

    try {
       input = input || {};
       
               const matchStage = [];
               const pageLimit = [];
               const matchIdsToBeExported = [];
               /* Ticket No SEAV-117
               if (input?.export) {
                   await NotificationHelper.createNotificationhelper({
                       subscriber: subscriberId,
                       titleValue: `Selected Course Report Export In Progress`,
                       messageValue: `The single course report has been started generating and exporting by ${userInfo?.firstName} ${userInfo?.lastName}.`,
                       notificationType: NotificationType.EXPORT_IN_PROGRESS,
                       notifyAdmin: true,
                       status: 'SENT',
                       createdBy: userInfo,
                       icon: notificationiconEnum.PROGRESS
                   });
               }
               */
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
                               'vesselTypeInfo._id': { $in: filterInput.vesselType.map(id => ObjectId(id)) },
                           },
                       });
                   }
       
                   if (filterInput.vesselName && Array.isArray(filterInput.vesselName) && filterInput.vesselName.length > 0) {
                       matchStage.push({
                           $match: {
                               'usersVesselInfo._id': { $in: filterInput.vesselName.map(id => ObjectId(id)) },
                           },
                       });
                   }
                   if (filterInput.designation && Array.isArray(filterInput.designation) && filterInput.designation.length > 0) {
                       matchStage.push({
                           $match: {
                               'designationInfo._id': { $in: filterInput.designation.map(id => ObjectId(id)) },
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
                               user: { $in: filterInput.learnerIds.map(id => ObjectId(id)) },
                           },
                       });
                   }
                   if (filterInput.idsToExport && Array.isArray(filterInput.idsToExport) && filterInput.idsToExport.length > 0) {
                       matchIdsToBeExported.push({
                           $match: {
                               _id: { $in: filterInput?.idsToExport.map(id => ObjectId(id)) },
                           },
                       });
                   }
       
               }

               console.log("matchStage---------->", matchStage);
       
               const skip = input?.pageInput?.skip ? input.pageInput.skip : 0;
               const limit = input?.pageInput?.limit ? input.pageInput.limit : 20;
       
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
                                               isDeleted: false,
                                               isSignupAdminAprroved: { $ne: false }
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
                                   _id: 1,
                                   firstName: "$userInfo.firstName",
                                   lowercaseFirstName: {
                                       $toLower: "$userInfo.firstName"
                                   },
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
                           {
                               $sort:
                               {
                                   lowercaseFirstName: 1
                               }
                           },
                           ...matchIdsToBeExported,
                           ...pageLimit
                       ]
       
                   );

                   console.log("data----------->", data);   
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

                       console.log("coursesData----------->", coursesData);
       
                       let s3PresignedUrl = "";
       
                       if (input?.export) {
                           if (!data) throw CustomError(ErrorName.NOT_FOUND, "No there is no data present");
                           const parsedData = data.map(item => {
       
                               const learnerName = `${item.firstName ? decrypt(item?.firstName, true) : ''} ${item.lastName ? decrypt(item?.lastName,true) : ''}`;
                               const enrollmentDate = item?.createdAt ? ReportsHelper.formatDate(item.createdAt) : "Not Applicable";
                               const completionDate = item?.endDate ? ReportsHelper.formatDate(item.endDate) : "Not Applicable";
                               const startDate = item?.startDate && item?.startDate !== 'startDate'
                                   ? ReportsHelper.formatDate(item?.startDate)
                                   : "Not Applicable";
                               const unenrollmentDate = item?.unenrollmentDate ? ReportsHelper.formatDate(item?.unenrollmentDate) : "Not Applicable";
                               const timeSpent = item.totalTimeSpent ? item.totalTimeSpent + " mins" : '0 mins';
                               const quizScore = (typeof item.quizPercentage === 'string')
                                   ? `${parseInt(item.quizPercentage, 10)}%`
                                   : (typeof item.quizPercentage === 'number' && !isNaN(item.quizPercentage))
                                       ? `${Math.round(item.quizPercentage)}%`
                                       : 'Not Applicable';
                               const courseStatus = item.status || 'NOT_STARTED';
       
                               const currentVessel = item.vesselName || '';
                               const vesselType = item.vesselType || '';
                               const courseName = item?.trainingTitle[0].value;
                               const adminMarkedAsCompleted = item.adminMarkedAsCompleted ? 'Yes' : 'No';
                               const parsedItem = {
                                   LearnerName: learnerName,
                                   Email: item.email ? decrypt(item.email) : '',
                                   'User Id': item.empId ? decrypt(item.empId) : '',
                                   Designation: item.designation || '',
                                   CurrentVessel: currentVessel,
                                   VesselType: vesselType,
                                   CourseName: courseName,
                                   CourseStatus: courseStatus,
                                   'Admin Marked As Completed': adminMarkedAsCompleted,
                                   TimeSpent: timeSpent,
                                   QuizScore: quizScore,
                                   'Course Enrollment Date (UTC)': enrollmentDate,
                                   'Course Started Date (UTC)': startDate,
                                   'Course Unenrollment Date (UTC)': unenrollmentDate,
                                   'Course Completion Date (UTC)': completionDate,
                               };
       
                               return parsedItem;
                           });

                           console.log("parsedData----------->", parsedData);
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
                           console.log("excelFilePath----------->", excelFilePath);
                           if (excelFilePath) {
                               s3PresignedUrl = await aws_helper.fetchFile(excelFilePath);
                               console.log("s3PresignedUrl----------->", s3PresignedUrl);
                               const notificationData = {
                                   subscriber: subscriberId,
                                   titleValue: `Enrollment Report Exported Successfully`,
                                   messageValue: `The Courses Enrollment report has been successfully generated and exported by ${decrypt(userInfo?.firstName,true)} ${decrypt(userInfo?.lastName,true) ?? ""}.`,
                                   notificationType: NotificationType.COURSE_ENROLLMENT_REPORT_EXPORT_SUCCESS,
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
                                   createdBy: userInfo._id,
                                   icon: notificationiconEnum.SUCCESS
                               }

                               console.log("notificationData----------->", notificationData);

                                 process.send({
                                     type: "REPORT_EXPORT_SUCCESS",
                                     payload: notificationData,
                                 });
                           }
                           return {
                               filePath: '',
                               fileName: '',
                               coursesData: [],
                           };
                       }
       
                       return {
                           couseData: [],
                       };
                   } else if (data.length === 0 && input?.export) {
                       const workbook = XLSX.utils.book_new();
                       const headers = [
                           "LearnerName",
                           "Email",
                           "EmployeeId",
                           "Designation",
                           "CurrentVessel",
                           "VesselType",
                           "CourseName",
                           "CourseStatus",
                           "Admin Marked As Completed",
                           "TimeSpent",
                           "QuizScore",
                           "Course Enrollment Date (UTC)",
                           "Course Started Date (UTC)",
                           "Course Unenrollment Date (UTC)",
                           "Course Completion Date (UTC)"
                       ]
       
                       const worksheet = XLSX.utils.aoa_to_sheet([
                           headers
                       ]);
       
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
                           const notificationData = {
                               subscriber: subscriberId,
                               titleValue: `Enrollment Report Exported Successfully`,
                               messageValue: `The Courses Enrollment report has been successfully generated and exported by ${decrypt(userInfo?.firstName,true)} ${decrypt(userInfo?.lastName,true) ?? ""}.`,
                               notificationType: NotificationType.COURSE_ENROLLMENT_REPORT_EXPORT_SUCCESS,
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
                               payload: notificationData
                           });
                       }
                       return {
                           filePath: "",
                           fileName: "",
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
                                   'adminMarkedAsCompleted': {
                                       '$first': '$adminMarkedAsCompleted'
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
                                                   'order': "$quizEvaluations.displayOrder",
                                                   'isQuizPassed': '$quizEvaluations.isPassed',
                                                   'contentType': '$quizEvaluations.contentType',
                                                   'updatedAt': '$quizEvaluations.updatedAt',
                                                   'quizStatus': "$quizEvaluations.contentStatus",
                                               },
                                               'else': {
                                                   'moduleName': '$quizEvaluations.moduleName',
                                                   'percentage': 'NOT APPLICABLE',
                                                   'order': "$quizEvaluations.displayOrder",
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
                                   '_id': '$_id.userId',
                                   'courseId': '$_id.trainingId',
                                   'user': '$_id.userId',
       
                                   'firstName': 1,
                                   lowercaseFirstName: {
                                       $toLower: "$firstName"
                                   },
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
                           { $sort: { lowercaseFirstName: 1 } },
                           ...matchIdsToBeExported,
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
                                   const email = course?.email ? decrypt(course?.email) : '';
                                   const designation = course?.designation || '';
                                   const firstName = course?.firstName? decrypt(course?.firstName,true) : '';
                                   const lastName = course?.lastName ? decrypt(course?.lastName,true) : '';
                                   const status = course?.status || 'Not Applicable';
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
                                       const quizScore = hasQuiz ? (module.percentage || 'Not Applicable') : 'Not Applicable';
                                       flattenedData.push({
                                           Name: `${firstName} ${lastName}`,
                                           Email: email,
                                           Designation: designation,
                                           'Course Name': courseName,
                                           'Lesson Name': moduleName,
                                           'Quiz Score': quizScore,
                                           'Course Status': status,
                                           'Admin Marked As Completed': adminMarkedAsCompleted,
                                           'Enrollment Date (UTC)': enrollmentDate,
                                           'Course Started Date (UTC)': startDate,
                                           'Course Completion Date (UTC)': completionDate,
                                           'Unenrollment Date (UTC)': unenrollmentDate,
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
                                   messageValue: `The Courses Quiz Enrollment report has been successfully generated and exported by ${decrypt(userInfo?.firstName,true)} ${decrypt(userInfo?.lastName,true) ?? ""}.`,
                                   notificationType: NotificationType.COURSE_QUIZ_REPORT_EXPORT_SUCCESS,
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
                               coursesData,
                           };
                       }
       
                       return {
                           coursesData,
                       };
                   } else if (data.length === 0 && input?.export) {
       
                       const workbook = XLSX.utils.book_new();
                       const worksheet = XLSX.utils.aoa_to_sheet([
                           [
                               "Name",
                               "Email",
                               "Designation",
                               "Course Name",
                               "Lesson Name",
                               "Quiz Score",
                               "Course Status",
                               "Admin Marked As Completed",
                               "Enrollment Date (UTC)",
                               "Course Started Date (UTC)",
                               "Course Completion Date (UTC)",
                               "Unenrollment Date (UTC)"
                           ]
                       ]);
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
                           const notificationData = {
                               subscriber: subscriberId,
                               titleValue: `Quiz Report Exported Successfully`,
                               messageValue: `The Courses Quiz Enrollment report has been successfully generated and exported by ${decrypt(userInfo?.firstName,true)} ${decrypt(userInfo?.lastName,true) ?? ""}.`,
                               notificationType: NotificationType.COURSE_QUIZ_REPORT_EXPORT_SUCCESS,
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
                           filePath: s3PresignedUrl,
                           fileName: path.basename(excelFilePath),
                           coursesData: [],
                       };
                   }
               }
               return {
                   coursesData: []
               }

    } catch (error) {
        console.error("Error in child process:", error);

        const notificationData = {
            subscriber: subscriberId,
            titleValue: `Single Course Report Export Failed`,
            messageValue: `An error occurred while generating the individual course report.`,
            notificationType: NotificationType.REPORT_EXPORT_FAILED,
            notifyAllAdmin: false,
            isNotificatonForAdmin: true,
            notifiers: [userInfo._id],
            status: "FAILED",
            icon: notificationiconEnum.ERROR,
            createdBy: userInfo,
        };

        process.send({
            type: "REPORT_EXPORT_FAILED",
            payload: notificationData,
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
            await performCourseReportGeneration(payload);


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