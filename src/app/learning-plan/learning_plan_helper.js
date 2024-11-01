const { LearningPlan } = require("./learning_plan_model");
const { CustomError } = require("../../util/error_helper");
const { ErrorName, AuthUser, Permission, SubRoleHelper, context } = require("../../util");
const { Group } = require("../../app/user/group-user/group_model");
const typeOfConditionalCustomFieldEnum = require("./enumFields/typeOfConditionalCustomField.json");
const { User } = require("../user/user_model");
const { Vessel } = require("../vessle/vessel_model");
const { VesselType } = require("../vessle/vessel-type/vessel_type_model");
const { Designation } = require("../designations/designation_model");
const approval_status = require("../trainings/approval_status.json")
const { Training } = require("../trainings/training_model");
const errorMessages = require("./error_helper/error_message");
const audienceSelection = require("./enumFields/audienceSelectionEnum.json")
const targetAudienceEnum = require("./enumFields/targetAudienceEnum.json");
const conditionTypeEnum = require("./enumFields/conditionTypeEnum.json");
const e = require("express");
const { Employee } = require("../user/employee/employee_model");
const { ObjectId } = require("../../tools");
const mongoose = require("mongoose");
const validateConditionalCustomFields = async (conditionalCustomFields) => {
    const errors = [];

    for (const field of conditionalCustomFields) {
        const { type_of_Field, valueOfField, isOrIsNot } = field;
        if (type_of_Field === typeOfConditionalCustomFieldEnum.CURRENT_STATUS) {
            const validStatus = ["ASSIGNED", "ON_LEAVE", "OFFBOARD", "ONBOARD"];
            const invalidStatus = valueOfField.filter(status => !validStatus.includes(status));
            if (invalidStatus.length > 0) {
                errors.push(`Invalid status provided for type ${type_of_Field}.`);
            }
        }
        const validFieldCount = await getValidObjectIds(type_of_Field, valueOfField);
        if (validFieldCount.length !== valueOfField.length) {
            errors.push(`Invalid ObjectId(s) provided for type ${type_of_Field}.`);
        }
        if (isOrIsNot !== 'IS' && isOrIsNot !== 'IS_NOT') {
            errors.push(`Invalid isOrIsNot value for type ${type_of_Field}.`);
        }

    }

    return errors;
};

const getValidObjectIds = async (type_of_Field, valueOfField) => {
    switch (type_of_Field) {
        case typeOfConditionalCustomFieldEnum.DESIGNATION:
            return await Designation.find({ _id: { $in: valueOfField }, isDeleted: false });

        case typeOfConditionalCustomFieldEnum.GROUP:
            return await Group.find({ _id: { $in: valueOfField }, isDeleted: false });

        case typeOfConditionalCustomFieldEnum.EMAIL:
            return await User.find({ _id: { $in: valueOfField }, isDeleted: false });

        case typeOfConditionalCustomFieldEnum.VESSEL:
            return await Vessel.find({ _id: { $in: valueOfField }, isDeleted: false, isActive: true });

        case typeOfConditionalCustomFieldEnum.VESSEL_TYPE:
            return await VesselType.find({ _id: { $in: valueOfField }, isDeleted: false, isActive: true });

        default:
            return [];
    }
};
const validatePickingCourses = async (selectCourses) => {
    const validCourses = await Training.find({
        _id: { $in: selectCourses },
        approvalStatus: approval_status.APPROVED,
        isDeleted: false,
        isActive: true
    });
    return validCourses.length === selectCourses.length;
};

