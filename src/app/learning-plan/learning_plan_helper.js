    const { LearningPlan } = require("./learning_plan_model");
    const { CustomError } = require("../../util/error_helper");
    const { ErrorName,AuthUser, Permission, SubRoleHelper,context } = require("../../util");
    const { Group } = require("../../app/user/group-user/group_model");
    const createLearningPlanHelper = async (input) => {
        let errorList = [];
        try {
            if (!input.title){ errorList.push("Title is required.");
            }
            if (!input.targetAudience) { errorList.push("Target audience is required.");
            }
            if (!input.audienceSelection) { errorList.push("Audience selection is required.");}
            if (input.audienceSelection === "ALL_EMPLOYEES" && input.conditionType) {
                errorList.push("Condition type should not be provided when audience selection is ALL_EMPLOYEES.");
            }
            if ((input.audienceSelection === "AUTOMATIC" || input.audienceSelection === "MANUAL") && !input.conditionType) {
                errorList.push("Condition type is required when audience selection is AUTOMATIC or MANUAL.");
            }
            if (input.targetAudience === "EVERYONE_IN_ORGANIZATION" && input.groupIDs && input.groupIDs.length > 0) {
                errorList.push("Group ObjectIds should not be provided when target audience is EVERYONE_IN_ORGANIZATION.");
            }
            if(errorList.length > 0){
                return { sucess: false, errors: errorList};
            }
            const existingLearningPlan = await LearningPlan.findOne({
                title: input.title,
            });
            if (existingLearningPlan) { 
                errorList.push("Learning Plan already exists.");
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
                conditionType: input.conditionType
            });
          await newLearningPlan.save();
          return { success: true, learningPlan: newLearningPlan };
        } catch (error) {
            errorList.push(error.message);
             return { success: false, errors: errorList };
        }
    };

    module.exports = { createLearningPlanHelper };
