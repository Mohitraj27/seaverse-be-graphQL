    const { LearningPlan } = require("./learning_plan_model");
    const { CustomError } = require("../../util/error_helper");
    const { ErrorName,AuthUser, Permission, SubRoleHelper,context } = require("../../util");
    const { Group } = require("../../app/user/group-user/group_model");
    const typeOfConditionalCustomFieldEnum = require("./enumFields/typeOfConditionalCustomField.json");
    const { User } = require("../user/user_model");
    const { Vessel } = require("../vessle/vessel_model");
    const { VesselType } = require("../vessle/vessel-type/vessel_type_model");
    const { Designation } = require("../designations/designation_model");
    const approval_status = require("../trainings/approval_status.json")
    const  { Training }  = require("../trainings/training_model");
    const errorMessages = require("./error_helper/error_message");
    const audienceSelection = require("./enumFields/audienceSelectionEnum.json")
    const targetAudienceEnum = require("./enumFields/targetAudienceEnum.json");
    const validateConditionalCustomFields = async (conditionalCustomFields) => {
        const errors = [];
        
        for (const field of conditionalCustomFields) {
            const { type_of_Field, valueOfField, isOrIsNot } = field;
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
            if (!input.title){ errorList.push(errorMessages.TITLE_REQUIRED);}
            if (!input.targetAudience) { errorList.push(errorMessages.TARGET_AUDIENCE_REQUIRED);}
            if (!input.audienceSelection) { errorList.push(errorMessages.AUDIENCE_SELECTION_REQUIRED);}
            if (!input.selectCourses) { errorList.push(errorMessages.SELECT_COURSES_REQUIRED);}
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
            if ((input.audienceSelection === audienceSelection.AUTOMATIC ) && 
                (!input.conditionType || !input.conditionalCustomFields || input.conditionalCustomFields.length === 0)) {
                errorList.push(errorMessages.AUTOMATIC_SELECTION_FIELDS_REQUIRED);
            }
            if (input.audienceSelection === audienceSelection.MANUAL ) {
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
            if(errorList.length > 0){
                return { sucess: false, errors: errorList};
            }
            const existingLearningPlan = await LearningPlan.findOne({
                title: input.title,
            });
            if (existingLearningPlan) {  errorList.push(errorMessages.LEARNING_PLAN_EXISTS);
                return { sucess: false, errors: errorList};
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

    module.exports = { createLearningPlanHelper };
