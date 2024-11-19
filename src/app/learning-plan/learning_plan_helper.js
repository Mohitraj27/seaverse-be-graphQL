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
const { getCustomGroupUsers, getAutoSyncUsers, createTrainingRegistration } = require("../training-registrations/training_registration_helper");
const roles = require("../../util/role.json");
const vesselStatusEnum = require("../../util/vessel_status.json");
const { OverallTrainingProgress } = require("../training-registrations/overall-course-progress/overall_progress_model");
const validateConditionalCustomFields = async (conditionalCustomFields) => {
    const errors = [];

    for (const field of conditionalCustomFields) {
        const { type_of_Field, valueOfField, isOrIsNot, groupIDs } = field;
        if (type_of_Field === typeOfConditionalCustomFieldEnum.CURRENT_STATUS) {
            const validStatus = ["ASSIGNED", "ONSHORE", "ONBOARD"];
            const invalidStatus = valueOfField.filter(status => !validStatus.includes(status));
            if (invalidStatus.length > 0) {
                errors.push(`Invalid status provided for type ${type_of_Field}.`);
            }
        }
        if (isOrIsNot !== 'IS' && isOrIsNot !== 'IS_NOT') {
            errors.push(`Invalid isOrIsNot value for type ${type_of_Field}.`);
        }
        if (type_of_Field === typeOfConditionalCustomFieldEnum.GROUP) {
            let group = Array.isArray(field.groupIDs) ? field.groupIDs[0] : field.groupIDs;
            if (!group || !group.groupType || !group.groupIDs) {
                errors.push(errorMessages.GROUP_IDS_GROUP_TYPE_REQUIRED_FOR_GROUP_BASED)
            }

            if (Array.isArray(valueOfField) && valueOfField.length > 0) {
                errors.push(errorMessages.VALUE_OF_FIELD_NOT_REQUIRED_FOR_GROUP_BASED);
            }
            switch (group.groupType) {
                case 'custom':
                    group.groupIDs = await getCustomGroupUsers([{ groupType: group.groupType, groupId: group.groupIDs }]);
                    break;
                case 'designation':
                case 'subRole':
                case 'vessel':
                case 'vesselType':
                    group.groupIDs = await getAutoSyncUsers([{ groupType: group.groupType, groupId: group.groupIDs }]);
                    break;
                case 'role':
                    if (![roles].includes(group.groupIDs)) {
                        errors.push(errorMessages.INVALID_ROLE_ID);
                    } else {
                        group.groupIDs = await getAutoSyncUsers([{ groupType: group.groupType, groupId: group.groupIDs }]);
                    }
                    break;
                case 'regStatus':
                    if (group.groupIDs !== "true" && group.groupIDs !== "false") {
                        errors.push(errorMessages.INVALID_REG_STATUS);
                    } else {
                        group.groupIDs = await getAutoSyncUsers([{ groupType: group.groupType, groupId: group.groupIDs }]);
                    }
                    break;
                case 'vesselStatus':
                    if (![vesselStatusEnum].includes(group.groupIDs)) {
                        errors.push(errorMessages.INVALID_VESSEL_STATUS);
                    } else {
                        group.groupIDs = await getAutoSyncUsers([{ groupType: group.groupType, groupId: group.groupIDs }]);
                    }
                    break;
                default:
                    errors.push(errorMessages.INVALID_GROUP_TYPE);
            }
        }
        else {
            if (type_of_Field === typeOfConditionalCustomFieldEnum.CURRENT_STATUS) {
                continue;
            } else {
                const validFieldCount = await getValidObjectIds(type_of_Field, valueOfField);
                if (validFieldCount.length !== valueOfField.length) {
                    errors.push(`Invalid ObjectId(s) provided for type ${type_of_Field}.`);
                }
            }
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
        case typeOfConditionalCustomFieldEnum.CURRENT_STATUS:
            return valueOfField.map(value => ({ currentStatus: value }));
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

const createLearningPlanHelper = async (input, context) => {
    console.log(context, "context");
    let errorList = [];

    try {
        if (!input.title) { errorList.push(errorMessages.TITLE_REQUIRED); }
        if (!input.targetAudience) { errorList.push(errorMessages.TARGET_AUDIENCE_REQUIRED); }
        if (input.status !== "DRAFT") {
            if (!input.selectCourses) { errorList.push(errorMessages.SELECT_COURSES_REQUIRED); }
        }
        if (input.targetAudience === targetAudienceEnum.GROUP_BASED && input.conditionalCustomFields?.some(
            ({ type_of_Field, groupIDs, isOrIsNot }) => type_of_Field === 'GROUP' && groupIDs && isOrIsNot === 'IS')) {
            errorList.push(errorMessages.INVALID_CONDITIONAL_FIELDS_FOR_GROUP_BASED);
        }
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
        let groupIDs = [];

        if (errorList.length > 0) {
            return { success: false, errors: errorList };
        }
        const { userIds, count } = await getUsersAndCount({
            targetAudience: input.targetAudience,
            audienceSelection: input.audienceSelection,
            conditionType: input.conditionType,
            conditionalCustomFields: input.conditionalCustomFields,
            groupIDs: input.groupIDs
        });
        const newLearningPlan = new LearningPlan({
            title: input.title,
            targetAudience,
            groupIDs: input.groupIDs,
            status: input.status,
            audienceSelection: input.audienceSelection,
            conditionType: input.conditionType,
            conditionalCustomFields: input.conditionalCustomFields,
            userObjectIds: input.userObjectIds,
            selectCourses: input.selectCourses,
            assignedLearnerIDs: input.userObjectIds || userIds,
            createdBy: input.createdBy,
            updatedBy: input.updatedBy
        });
        await newLearningPlan.save();
        const enrollData = {
            trainings: newLearningPlan.selectCourses,
            users: newLearningPlan?.assignedLearnerIDs,
            type: "ENROLL",
            learningPlan: newLearningPlan._id
        }
        await createTrainingRegistration({ enrollData }, context);
        // console.log(enrollLearningPlan,"enrollLearningPlan");
        return { success: true, learningPlan: newLearningPlan };
    } catch (error) {
        errorList.push(error.message);
        return { success: false, errors: errorList };
    }
};

const updateLearningPlanHelper = async (id, input) => {
    let errorList = [];
    console.log(input, "errorList");
    try {
        if (!input.title) { errorList.push(errorMessages.TITLE_REQUIRED); }
        if (!input.targetAudience) { errorList.push(errorMessages.TARGET_AUDIENCE_REQUIRED); }
        if (input.status !== "DRAFT") {
            if (!input.selectCourses) { errorList.push(errorMessages.SELECT_COURSES_REQUIRED); }
        }
        if (input.targetAudience === targetAudienceEnum.GROUP_BASED && input.conditionalCustomFields?.some(
            ({ type_of_Field, groupIDs, isOrIsNot }) => type_of_Field === 'GROUP' && groupIDs && isOrIsNot === 'IS')) {
            errorList.push(errorMessages.INVALID_CONDITIONAL_FIELDS_FOR_GROUP_BASED);
        }
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
            _id: id,
            isDeleted: false
        });
        console.log(existingLearningPlan, "existingLearningPlan");

        const targetAudience = input.targetAudience || targetAudienceEnum.EVERYONE_IN_ORGANIZATION;
        let groupIDs = [];

        if (errorList.length > 0) {
            return { success: false, errors: errorList };
        }
        const { userIds, count } = await getUsersAndCount({
            targetAudience: input.targetAudience,
            audienceSelection: input.audienceSelection,
            conditionType: input.conditionType,
            conditionalCustomFields: input.conditionalCustomFields,
            groupIDs: input.groupIDs
        });
        console.log(input.targetAudience, existingLearningPlan.targetAudience, "lplp");
        const shouldUpdateUsers =
            input.targetAudience !== existingLearningPlan?.targetAudience ||
            input.audienceSelection !== existingLearningPlan.audienceSelection ||
            input.conditionType !== existingLearningPlan.conditionType ||
            JSON.stringify(input.conditionalCustomFields) !== JSON.stringify(existingLearningPlan.conditionalCustomFields);

        if (input.audienceSelection) {
            if (input.audienceSelection === audienceSelection.MANUAL) {
                input.conditionalCustomFields = [];
                input.conditionType = null;
            } else if (input.audienceSelection === audienceSelection.ALL_EMPLOYEES) {
                input.userObjectIds = [];
                input.conditionType = null;
                input.conditionalCustomFields = [];
            } else if (input.audienceSelection === audienceSelection.AUTOMATIC && !input.conditionType) {
                errorList.push("Condition Type is required for AUTOMATIC audience selection.");
            }
        }
        if (errorList.length > 0) {
            return { success: false, errors: errorList };
        }
        console.log(shouldUpdateUsers,"bool")
        if (shouldUpdateUsers) {
            const { userIds, count } = await getUsersAndCount({
                targetAudience: input.targetAudience,
                audienceSelection: input.audienceSelection,
                conditionType: input.conditionType,
                conditionalCustomFields: input.conditionalCustomFields
            });
            console.log(input.userObjectIds, "userIds");
       
        }
        existingLearningPlan.title = input.title || existingLearningPlan.title;
        existingLearningPlan.targetAudience = input.targetAudience || existingLearningPlan.targetAudience;
        existingLearningPlan.audienceSelection = input.audienceSelection || existingLearningPlan.audienceSelection;
        existingLearningPlan.conditionType = input.conditionType ? input.conditionType : null;
        existingLearningPlan.conditionalCustomFields = input.conditionalCustomFields || [];
        existingLearningPlan.userObjectIds = input.userObjectIds || [];
        existingLearningPlan.assignedLearnerIDs = input.userObjectIds?.length > 0 ? input.userObjectIds : userIds;
        existingLearningPlan.selectCourses = input.selectCourses || existingLearningPlan.selectCourses;
        existingLearningPlan.status = input.status || existingLearningPlan.status;
        await existingLearningPlan.save();
        return { learningPlan: existingLearningPlan, success: true };
    } catch (error) {
        console.log(error, "error");
        throw new Error(error.message)
    }
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
                            GROUP: '_id',
                            VESSEL: 'currentVessel',
                            VESSEL_TYPE: 'currentVessel.typeOfVessel',
                            EMAIL: '_id',
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
                        }
                        else if (condition.type_of_Field === "EMAIL") {
                            const value = condition.valueOfField.map(id => ObjectId(id));
                            let finalQueryValue;
                            if (condition.isOrIsNot === 'IS') {
                                finalQueryValue = {
                                    '_id': { $in: value },
                                    'isDeleted': false,
                                };
                            } else {
                                finalQueryValue = {
                                    '_id': { $nin: value },
                                    'isDeleted': false,
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

                        } else if (condition.type_of_Field === "GROUP") {
                            let groupIDs = [];
                            const groupType = condition.groupIDs.map(groupType => groupType.groupType);
                            const groupId = condition.groupIDs.map(groupId => groupId.groupIDs).flat();
                            const combinedArray = groupType.map((groupType, index) => {
                                return { groupType, groupId: groupId[index] };
                            });

                            for (const item of combinedArray) {

                                if (!item.groupId) {
                                    errorList.push(errorMessages.GROUP_IDS_REQUIRED_FOR_GROUP_BASED);
                                    continue;
                                }


                                switch (item.groupType) {
                                    case 'custom':
                                        const getCustomUsers = await getCustomGroupUsers([{ groupType: item.groupType, groupId: item.groupId }]);
                                        groupIDs = getCustomUsers.map(user => user._id);
                                        break;

                                    case 'designation':
                                        const getDesignationUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupId }]);
                                        groupIDs = getDesignationUsers.map(user => user._id);
                                        break;
                                    case 'role':
                                        const getRoleUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupId }]);
                                        groupIDs = getRoleUsers.map(user => user._id);
                                        break;
                                    case 'subRole':
                                        const getSubRoleUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupId }]);
                                        groupIDs = getSubRoleUsers.map(user => user._id);
                                        break;
                                    case 'vessel':
                                        const vesselUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupId }]);
                                        groupIDs = vesselUsers.map(user => user._id);
                                        break;
                                    case 'vesselType':
                                        const vesselTypeUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupId }]);
                                        groupIDs = vesselTypeUsers.map(user => user._id);
                                        break;

                                    case 'regStatus':
                                        const regStatusUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupId }]);
                                        groupIDs = regStatusUsers.map(user => user._id);
                                        break;

                                    case 'vesselStatus':
                                        const vesselSttatusUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupId }]);
                                        groupIDs = vesselSttatusUsers.map(user => user._id);
                                        break;

                                    default:
                                        errorList.push(errorMessages.INVALID_GROUP_TYPE);
                                        continue;
                                }
                            }

                            valueData = condition.isOrIsNot === 'IS'
                                ? { [field]: { $in: groupIDs } }
                                : { [field]: { $nin: groupIDs } };
                        } else {
                            const value = condition.valueOfField.map(status => status);
                            valueData = condition.isOrIsNot === 'IS' ? { [field]: { $in: value } } : { [field]: { $nin: value } };
                        }
                        return valueData;
                    }));
                    filter[queryOperator] = conditions;
                }
            } else if (input.audienceSelection === audienceSelection.MANUAL) {
                filter._id = { $in: input.userObjectIds };
            }
        } else if (input.targetAudience === targetAudienceEnum.GROUP_BASED) {
            if (input.audienceSelection === audienceSelection.ALL_EMPLOYEES) {
                let groupIDs = [];
                for (const item of input.groupIDs) {
                    if (!item.groupIDs) {
                        errorList.push(errorMessages.GROUP_IDS_REQUIRED_FOR_GROUP_BASED);
                        continue;
                    }

                    switch (item.groupType) {
                        case 'custom':
                            const getCustomUsers = await getCustomGroupUsers([{ groupType: item.groupType, groupId: item.groupIDs }]);
                            groupIDs = getCustomUsers.map(user => user._id);
                            break;

                        case 'designation':
                            const getDesignationUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupIDs }]);
                            groupIDs = getDesignationUsers.map(user => user._id);
                            break;
                        case 'role':
                            const getRoleUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupIDs }]);
                            groupIDs = getRoleUsers.map(user => user._id);
                            break;
                        case 'subRole':
                            const getSubRoleUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupIDs }]);
                            groupIDs = getSubRoleUsers.map(user => user._id);
                            break;
                        case 'vessel':
                            const vesselUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupIDs }]);
                            groupIDs = vesselUsers.map(user => user._id);
                            break;
                        case 'vesselType':
                            const vesselTypeUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupIDs }]);
                            groupIDs = vesselTypeUsers.map(user => user._id);
                            break;

                        case 'regStatus':
                            const regStatusUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupIDs }]);
                            groupIDs = regStatusUsers.map(user => user._id);
                            break;

                        case 'vesselStatus':
                            const vesselSttatusUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupIDs }]);
                            groupIDs = vesselSttatusUsers.map(user => user._id);
                            break;

                        default:
                            errorList.push(errorMessages.INVALID_GROUP_TYPE);
                            continue;
                    }
                }
                filter._id = { $in: groupIDs };
            } else if (input.audienceSelection === audienceSelection.AUTOMATIC) {
                const queryOperator = input.conditionType === conditionTypeEnum.MATCH_ALL_CONDITION ? '$and' : '$or';
                if (input.conditionalCustomFields && input.conditionalCustomFields.length > 0) {
                    let conditions = await Promise.all(input.conditionalCustomFields.map(async condition => {
                        const fieldMapping = {
                            DESIGNATION: '_id',
                            GROUP: '_id',
                            VESSEL: 'currentVessel',
                            VESSEL_TYPE: 'currentVessel.typeOfVessel',
                            EMAIL: '_id',
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
                        } else if (condition.type_of_Field === "EMAIL") {
                            const value = condition.valueOfField.map(id => ObjectId(id));
                            let finalQueryValue;
                            if (condition.isOrIsNot === 'IS') {
                                finalQueryValue = {
                                    '_id': { $in: value },
                                    'isDeleted': false,
                                };
                            } else {
                                finalQueryValue = {
                                    '_id': { $nin: value },
                                    'isDeleted': false,
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

                        } else if (condition.type_of_Field === "GROUP") {
                            let groupIDs = [];
                            const groupType = condition.groupTypes.map(groupType => groupType);
                            const groupId = condition.groupIDs.map(groupId => groupId);
                            const combinedArray = groupType.map((groupType, index) => {
                                return { groupType, groupId: groupId[index] };
                            });

                            for (const item of combinedArray) {

                                if (!item.groupId) {
                                    errorList.push(errorMessages.GROUP_IDS_REQUIRED_FOR_GROUP_BASED);
                                    continue;
                                }

                                switch (item.groupType) {
                                    case 'custom':
                                        const getCustomUsers = await getCustomGroupUsers([{ groupType: item.groupType, groupId: item.groupId }]);
                                        groupIDs = getCustomUsers.map(user => user._id);
                                        break;

                                    case 'designation':
                                        const getDesignationUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupId }]);
                                        groupIDs = getDesignationUsers.map(user => user.user);
                                        break;
                                    case 'role':
                                        const getRoleUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupId }]);
                                        groupIDs = getRoleUsers.map(user => user._id);
                                        break;
                                    case 'subRole':
                                        const getSubRoleUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupId }]);
                                        groupIDs = getSubRoleUsers.map(user => user._id);
                                        break;
                                    case 'vessel':
                                        const vesselUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupId }]);
                                        groupIDs = vesselUsers.map(user => user._id);
                                        break;
                                    case 'vesselType':
                                        const vesselTypeUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupId }]);
                                        groupIDs = vesselTypeUsers.map(user => user._id);
                                        break;

                                    case 'regStatus':
                                        const regStatusUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupId }]);
                                        groupIDs = regStatusUsers.map(user => user._id);
                                        break;

                                    case 'vesselStatus':
                                        const vesselSttatusUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupId }]);
                                        groupIDs = vesselSttatusUsers.map(user => user._id);
                                        break;

                                    default:
                                        errorList.push(errorMessages.INVALID_GROUP_TYPE);
                                        continue;
                                }
                            }

                            valueData = condition.isOrIsNot === 'IS'
                                ? { [field]: { $in: groupIDs } }
                                : { [field]: { $nin: groupIDs } };
                        } else {
                            const value = condition.valueOfField.map(status => status);
                            valueData = condition.isOrIsNot === 'IS' ? { [field]: { $in: value } } : { [field]: { $nin: value } };
                        }
                        return valueData;
                    }));
                    filter[queryOperator] = conditions;
                }
            } else if (input.audienceSelection === audienceSelection.MANUAL) {
                filter._id = { $in: input.userObjectIds };
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
                    userIds: { $addToSet: "$_id" },
                    count: { $sum: 1 }
                }
            }
        ]);

        return {
            userIds: userData.length > 0 ? [...new Set(userData[0].userIds)] : null,
            count: userData.length > 0 ? userData[0].count : 0
        };
    } catch (error) {
        return { userIds: [], count: 0 };
    }

};

const getLearningPlanAverageProgress = async (learningPlanId) => {
    try {
        const progressRecords = await OverallTrainingProgress.find({ learningPlan: learningPlanId })
            .select('progressPercentage')
            .lean();

        if (progressRecords.length === 0) {
            return 0;
        }

        const totalProgress = progressRecords.reduce((sum, record) => sum + (record.progressPercentage || 0), 0);

        const averageProgress = totalProgress / progressRecords.length;

        return averageProgress;
    } catch (error) {
        throw Error(error.message);
    }
};



module.exports = { createLearningPlanHelper, getUsersAndCount, updateLearningPlanHelper, getLearningPlanAverageProgress };
