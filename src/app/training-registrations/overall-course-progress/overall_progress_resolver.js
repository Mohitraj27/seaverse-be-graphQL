const { AuthUser, CustomError, ErrorName, UploadHelper } = require("../../../util");
const { OverallTrainingProgress } = require("./overall_progress_model");
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const aws_helper = require("../../../util/aws_helper");

const getLearnerCoursesReport = async ({ input }, context) => {
    const { subscriberId } = AuthUser(context);
    if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
  
    try {
      const matchStage = [];
  
      if (input && Object.keys(input).length > 0) {
        const filterInput = input.filterInput || {};
        if (filterInput.name) {
          matchStage.push({
            $match: {
              $or: [
                { firstName: { $regex: filterInput.name, $options: 'i' } },
                { lastName: { $regex: filterInput.name, $options: 'i' } },
              ],
            },
          });
        }
  
        if (filterInput.courseStatus !== undefined) {
          matchStage.push({ $match: { status: filterInput.courseStatus } });
        }
  
        if (filterInput.dateRange !== undefined) {
          // matchStage.push({ $match: { 'userInfo.isDeleted': filterInput.isDeleted  } });
        }
  
        const skip = (input.pageInput?.pageSize || 0) * ((input.pageInput?.pageNumber || 1) - 1);
        const limit = input.pageInput?.pageSize || 0;
  
        if (limit > 0) {
          matchStage.push({ $skip: skip }, { $limit: limit });
        }
      }
  
      const learnerData = await OverallTrainingProgress.aggregate([
        {
          $lookup: {
            from: 'trainings',
            localField: 'training',
            foreignField: '_id',
            as: 'trainingInfo',
          },
        },
        { $match: { user: input.learnerId } },
        {
          $lookup: {
            from: 'users',
            localField: 'user',  
            foreignField: '_id', 
            as: 'userInfo',
          },
        },
        {
          $project: {
            courseName: { $arrayElemAt: ["$trainingInfo.title.value", 0] },
            duration: "$trainingInfo.durationHours",
            createdAt: 1,
            completionDate: 1,
            status: 1,
            updatedAt: 1,
            firstName: { $arrayElemAt: ["$userInfo.firstName", 0] }, 
            lastName: { $arrayElemAt: ["$userInfo.lastName", 0] }, 
          },
        },
      ]);
  
      const learnerName = learnerData.length > 0 ? `${learnerData[0].firstName} ${learnerData[0].lastName}` : 'Unknown Learner';
  
      const data = learnerData.map(item => ({
        courseName: item.courseName[0],
        status: item.status,
        Enrollment_Date: item.createdAt,
        Completion_Date: item.completionDate ? item.completionDate : "Not Applicable",
        Duration: item.duration[0] ? item.duration[0] : "Not Present" ,
        LastSeen: item.updatedAt ? new Date(item.updatedAt).toLocaleString() : 'N/A',
      }));
  
      let s3PresignedUrl = "";
  
      if (input?.export){
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
  


module.exports.queries = {
    getLearnerCoursesReport,
}
module.exports.mutations = {
}