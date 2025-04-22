
const { SubRole } = require("../sub-roles/sub_role_model");
const { Vessel } = require("../../vessle/vessel_model");
const { UserVessel } = require("../user-vessel-bridge/userVessel_model");
const { User } = require("../user_model");
const {   Moment } = require("../../../tools");
const { Employee} = require('./employee_model');
const mongoose = require('mongoose');
const { VesselType} = require('../../vessle/vessel-type/vessel_type_model');
const exportCSVFieldName = require('./exportCSVFieldName.json');
const processFilters = async (filterInput, initialMatchStage) => {

  if (!filterInput || !filterInput.flag || !filterInput.fields || filterInput.fields.length === 0) {
    return initialMatchStage
  }

  for (const fieldObj of filterInput?.fields) {
    if (!fieldObj?.field_name || !fieldObj?.field_values || fieldObj?.field_values?.length === 0) {
      continue;
    }
    if (fieldObj.field_name.includes(exportCSVFieldName.USER_STATUS) && fieldObj.field_values?.length > 0) {
      initialMatchStage.$match.isRegistered = fieldObj.field_values[0];
    }

    if (fieldObj.field_name.includes(exportCSVFieldName.USER_ROLES) && fieldObj.field_values?.length > 0) {
      await processUserRolesFilter(fieldObj.field_values, initialMatchStage)
    }

    if (fieldObj.field_name.includes(exportCSVFieldName.VESSEL_STATUS) && fieldObj.field_values?.length > 0) {
     await  processVesselStatusFilter(fieldObj.field_values, initialMatchStage)
    }

    if (fieldObj.field_name.includes(exportCSVFieldName.VESSEL_NAME) && fieldObj.field_values?.length > 0) {
      await processVesselNameFilter(fieldObj.field_values, initialMatchStage)
    }
    if (fieldObj.field_name.includes(exportCSVFieldName.SHOW_INVITED) && fieldObj.field_values?.length > 0) {
      await processShowInvitedFilter(fieldObj.field_values[0], initialMatchStage)
    }
    if (fieldObj.field_name.includes(exportCSVFieldName.ACTIVITY_TIMELINE) && fieldObj.field_values?.length > 0) {
       await processActivityTimelineFilter(fieldObj.field_values, initialMatchStage)
    }
    if (fieldObj.field_name.includes(exportCSVFieldName.DESIGNATION) && fieldObj.field_values?.length > 0) {
        await processDesignationFilter(fieldObj.field_values, initialMatchStage)
    }
    if (fieldObj.field_name.includes(exportCSVFieldName.VESSEL_TYPE) && fieldObj.field_values?.length > 0) {
        await processVesselTypeFilter(fieldObj.field_values, initialMatchStage)
    }

  }

  return initialMatchStage;
}

const processUserRolesFilter = async (roleValues, initialMatchStage) => {
  const adminCheck = roleValues.includes("ADMIN")
  const learnerCheck = roleValues.includes("LEARNER")
  if (adminCheck && learnerCheck) {
    const adminSubrole = await SubRole.findOne({ name: "ADMIN" }).select("_id")

    if (adminSubrole) {
      initialMatchStage.$match.$or = [
        { role: "LEARNER" },
        { subRoles: adminSubrole._id }, 
      ]
    } else {
      initialMatchStage.$match.role = "LEARNER"
    }
  }
  else if (adminCheck) {
    const adminSubrole = await SubRole.findOne({ name: "ADMIN" }).select("_id")
    if (adminSubrole) {
      initialMatchStage.$match.subRoles = adminSubrole._id
    } 
  }
  else if (learnerCheck) {
    initialMatchStage.$match.role = "LEARNER";
  }
}

const processVesselStatusFilter = async (vesselStatusValues, initialMatchStage) => {
  initialMatchStage.$match.vesselStatus = { $in: vesselStatusValues }
}


const processVesselNameFilter = async (vesselNames, initialMatchStage) => {

  const vessels = await Vessel.find({
    name: { $in: vesselNames },
    isDeleted: false,
  }).select("_id")

  if (vessels && vessels?.length > 0) {
    const vesselIds = vessels.map((v) => v._id)
    initialMatchStage.$match.currentVessel = { $in: vesselIds }
  } else {
    initialMatchStage.$match.currentVessel = { $in: [] }
  }
}

const processShowInvitedFilter = async (showInvited, initialMatchStage) => {
    initialMatchStage.$match.isResetPasswordDialog = showInvited
}