const createLearningPlanHelper = async (input) => {
    let errorList = [];

    try {
        if (!input.title) { errorList.push(errorMessages.TITLE_REQUIRED); }
        if (!input.targetAudience) { errorList.push(errorMessages.TARGET_AUDIENCE_REQUIRED); }
        if (!input.audienceSelection) { errorList.push(errorMessages.AUDIENCE_SELECTION_REQUIRED); }
        if (!input.selectCourses) { errorList.push(errorMessages.SELECT_COURSES_REQUIRED); }
        if (input.audienceSelection === audienceSelection.ALL_EMPLOYEES && input.conditionType) {
            errorList.push(errorMessages.INVALID_CONDITION_FOR_ALL_EMPLOYEES);
        }
        if (input.audienceSelection === audienceSelection.AUTOMATIC && !input.conditionType) {
            errorList.push(errorMessages.CONDITION_TYPE_REQUIRED_FOR_AUTOMATIC);
        }
        if (input.targetAudience === targetAudienceEnum.EVERYONE_IN_ORGANIZATION && input.groupIDs && input.groupIDs.length > 0) {
            errorList.push(errorMessages.INVALID_GROUP_IDS_FOR_TARGET_AUDIENCE);
        }
        if (input.audienceSelection === audienceSelection.ALL_EMPLOYEES && input.conditionalCustomFields && input.conditionalCustomFields.length > 0) {
            errorList.push(errorMessages.CONDITIONAL_FIELDS_NOT_ALLOWED_FOR_ALL_EMPLOYEES);
        }
        if ((input.audienceSelection === audienceSelection.AUTOMATIC) &&
            (!input.conditionType || !input.conditionalCustomFields || input.conditionalCustomFields.length === 0)) {
            errorList.push(errorMessages.AUTOMATIC_SELECTION_FIELDS_REQUIRED);
        }
        if (input.audienceSelection === audienceSelection.MANUAL) {
            if (input.conditionalCustomFields || input.conditionType) {
                errorList.push(errorMessages.INVALID_CONDITIONAL_FIELDS_FOR_MANUAL);
            }
            if (!Array.isArray(input.userObjectIds) || input.userObjectIds.length === 0) {
                errorList.push(errorMessages.USER_OBJECT_IDS_REQUIRED_FOR_MANUAL);
            } else {
                const validUserIds = await User.find({
                    _id: { $in: input.userObjectIds },
                    isDeleted: false
                });
                if (validUserIds.length !== input.userObjectIds.length) {
                    errorList.push(errorMessages.INVALID_USER_OBJECT_IDS);
                }
            }
        }
        if (input.conditionalCustomFields && input.conditionalCustomFields.length > 0) {
            const conditionalFieldErrors = await validateConditionalCustomFields(input.conditionalCustomFields);
            errorList = errorList.concat(conditionalFieldErrors);
        }
        if (input.selectCourses && input.selectCourses.length > 0) {
            const isValidCourses = await validatePickingCourses(input.selectCourses);
            if (!isValidCourses) {
                errorList.push(errorMessages.INVALID_COURSE_SELECTION);
            }
        }
        if (errorList.length > 0) {
            return { sucess: false, errors: errorList };
        }
        const existingLearningPlan = await LearningPlan.findOne({
            title: input.title,
        });
        if (existingLearningPlan) {
            errorList.push(errorMessages.LEARNING_PLAN_EXISTS);
            return { sucess: false, errors: errorList };
        }
        const targetAudience = input.targetAudience || targetAudienceEnum.EVERYONE_IN_ORGANIZATION;
        let groupIDs = input.groupIDs || [];
        if (targetAudience === targetAudienceEnum.GROUP_BASED) {
            if (!Array.isArray(groupIDs) || groupIDs.length === 0) {
                errorList.push(errorMessages.GROUP_IDS_REQUIRED_FOR_GROUP_BASED);
            }
            const validGroupCount = await Group.find({
                _id: { $in: groupIDs },
                isDeleted: false
            });
            if (validGroupCount.length !== groupIDs.length) {
                errorList.push(errorMessages.INVALID_GROUP_IDS);
            }
        }
        if (errorList.length > 0) {
            return { success: false, errors: errorList };
        }
        const newLearningPlan = new LearningPlan({
            title: input.title,
            targetAudience,
            groupIDs,
            status: input.status,
            audienceSelection: input.audienceSelection,
            conditionType: input.conditionType,
            conditionalCustomFields: input.conditionalCustomFields,
            userObjectIds: input.userObjectIds,
            selectCourses: input.selectCourses
        });
        await newLearningPlan.save();
        return { success: true, learningPlan: newLearningPlan };
    } catch (error) {
        errorList.push(error.message);
        return { success: false, errors: errorList };
    }
};

const updateLearningPlanHelper = async (existingLearningPlan, input) => {
    let errorList = [];
    if (input.title && input.title !== existingLearningPlan.title) {
        const titleExists = await LearningPlan.findOne({ title: input.title });
        if (titleExists) {
            errorList.push("Learning Plan title already exists.");
        }
    }
    if (input.targetAudience && input.targetAudience !== existingLearningPlan.targetAudience) {
        if (input.targetAudience === targetAudienceEnum.EVERYONE_IN_ORGANIZATION && input.groupIDs?.length > 0) {
            errorList.push("Group IDs cannot be set for targetAudience EVERYONE_IN_ORGANIZATION.");
        }
    }
    if (input.audienceSelection && input.audienceSelection !== existingLearningPlan.audienceSelection) {
        if (input.audienceSelection === audienceSelection.ALL_EMPLOYEES && input.conditionType) {
            errorList.push("Condition Type should not be provided when audience selection is ALL_EMPLOYEES.");
        }
        if (input.audienceSelection === audienceSelection.MANUAL && !input.userObjectIds?.length) {
            errorList.push("User Object IDs are required for MANUAL audience selection.");
        }
    }
    if (errorList.length > 0) {
        return { success: false, errors: errorList };
    }
    return { success: true };
};

