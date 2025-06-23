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
const TrainingStatus = require("../trainings/enum_fields/training_status.json");
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
const validRoles = Object.values(roles);
const { Moment } = require("../../tools");
const LearningPlanAssignment = require('../learning-plan/assignedLearner/assignedLearnerModel');
const learningPlanStatus = require('./enumFields/learning_plan_status.json');
const { ImportJob } = require("../user/employee/import_job_model");
// const { EXCHANGES } = require('../../util/rabbitmq_helper');
const { v4: uuidv4 } = require('uuid')
// const { setupQueues, publishToQueue, publishMessagesOneByOne } = require('../../util/rabbitMq_service');
const pLimit = require('p-limit');
// const { publishToExchange } = require('../training-registrations/rabbitMq_service');


const { decrypt } = require("../../util/encryption_helper");
const courseEnrollmentQueue = require("../queues/course_enrollment_queue");
const { JOB_NAMES } = require("../queues/queue.enum");
const validateConditionalCustomFields = async (conditionalCustomFields) => {
    const errors = [];

    for (const field of conditionalCustomFields) {
        const { type_of_Field, valueOfField, isOrIsNot, groupIDs } = field;
        if (type_of_Field === typeOfConditionalCustomFieldEnum.CURRENT_STATUS) {
            const validStatus = ["ASSIGNED", "ONSHORE", "ONBOARDED"];
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
                    group.groupIDs = group.groupIDs.map((groupId) => new mongoose.Types.ObjectId(groupId));
                    break;
                case 'designation':
                case 'subRole':
                case 'vessel':
                case 'vesselType':
                case 'owner':
                    group.groupIDs = group.groupIDs.map((groupId) =>
                        mongoose.isValidObjectId(groupId) ? new mongoose.Types.ObjectId(groupId) : groupId
                    );

                    break;
                // case 'role':
                //     if (!group.groupIDs.every(role => validRoles.includes(role))) {
                //         errors.push(errorMessages.INVALID_ROLE_ID);
                //     } else {
                //         group.groupIDs = group.groupIDs.map((groupId) => new mongoose.Types.ObjectId(groupId));
                //     }
                //     break;
                case 'role':
                    if (typeof group.groupIDs === 'string') {
                        group.groupIDs = [group.groupIDs];
                    }
                    if (!group.groupIDs.every(role => validRoles.includes(role))) {
                        errors.push(errorMessages.INVALID_ROLE_ID);
                    }
                    break;
                case 'regStatus':
                    if (group.groupIDs !== "true" && group.groupIDs !== "false") {
                        errors.push(errorMessages.INVALID_REG_STATUS);
                    } else {
                        group.groupIDS = group.groupIDs === "true" ? [true] : [false];
                    }
                    break;
                case 'vesselStatus':
                    group.groupIDS = group.groupIDs.map((vesselStatus) => vesselStatusEnum[vesselStatus]);
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
            return await User.find({ _id: { $in: valueOfField }, isDeleted: false, isSignupAdminAprroved: { $ne: false } });

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

const basicValidations = async (input, errorList) => {
    if (!input.title) { errorList.push(errorMessages.TITLE_REQUIRED); }
    if (!input.targetAudience) { errorList.push(errorMessages.TARGET_AUDIENCE_REQUIRED); }
    if (input.status === learningPlanStatus.ACTIVE || input.status === learningPlanStatus.INACTIVE) {
        if (!input.selectCourses || input.selectCourses?.length === 0) {
            errorList.push(errorMessages.SELECT_COURSES_REQUIRED);
        }
    }
};
const audienceSelectionValidation = async (input, errorList) => {
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
    if (input.targetAudience === targetAudienceEnum.EVERYONE_IN_ORGANIZATION && input.groupIDs?.length > 0) {
        errorList.push(errorMessages.INVALID_GROUP_IDS_FOR_TARGET_AUDIENCE);
    }
    if (input.audienceSelection === audienceSelection.ALL_EMPLOYEES && input.conditionalCustomFields?.length > 0) {
        errorList.push(errorMessages.CONDITIONAL_FIELDS_NOT_ALLOWED_FOR_ALL_EMPLOYEES);
    }
    if ((input.audienceSelection === audienceSelection.AUTOMATIC) &&
        (!input.conditionType || !input.conditionalCustomFields || input.conditionalCustomFields.length === 0)) {
        errorList.push(errorMessages.AUTOMATIC_SELECTION_FIELDS_REQUIRED);
    }
};
const audienceSelectionIsMannualValidation = async (input, errorList) => {
    if (input.audienceSelection === audienceSelection.MANUAL) {
        if (input.conditionalCustomFields || input.conditionType) {
            errorList.push(errorMessages.INVALID_CONDITIONAL_FIELDS_FOR_MANUAL);
        }
        if (!Array.isArray(input.userObjectIds) || input.userObjectIds?.length === 0) {
            errorList.push(errorMessages.USER_OBJECT_IDS_REQUIRED_FOR_MANUAL);
        } else {
            const validUserIds = await User.find({
                _id: { $in: input.userObjectIds },
                isDeleted: false,
                isSignupAdminAprroved: { $ne: false }
            });
            if (validUserIds.length !== input.userObjectIds.length) {
                errorList.push(errorMessages.INVALID_USER_OBJECT_IDS);
            }
        }
    }
};
const additionalValidationConditionalCustomFields = async (input, errorList) => {

    if (input.conditionalCustomFields?.length > 0) {
        const conditionalFieldErrors = await validateConditionalCustomFields(input.conditionalCustomFields);
        errorList = errorList.concat(conditionalFieldErrors);
    }
};
const validateGroupAndConditionalFields = async (input, errorList) => {
    if (input.targetAudience === targetAudienceEnum.GROUP_BASED && Array.isArray(input.groupIDs) && input.groupIDs.length > 0) {
        const groupTypeToFieldTypeMap = {
            'vesselType': 'VESSEL_TYPE',
            'vesselStatus': 'CURRENT_STATUS'
        };
        const normalizedTopLevelFields = input.groupIDs.map(group => groupTypeToFieldTypeMap[group.groupType?.trim()] || group.groupType?.toUpperCase()).filter(Boolean);

        for (const field of input.conditionalCustomFields || []) {
            const fieldType = field.type_of_Field?.trim()?.toUpperCase();
            if (normalizedTopLevelFields.includes(fieldType)) {
                errorList.push(`An auto-synced group of the same type has already been selected as a primary condition. Please choose a different group or condition`);
            }
        }
    }
};
const createLearningPlanHelper = async (input, context) => {
    let errorList = [];

    try {
        // const existingLearningPlan = await LearningPlan.findOne({
        //     title: input.title,
        //     isDeleted: false,
        // });
        // if (existingLearningPlan) {
        //     errorList.push(errorMessages.LEARNING_PLAN_EXISTS);
        //     return { success: false, errors: errorList };
        // }
        await basicValidations(input, errorList);
        await audienceSelectionValidation(input, errorList);
        await audienceSelectionIsMannualValidation(input, errorList);
        await additionalValidationConditionalCustomFields(input, errorList);
        await validateGroupAndConditionalFields(input, errorList);
        if (errorList?.length > 0) {
            return { success: false, errors: errorList };
        }
        const targetAudience = input.targetAudience || targetAudienceEnum.EVERYONE_IN_ORGANIZATION;
        let groupIDs = [];
        const createNewLearningPlan = async (input) => {
            return new LearningPlan({
                title: input.title,
                targetAudience,
                groupIDs: input.groupIDs,
                status: input.status,
                audienceSelection: input.audienceSelection,
                conditionType: input.conditionType,
                conditionalCustomFields: input.conditionalCustomFields,
                selectCourses: input.selectCourses,
                createdBy: input.createdBy,
                updatedBy: input.updatedBy,
                emailNotification: input.emailNotification,
                pushNotification: input.pushNotification,
            });
        };

        let newLearningPlan;

        // If audience selection is MANUAL
        if (input.audienceSelection === audienceSelection.MANUAL) {
            newLearningPlan = await createNewLearningPlan(input);
            if (input.userObjectIds?.length > 0) {
                const assigments = input.userObjectIds.map(userId => ({
                    learningPlanId: newLearningPlan._id,
                    assignedLearnerId: userId,
                    isManuallyAdded: true,
                    createdBy: input.createdBy,
                    updatedBy: input.updatedBy,
                }));

                await LearningPlanAssignment.insertMany(assigments);
            }
        }
        else {
            newLearningPlan = await createNewLearningPlan(input);

            const { userIds } = await getUsersAndCount({
                targetAudience: input.targetAudience,
                audienceSelection: input.audienceSelection,
                conditionType: input.conditionType,
                conditionalCustomFields: input.conditionalCustomFields,
                groupIDs: input.groupIDs,
            });
            if (userIds?.length > 0) {
                const assignments = userIds.map(userId => ({
                    learningPlanId: newLearningPlan._id,
                    assignedLearnerId: userId,
                    isManuallyAdded: false,
                    createdBy: input.createdBy,
                    updatedBy: input.updatedBy,
                }));

                await LearningPlanAssignment.insertMany(assignments);
            }
        }
        await newLearningPlan.save();
        if (!newLearningPlan._id) {
            return { success: false, errors: [errorMessages.FAILED_TO_SAVE_LEARNING_PLAN] };
        }
        if (newLearningPlan?.status === learningPlanStatus.ACTIVE || input?.status === learningPlanStatus.ACTIVE) {
            const dataNeedstobeSendForEnrollment = await LearningPlanAssignment.find({ learningPlanId: newLearningPlan._id, isDeleted: { $ne: true } }).select('assignedLearnerId');
            if (dataNeedstobeSendForEnrollment?.length > 0 && newLearningPlan.selectCourses?.length > 0) {

                // Create a job ID for tracking
                const jobId = uuidv4();

                const enrollData = {
                    trainings: newLearningPlan.selectCourses,
                    users: dataNeedstobeSendForEnrollment.map(user => user.assignedLearnerId),
                    type: "ENROLL",
                    learningPlan: newLearningPlan._id
                }

                // const limit = pLimit(1); // Only 1 at a time

                // const batchCount = 500;
                // const batchSize = Math.ceil(enrollData.users.length / batchCount);

                // for (let i = 0; i < batchCount; i++) {
                //     await limit(async () => {
                //         const start = i * batchSize;
                //         const end = Math.min(start + batchSize, enrollData.users.length);

                //         const batchedEnrollData = {
                //             ...enrollData,
                //             users: enrollData.users.slice(start, end)
                //         };

                //         console.log(`Processing batch ${i + 1}/${batchCount}`);

                //         return await publishToExchange(EXCHANGES.COURSE_ENROLLMENT, 'courseEnrollment', {
                //             jobId,
                //             batchedEnrollData,
                //             context,
                //             timestamp: new Date().toISOString()
                //         });
                //     });
                // }


                async function publishCourseEnrollmentJob(jobData) {
                    await courseEnrollmentQueue.add(JOB_NAMES.CREATE_ENROLL, jobData);
                }

                async function publishEnrollmentInBatches(enrollData, jobId, context) {
                    if (!enrollData || !Array.isArray(enrollData.users) || enrollData.users.length === 0) {
                        console.warn('⚠️ No users found for enrollment');
                        return;
                    }

                    const users = enrollData.users;
                    const batchSize = 500;
                    const totalUsers = users.length;
                    const batchCount = Math.ceil(totalUsers / batchSize);

                    console.log(`🚀 Publishing ${totalUsers} users in ${batchCount} batches`);

                    for (let i = 0; i < batchCount; i++) {
                        const start = i * batchSize;
                        const end = Math.min(start + batchSize, totalUsers);
                        const batchedUsers = users.slice(start, end);

                        const batchedEnrollData = {
                            ...enrollData,
                            users: batchedUsers
                        };

                        try {
                            await publishCourseEnrollmentJob({
                                jobId,
                                batchedEnrollData,
                                context,
                                timestamp: new Date().toISOString()
                            });

                            console.log(`✅ Batch ${i + 1}/${batchCount} sent with ${batchedUsers.length} users`);
                        } catch (err) {
                            console.error(`❌ Failed to publish batch ${i + 1}:`, err);
                            throw err; // you may choose to continue instead of breaking entire loop
                        }
                    }
                }


                await publishEnrollmentInBatches(enrollData, jobId, context);


                // await createTrainingRegistration(enrollData, context);

            }
        }
        return { success: true, learningPlan: newLearningPlan };
    } catch (error) {
        throw Error(error.message);
    }
};

const clearFieldsBasedOnConditions = async (input, errorList) => {
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
const validateRetiredCourses = async (input, errorList) => {
    if (input.selectCourses?.length > 0) {
        const validCourses = await Training.find({
            _id: { $in: input.selectCourses },
        }).select('status -_id');
        if (validCourses.some(course => course.status === TrainingStatus.RETIRED)) {
            errorList.push(errorMessages.IS_RETIRED_COURSES_SELECTION);
        }
    }
}
const updateLearningPlanHelper = async (id, input, context) => {
    let errorList = [];
    try {
        // const titleAlreadyExist = await LearningPlan.findOne({
        //     title: input.title,
        //     isDeleted: false,
        //     _id: { $ne: id }
        // })
        // if (titleAlreadyExist) {
        //     errorList.push(errorMessages.LEARNING_PLAN_EXISTS);
        //     return { success: false, errors: errorList };
        // }
        await basicValidations(input, errorList);
        await audienceSelectionValidation(input, errorList);
        await additionalValidationConditionalCustomFields(input, errorList);
        await clearFieldsBasedOnConditions(input, errorList);
        await validateGroupAndConditionalFields(input, errorList);
        /*
        await validateRetiredCourses(input, errorList);
        */
        if (errorList?.length > 0) {
            return { success: false, errors: errorList };
        }
        const existingLearningPlan = await LearningPlan.findOne({
            _id: id,
            isDeleted: false
        });
        const existingCourses = existingLearningPlan?.selectCourses || [];
        const existingCoursesToString = existingCourses?.map(course => course.toString());
        if (!existingLearningPlan) {
            errorList.push(errorMessages.LEARNING_PLAN_NOT_FOUND);
        }
        if (errorList?.length > 0) {
            return { success: false, errors: errorList };
        }
        Object.assign(existingLearningPlan, {
            title: input.title || existingLearningPlan.title,
            targetAudience: input.targetAudience || existingLearningPlan.targetAudience,
            audienceSelection: input.audienceSelection || existingLearningPlan.audienceSelection,
            conditionType: input.conditionType || null,
            conditionalCustomFields: input.conditionalCustomFields || [],
            selectCourses: input.selectCourses || existingLearningPlan.selectCourses,
            status: input.status || existingLearningPlan.status,
            emailNotification: input.updateemailNotifications,
            pushNotification: input.updatepushNotifications,
            isUpdated: true,
            groupIDs: input.groupIDs || existingLearningPlan.groupIDs
        });
        if (input.audienceSelection === audienceSelection.EVERYONE_IN_ORGANIZATION) {
            existingLearningPlan.groupIDs = [];
        }
        await existingLearningPlan.save();
        if (existingLearningPlan?.status === learningPlanStatus.DRAFT) {
            return { learningPlan: existingLearningPlan, success: true };
        }
        const removedLearnersID = await LearningPlanAssignment.find({ learningPlanId: existingLearningPlan._id, isDeleted: { $ne: true } }).select('assignedLearnerId -_id');
        const removedLearnerIdsArray = removedLearnersID.map(item => item.assignedLearnerId._id.toString());
        await LearningPlanAssignment.deleteMany({
            learningPlanId: existingLearningPlan._id
        });
        const updatedOverallTrainingProgress = await OverallTrainingProgress.updateMany(
            { user: { $in: removedLearnerIdsArray }, learningPlan: { $in: existingLearningPlan._id }, isDeleted: { $ne: true } },
            {
                $pull: {
                    learningPlan: existingLearningPlan._id
                }
            }
        );
        let learnersToAssign = [];
        if (input.audienceSelection === audienceSelection.MANUAL) {
            learnersToAssign = await User.find({
                _id: { $in: input.userObjectIds },
                isDeleted: false,
                isSignupAdminAprroved: { $ne: false }
            }).select('_id');
        } else {
            const { userIds } = await getUsersAndCount({
                targetAudience: input.targetAudience,
                audienceSelection: input.audienceSelection,
                conditionType: input.conditionType,
                conditionalCustomFields: input.conditionalCustomFields,
                groupIDs: input.groupIDs
            });
            learnersToAssign = userIds;

        }
        if (errorList?.length > 0) {
            return { success: false, errors: errorList };
        }

        if (learnersToAssign?.length > 0) {
            const existingAssignments = await LearningPlanAssignment.find({
                learningPlanId: existingLearningPlan._id,
                assignedLearnerId: { $in: learnersToAssign },
                isDeleted: false,
            }).select('assignedLearnerId');

            const existingLearnerIds = new Set(existingAssignments.map(doc => doc.assignedLearnerId.toString()));

            const newAssignments = learnersToAssign
                .filter(learnerId => !existingLearnerIds.has(learnerId.toString()))
                .map(learnerId => ({
                    learningPlanId: existingLearningPlan._id,
                    assignedLearnerId: learnerId,
                    isManuallyAdded: input.audienceSelection === audienceSelection.MANUAL,
                    createdBy: existingLearningPlan.createdBy,
                    updatedBy: existingLearningPlan.updatedBy,
                }));
            if (existingLearningPlan?.status === learningPlanStatus.ACTIVE || input?.status === learningPlanStatus.ACTIVE
            ) {
                await OverallTrainingProgress.updateMany(
                    {
                        user: { $in: learnersToAssign },
                        isDeleted: { $ne: true },
                        training: { $in: existingLearningPlan?.selectCourses },
                    },
                    {
                        $addToSet: { learningPlan: existingLearningPlan._id },
                    }
                );
            }
            if (newAssignments.length > 0) {
                await LearningPlanAssignment.insertMany(newAssignments);
            }
        }


        let inputCourses = [], excludedCourses = [];
        if (existingLearningPlan?.selectCourses.length > 0 && input.selectCourses?.length > 0) {

            inputCourses = input.selectCourses.map(course => course.toString());

            excludedCourses = existingCoursesToString
                .filter(courseId => !inputCourses.includes(courseId))
                .map(courseId => new ObjectId(courseId));

        }

        const takeOutLearningPlanIdFromOverallTrainingProgress = await OverallTrainingProgress.updateMany(
            { training: { $in: excludedCourses }, isDeleted: { $ne: true } },
            {
                $pull: {
                    learningPlan: existingLearningPlan._id
                }
            }
        );

        if (input.selectCourses?.length > 0 && learnersToAssign?.length > 0) {
            const courseIds = existingLearningPlan?.selectCourses?.map(course => course._id) || [];
            if (courseIds?.length > 0) {
                const publishedCourses = await Training.find({
                    _id: { $in: courseIds },
                    status: "PUBLISHED",
                    isDeleted: false
                }).select('_id');

                const publishedCourseIds = publishedCourses?.map(course => course._id);
                if (publishedCourseIds?.length > 0 && existingLearningPlan?.status === learningPlanStatus.ACTIVE) {
                    const jobId = uuidv4();

                    const enrollData = {
                        trainings: publishedCourseIds,
                        users: learnersToAssign?.map(learner => learner._id) || [],
                        type: "ENROLL",
                        learningPlan: existingLearningPlan._id
                    }

                    async function publishCourseEnrollmentJob(jobData) {
                        await courseEnrollmentQueue.add(JOB_NAMES.UPDATE_ENROLL, jobData);
                    }

                    async function publishEnrollmentInBatches(enrollData, jobId, context) {
                        if (!enrollData || !Array.isArray(enrollData.users) || enrollData.users.length === 0) {
                            console.warn('⚠️ No users found for enrollment');
                            return;
                        }

                        const users = enrollData.users;
                        const batchSize = 500;
                        const totalUsers = users.length;
                        const batchCount = Math.ceil(totalUsers / batchSize);

                        console.log(`🚀 Publishing ${totalUsers} users in ${batchCount} batches`);

                        for (let i = 0; i < batchCount; i++) {
                            const start = i * batchSize;
                            const end = Math.min(start + batchSize, totalUsers);
                            const batchedUsers = users.slice(start, end);

                            const batchedEnrollData = {
                                ...enrollData,
                                users: batchedUsers
                            };

                            try {
                                await publishCourseEnrollmentJob({
                                    jobId,
                                    batchedEnrollData,
                                    context,
                                    timestamp: new Date().toISOString()
                                });

                                console.log(`✅ Batch ${i + 1}/${batchCount} sent with ${batchedUsers.length} users`);
                            } catch (err) {
                                console.error(`❌ Failed to publish batch ${i + 1}:`, err);
                                throw err; // you may choose to continue instead of breaking entire loop
                            }
                        }
                    }


                    await publishEnrollmentInBatches(enrollData, jobId, context);


                }
            }
        }
        // const updatedLearningPlan = await LearningPlan.findById(id).lean();
        return { learningPlan: existingLearningPlan, success: true };
    } catch (error) {
        throw new Error(error.message)
    }
};

const getUsersAndCount = async (input) => {
    try {
        let filter = {};
        filter.isDeleted = false;
        filter.isSignupAdminAprroved = true;
        filter.isActive = true;
        filter.isRegistered = true;
        if (input.targetAudience === targetAudienceEnum.EVERYONE_IN_ORGANIZATION) {
            if (input.audienceSelection === audienceSelection.AUTOMATIC) {
                if (!input.conditionType || input.conditionalCustomFields.length === 0) {
                    return { userIds: [], count: 0 };
                }
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
                            // if (vesselIds.length === 0) {
                            //     return {
                            //         userIds: [],
                            //         count: 0
                            //     };
                            // }
                            let finalQueryValue;
                            if (condition.isOrIsNot === 'IS') {
                                finalQueryValue = {
                                    'currentVessel._id': { $in: vesselIds },
                                    'currentVessel.isDeleted': false,
                                };
                            } else {
                                finalQueryValue = {
                                    'currentVessel._id': { $nin: vesselIds },
                                    'currentVessel.isDeleted': false,
                                };
                            }
                            valueData = finalQueryValue;
                        } else if (condition.type_of_Field === "DESIGNATION") {
                            const designationIds = condition.valueOfField.map(id => ObjectId(id));
                            const employees = await Employee.find(
                                { empDesignation: { $in: designationIds }, isDeleted: { $ne: true } },
                                { user: 1 }
                            ).exec();
                            const value = employees.map(user => user.user);

                            valueData = condition.isOrIsNot === 'IS' ? { [field]: { $in: value } } : { [field]: { $nin: value } };

                        } else if (condition.type_of_Field === "GROUP") {

                            let groupIDs = [];
                            let ids;
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
                                        ids = getCustomUsers.map(user => user._id);
                                        groupIDs = [...groupIDs, ...ids];
                                        break;
                                    case 'designation':
                                        const getDesignationUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupId }]);
                                        ids = getDesignationUsers.map(user => user._id);
                                        groupIDs = [...groupIDs, ...ids];
                                        break;
                                    case 'role':
                                        const getRoleUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupId }]);
                                        ids = getRoleUsers.map(user => user._id);
                                        groupIDs = [...groupIDs, ...ids];
                                        break;
                                    case 'subRole':
                                        const getSubRoleUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupId }]);
                                        groupIDs = getSubRoleUsers.map(user => user._id);
                                        break;
                                    case 'vessel':
                                        const vesselUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupId }]);
                                        ids = vesselUsers.map(user => user._id);
                                        groupIDs = [...groupIDs, ...ids];

                                        break;
                                    case 'vesselType':
                                        const vesselTypeUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupId }]);
                                        ids = vesselTypeUsers.map(user => user._id);
                                        groupIDs = [...groupIDs, ...ids];
                                        break;
                                    case 'regStatus':
                                        const regStatusUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupId }]);
                                        ids = regStatusUsers.map(user => user._id);
                                        groupIDs = [...groupIDs, ...ids];
                                        break;
                                    case 'vesselStatus':
                                        const vesselSttatusUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupId }]);
                                        ids = vesselSttatusUsers.map(user => user._id);
                                        groupIDs = [...groupIDs, ...ids];
                                        break;
                                    case 'owner':
                                        const ownerUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupId }]);
                                        ids = ownerUsers.map(user => user._id);
                                        groupIDs = [...groupIDs, ...ids];
                                        break;
                                    default:
                                        errorList.push(errorMessages.INVALID_GROUP_TYPE);
                                        continue;
                                }
                            }

                            groupIDs = [...new Set(groupIDs)];

                            valueData = condition.isOrIsNot === 'IS'
                                ? { [field]: { $in: groupIDs } }
                                : { [field]: { $nin: groupIDs } };
                        } else {
                            const value = condition.valueOfField.map(status => status);
                            valueData = condition.isOrIsNot === 'IS' ? { [field]: { $in: value } } : { [field]: { $nin: value, $ne: null } };
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
                        case 'owner':
                            const ownerUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupIDs }]);
                            groupIDs = ownerUsers.map(user => user._id);
                            break;

                        default:
                            errorList.push(errorMessages.INVALID_GROUP_TYPE);
                            continue;
                    }
                }
                filter._id = { $in: groupIDs };
            } else if (input.audienceSelection === audienceSelection.AUTOMATIC) {
                if (!input.conditionType || input.conditionalCustomFields.length === 0) {
                    return { userIds: [], count: 0 };
                }
                const queryOperator = input.conditionType === conditionTypeEnum.MATCH_ALL_CONDITION ? '$and' : '$or';
                if (input.conditionalCustomFields && input.conditionalCustomFields.length > 0) {
                    let groupIDs = [];
                    let ids;
                    for (const item of input.groupIDs) {
                        if (!item.groupIDs) {
                            errorList.push(errorMessages.GROUP_IDS_REQUIRED_FOR_GROUP_BASED);
                            continue;
                        }
                        switch (item.groupType) {
                            case 'custom':
                                const getCustomUsers = await getCustomGroupUsers([{ groupType: item.groupType, groupId: item.groupIDs }]);
                                ids = getCustomUsers.map(user => user._id);
                                groupIDs = [...groupIDs, ...ids];
                                break;

                            case 'designation':
                                const getDesignationUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupIDs }]);
                                ids = getDesignationUsers.map(user => user._id);
                                groupIDs = [...groupIDs, ...ids];
                                break;
                            case 'role':
                                const getRoleUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupIDs }]);
                                ids = getRoleUsers.map(user => user._id);
                                groupIDs = [...groupIDs, ...ids];
                                break;
                            case 'subRole':
                                const getSubRoleUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupIDs }]);
                                ids = getSubRoleUsers.map(user => user._id);
                                groupIDs = [...groupIDs, ...ids];
                                break;
                            case 'vessel':
                                const vesselUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupIDs }]);
                                ids = vesselUsers.map(user => user._id);
                                groupIDs = [...groupIDs, ...ids];
                                break;
                            case 'vesselType':
                                const vesselTypeUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupIDs }]);
                                ids = vesselTypeUsers.map(user => user._id);
                                groupIDs = [...groupIDs, ...ids];
                                break;
                            case 'regStatus':
                                const regStatusUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupIDs }]);
                                ids = regStatusUsers.map(user => user._id);
                                groupIDs = [...groupIDs, ...ids];
                                break;
                            case 'vesselStatus':
                                const vesselSttatusUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupIDs }]);
                                ids = vesselSttatusUsers.map(user => user._id);
                                groupIDs = [...groupIDs, ...ids];
                                break;
                            case 'owner':
                                const ownerUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupIDs }]);
                                ids = ownerUsers.map(user => user._id);
                                groupIDs = [...groupIDs, ...ids];
                                break;
                            default:
                                errorList.push(errorMessages.INVALID_GROUP_TYPE);
                                continue;
                        }
                    }
                    filter._id = { $in: groupIDs };
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
                            // if (vesselIds.length === 0) {
                            //     return {
                            //         userIds: [],
                            //         count: 0
                            //     };
                            // }
                            let finalQueryValue;
                            if (condition.isOrIsNot === 'IS') {
                                finalQueryValue = {
                                    'currentVessel._id': { $in: vesselIds },
                                    'currentVessel.isDeleted': false,
                                };
                            } else {
                                finalQueryValue = {
                                    'currentVessel._id': { $nin: vesselIds },
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
                                    case 'owner':
                                        const ownerUsers = await getAutoSyncUsers([{ groupType: item.groupType, groupId: item.groupId }]);
                                        groupIDs = ownerUsers.map(user => user._id);
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

const mergeUsersData = (inputData) => {
    const aggregatedUsers = {};

    inputData.users.forEach((user) => {
        const userId = user._id;

        if (!aggregatedUsers[userId]) {
            aggregatedUsers[userId] = {
                ...user,
                progressPercentage: 0,
                totalModules: 0,
                completedModules: 0,
                completedTrainings: 0,
                totalTrainings: 0,
                statusCount: {},
            };
        }

        const userData = aggregatedUsers[userId];

        userData.progressPercentage += user.progressPercentage;

        userData.totalModules += user.totalModules;
        userData.completedModules += user.completedModules;
        userData.totalTrainings += 1;
        userData.statusCount[user.status] = (userData.statusCount[user.status] || 0) + 1;
    });

    const mergedUsers = Object.values(aggregatedUsers).map((user) => {
        const avgProgress = user.progressPercentage / user.totalTrainings;

        let finalStatus;
        const statusKeys = Object.keys(user.statusCount);

        if (statusKeys.length === 1) {
            finalStatus = statusKeys[0];
        } else {
            finalStatus = "IN_PROGRESS";
        }

        return {
            ...user,
            progressPercentage: avgProgress.toFixed(2),
            completedTrainings: user.statusCount["COMPLETED"] || 0,
            status: finalStatus,
        };
    });

    let participantsCompleted = mergedUsers.filter((user) => user.completedTrainings === user.totalTrainings).length;

    return {
        ...inputData,
        participantsCompleted: participantsCompleted,
        users: mergedUsers,
    };
};

const getLearningPlanAverageProgress = async (learningPlanId, status = [], search = '', lastActivity, filteredLearnerData = [], pageInput) => {

    try {
        const matchCriteria = { learningPlan: { $in: [learningPlanId] }, isEnrolled: { $ne: false } };
        const skip = pageInput?.skip ?? 0, limit = pageInput?.limit ?? 50;
        let activityFilter;

        let startDate, endDate;

        if (lastActivity) {
            const today = Moment();
            switch (lastActivity) {
                case "TODAY":
                    startDate = today.startOf("day").toDate();
                    endDate = today.endOf("day").toDate();
                    break;
                case "YESTERDAY":
                    startDate = today.subtract(1, "day").startOf("day").toDate();
                    endDate = today.subtract(1, "day").endOf("day").toDate();
                    break;
                case "LAST_7_DAYS":
                    startDate = today.subtract(7, "days").startOf("day").toDate();
                    endDate = Moment().endOf("day").toDate();
                    break;
                case "LAST_30_DAYS":
                    startDate = today.subtract(30, "days").startOf("day").toDate();
                    endDate = Moment().endOf("day").toDate();
                    break;
                case "LAST_3_MONTHS":
                    startDate = today.subtract(3, "months").startOf("day").toDate();
                    endDate = Moment().endOf("day").toDate();
                    break;
                case "LAST_6_MONTHS":
                    startDate = today.subtract(6, "months").startOf("day").toDate();
                    endDate = Moment().endOf("day").toDate();
                    break;
                case "LAST_YEAR":
                    startDate = today.subtract(1, "year").startOf("day").toDate();
                    endDate = Moment().endOf("day").toDate();
                    break;
                default:
                    break;
            }
        }

        const pipeline = [
            {
                $match: matchCriteria,
            },
            {
                $skip: skip
            },
            {
                $limit: limit
            },
            {
                $unwind: "$learningPlan"
            },
            {
                $match: { learningPlan: learningPlanId }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "user",
                    foreignField: "_id",
                    as: "userDetails",
                    pipeline: [
                        ...(lastActivity && startDate && endDate
                            ? [{ $match: { lastLoginAt: { $gte: startDate, $lte: endDate } } }]
                            : []),
                        {
                            $project: {
                                _id: 1,
                                email: 1,
                                firstName: 1,
                                lastName: 1,
                                lastLoginAt: 1,
                                isRegistered: 1,
                                isDeleted: 1
                            }
                        }
                    ],

                }
            },
            {
                $unwind: "$userDetails"
            },
            ...(filteredLearnerData.length > 0
                ? [
                    {
                        $match: {
                            $or: filteredLearnerData.map(field => ({
                                $or: [
                                    { "userDetails.email": { $regex: field, $options: 'i' } },
                                    { "userDetails.firstName": { $regex: field, $options: 'i' } },
                                    { "userDetails.lastName": { $regex: field, $options: 'i' } }
                                ]
                            }))
                        }
                    }
                ]
                : []),

            {
                $group: {
                    _id: "$learningPlan",
                    averageProgress: { $avg: "$progressPercentage" },
                    totalTimeSpend: { $sum: "$timeSpend" },
                    users: {
                        $push: {
                            userId: "$user",
                            progressPercentage: "$progressPercentage",
                            completedModules: "$completedModules",
                            userDetails: "$userDetails",
                            status: "$status",
                            totalTrainingModules: "$totalTrainingModules",
                            timeSpend: "$timeSpend"
                        }
                    },
                    overallTrainingprogressStatus: { $addToSet: "$status" }
                }
            },
            {
                $project: {
                    _id: 0,
                    learningPlan: "$_id",
                    averageProgress: { $round: ["$averageProgress", 2] },
                    totalTimeSpend: 1,
                    users: {
                        $map: {
                            input: "$users",
                            //COMENTED OUT FOR SHOWING COURSE COMPLETED DETELETED USERS DATA
                            /* input: {
                                $filter: {
                                    input: "$users",
                                    as: "user",
                                    cond: { $eq: ["$$user.userDetails.isDeleted", false] }
                                }
                            }, */
                            as: "user",
                            in: {
                                _id: "$$user.userId",
                                progressPercentage: "$$user.progressPercentage",
                                completedModules: "$$user.completedModules",
                                totalModules: "$$user.totalTrainingModules",
                                email: "$$user.userDetails.email",
                                firstName: "$$user.userDetails.firstName",
                                lastName: "$$user.userDetails.lastName",
                                updatedAt: "$$user.userDetails.lastLoginAt",
                                status: "$$user.status",
                                timeSpend: "$$user.timeSpend",
                                isRegistered: "$$user.userDetails.isRegistered"
                            }
                        }
                    },
                    overallTrainingprogressStatus: 1
                }
            }
        ];

        if (search != null && search) {
            pipeline.push({
                $match: {
                    $or: [
                        { "userDetails.firstName": { $regex: search, $options: 'i' } },
                        { "userDetails.lastName": { $regex: search, $options: 'i' } },
                        { "userDetails.email": { $regex: search, $options: 'i' } }
                    ]
                }
            });
        }

        const groupedProgress = await OverallTrainingProgress.aggregate(pipeline);

        if (!groupedProgress || groupedProgress.length === 0) {
            return [];
        }

        let mergedData = mergeUsersData(groupedProgress?.[0]);

        if (status && status.length > 0) {
            mergedData.users = mergedData.users.filter((user) =>
                status.includes(user.status)
            );
        }

        if (mergedData.users?.length > 0) {
            mergedData.users = mergedData.users.map(user => ({
                ...user,
                firstName: decrypt(user?.firstName),
                lastName: user?.lastName ? decrypt(user?.lastName) : "",
                email: decrypt(user?.email)
            }));
        }
        return mergedData || [];

    } catch (error) {
        throw new Error(error.message);
    }
};

const updateLearningPlanStatusActivationHelper = async (existingLearningPlans, context) => {
    let errorList = [];
    try {
        const { userId, userInfo } = AuthUser(context);
        // Use existing learning plan data to construct input-like object
        const input = {
            title: existingLearningPlans.title,
            targetAudience: existingLearningPlans.targetAudience,
            audienceSelection: existingLearningPlans.audienceSelection,
            conditionType: existingLearningPlans.conditionType,
            conditionalCustomFields: existingLearningPlans.conditionalCustomFields || [],
            selectCourses: existingLearningPlans.selectCourses,
            status: learningPlanStatus.ACTIVE, // Force to ACTIVE
            emailNotification: existingLearningPlans.emailNotification,
            pushNotification: existingLearningPlans.pushNotification,
            groupIDs: existingLearningPlans.groupIDs || [],
            isUpdated: true,
            updatedBy: userId,
            updatedAt: new Date()
        };

        console.log('input received for status activation', input);

        await basicValidations(input, errorList);
        await audienceSelectionValidation(input, errorList);
        await additionalValidationConditionalCustomFields(input, errorList);
        await clearFieldsBasedOnConditions(input, errorList);
        await validateGroupAndConditionalFields(input, errorList);

        if (errorList?.length > 0) {
            return { success: false, errors: errorList };
        }

        const existingCourses = existingLearningPlans?.selectCourses || [];
        const existingCoursesToString = existingCourses?.map(course => course.toString());

        // Update the existing learning plan object
        Object.assign(existingLearningPlans, {
            title: input.title,
            targetAudience: input.targetAudience,
            audienceSelection: input.audienceSelection,
            conditionType: input.conditionType || null,
            conditionalCustomFields: input.conditionalCustomFields || [],
            selectCourses: input.selectCourses,
            status: learningPlanStatus.ACTIVE,
            emailNotification: input.emailNotification,
            pushNotification: input.pushNotification,
            isUpdated: true,
            groupIDs: input.groupIDs,
            updatedBy: userId,
            updatedAt: new Date()
        });

        if (input.audienceSelection === audienceSelection.EVERYONE_IN_ORGANIZATION) {
            existingLearningPlans.groupIDs = [];
        }

        await existingLearningPlans.save();


        const userObjectIds = await LearningPlanAssignment.find({
            learningPlanId: ObjectId(existingLearningPlans._id),
            isDeleted: false,
            isManuallyAdded: true
        }).select('assignedLearnerId -_id');
        const userIds = userObjectIds.map(item => item.assignedLearnerId.toString());
        let learnersToAssign = [];
        if (input.audienceSelection === audienceSelection.MANUAL) {
            // For manual selection, we need to get users based on existing assignments or criteria
            learnersToAssign = await User.find({
                _id: { $in: userIds || [] },
                isDeleted: false,
                isSignupAdminAprroved: { $ne: false }
            }).select('_id');
        } else {
            const { userIds } = await getUsersAndCount({
                targetAudience: input.targetAudience,
                audienceSelection: input.audienceSelection,
                conditionType: input.conditionType,
                conditionalCustomFields: input.conditionalCustomFields,
                groupIDs: input.groupIDs
            });

            learnersToAssign = userIds;
        }

        if (errorList?.length > 0) {
            return { success: false, errors: errorList };
        }
        if (learnersToAssign?.length > 0) {
            const existingAssignments = await LearningPlanAssignment.find({
                learningPlanId: ObjectId(existingLearningPlans._id),
                assignedLearnerId: { $in: learnersToAssign },
                isDeleted: false,
            }).select('assignedLearnerId');

            const existingLearnerIds = new Set(existingAssignments.map(doc => doc.assignedLearnerId.toString()));
            const newAssignments = learnersToAssign
                .filter(learnerId => !existingLearnerIds.has(learnerId.toString()))
                .map(learnerId => ({
                    learningPlanId: ObjectId(existingLearningPlans._id),
                    assignedLearnerId: learnerId,
                    isManuallyAdded: input.audienceSelection === audienceSelection.MANUAL,
                    createdBy: existingLearningPlans.createdBy,
                    updatedBy: userId,
                }));
            await OverallTrainingProgress.updateMany(
                {
                    user: { $in: learnersToAssign },
                    isDeleted: { $ne: true },
                    training: { $in: existingLearningPlans?.selectCourses },
                },
                {
                    $addToSet: { learningPlan: ObjectId(existingLearningPlans._id) },
                }
            );

            if (newAssignments?.length > 0) {
                await LearningPlanAssignment.insertMany(newAssignments);
            }
        }

        if (input.selectCourses?.length > 0 && learnersToAssign?.length > 0) {
            const courseIds = existingLearningPlans?.selectCourses?.map(course => course._id) || [];
            if (courseIds?.length > 0) {
                const publishedCourses = await Training.find({
                    _id: { $in: courseIds },
                    status: "PUBLISHED",
                    isDeleted: false
                }).select('_id');
                const publishedCourseIds = publishedCourses?.map(course => course._id);
                if (publishedCourseIds?.length > 0) {
                    const enrollData = {
                        trainings: publishedCourseIds,
                        users: learnersToAssign?.map(learner => learner._id) || [],
                        type: "ENROLL",
                        learningPlan: ObjectId(existingLearningPlans._id)
                    };
                    await createTrainingRegistration(enrollData, context);
                }
            }
        }

        let inputCourses = [], excludedCourses = [];
        if (existingLearningPlans?.selectCourses.length > 0 && input.selectCourses?.length > 0) {
            inputCourses = input.selectCourses.map(course => course.toString());
            excludedCourses = existingCoursesToString
                .filter(courseId => !inputCourses.includes(courseId))
                .map(courseId => new ObjectId(courseId));
        }

        const takeOutLearningPlanIdFromOverallTrainingProgress = await OverallTrainingProgress.updateMany(
            { training: { $in: excludedCourses }, isDeleted: { $ne: true } },
            {
                $pull: {
                    learningPlan: ObjectId(existingLearningPlans._id)
                }
            }
        );
        return { learningPlan: existingLearningPlans, success: true };
    } catch (error) {
        throw new Error(error.message);
    }
};

module.exports = { createLearningPlanHelper, getUsersAndCount, updateLearningPlanHelper, getLearningPlanAverageProgress, updateLearningPlanStatusActivationHelper };