const processActivityTimelineFilter = async (timelineValues, initialMatchStage) => {
  
    const dateRangeConditions = []
  
    for (const timelineValue of timelineValues) {
      let startDate, endDate
      const today = Moment()
  
      switch (timelineValue) {
        case "TODAY":
          startDate = today.clone().startOf("day").toDate()
          endDate = today.clone().endOf("day").toDate()
          break
        case "YESTERDAY":
          startDate = today.clone().subtract(1, "day").startOf("day").toDate()
          endDate = today.clone().subtract(1, "day").endOf("day").toDate()
          break
        case "LAST_7_DAYS":
          startDate = today.clone().subtract(7, "days").startOf("day").toDate()
          endDate = today.clone().endOf("day").toDate()
          break
        case "LAST_30_DAYS":
          startDate = today.clone().subtract(30, "days").startOf("day").toDate()
          endDate = today.clone().endOf("day").toDate()
          break
        case "LAST_3_MONTHS":
          startDate = today.clone().subtract(3, "months").startOf("day").toDate()
          endDate = today.clone().endOf("day").toDate()
          break
        case "LAST_6_MONTHS":
          startDate = today.clone().subtract(6, "months").startOf("day").toDate()
          endDate = today.clone().endOf("day").toDate()
          break
        case "LAST_YEAR":
          startDate = today.clone().subtract(1, "year").startOf("day").toDate()
          endDate = today.clone().endOf("day").toDate()
          break
        default:
          continue
      }
  
      dateRangeConditions.push({
        lastLoginAt: {
          $gte: startDate,
          $lte: endDate,
        },
      })
  
    }
  
    if (dateRangeConditions?.length > 0) {
      if (dateRangeConditions?.length > 1) {
        initialMatchStage.$match.$or = dateRangeConditions
      } else {
        initialMatchStage.$match.lastLoginAt = dateRangeConditions[0].lastLoginAt
      }
    }
}
const processDesignationFilter = async (designationValues, initialMatchStage ) => {
    const employees = await Employee.find({
      designation: { $in: designationValues },
      isDeleted: false,
    }).select("user")
  
    if (employees && employees.length > 0) {
      const userIds = employees.map((e) => e.user)
  
      if (initialMatchStage.$match._id && initialMatchStage.$match._id.$in) {
        const existingIds = initialMatchStage.$match._id.$in
        const intersectionIds = userIds.filter((id) =>
          existingIds.some((existingId) => existingId.toString() === id.toString()),
        )
        initialMatchStage.$match._id.$in = intersectionIds
      } else {
        initialMatchStage.$match._id = { $in: userIds }
      }
    } else {
      initialMatchStage.$match._id = { $in: [] }
    }
}
  
const processVesselTypeFilter = async (vesselTypeValues, initialMatchStage) => {
  
    try {
      const vesselTypeQuery = { isDeleted: false }
  
      const isObjectIds = vesselTypeValues.every((value) => {
        // Check if the value is a valid ObjectId string (24 hex characters)
        return /^[0-9a-fA-F]{24}$/.test(value)
      })
  
      if (isObjectIds) {
        const objectIdVesselTypeIds = vesselTypeValues.map((id) => mongoose.Types.ObjectId(id))
        vesselTypeQuery._id = { $in: objectIdVesselTypeIds }
      } else {
        vesselTypeQuery.name = { $in: vesselTypeValues }
      }
  
      const vesselTypes = await VesselType.find(vesselTypeQuery).select("_id")
  
      if (!vesselTypes || vesselTypes.length === 0) {
        initialMatchStage.$match._id = { $in: [] }
        return
      }
  
      const vesselTypeObjectIds = vesselTypes.map((vt) => vt._id)
  
      const vessels = await Vessel.find({
        typeOfVessel: { $in: vesselTypeObjectIds },
        isDeleted: false,
      }).select("_id")
  
      if (!vessels || vessels.length === 0) {
        initialMatchStage.$match._id = { $in: [] }
        return
      }
  
      const vesselObjectIds = vessels.map((v) => v._id)
  
      const userVessels = await UserVessel.find({
        vessel: { $in: vesselObjectIds },
        isActive: true,
      }).select("user")
  
      if (!userVessels || userVessels.length === 0) {
        initialMatchStage.$match._id = { $in: [] }
        return
      }
  
      const userIds = userVessels.map((uv) => uv.user)
      if (initialMatchStage.$match._id && initialMatchStage.$match._id.$in) {
        const existingIds = initialMatchStage.$match._id.$in
        const intersectionIds = userIds.filter((id) =>
          existingIds.some((existingId) => existingId.toString() === id.toString()),
        )
        initialMatchStage.$match._id.$in = intersectionIds
      } else {
        initialMatchStage.$match._id = { $in: userIds }
       }
  
      if (initialMatchStage.$match._id.$in.length === 0) {
        initialMatchStage.$match._id = { $in: [] }
      }
    } catch (error) {
        console.log(error);
      initialMatchStage.$match._id = { $in: [] }
    }
  }
  
module.exports = { processFilters };