const getUsersAndCount = async (input) => {
    try {
        let filter = {};
        filter.isDeleted = false;
        if (input.targetAudience === targetAudienceEnum.EVERYONE_IN_ORGANIZATION) {
            if (input.audienceSelection === audienceSelection.AUTOMATIC) {
                const queryOperator = input.conditionType === conditionTypeEnum.MATCH_ALL_CONDITION ? '$and' : '$or';
                if (input.conditionalCustomFields && input.conditionalCustomFields.length > 0) {
                    let conditions = await Promise.all(input.conditionalCustomFields.map(async condition => {
                        const fieldMapping = {
                            DESIGNATION: '_id',
                            GROUP: 'employee.group',
                            VESSEL: 'currentVessel',
                            VESSEL_TYPE: 'currentVessel.typeOfVessel',
                            EMAIL: 'email',
                            CURRENT_STATUS: 'vesselStatus'
                        };
                        const field = fieldMapping[condition.type_of_Field];

                        let valueData;
                        if (condition.type_of_Field === "VESSEL") {
                            const value = condition.valueOfField.map(id => ObjectId(id));
                            let finalQueryValue;
                            if (condition.isOrIsNot === 'IS') {
                                finalQueryValue = {
                                    'currentVessel._id': { $in: value },
                                    'currentVessel.isDeleted': false,
                                };
                            } else {
                                finalQueryValue = {
                                    'currentVessel._id': { $nin: value },
                                    'currentVessel.isDeleted': false,
                                };
                            }
                            valueData = finalQueryValue;
                        } else if (condition.type_of_Field === "VESSEL_TYPE") {
                            const typeOfVesselIds = condition.valueOfField.map(id => ObjectId(id));
                            const vessels = await Vessel.find(
                                { typeOfVessel: { $in: typeOfVesselIds }, isDeleted: false },
                                { _id: 1 }
                            ).exec();

                            const vesselIds = vessels.map(vessel => vessel._id);

                            if (vesselIds.length === 0) {
                                return {
                                    userIds: [],
                                    count: 0
                                };
                            }
                            let finalQueryValue;
                            if (condition.isOrIsNot === 'IS') {
                                finalQueryValue = {
                                    'currentVessel._id': { $in: vesselIds },
                                    'currentVessel.isDeleted': false,
                                };
                            } else {
                                finalQueryValue = {
                                    'currentVessel_id': { $nin: vesselIds },
                                    'currentVessel.isDeleted': false,
                                };
                            }
                            valueData = finalQueryValue;
                        } else if (condition.type_of_Field === "DESIGNATION") {
                            const designationIds = condition.valueOfField.map(id => ObjectId(id));
                            const employees = await Employee.find(
                                { empDesignation: { $in: designationIds }, isDeleted: false },
                                { user: 1 }
                            ).exec();
                            const value = employees.map(user => user.user);
                            valueData = condition.isOrIsNot === 'IS' ? { [field]: { $in: value } } : { [field]: { $nin: value } };

                        } else {
                            const value = condition.valueOfField.map(status => status);
                            valueData = condition.isOrIsNot === 'IS' ? { [field]: { $in: value } } : { [field]: { $nin: value } };
                        }
                        return valueData;
                    }));
                    filter[queryOperator] = conditions;
                }
            }
        }

        const userData = await User.aggregate([
            {
                $lookup: {
                    from: "vessels",
                    localField: "currentVessel",
                    foreignField: "_id",
                    as: "currentVessel"
                }
            },
            {
                $unwind: {
                    path: "$currentVessel",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $match: {
                    ...filter,
                }
            },
            {
                $group: {
                    _id: null,
                    userIds: { $push: "$_id" },
                    count: { $sum: 1 }
                }
            }
        ]);

        return {
            userIds: userData[0].userIds,
            count: userData.length > 0 ? userData[0].count : 0
        };
    } catch (error) {
        return { userIds: [], count: 0 };
    }

};

module.exports = { createLearningPlanHelper, getUsersAndCount, updateLearningPlanHelper };
