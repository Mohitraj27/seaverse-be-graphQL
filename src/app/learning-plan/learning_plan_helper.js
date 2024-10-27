    const { LearningPlan } = require("./learning_plan_model");
    const { CustomError } = require("../../util/error_helper");
    const { ErrorName,AuthUser, Permission, SubRoleHelper,context } = require("../../util");
    const { Group } = require("../../app/user/group-user/group_model");
    const typeOfConditionalCustomFieldEnum = require("./enumFields/typeOfConditionalCustomField.json");
    const { User } = require("../user/user_model");
    const { Vessel } = require("../vessle/vessel_model");
    const { VesselType } = require("../vessle/vessel-type/vessel_type_model");
    const {Designation} = require("../designations/designation_model");
    
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
                return await Vessel.find({ _id: { $in: valueOfField }, isDeleted: false });
    
            case typeOfConditionalCustomFieldEnum.VESSEL_TYPE:
                return await VesselType.find({ _id: { $in: valueOfField }, isDeleted: false }); 
    
            default:
                return [];
        }
    };
    
    const createLearningPlanHelper = async (input) => {
        let errorList = [];
        
        try {
            if (!input.title){ errorList.push("Title is required.");}
            if (!input.targetAudience) { errorList.push("Target audience is required.");}
            if (!input.audienceSelection) { errorList.push("Audience selection is required.");}
            if (input.audienceSelection === "ALL_EMPLOYEES" && input.conditionType) {
                errorList.push("Condition type should not be provided when audience selection is ALL_EMPLOYEES.");
            }
            if (input.audienceSelection === "AUTOMATIC" && !input.conditionType) {
                errorList.push("Condition type is required when audience selection is AUTOMATIC.");
            }
            if (input.targetAudience === "EVERYONE_IN_ORGANIZATION" && input.groupIDs && input.groupIDs.length > 0) {
                errorList.push("Group ObjectIds should not be provided when target audience is EVERYONE_IN_ORGANIZATION.");
            }
            if (input.audienceSelection === 'ALL_EMPLOYEES' && input.conditionalCustomFields && input.conditionalCustomFields.length > 0) {
                errorList.push("Conditional custom fields cannot be passed when audience selection is ALL_EMPLOYEES.");
            }
            if ((input.audienceSelection === 'AUTOMATIC' ) && 
                (!input.conditionType || !input.conditionalCustomFields || input.conditionalCustomFields.length === 0)) {
                errorList.push("Condition Type & Conditional custom fields are required when condition type is AUTOMATIC.");
            }
            if (input.audienceSelection === "MANUAL") {
                if (input.conditionalCustomFields || input.conditionType) {
                    errorList.push("Conditional custom fields and condition type should not be provided for MANUAL audience selection.");
                }
                if (!Array.isArray(input.userObjectIds) || input.userObjectIds.length === 0) {
                    errorList.push("A list of user ObjectIds is required for MANUAL audience selection.");
                } else {
                    const validUserIds = await User.find({
                        _id: { $in: input.userObjectIds },
                        isDeleted: false
                    });
                    if (validUserIds.length !== input.userObjectIds.length) {
                        errorList.push("One or more user ObjectIds are invalid.");
                    }
                }
            }
            if (input.conditionalCustomFields && input.conditionalCustomFields.length > 0) {
                const conditionalFieldErrors = await validateConditionalCustomFields(input.conditionalCustomFields);
                errorList = errorList.concat(conditionalFieldErrors);
            }
            if(errorList.length > 0){
                return { sucess: false, errors: errorList};
            }
            const existingLearningPlan = await LearningPlan.findOne({
                title: input.title,
            });
            if (existingLearningPlan) {  errorList.push("Learning Plan already exists.");
                return { sucess: false, errors: errorList};
            }
            const targetAudience = input.targetAudience || 'EVERYONE_IN_ORGANIZATION';
            let groupIDs = input.groupIDs || [];  
            if (targetAudience === 'GROUP_BASED') {
                if (!Array.isArray(groupIDs) || groupIDs.length === 0) {
                    errorList.push("Group ObjectIds are required for GROUP_BASED target audience.");
                }
                const validGroupCount = await Group.find({
                    _id: { $in: groupIDs },
                    isDeleted: false
                });
                if (validGroupCount.length !== groupIDs.length) {
                    errorList.push("One or more Group ObjectIds are invalid",);
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
                userObjectIds: input.userObjectIds
            });
          await newLearningPlan.save();
          return { success: true, learningPlan: newLearningPlan };
        } catch (error) {
            errorList.push(error.message);
             return { success: false, errors: errorList };
        }
    };

    module.exports = { createLearningPlanHelper };
