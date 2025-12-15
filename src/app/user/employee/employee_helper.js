require("dotenv").config();
const {
    SendEmail,
    AuthUser,
    CustomError,
    ErrorName,
    DbTransactionHelper,
    Role,
    EmailTemplate,
    VesselStatus,
    dummyPassword,
    consentTypes,
    SqliteEmailHelper,

} = require("../../../util");
const { CryptoHelper, PubSubHelper, Validator, CronHelper, ConsoleLog, ObjectId } = require("../../../tools");
const courseEnrollment = require('../../email-template/courseEnrollment');
const { Training } = require("../../trainings/training_model");
const { Employee } = require("../../user/employee/employee_model");
const { User, DeletedUser } = require("../../user/user_model");
const { Designation } = require("../../designations/designation_model")
const {
    TrainingRegistration,
} = require("../../training-registrations/training_registration_model");
const { SubscriberProfile } = require("../subscriber-profile/subscriber_profile_model");
const { Batch } = require("../../batches/batch_model");
const { Organization } = require("../../organizations/organization_model");

const NotificationHelper = require("../../notifications/notification_helper");
const SubRoleHelper = require("../sub-roles/sub_role_helper");
const CounterHelper = require("../../counters/counter_helper");
const LogHelper = require("../../logs/log_helper");
const { BatchHelper } = require("../../batches/batch_helper");

const { Group, DeletedGroup } = require("../group-user/group_model");
const { GroupMember } = require("../group-user/group_member_model");

const NotificationType = require("../../notifications/notification_type.json");
const Permission = require("../sub-roles/permission.json");
const LogType = require("../../logs/log_type.json");
const { v4: uuidv4 } = require('uuid')
const UserHelper = require("../user_helper");
const { Vessel } = require("../../vessle/vessel_model");
const { Subscriber } = require("../../saas/subscriber/subscriber_model");
const { parse } = require("json2csv");
const { parse: csvParse } = require("csv-parse");
const { ImportLog } = require("../import-log/import_log_model");
const { UserVessel } = require("../user-vessel-bridge/userVessel_model");
const { Notification } = require("../../notifications/notification_model");
const NotificationEvent = require("../../notifications/notification_event.json");
const { generateRandomString, sendNodeEmailBulk } = require("../user-profile/user_profile_helper");
const { LearningPlan } = require("../../learning-plan/learning_plan_model");
const notificationiconEnum = require("../../notifications/notification_icon.json");
const { sendNotifications } = require("../../../util/firebase_helper");
const { VesselStatus: vesselStatusEnum } = require("../../../util");
const { OverallTrainingProgress } = require("../../training-registrations/overall-course-progress/overall_progress_model");
const { sendDeleteEmailToLearner } = require("../../email-template/sendDeleteEmailToLearner")
const targetAudience = require('../../learning-plan/enumFields/targetAudienceEnum.json');
const audienceSelection = require('../../learning-plan/enumFields/audienceSelectionEnum.json');
const { TrainingModuleContent } = require("../../trainings/training_modules/training_module_contents/training_module_content_model");
const { TrainingModule } = require('../../trainings/training_modules/training_module_model');
const mongoose = require('mongoose');
const LearningPlanAssignment = require("../../learning-plan/assignedLearner/assignedLearnerModel");
const { clear } = require("geoip-lite");
const { TrainingProgress } = require('../../training-registrations/training-progress/training_progress_model');
const { fetchDeletionBatch, deleteDeletionBatch, insertDeletionRequests, insertCourseEmails, deleteCourseEmailBatch, fetchCourseEmailBatch } = require("../../../util/sqlite_email_helper");
const LearningPlanStatus = require('../../learning-plan/enumFields/audienceSelectionEnum.json');
const { groupTypes } = require('../../../util');
const { DeleteRequestHistory } = require("./delete_request_history_model");
const HistorySignupRequest = require("../../signup-request-history/signup-request-history-model");
const { reject30DayOldSignupRequests } = require("../../signup-request/signup-request-helper");
const { DeleteRequestApproved } = require("../../email-template/DeleteRequestApproved");
const { deleteCourseDataForUserDeleted5yearsAgo, updateCoursesCountAndProgressInElasticSearch } = require("../../training-registrations/overall-course-progress/overall_progress_helper");
const { fetchFile, sendEmail } = require("../../../util/aws_helper");
const { SubRole } = require("../sub-roles/sub_role_model");
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const { decrypt, encrypt } = require('../../../util/encryption_helper');
// Replaced Elasticsearch with MongoDB UserSearchCache
// const { client, deleteByQueryFromElasticSearch, updateDocumenttoElasticSearch, updateByQueryToElasticSearch, indexDocumenttoElasticSearch, bulkIndexDocumentsToElasticSearch } = require('../../../util/elastic_helper');
const { client, deleteByQueryFromElasticSearch, updateDocumenttoElasticSearch, updateByQueryToElasticSearch, indexDocumenttoElasticSearch, bulkIndexDocumentsToElasticSearch } = require('../../../util/user_search_helper');
const { UserSearchCache } = require('../user_search_cache/user_search_cache_model');
const { MongoClient, ObjectId: mongodbObject } = require('mongodb');
const { VesselType } = require('../../vessle/vessel-type/vessel_type_model');
const { ImportJob } = require("./import_job_model");
const { TrainingContentBridge } = require("../../trainings/training_content_bridge/training_content_model");
const trainingRegistrationHelper = require("../../training-registrations/training_registration_helper");
const { sendEmailToLearner } = require("../../email-template/sendWelcomeEmail");
const { MigrationCourse } = require('../../trainings/migrationcourses/migration_courses_model');
const { runQuery, runQueryStream } = require("../../../util/mysql_helper");

const sendCredentialMail = async ({ userData }) => {
    let subscriberLogo = null;
    let subscriberDetails = {};
    const subscriberName = process.env.SUBSCRIBER_NAME_LONG;

    if (userData?.subscriber?._id) {
        let subscriberData = await SubscriberProfile.findOne({
            subscriber: userData.subscriber._id,
        })
            .lean()
            .populate("user");
        subscriberLogo = subscriberData?.user?.avatar;
        subscriberDetails.name = `${subscriberData?.user?.firstName ?? ""} ${subscriberData?.user?.lastName ?? ""
            }`;
    }

    let html =
        `<img src='https://i.imgur.com/akEHRhI.png' style='height: 230px'>
    <div style='font-weight: 700;font-size: 20px;font-family: sans-serif;color: #281166;'>Welcome ${userData.firstName} !</div>
    <hr style=" border-top: 2px solid #bbb;width: 45px;margin-top: 20px"> 
    <div style="font-weight: 400;font-size: 12px;font-family: sans-serif;color: #281166;margin: 20px;">Welcome to ${subscriberName}.
        Get ready for a great career journey with our Learning Management System</div>
        <a href="` +
        process.env.EMPLOYEE_DOMAIN_URL + `">Click here to login</a>
        <p>Email : `+ userData.email + `</p>
        <p>Password : `+ process.env.USER_DUMMY_PASSWORD + `</p>
    `;
    return await SendEmail({
        receiverEmail: userData.email,
        subject: "Registration Invitation",
        htmlContent: EmailTemplate.emailTemplate(subscriberLogo, subscriberDetails, html),
    });
};

const checkforCustomGroupBasedAutoenrollment = async (hasValidIds, conditions) => {
    if (!conditions || !hasValidIds) {
        return false;
    }
    const { designationID, vesselID, vesselTypeID, currentStatus, _id, owner, role: roleFromConditions } = conditions;
    let role = [];
    if (roleFromConditions && roleFromConditions.length > 0) role = [...roleFromConditions];
    const group = await Group.findOne({ _id: ObjectId(hasValidIds), isDeleted: { $ne: true } });
    if (!group) return false;

    if (group?.groupType === 'MEMBER') {
        const isMember = await GroupMember.findOne({ group: group._id, member: _id, isDeleted: { $ne: true } });
        return Boolean(isMember);
    }

    if (group?.groupType === 'GROUP') {
        const members = await GroupMember.find({ group: group._id, isDeleted: false });
        for (const member of members) {

            const { groupType, groupData } = member;

            switch (groupType) {
                case 'designation':
                    if (String(groupData) === String(designationID)) return true;
                    break;
                case 'vessel':
                    if (String(groupData) === String(vesselID)) return true;
                    break;
                case 'vesselType':
                    if (String(groupData) === String(vesselTypeID)) return true;
                    break;
                case 'vesselStatus':
                    if (String(groupData) === String(currentStatus)) return true;
                    break;
                case 'role':
                    if (role.length > 0 && role.includes(groupData)) return true;
                    break;
                case 'owner':
                    if (String(groupData) === String(owner)) return true;
                    break;
                default:
                    break;
            }
        }
    }
    return false;
};



const evaluateConditionalCustomFields = async (conditionType, conditionalCustomFields, conditions) => {
    const results = [];

    for (const field of conditionalCustomFields) {
        const { type_of_Field, valueOfField, isOrIsNot, groupIDs } = field;
        const { designationID, vesselID: vesselIDFromCondition, vesselTypeID: vesselFromCondition, currentStatus: statusFromCondition, _id, owner, role: roleFromConditions } = conditions;

        let vesselTypeID = vesselFromCondition;
        let vesselID = vesselIDFromCondition;
        let currentStatus = statusFromCondition;

        let role = [];
        if (roleFromConditions && roleFromConditions.length > 0) role = [...roleFromConditions];

        let match = false;

        switch (type_of_Field) {
            case "DESIGNATION":
                if (designationID == null) {
                    match = true;
                } else {
                    match = isOrIsNot === "IS"
                        ? valueOfField.includes(designationID)
                        : !valueOfField.includes(designationID);
                }
                break;

            case "ROLE":
                if (isOrIsNot === "IS") {
                    match = valueOfField.some(r => role.includes(r));
                } else {
                    match = valueOfField.every(r => !role.includes(r));
                }
                break;

            case "VESSEL":
                if (vesselID == null || !vesselID) {
                    vesselID = 'N/A';
                }
                match = vesselID === 'N/A'
                    ? false
                    : isOrIsNot === "IS"
                        ? valueOfField.includes(vesselID)
                        : !valueOfField.includes(vesselID);
                break;

            case "VESSEL_TYPE":
                if (vesselTypeID == null) {
                    vesselTypeID = 'N/A';
                }
                match = vesselTypeID === 'N/A'
                    ? false
                    : isOrIsNot === "IS"
                        ? valueOfField.includes(vesselTypeID)
                        : !valueOfField.includes(vesselTypeID);
                break;

            case "CURRENT_STATUS":
                if (currentStatus == null || !currentStatus) {
                    currentStatus = 'N/A';
                }
                match = currentStatus === 'N/A'
                    ? false
                    : isOrIsNot === "IS"
                        ? valueOfField.includes(currentStatus)
                        : !valueOfField.includes(currentStatus);
                break;

            case "EMAIL":
                if (_id == null) {
                    match = true;
                } else {
                    match = isOrIsNot === "IS"
                        ? valueOfField.includes(_id)
                        : !valueOfField.includes(_id);
                }
                break;

            case "GROUP":
                match = await (async () => {
                    if (!groupIDs || groupIDs.length === 0) return false;

                    for (const group of groupIDs) {
                        switch (group.groupType) {
                            case "designation":
                                if (String(group.groupIDs?.[0]) === String(designationID)) return true;
                                break;
                            case "vessel":
                                if (String(group.groupIDs?.[0]) === String(vesselID)) return true;
                                break;
                            case "vesselType":
                                if (String(group.groupIDs?.[0]) === String(vesselTypeID)) return true;
                                break;
                            case "vesselStatus":
                                if (String(group.groupIDs?.[0]) === String(currentStatus)) return true;
                                break;
                            case 'role':
                                return role.length > 0 && role.includes(String(group.groupIDs?.[0]));
                                break;
                            case 'owner':
                                group.groupIDs = group.groupIDs.map((groupId) =>
                                    mongoose.isValidObjectId(groupId) ? new mongoose.Types.ObjectId(groupId) : String(groupId)
                                );
                                return group.groupIDs?.includes(owner);
                            case "custom":
                                const customGroupId = group.groupIDs?.[0];
                                if (!customGroupId) break;

                                const result = await checkforCustomGroupBasedAutoenrollment(customGroupId, conditions);
                                if (result) return true;
                                break;
                            default:
                                break;
                        }
                    }

                    return false;
                })();
                break;

            default:
                match = false;
        }

        results.push(match);
    }

    return conditionType === "MATCH_ALL_CONDITION"
        ? results.every(Boolean)
        : results.some(Boolean);
};

const createEnrollmentObject = (userId, trainingId, enrollData, trainingRegistrationIds, trainingModuleCounts, isCertificatePresent, currentCertificateLayout, status, progressPercentage, isFromMigration, overallTrainingProgressId, contentData, endDate, certificateExpiryDate) => ({
    _id: overallTrainingProgressId,
    isComplete: false,
    isCertificateGenerated: false,
    learningPlan: enrollData.learningPlan ? [new mongodbObject(enrollData.learningPlan)] : [],
    training: new mongodbObject(trainingId),
    user: new mongodbObject(userId),
    trainingRegistration: new mongodbObject(trainingRegistrationIds[0]),
    status: status || "NOT_STARTED",
    isEnrolled: true,
    progressPercentage: progressPercentage || 0,
    completedModules: 0,
    totalTrainingModules: trainingModuleCounts || 0,
    isCertificatePresent: isCertificatePresent ?? false,
    currentCertificateLayout: currentCertificateLayout ?? null,
    isFromMigration: isFromMigration || false,
    contentData,
    endDate: endDate || null,
    certificateExpiryDate: certificateExpiryDate
});

async function enrollUsers(enrollDataArray, context) {
    console.log("Enrolling users...");
    try {
        const { userInfo } = AuthUser(context);
        const allUserIds = [];
        const allTrainingIds = [];

        for (const enrollData of enrollDataArray) {
            const userIds = Array.isArray(enrollData.users) ? enrollData.users : [enrollData.users];
            const trainingIds = Array.isArray(enrollData.trainings) ? enrollData.trainings : [enrollData.trainings];

            allUserIds.push(...userIds);
            allTrainingIds.push(...trainingIds);
        }



        const userObjectIds = [...new Set(allUserIds)].map(id => new mongoose.Types.ObjectId(id));
        const trainingObjectIds = [...new Set(allTrainingIds)].map(id => new mongoose.Types.ObjectId(id));

        const trainingsWithMigration = await Training.find({
            _id: { $in: trainingObjectIds },
            migrationcoursesId: { $exists: true, $ne: null }
        }, { _id: 1, migrationcoursesId: 1 }).lean();


        let trainingRegistrations;

        let subscriberId;
        const subscriber = await Subscriber.findOne();
        if (subscriber) {
            subscriberId = subscriber._id;
        }

        const existingRegistrations = await TrainingRegistration.find({ training: { $in: trainingObjectIds } });

        const existingTrainingIds = existingRegistrations.map(reg => reg.training.toString());

        const missingTrainingIds = trainingObjectIds.filter(id => !existingTrainingIds.includes(id.toString()));

        if (missingTrainingIds.length > 0) {

            const newTrainingRegistrations = await TrainingRegistration.insertMany(
                missingTrainingIds.map(trainingId => ({
                    training: trainingId,
                    subscriber: subscriberId
                }))
            );

        }


        trainingRegistrations = await TrainingRegistration.find({ training: { $in: trainingObjectIds } });


        const trainingRegistrationIds = trainingRegistrations.map(tr => tr._id);
        // const trainingModuleCounts = await TrainingModule.find({ training: { $in: trainingObjectIds } }).countDocuments();

        const trainingModuleCounts = await TrainingModule.aggregate([
            {
                $match: {
                    training: { $in: trainingObjectIds }
                }
            },
            {
                $group: {
                    _id: "$training",
                    count: { $sum: 1 }
                }
            }
        ]);

        const moduleCountMap = trainingModuleCounts.reduce((acc, item) => {
            acc[item._id.toString()] = item.count;
            return acc;
        }, {});

        const existingEnrollments = await OverallTrainingProgress.find({
            user: { $in: userObjectIds },
            training: { $in: trainingObjectIds }
        });

        const existingEnrollmentMap = new Map(
            existingEnrollments.map(enrollment =>
                [`${enrollment.user}-${enrollment.training}`, enrollment]
            )
        );

        const bulkOps = [];
        const updateProgressOps = [];
        const insertedEnrollments = [];
        const insertProgresses = [];

        const trainings = [...new Set(enrollDataArray.flatMap(el => el.trainings))];

        const trainingData = await Training.find({ _id: { $in: trainings } }).lean();

        const trainingDataById = trainingData.reduce((acc, training) => {
            acc[training._id.toString()] = training;
            return acc;
        }, {});


        // let trainingModuleContentData = [];

        const trainingContentGroupedByTraining = {};
        let userEmailMap = {};
        let finishedEmailsSet = new Set();
        let migrationIssuedAtMap = {};
        let migrationExpiryDateMap = {};

        if (trainingsWithMigration.length > 0) {

            // Get the email Ids of all migration users who completed this training
            const completedMigrationUsers = [];

            // Collect all migration course IDs
            const migrationCourseIds = trainingsWithMigration
                .filter(t => t.migrationcoursesId)
                .map(t => t.migrationcoursesId);

            // Get all migration course IDs and their UIDs
            const migrationCourses = await MigrationCourse.find({
                _id: { $in: migrationCourseIds }
            }).lean();

            // Prepare UID map
            const migrationCourseUIDMap = migrationCourses.reduce((acc, course) => {
                const uid =
                    typeof course.UID === 'string' && !isNaN(course.UID)
                        ? Number(course.UID)
                        : course.UID;
                acc[course._id.toString()] = uid;
                return acc;
            }, {});

            // Extract UIDs for SQL query
            const migrationCourseUIDs = Object.values(migrationCourseUIDMap);

            // ✅ Single SQL query for all migration UIDs
            const sql = `
                SELECT DISTINCT 
                    EMPLOYEE_ID, EMAIL, FIRST_NAME, LAST_NAME, COURSE_ID, ISSUED_AT, EXPIRY_DATE
                FROM (
                    SELECT EMPLOYEE_ID, EMAIL, FIRST_NAME, LAST_NAME, COURSE_ID, ISSUED_AT, EXPIRY_DATE
                    FROM crew_certificates_synergy_new
                    WHERE EMAIL IS NOT NULL
                      AND COURSE_ID IN (?)

                    UNION

                    SELECT EMPLOYEE_ID, EMAIL, FIRST_NAME, LAST_NAME, COURSE_ID, ISSUED_AT, EXPIRY_DATE
                    FROM crew_certificates_denmark_new
                    WHERE EMAIL IS NOT NULL
                      AND COURSE_ID IN (?)
                ) AS combined
                ORDER BY FIRST_NAME, LAST_NAME;
            `;

            // Fetch all completed migration users in one go
            for await (const row of runQueryStream(sql, [migrationCourseUIDs, migrationCourseUIDs])) {
                completedMigrationUsers.push(row);
            }

            // Map: email -> ISSUED_AT date
            migrationIssuedAtMap = completedMigrationUsers.reduce((acc, user) => {
                if (user.EMAIL && user.ISSUED_AT) {
                    acc[user.EMAIL.trim().toLowerCase()] = new Date(user.ISSUED_AT);
                }
                return acc;
            }, {});

            migrationExpiryDateMap = completedMigrationUsers.reduce((acc, user) => {
                if (user.EMAIL) {
                    acc[user.EMAIL.trim().toLowerCase()] = user.EXPIRY_DATE ? new Date(user.EXPIRY_DATE) : null;
                }
                return acc;
            }, {});


            const emails = completedMigrationUsers.map(user => user.EMAIL.trim().toLowerCase());

            finishedEmailsSet = new Set(emails);
            const usersData = await User.find({ _id: { $in: userObjectIds } }, { _id: 1, email: 1 }).lean();

            userEmailMap = usersData.reduce((acc, user) => {
                if (user.email) {
                    try {
                        const decryptedEmail = decrypt(user.email);
                        acc[user._id.toString()] = decryptedEmail;
                    } catch (err) {
                        console.error("Decryption failed for app user:", user.email);
                    }
                }
                return acc;
            }, {});



            // Fetch content details to mark as completed for migration users
            const trainingsWithMigrationIds = trainingsWithMigration.map(t => t._id);

            const trainingModuleContentData = await TrainingContentBridge.find(
                {
                    training: { $in: trainingsWithMigrationIds },
                    isDeleted: { $ne: true }
                }).lean();



            if (trainingModuleContentData.length > 0) {

                for (const item of trainingModuleContentData) {
                    const { training, trainingModule, trainingContent } = item;

                    const trainingId = training.toString();


                    if (!trainingContentGroupedByTraining[trainingId]) {
                        trainingContentGroupedByTraining[trainingId] = {};
                    }


                    if (!trainingContentGroupedByTraining[trainingId][trainingModule]) {
                        trainingContentGroupedByTraining[trainingId][trainingModule] = [];
                    }

                    trainingContentGroupedByTraining[trainingId][trainingModule].push(trainingContent);
                }

            }

        }


        for (const enrollData of enrollDataArray) {
            const userIds = Array.isArray(enrollData.users) ? enrollData.users : [enrollData.users];
            const trainingIds = Array.isArray(enrollData.trainings) ? enrollData.trainings : [enrollData.trainings];

            for (const userId of userIds) {
                for (const trainingId of trainingIds) {
                    const key = `${userId}-${trainingId}`;
                    const existingEnrollment = existingEnrollmentMap.get(key);

                    if (existingEnrollment) {
                        // bulkOps.push({
                        //     updateOne: {
                        //         filter: { _id: existingEnrollment._id },
                        //         update: {
                        //             $addToSet: { learningPlan: enrollData.learningPlan }
                        //         }
                        //     }
                        // })

                        // Check if trainingId is in trainingsWithMigration
                        // const isMigrationTraining = trainingsWithMigration.some(t => t._id.toString() === trainingId.toString());
                        const migrationTraining = trainingsWithMigration.find(t => t._id.toString() === trainingId.toString());
                        const isMigrationTraining = Boolean(migrationTraining);

                        let isMigrationCompletedUser = false;

                        if (isMigrationTraining) {
                            const userEmailEncrypted = userEmailMap[userId.toString()];
                            if (userEmailEncrypted && finishedEmailsSet.has(userEmailEncrypted)) {
                                isMigrationCompletedUser = true;
                            }
                        }

                        const update = {
                            $addToSet: { learningPlan: enrollData.learningPlan }
                        };
                        if (isMigrationCompletedUser) {
                            update.$set = { status: "COMPLETED", isFromMigration: true, progressPercentage: 100 };
                        }
                        bulkOps.push({
                            updateOne: {
                                filter: { _id: existingEnrollment._id },
                                update
                            }
                        });


                        if (isMigrationCompletedUser) {
                            updateProgressOps.push({
                                updateMany: {
                                    filter: {
                                        overallTrainingProgress: existingEnrollment._id,
                                    },
                                    update: { $set: { status: "COMPLETED", progressPercentage: 100 } }
                                }
                            });
                        }

                    } else {
                        // Check if migration training for new enrollment
                        // const isMigrationTraining = trainingsWithMigration.some(t => t._id.toString() === trainingId.toString());

                        const migrationTraining = trainingsWithMigration.find(t => t._id.toString() === trainingId.toString());
                        const isMigrationTraining = Boolean(migrationTraining);

                        let isMigrationCompletedUser = false;

                        if (isMigrationTraining) {
                            const userEmailEncrypted = userEmailMap[userId.toString()];
                            if (userEmailEncrypted && finishedEmailsSet.has(userEmailEncrypted)) {
                                isMigrationCompletedUser = true;
                            }
                        }

                        const trainingRegistrationId = trainingRegistrations.find(tr => tr.training.toString() === trainingId.toString())?._id;

                        let status = "NOT_STARTED";
                        let progressPercentage = 0;
                        let isFromMigration = false;
                        const trainingModuleCount = moduleCountMap[trainingId.toString()] || 0;
                        let contentData = [];
                        let endDate = null;
                        let certificateExpiryDate = null;
                        if (isMigrationCompletedUser) {

                            const decryptedEmail = userEmailMap[userId.toString()];
                            if (decryptedEmail && migrationIssuedAtMap[decryptedEmail]) {
                                endDate = migrationIssuedAtMap[decryptedEmail];
                            }

                            if (decryptedEmail && migrationExpiryDateMap[decryptedEmail]) {
                                certificateExpiryDate = migrationExpiryDateMap[decryptedEmail];
                            }

                            status = "COMPLETED";
                            progressPercentage = 100;
                            isFromMigration = true;

                            // Add contentData array with moduleId and contentId
                            const trainingContentDataForOverallTraining = await trainingRegistrationHelper.extractTrainingContentData(trainingId, isFromMigration);
                            contentData = trainingContentDataForOverallTraining?.trainingModulesMap ?? [];

                        }

                        // Create mongodb objectId
                        const overallTrainingProgressId = new ObjectId();

                        const newEnrollment = createEnrollmentObject(
                            userId,
                            trainingId,
                            enrollData,
                            trainingRegistrationId,
                            trainingModuleCount,
                            trainingDataById[trainingId?.toString()]?.isCertificate ?? false,
                            trainingDataById[trainingId?.toString()]?.currentCertificateLayout,
                            status,
                            progressPercentage,
                            isFromMigration,
                            overallTrainingProgressId,
                            contentData,
                            endDate,
                            certificateExpiryDate
                        );

                        console.log("New Enrollment: ", newEnrollment);


                        insertedEnrollments.push(newEnrollment);

                        // If isMigrationCompletedUser, create docs in trainingProgresses collection with COMPLETED status for each content
                        if (isMigrationCompletedUser) {

                            const groupedModules = trainingContentGroupedByTraining[trainingId.toString()];
                            if (!groupedModules) continue;

                            const now = new Date();


                            for (const [trainingModule, contents] of Object.entries(groupedModules)) {
                                for (const trainingContent of contents) {

                                    insertProgresses.push({
                                        training: trainingId,
                                        trainingModule: ObjectId(trainingModule),
                                        trainingModuleContent: trainingContent,
                                        status: "COMPLETED",
                                        progressPercentage: 100,
                                        enroledStatus: true,
                                        trainingRegistration: trainingRegistrationId,
                                        overallTrainingProgress: overallTrainingProgressId,
                                        startedAt: now,
                                        completedAt: now,
                                        isDeleted: false
                                    });

                                }
                            }

                        }

                    }
                }
            }
        }

        const uniqueEnrollments = [];
        if (insertedEnrollments.length > 0) {
            const seen = new Set();

            for (const enrollment of insertedEnrollments) {
                const key = `${enrollment.training}_${enrollment.user}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueEnrollments.push(enrollment);
                }
            }
        }


        console.time('OTP insertion')
        let allEnrollments = [];

        const MONGO_URI = process.env.MONGO_DB;


        const BATCH_SIZE = 200;

        const run = async () => {
            try {
                await mongoose.connect(MONGO_URI, {
                    useNewUrlParser: true,
                    useUnifiedTopology: true,
                });

                console.time('Batch Insert');

                const allEnrollments = [];
                const insertPromises = [];

                const allProgresses = [];
                const insertProgressPromises = [];

                for (let i = 0; i < uniqueEnrollments.length; i += BATCH_SIZE) {
                    const batch = uniqueEnrollments.slice(i, i + BATCH_SIZE);
                    insertPromises.push(OverallTrainingProgress.insertMany(batch, { ordered: false }));
                }

                const results = await Promise.all(insertPromises);


                for (const result of results) {
                    allEnrollments.push(...result); // result is an array of inserted docs
                }

                for (let i = 0; i < insertProgresses.length; i += BATCH_SIZE) {

                    console.log('inside batch insertion!');

                    const batch = insertProgresses.slice(i, i + BATCH_SIZE);

                    insertProgressPromises.push(TrainingProgress.insertMany(batch, { ordered: false }));

                }

                const progressResults = await Promise.all(insertProgressPromises);

                for (const result of progressResults) {
                    allProgresses.push(...result);
                }


                console.timeEnd('Batch Insert');
                return allEnrollments;

            } catch (err) {
                console.error('❌ Error inserting batches:', err);
            }
            // finally {
            //     await mongoose.disconnect();
            // }
        };

        run().then(() => {
            console.log('✅ Total Inserted Documents:', allEnrollments?.length);
        });



        console.timeEnd('OTP insertion')


        console.time('OTP bulkWrite LP')
        if (bulkOps.length > 0) {
            await OverallTrainingProgress.bulkWrite(bulkOps);
        }
        if (updateProgressOps.length > 0) {
            await TrainingProgress.bulkWrite(updateProgressOps);
        }
        console.timeEnd('OTP bulkWrite LP')

        const duplicates = await OverallTrainingProgress.aggregate([
            {
                $match: {
                    user: { $in: userObjectIds },
                    training: { $in: trainingObjectIds }
                }
            },
            {
                $group: {
                    _id: {
                        user: "$user",
                        training: "$training"
                    },
                    entries: {
                        $push: {
                            _id: "$_id",
                            learningPlan: "$learningPlan",
                            createdAt: "$createdAt"
                        }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $match: {
                    count: { $gt: 1 }
                }
            }
        ]);

        if (duplicates.length > 0) {
            const mergeBulkOps = [];

            for (const dup of duplicates) {

                const sortedEntries = dup.entries.sort((a, b) => a.createdAt - b.createdAt);
                const oldestEntry = sortedEntries[0];

                const combinedLearningPlans = [...new Set(
                    sortedEntries.flatMap(entry => entry.learningPlan)
                        .map(id => id.toString())
                )].map(id => new mongoose.Types.ObjectId(id));

                mergeBulkOps.push({
                    updateOne: {
                        filter: { _id: oldestEntry._id },
                        update: {
                            $set: { learningPlan: combinedLearningPlans }
                        }
                    }
                });

                const idsToDelete = sortedEntries.slice(1).map(entry => entry._id);
                if (idsToDelete.length > 0) {
                    mergeBulkOps.push({
                        deleteMany: {
                            filter: { _id: { $in: idsToDelete } }
                        }
                    });
                }
            }

            console.time('dup removal')
            if (mergeBulkOps.length > 0) {
                await OverallTrainingProgress.bulkWrite(mergeBulkOps);
                console.log(`Merged ${duplicates.length} sets of duplicate entries after enrollment`);
            }
            console.timeEnd('dup removal')
        }

        // Update courses count and progress in ElasticSearch
        const elasticSearchUpdateResponse = await updateCoursesCountAndProgressInElasticSearch(userObjectIds)
        console.log("Elastic Search Update Response", elasticSearchUpdateResponse);

        const finalEnrollments = await OverallTrainingProgress.find({
            user: { $in: userObjectIds },
            training: { $in: trainingObjectIds }
        });

        return finalEnrollments;
    } catch (error) {
        console.log(error);
        throw CustomError(ErrorName.FAILED, error.message);
    }
}
const sendWelcomeEmailBulk = async () => {
    try {
        let results = [];
        while (true) {
            const emailBatch = await SqliteEmailHelper.fetchInsertSendWelcomeEmailsBatch();
            if (!emailBatch.length) break;

            // Generate HTML content dynamically
            const emailsToSend = emailBatch.map(email => {

                const html = sendEmailToLearner({
                    firstName: email.firstName,
                    email: email.email,
                    temp_password: email.temp_password,
                    buttonLink: `${process.env.APP_URL}/login?isResetPasswordDialog=false&isTermsAccepted=false`
                });

                console.log("-----emailsToSend----- ", email.email);
                return { to: email.email, subject: "Registration Invitation", html };
            });
            // Send emails (use sendWithRetry logic from existing code)
            const batchResults = await sendCourseMailsWithRetry(emailsToSend);
            results = results.concat(batchResults);
            await delay(200);

            // Delete processed emails
            const emailIds = emailBatch.map(email => email.id);
            await SqliteEmailHelper.deleteInsertSendWelcomeEmailsBatch(emailIds);
        }

        // Return summary ( in case you have to verify success and errors, console the results)
        const { successCount, errorCount, errors } = summarizeResults(results);

        return { success: true, message: `Sent ${successCount}, failed ${errorCount}`, errors };

    } catch (error) {
        return { success: false, message: error.message };
    }
};
const sendCourseEmailBulk = async (action = 'ENROLL') => {
    try {
        let results = [];
        while (true) {

            const emailBatch = await fetchCourseEmailBatch(action);
            if (!emailBatch.length) break;

            // Generate HTML content dynamically
            const emailsToSend = emailBatch.map(email => {
                let html;
                const coursesData = JSON.parse(email.courses);

                switch (email.action) {
                    case 'ENROLL':
                        html = courseEnrollment({
                            firstName: email.firstName,
                            courses: coursesData ?? [],
                            isAdmin: Boolean(email.isAdmin),
                        });
                        break;
                    default:
                        throw new Error('Unknown action');
                }
                return { to: email.email, subject: email.subject, html };
            });

            // Send emails (use sendWithRetry logic from existing code)
            const batchResults = await sendCourseMailsWithRetry(emailsToSend);
            results = results.concat(batchResults);
            await delay(200);
            // Delete processed emails
            const emailIds = emailBatch.map(email => email.id);
            await deleteCourseEmailBatch(emailIds);
        }

        // Return summary ( in case you have to verify success and errors, console the results)
        const { successCount, errorCount, errors } = summarizeResults(results);

        return { success: true, message: `Sent ${successCount}, failed ${errorCount}`, errors };

    } catch (error) {
        console.log(error);
        return { success: false, message: error.message };
    }
};


const summarizeResults = (results) => {
    const [success, errors] = results.reduce(
        (acc, res) => [
            acc[0].concat(res.status === 'fulfilled' ? res : []),
            acc[1].concat(res.status === 'rejected' ? res : []),
        ],
        [[], []]
    );
    return {
        successCount: success.length,
        errorCount: errors.length,
        errors: errors.map(err => err.reason.message),
    };
};
const sendCourseMailsWithRetry = async (emailBatch, retryCount = 0) => {
    try {
        console.log(`\nSending batch of ${emailBatch.length} emails, Attempt: ${retryCount + 1}`);
        const emailPromises = emailBatch.map(async (email) => {
            const { to, subject, html } = email;
            if (to?.trim()?.length) {
                const emailResponse = await sendEmail({ receiverEmail: to, subject: subject, htmlContent: html });
                return emailResponse;
            } else {
                return Promise.reject(new Error("Invalid email address"));
            }
        });
        return await Promise.allSettled(emailPromises);
    } catch (error) {
        console.log(error);
        if (
            error.message.includes("Maximum sending rate exceeded") &&
            retryCount < 5
        ) {
            await delay(2 ** retryCount * 1000);
            return sendCourseMailsWithRetry(emailBatch, retryCount + 1);
        }
        throw error;
    }
};



async function findGroupBasedPublishedLearningPlans(plan, userConditions) {
    try {
        if (!plan || !plan.groupIDs || !Array.isArray(plan.groupIDs) || plan.groupIDs.length === 0) {
            return { success: false, message: "No group IDs found in the plan", matchedUsers: [] };
        }

        let matchedUserIds = [];

        for (const group of plan.groupIDs) {
            const groupType = group.groupType;
            const groupIDsList = group.groupIDs || [];

            if (!groupType || !Array.isArray(groupIDsList) || groupIDsList.length === 0) {
                console.log(`Skipping invalid group configuration: ${JSON.stringify(group)}`);
                continue;
            }

            const matchingUsers = userConditions.filter(user => {
                if (!user) return false;

                let matches = false;

                switch (groupType) {
                    case groupTypes.designation:
                        if (user?.designationID) {
                            matches = groupIDsList.includes(user.designationID.toString());
                        }
                        break;
                    case groupTypes.vessel:
                        if (user?.vesselID) {
                            matches = groupIDsList.includes(user.vesselID.toString());
                        }
                        break;
                    case groupTypes.vesselType:
                        if (user?.vesselTypeID) {
                            matches = groupIDsList.includes(user.vesselTypeID.toString());
                        }
                        break;
                    case groupTypes.vesselStatus:
                        if (user?.currentStatus) {
                            matches = groupIDsList.includes(user.currentStatus);
                        }
                        break;
                    case groupTypes.role:
                        if (user?.role) {
                            matches = groupIDsList.includes(user.role);
                        }
                        break;
                }

                if (matches) {
                    console.log(`User ${user._id} matches ${groupType} criteria`);
                }

                return matches;
            });

            if (matchingUsers?.length > 0) {
                const newMatchedUserIds = matchingUsers.map(user => user._id);
                matchedUserIds.push(...newMatchedUserIds);
                console.log(`Found ${newMatchedUserIds.length} matching users for ${groupType}`);
            }
        }

        // Remove duplicates (a user might match multiple group criteria)
        const uniqueMatchedUserIds = [...new Set(matchedUserIds)];

        // Check for existing assignments to avoid duplicates
        const existingAssignments = await LearningPlanAssignment.find({
            learningPlanId: plan._id,
            assignedLearnerId: { $in: uniqueMatchedUserIds },
            isDeleted: { $ne: true }
        }, { assignedLearnerId: 1 });

        const alreadyAssignedUserIds = new Set(existingAssignments.map(assignment =>
            assignment.assignedLearnerId.toString()));
        // Filter out users that are already assigned
        const newUserIds = uniqueMatchedUserIds.filter(userId =>
            !alreadyAssignedUserIds.has(userId.toString())
        );

        return {
            success: true,
            planId: plan._id,
            allMatchedUsers: uniqueMatchedUserIds,
            newUsersToAssign: newUserIds,
            existingAssignedUsers: existingAssignments.length
        };

    } catch (error) {
        return {
            success: false,
            message: error.message,
            error: error
        };
    }
};


const filterLearningPlans = async (learningPlans, userConditions, context, session) => {

    if (!Array.isArray(learningPlans)) {
        throw new Error("learningPlans should be an array");
    }
    if (!Array.isArray(userConditions)) {
        throw new Error("userConditions should be an array");
    }

    let enrollDataSet = [];
    let enrollmentData = [];
    let removeUsersData = [];
    // const filteredPlans = await Promise.allSettled(
    //     learningPlans.map(async (plan) => {
    const filteredPlans = [];

    for (const plan of learningPlans) {
        const usersToEnroll = [];
        try {

            if (plan?.targetAudience === targetAudience.EVERYONE_IN_ORGANIZATION && plan?.audienceSelection === audienceSelection.ALL_EMPLOYEES) {
                const userIds = userConditions.map(user => user._id);
                // await LearningPlan.updateMany(
                //     { _id: plan._id },
                //     [
                //         { $set: { assignedLearnerIDs: { $ifNull: ["$assignedLearnerIDs", []] } } },
                //         { $set: { assignedLearnerIDs: { $concatArrays: ["$assignedLearnerIDs", userIds] } } }
                //     ]
                // );
                const assignments = userIds.map(userId => ({
                    learningPlanId: plan._id,
                    assignedLearnerId: userId,
                    isMannuallyAdded: false,
                    createdBy: context.user.userId,
                    updatedBy: context.user.userId
                }));

                if (assignments?.length) {
                    const dataenrolled = await LearningPlanAssignment.insertMany(assignments, { ordered: false });
                }

                usersToEnroll.push(...userIds);
            } else if (plan?.targetAudience === targetAudience.EVERYONE_IN_ORGANIZATION && plan?.audienceSelection === audienceSelection.AUTOMATIC) {

                let evaluations = userConditions.map(() => false); // Safe Intialization fallback to false
                try {

                    console.time('evaluateConditionalCustomFields')
                    evaluations = await Promise.all(
                        userConditions.map(user =>
                            evaluateConditionalCustomFields(plan.conditionType, plan.conditionalCustomFields, user)
                        )
                    );
                    console.timeEnd('evaluateConditionalCustomFields')

                } catch (error) {
                    console.log(error);
                }

                const validUsers = userConditions.filter((_, index) => evaluations[index]);

                const validUserIds = new Set(validUsers.map(user => user._id));

                const usersToRemove = userConditions
                    .filter(user => !validUserIds.has(user._id))
                    .map(user => user._id);
                /*
                if (usersToRemove.length > 0) {
                    removeUsersData.push({
                        usersToRemove,
                        planId: plan._id
                    });
                }
                */
                //  only push removeUsersData after verifying with LearningPlanAssignment.find()
                if (usersToRemove.length > 0) {
                    const existingAssignments = await LearningPlanAssignment.find({
                        learningPlanId: plan._id,
                        assignedLearnerId: { $in: usersToRemove },
                        isDeleted: { $ne: true }
                    }).lean();
                    const existingOverallProgress = await OverallTrainingProgress.findOne({
                        learningPlanId: plan._id,
                        userId: { $in: usersToRemove },
                        isDeleted: { $ne: true }
                    });
                    if (existingOverallProgress) {
                        removeUsersData.push({ usersToRemove, planId: plan._id });
                    }
                    if (existingAssignments.length > 0 || existingOverallProgress) {
                        removeUsersData.push({ usersToRemove, planId: plan._id });
                    }
                }
                if (validUsers?.length > 0) {
                    const userIds = validUsers.map(user => user._id);
                    const existingAssignments = await LearningPlanAssignment.find({
                        learningPlanId: plan._id,
                        assignedLearnerId: { $in: userIds },
                        isDeleted: { $ne: true }
                    }, { assignedLearnerId: 1 });

                    const alreadyAssignedUserIds = new Set(existingAssignments.map(assignment => assignment.assignedLearnerId.toString()));

                    const newAssignments = userIds
                        .filter(userId => !alreadyAssignedUserIds.has(userId.toString()))
                        .map(userId => ({
                            learningPlanId: plan._id,
                            assignedLearnerId: userId,
                            isMannuallyAdded: false,
                            createdBy: context.user.userId,
                            updatedBy: context.user.userId,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        }));

                    console.time('LearningPlanAssignmentInsertion')
                    if (newAssignments.length > 0) {
                        const dataEnrolled = await LearningPlanAssignment.insertMany(newAssignments, { ordered: false });
                    }
                    console.timeEnd('LearningPlanAssignmentInsertion')

                    usersToEnroll.push(...userIds);
                }
            }
            if (usersToEnroll.length > 0) {

                const enrollData = {
                    trainings: plan.selectCourses,
                    users: usersToEnroll,
                    type: "ENROLL",
                    learningPlan: plan._id,
                    session
                };
                enrollDataSet.push(enrollData);
                enrollmentData.push(enrollData);
                // return true;
            }


            filteredPlans.push(true);


        } catch (error) {
            console.log('error');
            console.log(error);
        }
        // return true;
    };
    //     })
    // );

    const allUserIds = new Set();
    const allTrainingIds = new Set();
    const userToLearningPlansMap = new Map();

    enrollDataSet?.forEach(data => {
        (data.users || [])?.forEach(userId => allUserIds.add(userId.toString()));
        (data.trainings || [])?.forEach(trainingId => allTrainingIds.add(trainingId.toString()));
    });


    enrollDataSet?.forEach(data => {
        const learningPlanId = data.learningPlan;
        (data.users || []).forEach(userId => {
            const id = userId.toString();

            if (!userToLearningPlansMap.has(id)) {
                userToLearningPlansMap.set(id, new Set());
            }

            userToLearningPlansMap.get(id).add(learningPlanId.toString());
        });
    });


    // Convert Sets to arrays if needed
    const uniqueUserIds = Array.from(allUserIds);
    const uniqueTrainingIds = Array.from(allTrainingIds);

    const userToLearningPlansObject = {};
    userToLearningPlansMap.forEach((planIds, userId) => {
        userToLearningPlansObject[userId] = Array.from(planIds);
    });
    const nonNotificationRecievers = await OverallTrainingProgress.find({ training: { $in: uniqueTrainingIds }, user: { $in: uniqueUserIds } }).select("training user");

    if (enrollmentData?.length > 0) {
        console.time('enrollUsersInFilterLP')
        await enrollUsers(enrollmentData, context);
        console.timeEnd('enrollUsersInFilterLP')
    }

    if (removeUsersData?.length > 0) {
        const bulkUpdateOps = [];
        const bulkDeleteOps = [];

        for (const { planId, usersToRemove } of removeUsersData) {
            if (usersToRemove.length > 0) {
                bulkUpdateOps.push({
                    updateMany: {
                        filter: {
                            learningPlan: ObjectId(planId),
                            user: { $in: usersToRemove }
                        },
                        update: {
                            $pull: { learningPlan: ObjectId(planId) }
                        }
                    }
                });

                bulkDeleteOps.push({
                    deleteMany: {
                        filter: {
                            learningPlanId: ObjectId(planId),
                            assignedLearnerId: { $in: usersToRemove }
                        }
                    }
                });
            }
        }

        try {

            if (bulkUpdateOps.length > 0) {
                await OverallTrainingProgress.bulkWrite(bulkUpdateOps);
            }

            if (bulkDeleteOps.length > 0) {
                await LearningPlanAssignment.bulkWrite(bulkDeleteOps);
            }

        } catch (error) {
            console.log(error);
        }

    }

    await sendNotificationAndMailForAutoEnrollment(uniqueUserIds, uniqueTrainingIds, nonNotificationRecievers, userToLearningPlansObject, context);

    return filteredPlans.filter(Boolean);
}
const sendNotificationAndMailForAutoEnrollment = async (userObjectIds, trainingObjectIds, nonNotificationRecievers, userToLearningPlansObject, context) => {
    try {
        const { subscriberId, userInfo } = AuthUser(context);

        const existingSetOfUserTrainings = new Set(
            nonNotificationRecievers.map(e => `${e.user.toString()}-${e.training.toString()}`)
        );

        const uniqueLearningPlanIdsSet = new Set();

        Object.values(userToLearningPlansObject).forEach(planIdsArray => {
            planIdsArray.forEach(planId => {
                uniqueLearningPlanIdsSet.add(planId.toString());
            });
        });

        const uniqueLearningPlanIds = Array.from(uniqueLearningPlanIdsSet);

        const coursesList = await LearningPlan.find({ _id: { $in: uniqueLearningPlanIds } }).select("_id selectCourses").lean();
        const learningPlanToCoursesMap = new Map();

        coursesList.forEach(plan => {
            if (plan._id && plan.selectCourses) {
                learningPlanToCoursesMap.set(plan._id.toString(), plan.selectCourses);
            }
        });




        const uniqueCourseIds = [
            ...new Set(
                coursesList.flatMap(plan => plan.selectCourses.map(courseId => courseId.toString()))
            )
        ];

        const newEnrollments = [];

        for (const userId of userObjectIds) {
            for (const trainingId of trainingObjectIds) {
                const key = `${userId}-${trainingId}`;
                if (!existingSetOfUserTrainings.has(key)) {
                    newEnrollments.push({ userId, trainingId });
                }
            }
        }

        const emailsToSend = [];

        for (const userId of userObjectIds) {
            let hasAnyNewCourse = false;

            for (const trainingId of trainingObjectIds) {
                const key = `${userId}-${trainingId}`;
                if (!existingSetOfUserTrainings.has(key)) {
                    hasAnyNewCourse = true;
                    break;
                }
            }

            if (hasAnyNewCourse) {
                emailsToSend.push(userId);
            }
        }

        if (newEnrollments.length === 0) {
            return;
        }

        const trainingProgressDocuments = await OverallTrainingProgress.find({
            user: { $in: userObjectIds },
            training: { $in: trainingObjectIds }
        });

        const trainingProgressMap = new Map();

        trainingProgressDocuments.forEach(doc => {
            const key = `${doc.user.toString()}_${doc.training.toString()}`;
            trainingProgressMap.set(key, doc._id);
        });

        // Precompute training progress IDs for quick lookup
        const trainingProgressMapComputed = new Map(
            userObjectIds.flatMap(userId =>
                trainingObjectIds.map(trainingId => {
                    const key = `${userId}_${trainingId}`;
                    return [key, trainingProgressMap.get(key)];
                })
            )
        );

        const trainingTitlesMap = new Map(
            (await Training.find({ _id: { $in: trainingObjectIds } }).select('title'))
                .map(({ _id, title }) => [_id.toString(), title?.[0]?.value || "a new course"])
        );

        if (userObjectIds?.length > 0) {
            const notifications = newEnrollments?.map(({ userId, trainingId }) => ({
                subscriber: subscriberId,
                title: [
                    {
                        lang: "en",
                        value: `${trainingTitlesMap.get(
                            trainingId.toString()
                        )} has been enrolled to you`,
                    },
                ],
                message: [
                    {
                        lang: "en",
                        value: `You have been successfully enrolled to a new Course: ${trainingTitlesMap.get(
                            trainingId.toString()
                        )}.`,
                    },
                ],
                notificationType: NotificationType.NEW_COURSE_ENROLLMENT,
                notifyAllAdmin: false,
                isNotificatonForAdmin: false,
                notifiers: [userId],
                employeeNotifiers: [userId],
                affected: [],
                status: "SENT",
                icon: notificationiconEnum.SUCCESS,
                createdBy: userInfo,
                additionalInfo: [
                    {
                        infoType: "VIEW_COURSE",
                        infoData: {
                            filePath: trainingId,
                            trainingProgressId: trainingProgressMapComputed.get(
                                `${userId}_${trainingId}`
                            ),
                        },
                    },
                ],
            }));

            if (notifications?.length > 0) {
                await NotificationHelper.createNotification(notifications);
            }
        }

        //SENDING EMAIL NOTIFICATIONS

        const trainingData = await Training.find({ _id: { $in: uniqueCourseIds } }).lean();

        const trainingDataById = trainingData.reduce((acc, training) => {
            acc[training._id.toString()] = training;
            return acc;
        }, {});

        //send enrollment email
        const imageUrlMap = new Map(await Promise.all(
            trainingData.map(async training => [
                training?._id,
                await fetchFile(training?.coverImage?.url) ||
                'https://squadra-media-assets.s3.amazonaws.com/public/course-image.png'
            ])
        ));

        // Preprocess course data once
        const notEnrolledUsers = await User.find({ _id: { $in: emailsToSend } }).lean();
        const subRoleAdminId = await SubRole.findOne({ name: Role.ADMIN, primaryRole: Role.ADMIN }).select("_id");
        const coursesDataMap = trainingData.map(training => ({
            trainingTitle: training?.title?.[0]?.value || ' ',
            durationHours: ((training?.durationHours || 0) / 60).toFixed(1),
            courseImage: imageUrlMap.get(training?._id),
        }));

        const emailData = [];

        notEnrolledUsers.forEach(user => {
            const userIdStr = user._id.toString();
            const plans = userToLearningPlansObject[userIdStr];


            if (!user.isEmailNotification || !user.isRegistered) {
                console.log(`Skipping ${user.email} due to email/settings`);
                return;
            }

            if (!plans || !plans.length) {

                return;
            }

            plans.forEach(lpId => {
                const courseIds = learningPlanToCoursesMap.get(lpId);


                if (!courseIds || !courseIds.length) return;

                const courses = courseIds.map(courseId => {
                    const course = trainingDataById[courseId.toString()];
                    if (!course) {

                        return null;
                    }
                    return {
                        trainingTitle: course?.title?.[0]?.value || ' ',
                        durationHours: ((course?.durationHours || 0) / 60).toFixed(1),
                        courseImage: imageUrlMap.get(courseId.toString()) ||
                            'https://squadra-media-assets.s3.amazonaws.com/public/course-image.png'
                    };
                }).filter(Boolean);

                if (courses.length) {
                    emailData.push({
                        receiverEmail: decrypt(user.email),
                        firstName: decrypt(user.firstName, true),
                        isAdmin: user?.subRoles?.includes(subRoleAdminId?._id),
                        courses
                    });
                }
            });
        });

        // Insert emails into the course_emails table
        insertCourseEmails(emailData);
        // Send the emails batch by batch
        await sendCourseEmailBulk();

    } catch (error) {
        console.log(error);
        throw CustomError(ErrorName.FAILED, error.message);
    }
}
const sendInvitationMail = async ({ userData, token, emailOrCivilIdOrPassport }) => {
    let subscriberLogo = null;
    let subscriberDetails = {};
    const subscriberName = process.env.SUBSCRIBER_NAME_LONG;

    if (userData?.subscriber?._id) {
        let subscriberData = await SubscriberProfile.findOne({
            subscriber: userData.subscriber._id,
        })
            .lean()
            .populate("user");
        subscriberLogo = subscriberData?.user?.avatar;
        subscriberDetails.name = `${subscriberData?.user?.firstName ?? ""} ${subscriberData?.user?.lastName ?? ""
            }`;
    }

    let html =
        `<img src='https://i.imgur.com/akEHRhI.png' style='height: 230px'>
    <div style='font-weight: 700;font-size: 20px;font-family: sans-serif;color: #281166;'>Welcome ${userData.firstName} !</div>
    <hr style=" border-top: 2px solid #bbb;width: 45px;margin-top: 20px"> 
    <div style="font-weight: 400;font-size: 12px;font-family: sans-serif;color: #281166;margin: 20px;">Welcome to ${subscriberName}.
        Get ready for a great career journey with our Learning Management System</div>
        <a href="` +
        process.env.EMPLOYEE_DOMAIN_URL +
        `en/sign-up/` +
        emailOrCivilIdOrPassport +
        "/" +
        token +
        `"><button type="button" style="border: none;border-radius: 5px;background-color: #5928E5;color: white;width: 140px;padding: 8px;margin-bottom: 60px;">Click to continue</button></a>
    `;
    return await SendEmail({
        receiverEmail: userData.email ? userData.email : userData.companyEmail,
        subject: "Registration Invitation",
        htmlContent: EmailTemplate.emailTemplate(subscriberLogo, subscriberDetails, html),
    });
};

const sendCourseInvitationMail = async ({ userData, trainingRegistrationId }) => {
    let subscriberLogo = null;
    let subscriberDetails = {};
    const subscriberName = process.env.SUBSCRIBER_NAME_LONG;

    if (userData?.subscriber?._id) {
        let subscriberData = await SubscriberProfile.findOne({
            subscriber: userData.subscriber._id,
        })
            .lean()
            .populate("user");
        subscriberLogo = subscriberData?.user?.avatar;
        subscriberDetails.name = `${subscriberData?.user?.firstName ?? ""} ${subscriberData?.user?.lastName ?? ""
            }`;
    }

    let html =
        `<img src='https://i.imgur.com/akEHRhI.png' style='height: 230px'>
        <div style='font-weight: 700;font-size: 20px;font-family: sans-serif;color: #281166;'>Hello ${userData.firstName} !</div>
        <hr style=" border-top: 2px solid #bbb;width: 45px;margin-top: 20px"> 
        <div style="font-weight: 400;font-size: 12px;font-family: sans-serif;color: #281166;margin: 20px;">Welcome to ${subscriberName}.
            A new course is ready for you.</div>
            <a href="` +
        process.env.EMPLOYEE_DOMAIN_URL +
        `en/course-details/` +
        trainingRegistrationId +
        `"><button type="button" style="border: none;border-radius: 5px;background-color: #5928E5;color: white;width: 140px;padding: 8px;margin-bottom: 60px;">Click to continue</button></a>
        `;
    return await SendEmail({
        receiverEmail: userData.email,
        subject: "Course Invitation",
        htmlContent: EmailTemplate.emailTemplate(subscriberLogo, subscriberDetails, html),
    });
};
const sendDeleteNotification = async (notificationsData) => {
    if (notificationsData?.length) {
        const notifications = [];

        for (const notificationData of notificationsData) {
            const employeeName = `${decrypt(notificationData.deletedEmployee?.user?.firstName)} ${notificationData.deletedEmployee?.user?.lastName ? decrypt(notificationData.deletedEmployee?.user?.lastName) : ''}`;
            const employeeEmail = decrypt(notificationData.deletedEmployee?.user?.email);

            const notification = {
                subscriber: notificationData.subscriber,
                title: [{ lang: "en", value: `Employee Deleted` }],
                message: [
                    {
                        lang: "en",
                        value: `Employee "${employeeName}" (${employeeEmail}) has been deleted by ${decrypt(notificationData.createdBy.firstName)}.`,
                    },
                ],
                notificationType: NotificationType.EMPLOYEE_DELETED,
                notifyAllAdmin: true,
                isNotificatonForAdmin: true,
                notifiers: [],
                employeeNotifiers: [],
                affected: [
                    {
                        targetRef: "Employee",
                        target: notificationData.deletedEmployee._id,
                    },
                ],
                additionalInfo: [
                    {
                        infoType: "DELETED_EMPLOYEE_INFO",
                        infoData: {
                            _id: notificationData.deletedEmployee._id,
                            name: employeeName,
                            email: employeeEmail,
                        },
                    },
                    {
                        infoType: "DELETER_INFO",
                        infoData: {
                            _id: notificationData.createdBy._id,
                            firstName: decrypt(notificationData.createdBy.firstName),
                            lastName: decrypt(notificationData.createdBy.lastName),
                        },
                    },
                ],
                icon: notificationiconEnum.STABLE,
                createdBy: notificationData.createdBy,
            };
            notifications.push(notification);
        }
        // await NotificationHelper.createNotification(notifications);
    }
};
const notifyEmployeeStatusChange = async (notificationsData) => {
    if (notificationsData?.length) {
        const notifications = [];
        for (const notificationData of notificationsData) {
            const employeeName = `${decrypt(notificationData.employee?.user?.firstName)} ${notificationData.employee?.user?.lastName ? decrypt(notificationData.employee?.user?.lastName) : ''}`.trim();
            const employeeEmail = decrypt(notificationData.employee?.user?.email);

            const notification = {
                subscriber: notificationData.subscriber,
                title: [{ lang: "en", value: `Employee Status Updated` }],
                message: [
                    {
                        lang: "en",
                        value: `Employee "${employeeName}" (${employeeEmail}) has been successfully marked as ${notificationData.type} by ${decrypt(notificationData.updatedBy.firstName)}.`,
                    },
                ],
                notificationType: NotificationType.EMPLOYEE_STATUS_UPDATED,
                notifyAllAdmin: true,
                isNotificatonForAdmin: true,
                notifiers: [],
                employeeNotifiers: [],
                affected: [
                    {
                        targetRef: "Employee",
                        target: notificationData.employee._id,
                    },
                ],
                status: "SENT",
                icon: notificationiconEnum.SUCCESS,
                createdBy: notificationData.updatedBy,
            };
            notifications.push(notification);
        }
        // await NotificationHelper.createNotification(notifications);
    }
};


const sendEnrollmentNotification = async notificationsData => {
    if (notificationsData?.length) {
        const notifications = [];

        const training = await Training.findById(notificationsData[0].trainingRegistration.training)
            .select("title")
            .lean();

        const trainingTitle = training?.title.find(x => x.lang === "en" || x.lang === "ar")?.value;

        for (const notificationData of notificationsData) {
            const notification = {
                subscriber: notificationData.subscriber,
                title: [{ lang: "en", value: `Learner ${notificationData.action}` }],
                message: [
                    {
                        lang: "en",
                        value: `${notificationData.userIds.length} users are ${notificationData.action} to the course "${trainingTitle}" by ${decrypt(notificationData.createdBy.firstName)}`,
                    },
                ],
                userMessage: [
                    {
                        lang: "en",
                        value: `You have been ${notificationData.action} to the course "${trainingTitle}" by ${decrypt(notificationData.createdBy.firstName)}`,
                    },
                ],
                notificationType: `TRAINING_NEW_${notificationData.action}`,
                notifyAllAdmin: true,
                isNotificatonForAdmin: true,
                notifiers: notificationData.userIds ? notificationData.userIds : [],
                employeeNotifiers: [],
                affected: [
                    {
                        targetRef: "TrainingRegistration",
                        target: notificationData.trainingRegistration._id,
                    },
                ],
                additionalInfo: [
                    {
                        infoType: "UPDATER_INFO",
                        infoData: {
                            _id: notificationData.createdBy._id,
                            firstName: decrypt(notificationData.createdBy.firstName),
                            lastName: notificationData.createdBy.lastName ? decrypt(notificationData.createdBy.lastName) : '',
                        },
                    },
                    {
                        infoType: "EMPLOYEE_INFO",
                        infoData: {
                            _id: notificationData.trainingRegistration.employee?._id,
                            user: {
                                _id: notificationData.trainingRegistration.employee?.user?._id,
                                firstName:
                                    decrypt(notificationData.trainingRegistration.employee?.user?.firstName),
                                lastName:
                                    notificationData.trainingRegistration.employee?.user?.lastName ? decrypt(notificationData.trainingRegistration.employee?.user?.lastName) : '',
                            },
                        },
                    },
                    {
                        infoType: "TRAINING_INFO",
                        infoData: {
                            _id: training?._id,
                            title: training?.title,
                        },
                    },
                ],
                icon: notificationiconEnum.STABLE,
                createdBy: notificationData.createdBy,
            };

            notifications.push(notification);
        }

        // await NotificationHelper.createNotification(notifications);
    }
};
const sendNotificationOnBULK = async notificationData => {

    try {

        const notification = {
            subscriber: notificationData.subscriber,
            title: [{ lang: "en", value: `${notificationData.action}` }],
            notifyAllAdmin: false,
            isNotificatonForAdmin: true,
            notifiers: [notificationData.creatorId],
            employeeNotifiers: [],
            createdBy: notificationData.adminUser?._id,
            employee: notificationData.adminUser?._id,
            description: notificationData.description,
            isError: notificationData.isError,
            notificationType: notificationData.notificationType,
            status: notificationData.status,
            icon: notificationData.icon
        };

        notification.message = {
            lang: "en",
            value: notificationData.description,
        };

        const createdNotification = await Notification.create(notification);

        if (notification?.createdAt) {
            notification.createdAt = new Date(notification.createdAt).getTime().toString();
        }

        if (notification?.updatedAt) {
            notification.updatedAt = new Date(notification.updatedAt).getTime().toString();
        }
        // await PubSubHelper.publish(NotificationEvent.ON_NOTIFICATION, createdNotification);
        await PubSubHelper.publish(NotificationEvent.ON_NOTIFICATION, {
            onNotification: createdNotification,
        });


    } catch (error) {
        throw Error(error.message);
    }

}
const sendNotificationOnBULKOutsideChildProcess = async notificationData => {
    try {

        const notification = {
            subscriber: notificationData.subscriber,
            title: [{ lang: "en", value: `${notificationData.action}` }],
            notifyAllAdmin: true,
            isNotificatonForAdmin: true,
            notifiers: [],
            employeeNotifiers: [],
            createdBy: notificationData.createdBy,
            employee: notificationData.createdBy,
            description: notificationData.description,
            isError: notificationData.isError,
            notificationType: notificationData.notificationType,
            status: notificationData.status
        };

        notification.message = {
            lang: "en",
            value: notificationData.description,
        };

        const createdNotification = await Notification.create(notification);

        if (createdNotification) await PubSubHelper.publish(NotificationEvent.ON_NOTIFICATION, createdNotification);

    } catch (error) {
        throw Error(error.message);
    }
}
const sendNotificationOnCRUD = async notificationData => {
    try {
        const employeeName = decrypt(notificationData.employee.user?.firstName);

        const notification = {
            subscriber: notificationData.subscriber,
            title: [{ lang: "en", value: `Employee ${notificationData.action}` }],
            notifyAllAdmin: true,
            isNotificatonForAdmin: true,
            notifiers: [],
            employeeNotifiers: [],
            affected: [
                {
                    targetRef: "Employee",
                    target: notificationData.employee._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "EMPLOYEE_INFO",
                    infoData: {
                        _id: notificationData.employee._id,
                        user: {
                            _id: notificationData.employee.user._id,
                            firstName: decrypt(notificationData.employee.user.firstName),
                            lastName: notificationData.employee.user.lastName ? decrypt(notificationData.employee.user.lastName) : '',
                        },
                    },
                },
            ],
            createdBy: notificationData.createdBy,
        };

        notification.notificationType = NotificationType["EMPLOYEE_" + notificationData.action];

        if (
            notificationData.employee.user._id.toString() ===
            notificationData.createdBy._id.toString()
        ) {
            notification.message = {
                lang: "en",
                value: `Employee "${employeeName}" has updated his profile`,
            };
        } else {
            notification.additionalInfo.push({
                infoType: "UPDATER_INFO",
                infoData: {
                    _id: notificationData.createdBy._id,
                    firstName: decrypt(notificationData.createdBy.firstName),
                    lastName: notifcationData.createdBy.lastName ? decrypt(notificationData.createdBy.lastName) : '',
                },
            });

            notification.message = [
                {
                    lang: "en",
                    value: `Admin User "${decrypt(notificationData.createdBy.firstName)}" ${notificationData.action} employee "${employeeName}"`,
                },
            ];
        }

        // await NotificationHelper.createNotification(notification);
    } catch (e) {
        throw Error(e?.message);
    }
};

const generateEmployeeUID = async ({ subscriberId, session }) => {
    const savedCounter = await CounterHelper.updateCounter({
        subscriberId,
        modelName: Employee.modelName,
        session,
    });

    if (!savedCounter) throw CustomError(ErrorName.FAILED);
    return `EMP-${savedCounter.count}`;
};

const generateUserUID = async ({ session }) => {
    const savedCounter = await CounterHelper.updateCounter({
        modelName: User.modelName,
        session,
    });

    if (!savedCounter) throw CustomError(ErrorName.FAILED);

    return `USER-${savedCounter.count}`;
};

const generateDefaultGroup = async ({ user, subscriberId }) => {
    try {
        const groupFilterConditions = { subscriber: subscriberId, isDeleted: false, isManagerDefault: true, groupAdmin: user._id };
        const groupUpdateData = { groupName: user.firstName + "'s Group" }

        let savedGroupName = await Group.findOne(groupFilterConditions).lean();

        if (savedGroupName) {

            return savedGroupName._id;
        } else {

            const newGroup = await new Group({
                ...groupFilterConditions,
                ...groupUpdateData,
                createdBy: user._id,
                updatedBy: user._id,
            }).save();

            return newGroup;
        }
    } catch (error) {

        return false;
    }
};

const insertGroupMember = async ({ group, subscriberId, memberIDs }) => {
    try {

        const existingMembers = await GroupMember.find({
            group: group,
            member: { $in: memberIDs },
            isDeleted: { $ne: true },
        }).select('member');

        const existingMemberIds = existingMembers.map((member) => member.member.toString());
        const existingMemberIdsSet = new Set(existingMemberIds);

        const newMembers = memberIDs.filter(userID => !existingMemberIdsSet.has(userID.toString()));


        const groupMembers = newMembers.map((userID) => ({
            group: group,
            member: userID,
            subscriber: subscriberId
        }));


        const result = await GroupMember.insertMany(groupMembers);
        await Group.findByIdAndUpdate(group, { $inc: { memberCount: result.length } });

        return true;
    } catch (error) {
        return false;
    }
}

const bulkInsertGroupMembers = async (subscriberId, groupId, users) => {
    try {
        const groupMembers = users.map(user => ({
            subscriber: subscriberId,
            group: groupId,
            member: user._id,
        }));

        const result = await GroupMember.insertMany(groupMembers, { ordered: false });
        return true;
    } catch (error) {
        return false;
    }
};

const removeGroupMember = async ({ group, subscriberId, memberIDs }) => {
    try {

        const existingMembers = await GroupMember.findOneAndDelete({
            group: group,
            member: memberIDs,
            isDeleted: { $ne: true },
        }).select('member');

        return true;
    } catch (error) {
        return false;
    }
}

const deleteUsers = async (users, errors) => {

    try {

        const getUsers = await User.find({ _id: { $in: users } });

        if (!getUsers || getUsers.length <= 0) {
            errors.push("User not found");
            return;
        }

        const deleteUsers = await DbTransactionHelper.performDbTransaction(async (session) => {


            const deletedUsers = getUsers.map(user => {
                return {
                    ...user.toObject(),
                    isDeleted: true
                };
            });

            const updateDeletedList = await DeletedUser.insertMany(deletedUsers, { session });

            if (updateDeletedList) {


                let deleteUsers = await User.deleteMany({ _id: { $in: users } }, { session });

                await Employee.updateMany(
                    { user: { $in: users } },
                    { $set: { isDeleted: true } },
                    { session }
                );

                await LearningPlanAssignment.deleteMany({ assignedLearnerId: { $in: users } }, { session });

                const getOverallDocs = await OverallTrainingProgress.find({ user: { $in: users } }).session(session);

                if (getOverallDocs.length > 0) {

                    const getOverallDocIds = getOverallDocs.map(doc => doc._id);
                    await TrainingProgress.deleteMany({ OverallTrainingProgress: { $in: getOverallDocIds } }, { session });

                }

                await OverallTrainingProgress.updateMany(
                    { user: { $in: users } },
                    { $set: { isDeleted: true } },
                    { session }
                );

                if (deleteUsers) {

                    const getAdminGroups = await Group.find({ groupAdmin: { $in: users } }).session(session);

                    if (getAdminGroups.length > 0) {
                        const deletedGroups = getAdminGroups.map(group => ({
                            ...group.toObject(),
                            isDeleted: true
                        }));

                        await DeletedGroup.insertMany(deletedGroups, { session });
                    }

                    let updateGroup;

                    updateGroup = await Group.updateMany(
                        { members: { $in: users } },
                        [
                            {
                                $set: {
                                    members: {
                                        $filter: {
                                            input: "$members",
                                            as: "member",
                                            cond: { $not: { $in: ["$$member", users] } }
                                        }
                                    }
                                }
                            },
                            {
                                $set: {
                                    memberCount: { $size: "$members" }
                                }
                            }
                        ],
                        { session }
                    );

                    const updateGroupMember = await GroupMember.updateMany(
                        { member: { $in: users } },
                        { $set: { isDeleted: true } },
                        { session }
                    );

                    if (updateGroupMember) {


                        //REMOVED DELETION MAIL

                        // const usersToDelete = getUsers;
                        // insertDeletionRequests(usersToDelete);

                        // const result = await sendDeletionEmailBulk();

                        return deleteUsers;
                    }

                    return deleteUsers;

                } else {
                    errors.push("Error while deleting users");
                    return;
                }

            } else {
                errors.push("Error while deleting users");
                return;
            }

        });

        return deleteUsers;

    } catch (error) {
        throw Error(error.message);

    }

}

const softDeleteUsers = async (users, errors) => {
   console.log(users,"users");
    try {

        const getUsers = await User.find({ _id: { $in: users }, isDeleted: false })
            .populate("subRoles", "name")
            .lean();

        if (!getUsers || getUsers.length === 0) {
            throw CustomError(ErrorName.USER_NOT_FOUND, "Users not found");
        }

        const isAdmin = user => user.subRoles?.some(role => role.name === "ADMIN");

        const adminsNotBeingDeleted = await User.find({
            _id: { $nin: users },
            isDeleted: false
        })
            .populate("subRoles", "name")
            .lean();

        const remainingAdmins = adminsNotBeingDeleted.filter(isAdmin);
        console.log("remainingAdmins", remainingAdmins.length)
        if (remainingAdmins.length === 0) {
            throw CustomError(ErrorName.FAILED_TO_DELETE_LAST_ADMIN, "At least one admin must remain in the system.");
        }



        const deleteUsers = await DbTransactionHelper.performDbTransaction(async (session) => {


            const deletedUsers = getUsers.map(user => {
                return {
                    ...user,
                    isDeleted: true
                };
            });
            const updateDeletedList = await DeletedUser.insertMany(deletedUsers, { session });

            if (updateDeletedList) {

                let deleteUsers = await User.deleteMany(
                    { _id: { $in: users } },
                    { session }
                );

                await Employee.updateMany(
                    { user: { $in: users } },
                    { $set: { isDeleted: true } },
                    { session }
                );

                await LearningPlanAssignment.updateMany(
                    { assignedLearnerId: { $in: users } },
                    { $set: { isDeleted: true } },
                    { session }
                );

                await OverallTrainingProgress.updateMany(
                    { user: { $in: users } },
                    { $set: { isDeleted: true } },
                    { session }
                );

                if (deleteUsers) {

                    const getAdminGroups = await Group.find({ groupAdmin: { $in: users } }).session(session);

                    if (getAdminGroups.length > 0) {
                        const deletedGroups = getAdminGroups.map(group => ({
                            ...group.toObject(),
                            isDeleted: true
                        }));

                        await DeletedGroup.insertMany(deletedGroups, { session });
                    }

                    let updateGroup;

                    updateGroup = await Group.updateMany(
                        { members: { $in: users } },
                        [
                            {
                                $set: {
                                    members: {
                                        $filter: {
                                            input: "$members",
                                            as: "member",
                                            cond: { $not: { $in: ["$$member", users] } }
                                        }
                                    }
                                }
                            },
                            {
                                $set: {
                                    memberCount: { $size: "$members" }
                                }
                            }
                        ],
                        { session }
                    );

                    const updateGroupMember = await GroupMember.updateMany(
                        { member: { $in: users } },
                        { $set: { isDeleted: true } },
                        { session }
                    );

                    try {
                        // Direct delete from UserSearchCache table
                        const userIdStrings = users.map(id => id.toString());
                        await UserSearchCache.deleteMany(
                            { userId: { $in: userIdStrings } },
                            { session }
                        );
                    } catch (error) {
                        throw CustomError(ErrorName.FAILED_TO_DELETE_USER, error.message,);
                    }

                    if (updateGroupMember) {
                        /*
                        for (const user of getUsers) {
                            const htmlContent = sendDeleteEmailToLearner(user.firstName);
                            await SendEmail({
                                receiverEmail: user.email,
                                subject: "Your account has been deleted",
                                htmlContent: htmlContent,
                            });
                        }
                        */
                        return deleteUsers;
                    }

                    return deleteUsers;

                } else {
                    errors.push("Error while deleting users");
                    return;
                }

            } else {
                errors.push("Error while deleting users");
                return;
            }

        });

        return deleteUsers;

    } catch (error) {
        throw CustomError(ErrorName.FAILED_TO_DELETE_USER, error.message,);

    }

}

const deleteUsersAfterGDPR = async (users, errors) => {

    try {

        const getUsers = await User.find({ _id: { $in: users } })
            .populate("subRoles", "name")
            .lean();

        if (!getUsers || getUsers.length === 0) {
            throw CustomError(ErrorName.USER_NOT_FOUND, "Users not found");
        }

        const isAdmin = user => user.subRoles?.some(role => role.name === "ADMIN");

        const adminsNotBeingDeleted = await User.find({
            _id: { $nin: users },
            isDeleted: false
        })
            .populate("subRoles", "name")
            .lean();

        const remainingAdmins = adminsNotBeingDeleted.filter(isAdmin);
        if (remainingAdmins.length === 0) {
            console.log("At least one admin must remain in the system.");
            throw CustomError(ErrorName.FAILED_TO_DELETE_LAST_ADMIN, "At least one admin must remain in the system.");
        }

        const trainingProgressesToBeDeleted = await OverallTrainingProgress.find({
            user: { $in: users },
            status: { $ne: "COMPLETED" }
        }).select("user _id trainingRegistration learningPlan training").lean();

        const trainingProgressesNotToBeDeleted = await OverallTrainingProgress.find({
            user: { $in: users },
            status: "COMPLETED"
        }).select("user _id learningPlan ").lean();


        const trainingProgressesToBeDeletedIds = trainingProgressesToBeDeleted.map(({ _id }) => _id);
        const removeIncompleteUserDataFromTrainingReg = trainingProgressesToBeDeleted.map(({ user, trainingRegistration }) => ({
            updateOne: {
                filter: { _id: trainingRegistration },
                update: { $pull: { users: user } }
            }
        }));

        const userlearningPlanIdMap = trainingProgressesNotToBeDeleted.reduce((acc, curr) => {
            const userId = curr.user.toString();
            const plans = Array.isArray(curr.learningPlan) ? curr.learningPlan : [curr.learningPlan];

            if (!acc[userId]) {
                acc[userId] = [];
            }

            acc[userId].push(...plans);
            return acc;
        }, {});

        // for removing duplicate learningplan ids
        for (const userId in userlearningPlanIdMap) {
            userlearningPlanIdMap[userId] = [...new Set(userlearningPlanIdMap[userId])];
        }

        const bulkDeleteOpsLPAssignments = Object.entries(userlearningPlanIdMap).map(([userId, allowedPlanIds]) => ({
            deleteMany: {
                filter: {
                    assignedLearnerId: userId,
                    learningPlanId: { $nin: allowedPlanIds }
                }
            }
        }));



        const deleteUsers = await DbTransactionHelper.performDbTransaction(async (session) => {


            // const deletedUsers = getUsers.map(user => {
            //     return {
            //         ...user,
            //         isDeleted: true
            //     };
            // });

            if (removeIncompleteUserDataFromTrainingReg.length > 0) {
                await TrainingRegistration.bulkWrite(removeIncompleteUserDataFromTrainingReg, { session });
            }
            if (bulkDeleteOpsLPAssignments.length > 0) {
                await LearningPlanAssignment.bulkWrite(bulkDeleteOpsLPAssignments, { session });
            }
            const markAsDeleted = await User.updateMany(
                { _id: { $in: users } },
                {
                    $set: {
                        isDeleted: true,
                        isRegistered: false,
                        subRoles: [],
                        deleteRequest: false,
                        deletionDate: new Date(),
                    },
                    $unset: {
                        email: "",
                        dummyPassword: "",
                        languagePreference: "",
                        currentVessel: "",
                        vesselStatus: "",
                        password: "",
                        isSignupAdminApproved: "",
                        UID: "",
                        lastLoginAt: "",
                        civilIdOrPassport: "",
                        roleAssignmentDate: "",
                        contentlanguages: "",
                        deleteRequestDate: "",
                        reasonForDelete: "",
                    },
                },
                { session }
            );
            // const updateDeletedList = await DeletedUser.insertMany(deletedUsers, { session });

            try {
                await updateByQueryToElasticSearch(
                    "users",
                    `
                ctx._source.isDeleted = true;
                ctx._source.isRegistered = false;
                ctx._source.subRoles = [];
                ctx._source.deleteRequest = false;
                ctx._source.deletionDate = params.deletionDate;

                ctx._source.remove("email");
                ctx._source.remove("dummyPassword");
                ctx._source.remove("languagePreference");
                ctx._source.remove("currentVessel");
                ctx._source.remove("vesselStatus");
                ctx._source.remove("password");
                ctx._source.remove("isSignupAdminApproved");
                ctx._source.remove("UID");
                ctx._source.remove("lastLoginAt");
                ctx._source.remove("civilIdOrPassport");
                ctx._source.remove("roleAssignmentDate");
                ctx._source.remove("contentlanguages");
                ctx._source.remove("deleteRequestDate");
                ctx._source.remove("reasonForDelete");
            `,
                    {
                        terms: {
                            userId: users, // assuming your ES documents have `userId` field that matches Mongo `_id`
                        },
                    },
                    {
                        deletionDate: new Date(),
                    }
                );
            } catch (error) {
                console.error("Error deleting users from ElasticSearch:", error);
                throw CustomError(ErrorName.FAILED_TO_DELETE_USER, error.message);

            }

            const deletedOverallTrainingProgresses = await OverallTrainingProgress.deleteMany(
                {
                    user: { $in: users },
                    status: { $ne: "COMPLETED" },
                },
                { session }
            );

            await TrainingProgress.deleteMany(
                {
                    overallTrainingProgress: { $in: trainingProgressesToBeDeletedIds },
                },
                { session },
            )

            if (markAsDeleted) {

                // let deleteUsers = await User.deleteMany(
                //     { _id: { $in: users } },
                //     { session }
                // );

                await Employee.updateMany(
                    { user: { $in: users } },
                    { $set: { isDeleted: true } },
                    { session }
                );

                // await LearningPlanAssignment.updateMany(
                //     { assignedLearnerId: { $in: users } },
                //     { $set: { isDeleted: true } },
                //     { session }
                // );

                // await OverallTrainingProgress.updateMany(
                //     { user: { $in: users } },
                //     { $set: { isDeleted: true } },
                //     { session }
                // );

                // if (deleteUsers) {

                const getAdminGroups = await Group.find({ groupAdmin: { $in: users } }).session(session);

                if (getAdminGroups.length > 0) {
                    const deletedGroups = getAdminGroups.map(group => ({
                        ...group.toObject(),
                        isDeleted: true
                    }));

                    await DeletedGroup.insertMany(deletedGroups, { session });
                }

                let updateGroup;

                updateGroup = await Group.updateMany(
                    { members: { $in: users } },
                    [
                        {
                            $set: {
                                members: {
                                    $filter: {
                                        input: "$members",
                                        as: "member",
                                        cond: { $not: { $in: ["$$member", users] } }
                                    }
                                }
                            }
                        },
                        {
                            $set: {
                                memberCount: { $size: "$members" }
                            }
                        }
                    ],
                    { session }
                );

                const updateGroupMember = await GroupMember.updateMany(
                    { member: { $in: users } },
                    { $set: { isDeleted: true } },
                    { session }
                );

                const noCourseDataToBeRemoved = trainingProgressesToBeDeleted.length == 0 && trainingProgressesNotToBeDeleted.length == 0;
                if (noCourseDataToBeRemoved) {
                    await User.deleteMany(
                        { _id: { $in: users } },
                        { session }
                    );
                    await Employee.deleteMany(
                        { user: { $in: users } },
                        { session }
                    );
                }

                if (updateGroupMember) {
                    /*
                    for (const user of getUsers) {
                        const htmlContent = sendDeleteEmailToLearner(user.firstName);
                        await SendEmail({
                            receiverEmail: user.email,
                            subject: "Your account has been deleted",
                            htmlContent: htmlContent,
                        });
                    }
                    */
                    return true;
                }

                return true;

                // } else {
                //     errors.push("Error while deleting users");
                //     return;
                // }

            } else {
                errors.push("Error while deleting users");
                return;
            }

        });

        return deleteUsers;

    } catch (error) {
        console.log(error);
        throw CustomError(ErrorName.FAILED_TO_DELETE_USER, error.message,);

    }

}

const restoreUsers = async (users, errors) => {
    try {
        const savedUsers = await DbTransactionHelper.performDbTransaction(async (session) => {

            const getDeletedUsers = await DeletedUser.find({ _id: { $in: users } }).session(session);

            if (!getDeletedUsers || getDeletedUsers.length <= 0) {
                errors.push("No deleted users found");
                return;
            }


            const restoredUsers = getDeletedUsers.map(deletedUser => {
                const userObject = deletedUser.toObject();
                userObject.isDeleted = false;
                return new User(userObject);
            });

            const insertRestoredUsers = await User.insertMany(restoredUsers, { session });

            if (!insertRestoredUsers) {
                errors.push("Error while restoring users");
                return;
            }


            await Employee.updateMany(
                { user: { $in: users } },
                { $set: { isDeleted: false } },
                { session }
            );


            const getDeletedGroups = await DeletedGroup.find({ groupAdmin: { $in: users }, isManagerDefault: true }).session(session);

            if (getDeletedGroups.length > 0) {
                const restoredGroups = getDeletedGroups.map(group => {
                    const groupObject = group.toObject();
                    groupObject.isDeleted = false;
                    return new Group(groupObject);
                });

                await Group.insertMany(restoredGroups, { session });
            }


            const restoreGroupMembers = await GroupMember.updateMany(
                { member: { $in: users }, isDeleted: true },
                { $set: { isDeleted: false } },
                { session }
            );

            const restoreOverallTrainingProgress = await OverallTrainingProgress.updateMany(
                { user: { $in: users }, isDeleted: true },
                { $set: { isDeleted: false } },
                { session }
            );

            const restoreLearningPlanAssignment = await LearningPlanAssignment.updateMany(
                { assignedLearnerId: { $in: users }, isDeleted: true },
                { $set: { isDeleted: false } },
                { session }
            );

            // const userGroupMembers = await GroupMember.find(
            //     { member: { $in: users }, isDeleted: false }
            // ).select('group member').session(session);
            // const groupUpdates = userGroupMembers.reduce((acc, groupMember) => {
            //     if (!acc[groupMember.group]) {
            //         acc[groupMember.group] = new Set();
            //     }
            //     acc[groupMember.group].add(groupMember.member.toString());
            //     return acc;
            // }, {});
            // const bulkOperations = Object.entries(groupUpdates).map(([groupId, members]) => ({
            //     updateOne: {
            //         filter: { _id: groupId },
            //         update: {
            //             $addToSet: { members: { $each: [...members] } },
            //             $inc: { memberCount: members.size }
            //         }
            //     }
            // }));
            // if (bulkOperations.length > 0) {
            //     const updateResult = await Group.bulkWrite(bulkOperations, { session });
            // }


            const deleteResult = await DeletedUser.deleteMany({ _id: { $in: users } }).session(session);

            return insertRestoredUsers;
        });

        return savedUsers;

    } catch (error) {
        errors.push(error.message);
        throw new Error(error.message);
    }
};

const validateUserRow = async (row, { empIds, emails, dbemployeeIds, dbEmails, designationNames, imoNumbers, vesselStatus, countriesListed }, rowIndex) => {

    const errors = [];

    if (Object.values(row).every(value => value === '' || value === null || value === undefined)) {
        return errors;
    }

    if (!row["First Name*"]) {
        errors.push(`First Name is missing in row ${rowIndex + 1}.`);
    } else if (!validateName(row["First Name*"])) {
        errors.push(`First Name is invalid. Name should only contain letters in row ${rowIndex + 1}.`);
        return errors;
    }

    if (row["Last Name"]) {
        if (!validateName(row["Last Name"])) {
            errors.push(`Last Name is invalid. Name should only contain letters in row ${rowIndex + 1}.`);
            return errors;
        }
    }

    if (!row["User ID*"]) {
        errors.push(`User ID is missing in row ${rowIndex + 1}`);
        return errors;
    }

    let normalizedId = row["User ID*"].toUpperCase();
    if (empIds.has(normalizedId)) {
        errors.push(`Duplicate User ID found in row ${rowIndex + 1} as ${row["User ID*"]}`);
        return errors;
    } else {
        empIds.add(normalizedId);
    }

    if (!row["Email*"]) {
        errors.push(`Email is missing in row ${rowIndex + 1}`);
        return errors;
    } else {
        const normalizedEmail = row["Email*"].toLowerCase();
        if (!Validator.isEmail(normalizedEmail)) {
            errors.push(`Invalid Email in row ${rowIndex + 1} as ${normalizedEmail}.`);
            return errors;
        } else if (emails.has(normalizedEmail)) {
            errors.push(`Duplicate Email found in row ${rowIndex + 1} as ${normalizedEmail}.`);
            return errors;
        } else {
            emails.add(normalizedEmail);
        }
    }

    if (!row["Employee Designation*"]) {
        errors.push(`Designation is missing in row ${rowIndex + 1}`);
        return errors;
    } else {
        const designation = row["Employee Designation*"]?.toLowerCase();
        if (!designationNames.some(name => name?.toLowerCase() === designation)) {
            errors.push(`Invalid Designation in row ${rowIndex + 1} as ${row["Employee Designation*"]}`);
            return errors;
        }
    }

    if (row["Vessel Status"]) {
        if (row["Vessel Status"].toUpperCase() === 'ONBOARDED') {
            errors.push(`Invalid Status in row ${rowIndex + 1} as ${row["Vessel Status"]}`);
            return errors;
        }
        if (row["Vessel Status"].toUpperCase() === 'ONBOARD') {
            row["Vessel Status"] = 'ONBOARDED'
        }
        const status = row["Vessel Status"].toLowerCase();
        if (!vesselStatus.some(statusOption => statusOption.toLowerCase() === status)) {
            errors.push(`Invalid Status in row ${rowIndex + 1} as ${row["Vessel Status"]}`);
            return errors;
        }
    }

    if (!row["Vessel Status"]) {
        row["Vessel Status"] = '';
    }

    if (row["Vessel IMO Number"]) {
        if (!imoNumbers.includes(row["Vessel IMO Number"])) {
            errors.push(`Invalid IMO Number in row ${rowIndex + 1} as ${row["Vessel IMO Number"]}`);
            return errors;
        }
    }

    if (!row["Vessel IMO Number"]) {
        row["Vessel IMO Number"] = '';
    }



    return errors;
}

function mapCSVRowToUser(row) {
    const mandatoryFields = [
        "First Name*",
        "Email*",
        "Designation*",
        "User ID*"
    ];

    Object.keys(row).forEach(key => {
        if (!mandatoryFields.includes(key)) {
            const fieldName = key;
            let fieldValue = row[key];
        }
    });

    const result = {
        firstName: row["First Name*"],
        lastName: row["Last Name"] ?? "",
        civilIdOrPassport: row["User ID*"]?.toUpperCase(),
        email: row["Email*"]?.toLowerCase(),
        designation: row["Employee Designation*"]?.toLowerCase(),
        imoNumber: row["Vessel IMO Number"],
        vesselStatus: row["Vessel Status"],
    };

    return result;
}

const sendBulkEmails = async (passwordEmailList) => {

    try {

        SqliteEmailHelper.insertEmails(passwordEmailList);
        const emails = SqliteEmailHelper.fetchEmailBatch();

        await sendNodeEmailBulk({ subject: 'Welcome To Seaverse!' });

    } catch (error) {
        console.error(`Error sending emails`, error);
    }

};
const validateName = (name) => {
    const nameRegex = /^[A-Za-z]+(\s[A-Za-z]+)*$/;
    const trimmedName = name.trim();
    return nameRegex.test(trimmedName);
};

const clear7dayOldRequests = async () => {
    try {
        const currentDate = new Date();
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const query = { createdAt: { $lte: sevenDaysAgo } };

        await DeleteRequestHistory.deleteMany({ isDeleted: true, ...query });
        await HistorySignupRequest.deleteMany({ signupStatus: 'REJECTED', ...query });
    }
    catch (error) {
        throw new Error(error.message);
    }
}
const clear7dayOldUsersWhoRejectedTAndC = async () => {
    try {
        const currentDate = new Date();
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const usersWhoRejected = await User.find({
            consents: {
                $elemMatch: {
                    consentType: consentTypes.INITIAL_LOGIN,
                    status: false,
                    timestamps: { $lte: sevenDaysAgo },
                }
            }
        })
            .select('_id');

        const rejectedUserIds = usersWhoRejected.map(user => user._id);

        if (rejectedUserIds.length === 0) {
            return "No users to delete";
        }
        await approveDeleteRequests(rejectedUserIds, false);

    }
    catch (error) {
        throw new Error(error.message);
    }
}


const scheduledForEveryDayMidnight = async () => {
    try {
        // Schedule the task to run every day at midnight
        CronHelper.schedule("0 0 * * *", async () => {

            //clear 7 day old user requests for userprofile deletion and signup requests
            await clear7dayOldRequests();

            //clear 7 day old users who rejected terms and conditions
            await clear7dayOldUsersWhoRejectedTAndC();

            //reject 30 day old user requests for userprofile deletion and approve 30 day old signup requests
            await reject30DayOldSignupRequests();
            await approve30DayOldDeleteRequests();

            //delete 5 year old course completion data
            await deleteCourseDataForUserDeleted5yearsAgo();
        });
    } catch (error) {
        throw new Error(error.message);
    }
};


const approve30DayOldDeleteRequests = async () => {
    try {
        const currentDate = new Date();
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const query = { deleteRequestDate: { $lte: thirtyDaysAgo } };

        const usersWhoRaisedDeleteRequest = await User.find({ deleteRequest: true, ...query });

        if (usersWhoRaisedDeleteRequest.length === 0) {
            return "No users to delete";
        }

        await approveDeleteRequests(usersWhoRaisedDeleteRequest);
    }
    catch (error) {
        throw new Error(error.message);
    }
}

const approveDeleteRequests = async (getUsers, isHistoryRequired = true) => {
    try {
        const input = {};
        input.users = getUsers.map(user => user._id);
        if (!getUsers || getUsers.length === 0) {
            return "no users to delete";
        }

        const isAdmin = user => user.subRoles?.some(role => role.name === "ADMIN");

        const adminsNotBeingDeleted = await User.find({
            _id: { $nin: input?.users },
            isDeleted: false,
        })
            .populate("subRoles", "name")
            .lean();

        const remainingAdmins = adminsNotBeingDeleted?.filter(isAdmin);

        if (remainingAdmins?.length === 1) {
            console.log("At least one admin must remain in the system.");
            throw CustomError(
                ErrorName.FAILED_TO_DELETE_LAST_ADMIN,
                "At least one admin must remain in the system."
            );
        }

        const userHistoryData = getUsers?.map(user => ({
            firstName: user?.firstName,
            lastName: user?.lastName,
            email: user?.email,
            isDeleted: true,
            civilIdOrPassport: user?.civilIdOrPassport,
            lastLoginAt: user?.lastLoginAt,
            reasonForDelete: user?.reasonForDelete,
            directSignup: user?.directSignup,
            deleteRequestDate: user?.deleteRequestDate,
            decisionDate: new Date(),
            isRegistered: false,
        }));

        let errors = [];

        const deleteUsers = await deleteUsersAfterGDPR(getUsers, errors);

        if (errors.length > 0) {
            throw CustomError(ErrorName.ERROR_DELETING_USER, `${errors[0]}`);
        }

        if (deleteUsers) {
            if (isHistoryRequired) {
                const updateDeleteRequestHistory = await DeleteRequestHistory.insertMany(
                    userHistoryData
                );

                if (updateDeleteRequestHistory) {
                    if (userHistoryData[0]?.isEmailNotification) {
                        const sendmailforApproval = await aws_helper.sendEmail({
                            receiverEmail: userHistoryData[0]?.email,
                            subject: "Delete request APPROVED",
                            htmlContent: DeleteRequestApproved({
                                firstName: userHistoryData[0]?.firstName,
                            }),
                        });
                        if (!sendmailforApproval) {
                            throw CustomError(
                                ErrorName.FAILED_TO_SEND_APPROVAL_EMAIL,
                                "Failed to send approval email"
                            );
                        }
                    }
                }
            }

            return "Successfully deleted";
        }
    } catch (error) {
        console.log(error);
        throw new Error(error.message);
    }
};

// const moveExpiredDeletedUsers = async () => {
//     CronHelper.schedule("0 0 * * *", async () => {
//         try {

//             const thirtyDaysAgo = new Date();
//             thirtyDaysAgo.setMinutes(thirtyDaysAgo.getMinutes() - 1);

//             const result = await DbTransactionHelper.performDbTransaction(async session => {

//                 const expiredUsers = await User.find({
//                     deleteRequestDate: { $lte: thirtyDaysAgo },
//                     isDeleted: true,
//                     isActive: false
//                 }).session(session);

//                 if (expiredUsers.length > 0) {
//                     const expiredUserIds = expiredUsers.map(user => user.id);

//                     const errors = [];
//                     const deletedUsers = await deleteUsers(expiredUserIds, errors);

//                     if (deletedUsers.length < 0) {
//                         console.error("Errors occurred while deleting users");
//                     }
//                 }

//                 return `${expiredUsers.length} users processed`;
//             });

//         } catch (error) {
//             console.error("Error occurred while processing expired users:", error);
//         }
//     });
// };

/*
const sendDeletionEmailBulk = async () => {
    try {
        let results = [];
        while (true) {
 
            const deletionBatch = await fetchDeletionBatch();
            if (deletionBatch.length === 0) {
                break;
            }
 
            const batchResults = await sendDeletionWithRetry(deletionBatch);
 
            results = results.concat(batchResults);
            await delay(200);
 
            const deletionIds = deletionBatch.map(email => email.id);
 
            // Filter successful emails to delete
            const successfulIds = [];
            batchResults.forEach((result, index) => {
                if (result.status === "fulfilled") {
                    successfulIds.push(deletionIds[index]);
                }
            });
 
            if (successfulIds.length > 0) {
                await deleteDeletionBatch(successfulIds);
            }
        }
 
        const success = results.filter(res => res.status === "fulfilled");
        const errors = results.filter(res => res.status === "rejected");
 
        return {
            status: "success",
            successCount: success.length,
            errorCount: errors.length,
            errors: errors.map(err => err.reason.message),
            message: `${success.length} deletion emails sent successfully, ${errors.length} failed.`,
        };
    } catch (error) {
        return {
            status: "error",
            message: error.message,
        };
    }
};
 
const sendDeletionWithRetry = async (deletionBatch, retryCount = 0) => {
    try {
        const emailPromises = deletionBatch.map(async (user) => {
            if (user.email?.trim()?.length) {
                return await SendEmail({
                    receiverEmail: user.email,
                    subject: "Your account has been deleted",
                    htmlContent: sendDeleteEmailToLearner(user.firstName)
                });
            } else {
                return Promise.reject(new Error("Invalid email address"));
            }
        });
 
        return await Promise.allSettled(emailPromises);
    } catch (error) {
        if (error.message.includes("Maximum sending rate exceeded") && retryCount < 5) {
            await delay(2 ** retryCount * 1000);
            return sendDeletionWithRetry(deletionBatch, retryCount + 1);
        }
        throw error;
    }
};
*/
module.exports = {
    scheduledForEveryDayMidnight,
    deleteUsers,
    softDeleteUsers,
    deleteUsersAfterGDPR,
    restoreUsers,
    sendInvitationMail,
    sendCourseInvitationMail,
    sendEnrollmentNotification,
    sendDeleteNotification,
    notifyEmployeeStatusChange,
    sendNotificationOnCRUD,
    sendNotificationOnBULK,
    generateUserUID,
    generateEmployeeUID,
    sendCredentialMail,
    generateDefaultGroup,
    insertGroupMember,
    removeGroupMember,
    sendNotificationOnBULKOutsideChildProcess,
    filterLearningPlans,
    enrollUsers,
    // moveExpiredDeletedUsers,
    sendNotificationOnBULK,
    sendWelcomeEmailBulk,
    updateEmployees: async ({ id, input, userId, subscriberId, role, userInfo }, context, session) => {

        const employeeFilterConditions = { subscriber: subscriberId };
        employeeFilterConditions.user = id;

        const existingEmployee = await Employee.findOne({ user: employeeFilterConditions.user }).populate({ path: "user", select: "currentVessel firstName lastName vesselStatus", populate: ({ path: "currentVessel", select: "name isActive" }) })
            .lean();

        if (!existingEmployee) throw CustomError(ErrorName.NOT_FOUND);

        let newVessel;

        //Encryption logic
        // input.user.firstName = input.user.firstName && encrypt(input.user.firstName.toLowerCase());
        // input.user.lastName = input.user.lastName ? encrypt(input.user.lastName.toLowerCase()) : "";
        // input.user.civilIdOrPassport = input.user.civilIdOrPassport && encrypt(input.user.civilIdOrPassport.toUpperCase());
        // input.user.email = input.user.email && encrypt(input.user.email.toLowerCase());
        if (input?.user?.currentVessel === '') {
            await UserVessel.updateMany(
                { user: existingEmployee?.user?._id, isActive: true },
                { isActive: false, vesselStatus: input.user.vesselStatus === '' ? null : input.user.vesselStatus, deletedAt: new Date() }
            );
        }
        console.log('input .user firstName', input.user.firstName);
        if (input?.user?.currentVessel) {

            newVessel = await Vessel.findById(input?.user?.currentVessel, { name: 1 }).lean();
            if (!newVessel) throw new CustomError(ErrorName.INVALID_VESSEL);

            if (input?.user?.currentVessel.toString() !== existingEmployee?.user?.currentVessel?._id.toString()) {

                await UserVessel.updateMany(
                    { user: existingEmployee?.user?._id, isActive: true },
                    { isActive: false, deletedAt: new Date() }
                );

                if (input?.user?.currentVessel !== '') {

                    await UserVessel.create({
                        user: existingEmployee?.user?._id,
                        vessel: ObjectId(input?.user?.currentVessel),
                        vesselStatus: input?.user?.vesselStatus === '' ? null : input?.user?.vesselStatus,
                    });
                    /*
                                        await NotificationHelper.createNotificationhelper({
                                            subscriber: subscriberId,
                                            titleValue: `User Vessel Updated Successfully`,
                                            messageValue: `User  ${existingEmployee?.user?.firstName} ${existingEmployee?.user?.lastName}" has been assigned to vessel ${newVessel?.name} by ${userInfo?.firstName} ${userInfo?.lastName}`,
                                            notificationType: NotificationType.USER_VESSEL_UPDATE,
                                            notifyAllAdmin: true,
                                            affected: [
                                                {
                                                    targetRef: "User",
                                                    target: existingEmployee?.user?._id,
                                                },
                                            ],
                                            icon: notificationiconEnum.SUCCESS,
                                            createdBy: userInfo,
                                        });
                     
                                        await NotificationHelper.createNotificationhelper({
                                            subscriber: subscriberId,
                                            titleValue: `Your Vessel has been Updated`,
                                            messageValue: `Your have been assigned to vessel  ${newVessel?.name} by ${userInfo?.firstName} ${userInfo?.lastName}`,
                                            notificationType: NotificationType.USER_VESSEL_UPDATE,
                                            notifyAllAdmin: false,
                                            affected: [
                                                {
                                                    targetRef: "User",
                                                    target: existingEmployee?.user?._id,
                                                },
                                            ],
                                            notifiers: [existingEmployee?.user?._id],
                                            employeeNotifiers: [existingEmployee?.user?._id],
                                            icon: notificationiconEnum.SUCCESS,
                                            createdBy: userInfo,
                                        });
                      */
                }

            }

        }
        /* 
                if (input?.user?.vesselStatus || input?.user?.vesselStatus === '') {
        
                    await UserVessel.findOneAndUpdate(
                        { user: existingEmployee?.user?._id, isActive: true },
                        { vesselStatus: input?.user?.vesselStatus === '' ? null : input?.user?.vesselStatus }
                    )
        
                    await NotificationHelper.createNotificationhelper({
                        subscriber: subscriberId,
                        titleValue: `User status Updated Successfully`,
                        messageValue: `User  ${existingEmployee?.user?.firstName} ${existingEmployee?.user?.lastName}'s status updated.`,
        
                        notificationType: NotificationType.USER_VESSEL_UPDATE,
                        notifyAllAdmin: true,
                        affected: [
                            {
                                targetRef: "User",
                                target: existingEmployee?.user?._id,
                            },
                        ],
                        icon: notificationiconEnum.SUCCESS,
                        createdBy: userInfo,
                    });
        
                    await NotificationHelper.createNotificationhelper({
                        subscriber: subscriberId,
                        titleValue: `Your vessel status has been Updated`,
                        messageValue: input?.user?.vesselStatus === '' ? 'Your vessel status has been removed' : `Your vessel status has been updated to ${input?.user?.vesselStatus}`,
                        notificationType: NotificationType.USER_VESSEL_UPDATE,
                        notifyAllAdmin: false,
                        affected: [
                            {
                                targetRef: "User",
                                target: existingEmployee?.user?._id,
                            },
                        ],
                        notifiers: [existingEmployee?.user?._id],
                        employeeNotifiers: [existingEmployee?.user?._id],
                        icon: notificationiconEnum.SUCCESS,
                        createdBy: userInfo,
                    });
        
                }
         */
        const updatedUser = await UserHelper.updateUser(
            {
                id: id,
                input: {
                    ...input.user
                },
            },
            { currentRole: role }
        );

        let savedEmployee;

        if (updatedUser) {
            savedEmployee = await Employee.findOne({ user: updatedUser._id }).populate('user');
        }

        if (input.empDesignation) {
            const existingDesignation = await Designation.findById(input.empDesignation);

            if (!existingDesignation) throw new CustomError(ErrorName.INVALID_DESIGNATION);

            if (savedEmployee?.empDesignation?.toString() != input.empDesignation?.toString()) {
                savedEmployee.empDesignation = existingDesignation._id;
                savedEmployee.designation = existingDesignation.name;
                await savedEmployee.save();
            }
        }



        // Offload only filterLearningPlans to background child process (time-consuming operation)
        try {
            const { fork } = require('child_process');
            const path = require('path');

            const backgroundProcessPath = path.join(__dirname, 'employee_update_background_process.js');
            const child = fork(backgroundProcessPath);

            // Send data to child process
            child.send({
                userId: id,
                subscriberId: subscriberId,
                context: context,
                session: session
            });

            // Handle child process messages (optional - for logging)
            child.on('message', (message) => {
                if (message.success) {
                    console.log(`✅ Background learning plan update completed for user ${id}`);
                } else {
                    console.error(`⚠️ Background learning plan update failed for user ${id}:`, message.error);
                }
            });

            // Handle child process errors
            child.on('error', (error) => {
                console.error(`❌ Background process error for user ${id}:`, error);
            });

            // Detach child process so it doesn't block the main process
            child.unref();

            console.log(`🚀 Background learning plan update process started for user ${id}`);
        } catch (error) {
            console.error('Failed to start background process:', error);
            // Don't throw - the main update was successful
        }

        // Update ElasticSearch in the main API (synchronous for immediate search consistency)
        try {
            const userVesselsDetails = await Vessel.find({ _id: savedEmployee.user?.currentVessel, isDeleted: false, isActive: true }).populate('typeOfVessel', '_id name');

            const scriptSource = `
                ctx._source.employeeId = params.employeeId;
                ctx._source.UID = params.UID;
                ctx._source.designation = params.designation;
                ctx._source.empDesignation = params.empDesignation;
                ctx._source.bulkId = params.bulkId;
                ctx._source.regType = params.regType;
                ctx._source.isActive = params.isActive;
                ctx._source.isDeleted = params.isDeleted;
                ctx._source.subscriber = params.subscriber;
                ctx._source.createdAt = params.createdAt;
                ctx._source.updatedAt = params.updatedAt;
                ctx._source.firstName = params.firstName;
                ctx._source.lastName = params.lastName;
                ctx._source.email = params.email;
                ctx._source.civilIdOrPassport = params.civilIdOrPassport;
                ctx._source.languagePreference = params.languagePreference;
                ctx._source.role = params.role;
                ctx._source.subRoles = params.subRoles;
                ctx._source.isVerified = params.isVerified;
                ctx._source.isRegistered = params.isRegistered;
                ctx._source.superAdmin = params.superAdmin;
                ctx._source.deleteRequest = params.deleteRequest;
                ctx._source.isDeleted_user = params.isDeleted_user;
                ctx._source.directSignup = params.directSignup;
                ctx._source.contentlanguages = params.contentlanguages;
                ctx._source.currentVessel = params.currentVessel;
                ctx._source.vesselStatus = params.vesselStatus;
                ctx._source.isEmailNotification = params.isEmailNotification;
                ctx._source.isPushNotification = params.isPushNotification;
                ctx._source.lastLoginAt = params.lastLoginAt;
                ctx._source.isSignupAdminAprroved = params.isSignupAdminAprroved;
                ctx._source.vesselName = params.vesselName;
                ctx._source.vesselIsActive = params.vesselIsActive;
                ctx._source.vesselId = params.vesselId;
                ctx._source.vesselIsDeleted = params.vesselIsDeleted;
                ctx._source.typeOfVesselName = params.typeOfVesselName;
                ctx._source.tyepOfVesselId = params.tyepOfVesselId;
                ctx._source.userCreatedAt = params.userCreatedAt;
                ctx._source.userUpdatedAt = params.userUpdatedAt;
            `;

            const params = {
                employeeId: savedEmployee._id?.toString(),
                UID: savedEmployee.UID,
                designation: savedEmployee.designation,
                empDesignation: savedEmployee.empDesignation?.toString(),
                bulkId: savedEmployee.bulkId,
                regType: savedEmployee.regType,
                isActive: savedEmployee.isActive,
                isDeleted: savedEmployee.isDeleted,
                subscriber: savedEmployee.subscriber?.toString(),
                createdAt: savedEmployee.createdAt,
                updatedAt: savedEmployee.updatedAt,
                firstName: savedEmployee.user?.firstName,
                lastName: savedEmployee.user?.lastName,
                email: savedEmployee.user?.email,
                civilIdOrPassport: savedEmployee.user?.civilIdOrPassport,
                languagePreference: savedEmployee.user?.languagePreference,
                role: savedEmployee.user?.role,
                subRoles: savedEmployee.user?.subRoles,
                isVerified: savedEmployee.user?.isVerified,
                isRegistered: savedEmployee.user?.isRegistered,
                superAdmin: savedEmployee.user?.superAdmin,
                deleteRequest: savedEmployee.user?.deleteRequest,
                isDeleted_user: savedEmployee.user?.isDeleted,
                directSignup: savedEmployee.user?.directSignup,
                contentlanguages: savedEmployee.user?.contentlanguages,
                currentVessel: savedEmployee.user?.currentVessel?.toString(),
                vesselStatus: savedEmployee.user?.vesselStatus,
                isEmailNotification: savedEmployee.user?.isEmailNotification,
                isPushNotification: savedEmployee.user?.isPushNotification,
                lastLoginAt: savedEmployee.user?.lastLoginAt,
                isSignupAdminAprroved: savedEmployee.user?.isSignupAdminAprroved,
                vesselName: userVesselsDetails[0]?.name === undefined ? null : userVesselsDetails[0]?.name,
                vesselIsActive: userVesselsDetails[0]?.isActive === undefined ? null : userVesselsDetails[0]?.isActive,
                vesselId: userVesselsDetails[0]?._id === undefined ? null : userVesselsDetails[0]?._id.toString(),
                vesselIsDeleted: userVesselsDetails[0]?.isDeleted === undefined ? null : userVesselsDetails[0]?.isDeleted,
                typeOfVesselName: userVesselsDetails[0]?.typeOfVessel?.name === undefined ? null : userVesselsDetails[0]?.typeOfVessel?.name,
                tyepOfVesselId: userVesselsDetails[0]?.typeOfVessel?._id === undefined ? null : userVesselsDetails[0]?.typeOfVessel?._id.toString(),
                userCreatedAt: savedEmployee.user?.createdAt,
                userUpdatedAt: savedEmployee.user?.updatedAt,
            };

            await updateByQueryToElasticSearch(
                "users",
                scriptSource,
                { term: { userId: savedEmployee.user?._id?.toString() } },
                params
            );
        } catch (err) {
            console.error("Error updating document in Elastic:", err);
        }

        return savedEmployee;

    },
    createBulkEmployee: async ({ userList, emailsLists, civilIds }, context) => {
        const { role, userId, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [
                    Permission.CREATE_EMPLOYEE,
                    Permission.CREATE_TRAINING_REGISTRATION,
                ],
                requiredAll: false,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

        const designationNames = [...new Set(userList.map(user => user.designation))];

        const designationNamesRegex = designationNames.map(name => new RegExp(`^${name}$`, 'i'));

        const password = await CryptoHelper.hash(process.env.USER_DUMMY_PASSWORD, 10)

        const invitationList = [];


        try {

            const savedEmployees = await DbTransactionHelper.performDbTransaction(async session => {

                const [existingUsers, existingDesignations] = await Promise.all([
                    User.find({ $or: [{ email: { $in: emailsLists } }, { civilIdOrPassport: { $in: civilIds } }] }).select('email civilIdOrPassport'),
                    Designation.find({ name: { $in: designationNamesRegex } }).select('name _id isManager')
                ]);

                const designationMap = new Map(
                    existingDesignations.map(designation => [
                        designation.name,
                        { id: designation._id, isManager: designation.isManager }
                    ])
                );

                const newDesignations = designationNames.filter(name => !designationMap.has(name)).map(name => ({ name: name, subscriber: subscriberId, createdBy: userId }));
                if (newDesignations.length > 0) {
                    const insertedDesignations = await Designation.insertMany(newDesignations);
                    insertedDesignations.forEach(designation => {
                        designationMap.set(designation.name, designation._id);
                    });
                }

                const newUsersData = userList.filter(user =>
                    !existingUsers.some(existingUser =>
                        existingUser.email === user.email ||
                        existingUser.civilIdOrPassport === user.civilIdOrPassport
                    )
                ).map(user => ({
                    email: user.email,
                    civilIdOrPassport: user.civilIdOrPassport,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    role: user.role,
                    password: password,
                    isRegistered: true,
                    subscriber: subscriberId,
                }));

                if (newUsersData.length == 0) {
                    throw CustomError(ErrorName.ALREADY_EXIST);
                }

                const bulkId = uuidv4();
                const usersToInsert = newUsersData.map(user => ({
                    updateOne: {
                        filter: { email: user.email },
                        update: {
                            $setOnInsert: {
                                email: user.email,
                                civilIdOrPassport: user.civilIdOrPassport,
                                firstName: user.firstName,
                                lastName: user.lastName,
                                role: user.role,
                                password: password,
                                isRegistered: true,
                                subscriber: subscriberId,
                            }
                        },
                        upsert: true
                    }
                }));

                await User.bulkWrite(usersToInsert, { session });

                const insertedUsers = await User.find({ email: { $in: userList.map(u => u.email) } }).session(session);

                const allManagers = [
                    ...insertedUsers.filter(user => {
                        const originalUser = userList.find(u => u.email === user.email);
                        if (!originalUser) return false;

                        const designation = designationMap.get(originalUser.designation);
                        return designation && designation.isManager;
                    }),
                    ...additionalManagers
                ];

                const managerMap = new Map(
                    allManagers.map(manager => [manager.email, manager._id])
                );

                const employeesToInsert = insertedUsers.map(user => {
                    const originalUserData = userList.find(u => u.email === user.email);
                    invitationList.push({
                        userData: user
                    });
                    return {
                        updateOne: {
                            filter: { user: user._id },
                            update: {
                                $setOnInsert: {
                                    user: user._id,
                                    subscriber: subscriberId,
                                    empDesignation: designationMap.get(originalUserData.designation).id,
                                    managerObjectId: managerMap.get(originalUserData.managerEmail),
                                    customField: originalUserData.customField,
                                    bulkId: bulkId,
                                    regType: 2
                                }
                            },
                            upsert: true
                        }
                    };
                });

                await Employee.bulkWrite(employeesToInsert, { session });

                const newEmployees = await Employee.find({ UID: { $exists: false } }).session(session).lean();

                const uidUpdates = await Promise.all(newEmployees.map(async (employee) => {
                    const UID = await generateEmployeeUID({ subscriberId, session });
                    return {
                        updateOne: {
                            filter: { _id: employee._id },
                            update: { UID },
                            upsert: false
                        }
                    };
                }));

                await Employee.bulkWrite(uidUpdates, { session });

                const groupOperations = allManagers.map(async manager => {
                    const groupName = `${manager.firstName} ${manager.lastName}`;
                    const groupData = {
                        groupName: groupName,
                        groupAdmin: manager._id,
                        subscriber: subscriberId,
                        createdBy: manager._id,
                        updatedBy: manager._id
                    };

                    const group = await Group.findOneAndUpdate(
                        { groupAdmin: manager._id, subscriber: subscriberId, isManagerDefault: true },
                        { $setOnInsert: groupData },
                        { upsert: true, new: true, lean: true, session }
                    );

                    const groupMemberData = {
                        group: group._id,
                        member: manager._id,
                        subscriber: subscriberId
                    };

                    await GroupMember.findOneAndUpdate(
                        { group: group._id, member: manager._id, isDeleted: { $ne: true } },
                        { $setOnInsert: groupMemberData },
                        { upsert: true, new: true, lean: true, session }
                    );

                    const employeesToAdd = userList.filter(user => user.managerEmail === manager.email);

                    const employeeGroupMembers = employeesToAdd.map(user => ({
                        group: group._id,
                        member: insertedUsers.find(u => u.email === user.email)._id,
                        subscriber: subscriberId
                    }));

                    if (employeeGroupMembers.length > 0) {
                        await GroupMember.insertMany(employeeGroupMembers, { session });
                    }

                    return group;
                });

                await Promise.all(groupOperations);
                return insertedUsers;
            });
            if (savedEmployees.length == 0) throw CustomError(ErrorName.FAILED);
            try {

                invitationList.forEach(obj => {
                    sendCredentialMail(obj);
                });

            } catch (error) {
                console.error(`Failed to send email to ${obj.email}:`, error);
            }

            return savedEmployees.length;
        } catch (error) {
            throw CustomError(ErrorName.FAILED);
        }
    },
    createEmployees: async ({ input }, context) => {
        const { role, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [
                    Permission.CREATE_EMPLOYEE,
                    Permission.CREATE_TRAINING_REGISTRATION,
                ],
                requiredAll: false,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

        if (!input.users?.length) throw CustomError(ErrorName.ARGUMENTS_REQUIRED);

        const notificationList = [];
        const courseInvitationList = [];
        const invitationList = [];
        let savedBatch;

        const savedEmployees = await DbTransactionHelper.performDbTransaction(async session => {
            const savedEmployees = [];

            for (const user of input.users) {

                user.password = user.password ? await CryptoHelper.hash(user.password, 10) : await CryptoHelper.hash(process.env.USER_DUMMY_PASSWORD, 10);

                if (input.empDesignation) {
                    const existingDesignation = await Designation.findById(input.empDesignation);

                    if (!existingDesignation) throw new CustomError(ErrorName.INVALID_DESIGNATION);

                }

                let userRole = Role.LEARNER;

                const savedUserRaw = await User.findOneAndUpdate(
                    { email: { $regex: new RegExp(`^${user.email}$`, "i") } },
                    {
                        $setOnInsert: {
                            subscriber: subscriberId,
                            ...user,
                            role: userRole,
                            isRegistered: true,
                        },
                    },
                    {
                        upsert: true,
                        new: true,
                        setDefaultsOnInsert: true,
                        runValidators: true,
                        lean: true,
                        rawResult: true,
                        session,
                    }
                );

                if (!savedUserRaw || !savedUserRaw.value) throw CustomError(ErrorName.FAILED);
                let savedUser = savedUserRaw.value;


                if (!savedUserRaw.lastErrorObject.updatedExisting) {
                    savedUser = await User.findByIdAndUpdate(
                        savedUser._id,
                        { UID: await generateUserUID({ session }) },
                        {
                            upsert: false,
                            new: true,
                            lean: true,
                            session,
                        }
                    );
                }

                let employeeUpdate = {
                    $setOnInsert: {
                        subscriber: subscriberId,
                        user: savedUser,
                        branch: input.branch,
                        organization: input.organization,
                        empDesignation: input.empDesignation,
                    },
                };

                if (input.customField || user.customField) {
                    if (input.customField) employeeUpdate.customField = input.customField;
                    else if (user.customField) employeeUpdate.customField = user.customField;
                }

                const savedEmployeeRaw = await Employee.findOneAndUpdate(
                    { user: savedUser._id },
                    employeeUpdate,
                    {
                        upsert: true,
                        new: true,
                        setDefaultsOnInsert: true,
                        runValidators: true,
                        lean: true,
                        rawResult: true,
                        session,
                    }
                );

                if (!savedEmployeeRaw || !savedEmployeeRaw.value)
                    throw CustomError(ErrorName.FAILED);
                let savedEmployee = savedEmployeeRaw.value;

                if (!savedEmployeeRaw.lastErrorObject.updatedExisting) {
                    savedEmployee = await Employee.findByIdAndUpdate(
                        savedEmployee._id,
                        { UID: await generateEmployeeUID({ subscriberId, session }) },
                        {
                            upsert: false,
                            new: true,
                            lean: true,
                            session,
                        }
                    );
                }

                invitationList.push({
                    userData: savedUser
                });

                savedEmployees.push({ ...savedEmployee, user: savedUser });
            }

            // Index to cache within transaction for atomicity
            const cacheDocuments = [];
            for (const emp of savedEmployees) {
                const designation = await Designation.findById(emp.empDesignation).session(session).lean();
                const vessel = emp.user.currentVessel ? await Vessel.findById(emp.user.currentVessel).session(session).lean() : null;
                const vesselType = vessel?.typeOfVessel ? await VesselType.findById(vessel.typeOfVessel).session(session).lean() : null;

                const cacheDoc = {
                    id: emp.user._id,
                    userId: emp.user._id,
                    employeeId: emp._id,
                    UID: emp.user.UID || emp.UID,
                    subscriber: emp.user.subscriber,
                    firstName: emp.user.firstName,
                    lastName: emp.user.lastName,
                    email: emp.user.email,
                    civilIdOrPassport: emp.user.civilIdOrPassport,
                    role: emp.user.role,
                    subRoles: emp.user.subRoles || [],
                    superAdmin: emp.user.superAdmin || false,
                    designation: designation?.name || null,
                    empDesignation: emp.empDesignation || null,
                    regType: emp.regType || 1,
                    bulkId: emp.bulkId || null,
                    currentVessel: emp.user.currentVessel || null,
                    vesselName: vessel?.name || null,
                    vesselId: vessel?._id || null,
                    vesselStatus: emp.user.vesselStatus || null,
                    vesselIsActive: vessel?.isActive || false,
                    vesselIsDeleted: vessel?.isDeleted || false,
                    typeOfVesselName: vesselType?.name || null,
                    tyepOfVesselId: vesselType?._id || null,
                    isActive: emp.user.isActive,
                    isVerified: emp.user.isVerified || false,
                    isRegistered: emp.user.isRegistered !== undefined ? emp.user.isRegistered : true,
                    isDeleted: emp.user.isDeleted || false,
                    isDeleted_user: emp.user.isDeleted || false,
                    isSignupAdminAprroved: emp.user.isSignupAdminAprroved,
                    isResetPasswordDialog: emp.user.isResetPasswordDialog || false,
                    deleteRequest: emp.user.deleteRequest || false,
                    directSignup: emp.user.directSignup || false,
                    languagePreference: emp.user.languagePreference || 'en',
                    contentlanguages: emp.user.contentlanguages || ['english'],
                    isEmailNotification: emp.user.isEmailNotification !== undefined ? emp.user.isEmailNotification : true,
                    isPushNotification: emp.user.isPushNotification !== undefined ? emp.user.isPushNotification : true,
                    enrolledCourses: 0,
                    averageCourseProgress: 0,
                    lastLoginAt: emp.user.lastLoginAt,
                    userCreatedAt: emp.user.createdAt,
                    userUpdatedAt: emp.user.updatedAt,
                };
                cacheDocuments.push(cacheDoc);
            }

            if (cacheDocuments.length > 0) {
                await bulkIndexDocumentsToElasticSearch("users", cacheDocuments, session);
            }

            return savedEmployees;
        });

        if (!savedEmployees) throw CustomError(ErrorName.FAILED);

        sendEnrollmentNotification(notificationList);

        if (input.training) {
            LogHelper.logActivity({
                subscriber: subscriberId,
                logType: LogType.TRAINING_REGISTRATION_LOG,
                operation: "CREATE",
                ipInfo: context.ipInfo,
                affected:
                    notificationList?.map(x => ({
                        targetRef: "TrainingRegistration",
                        target: x?.trainingRegistration?._id,
                    })) ?? [],
                additionalInfo: [
                    {
                        infoType: "TRAINING_REGISTRATION_INFO",
                        infoData: JSON.stringify(input),
                    },
                ],
                createdBy: userInfo,
            });
        } else {
            LogHelper.logActivity({
                subscriber: subscriberId,
                logType: LogType.EMPLOYEE_LOG,
                operation: "CREATE",
                ipInfo: context.ipInfo,
                affected:
                    savedEmployees?.map(x => ({
                        targetRef: "Employee",
                        target: x?._id,
                    })) ?? [],
                additionalInfo: [
                    {
                        infoType: "EMPLOYEE_INFO",
                        infoData: JSON.stringify(input),
                    },
                ],
                createdBy: userInfo,
            });
        }

        courseInvitationList.forEach(obj => {
            sendCourseInvitationMail(obj);
        });

        invitationList.forEach(obj => {
            sendCredentialMail(obj);
        });
        console.log('this is saved employees', savedEmployees);
        return {
            batch: savedBatch,
            employees: savedEmployees,
            totalCount: savedEmployees.length,
        };
    },

    createEmployeesBackgroundTask: async (users, emailsArray, empIdsArray, subscriberId, userId, newFileName, saveCSV, jobId, context) => {

        const existingDesignations = await Designation.find({ isDeleted: false }).lean();
        const adminUser = await User.findById(userId);
        const { userInfo } = AuthUser(context);
        let userCount = 0;

        const caseInsensitiveEmpIdArray = empIdsArray.map((id) => new RegExp(`^${id}$`, 'i'));

        // Filter out users with missing required fields before processing
        users = users.filter(user => user.civilIdOrPassport && user.email);

        // Check for duplicates within the CSV data itself
        const csvEmails = new Map(); // Use Map to track row numbers
        const csvEmpIds = new Map();
        const duplicateErrors = [];

        console.log(`Processing ${users.length} users after filtering missing fields`);

        users = users.filter((user, index) => {
            const email = user.email?.trim().toLowerCase();
            const empId = user.civilIdOrPassport?.trim().toUpperCase();

            if (csvEmails.has(email)) {
                const firstOccurrence = csvEmails.get(email);
                duplicateErrors.push(`Row ${index + 1}: Duplicate email found in CSV - ${email} (first seen at row ${firstOccurrence})`);
                console.log(`Duplicate email detected: ${email} at row ${index + 1} (first seen at row ${firstOccurrence})`);
                return false;
            }

            if (csvEmpIds.has(empId)) {
                const firstOccurrence = csvEmpIds.get(empId);
                duplicateErrors.push(`Row ${index + 1}: Duplicate User ID found in CSV - ${empId} (first seen at row ${firstOccurrence})`);
                console.log(`Duplicate User ID detected: ${empId} at row ${index + 1} (first seen at row ${firstOccurrence})`);
                return false;
            }

            csvEmails.set(email, index + 1);
            csvEmpIds.set(empId, index + 1);
            return true;
        });

        console.log(`After duplicate removal: ${users.length} users remaining, ${duplicateErrors.length} duplicates found`);

        users = users.map(user => {
            return {
                ...user,
                firstName: encrypt(user.firstName?.trim().toLowerCase()),
                lastName: user.lastName?.trim().toLowerCase() ? encrypt(user.lastName.trim().toLowerCase()) : '',
                civilIdOrPassport: user.civilIdOrPassport ? encrypt(user.civilIdOrPassport.trim().toUpperCase()) : '',
                email: encrypt(user.email?.trim().toLowerCase()),
            }
        })

        emailsArray = emailsArray.map((email) => encrypt(email.trim().toLowerCase()));
        empIdsArray = empIdsArray.map((id) => encrypt(id.trim().toUpperCase()));

        const existingUsers = await User.find({
            $or: [
                { civilIdOrPassport: { $in: empIdsArray } },
                { email: { $in: emailsArray } }
            ]
        }).lean();

        let existingEmailsInDB = new Map();
        let existingEmpIdsInDB = new Map();

        existingUsers.forEach(user => {
            if (user.civilIdOrPassport && user.email) {
                const employeeId = user.civilIdOrPassport?.toUpperCase();
                const email = user.email.toLowerCase();

                existingEmailsInDB.set(employeeId, email);
                existingEmpIdsInDB.set(email, employeeId);
            }
        })

        const existingEmpIdEmailMap = existingUsers.map(user => ({
            [user.civilIdOrPassport?.toLowerCase()]: user.email?.toLowerCase()
        }));


        const existingEmailEmpIdMap = existingUsers.map(user => ({
            [user.email?.toLowerCase()]: user.civilIdOrPassport?.toLowerCase()
        }))



        const getAllDBUsers = await User.find().select('email civilIdOrPassport');
        const getAllDBEmails = getAllDBUsers.map(user => user.email?.toLowerCase());
        const getAllDBEmpIds = getAllDBUsers.map(user => user.civilIdOrPassport?.toUpperCase());
        let errors = [...duplicateErrors];
        const updates = [];
        const inserts = [];

        // If there are duplicate errors, return early
        if (duplicateErrors.length > 0) {
            return {
                success: false,
                errors: errors,
                message: `CSV contains duplicate entries. Please fix duplicates and try again.`
            };
        }

        let userIndex = 0;


        const existingVessels = await Vessel.find({ isDeleted: false, isActive: true });

        const vesselMap = new Map(
            existingVessels.map(vessel => [
                vessel.imoNumber,
                { id: vessel._id, typeOfVessel: vessel.typeOfVessel }
            ])
        );



        let updatedEmpIds = [];
        let updatedEmailIds = [];
        const vesselAssociations = [];
        let passwordEmailList = [];

        const subscriber = await Subscriber.findOne();
        let subscriber_Id;
        if (subscriber) subscriber_Id = subscriber._id;

        console.time('userValidationLoop');
        for (const user of users) {
            // Skip users with missing required fields
            if (!user.civilIdOrPassport || !user.email) {
                errors.push(`Row ${userIndex + 1}: Missing required fields (User ID or Email)`);
                userIndex++;
                continue;
            }

            const existingEmpIdsMap = existingEmpIdEmailMap.find(empObj => empObj[user.civilIdOrPassport?.toLowerCase()]);
            const existingEmailIdsMap = existingEmailEmpIdMap.find(emailObj => emailObj[user.email?.toLowerCase()]);


            if (existingEmpIdsMap) {

                const email = existingEmpIdsMap[user.civilIdOrPassport?.toLowerCase()];

                if (existingEmailIdsMap) {

                    const empId = existingEmailIdsMap[user.email?.toLowerCase()]?.toUpperCase();

                    if (empId !== user.civilIdOrPassport?.toUpperCase() && existingEmailsInDB.has(user.civilIdOrPassport?.toUpperCase())) {

                        errors.push(errors.push(`Conflict in Row ${userIndex + 1}: The provided User ID or Email ID is already associated with another user.`));
                        break;

                    } else {

                        updates.push({
                            updateMany: {
                                filter: { email: user.email },
                                update: {
                                    $set: {
                                        firstName: user.firstName,
                                        lastName: user.lastName,
                                        civilIdOrPassport: user.civilIdOrPassport,
                                        vesselStatus: user?.vesselStatus && user?.vesselStatus.trim() !== '' ? user.vesselStatus?.toUpperCase() : null,
                                        currentVessel: user?.imoNumber && user?.imoNumber.trim() !== '' ? vesselMap.get(user.imoNumber)?.id || null : null,
                                        isRegistered: false, // to enter users in unregistered state
                                    },
                                },
                            },
                        });

                        updatedEmailIds.push(user.email);

                        vesselAssociations.push({
                            email: user.email,
                            imoNumber: user.imoNumber && user.imoNumber.trim() !== '' ? user.imoNumber || null : null,
                            vesselStatus: user?.vesselStatus && user?.vesselStatus.trim() !== '' ? user.vesselStatus?.toUpperCase() : null,
                            typeOfVessel: vesselMap.get(user.imoNumber)?.typeOfVessel,
                        });

                    }

                } else if (email !== user.email?.toLowerCase() && existingEmpIdsInDB.has(user.email?.toLowerCase())) {

                    errors.push(errors.push(`Conflict in Row ${userIndex + 1}: The provided User ID or Email ID is already associated with another user`));
                    break;


                } else {

                    updates.push({
                        updateMany: {
                            filter: { civilIdOrPassport: { $regex: `^${user.civilIdOrPassport}$`, $options: 'i' } },
                            update: {
                                $set: {
                                    firstName: user.firstName,
                                    lastName: user.lastName,
                                    email: user.email,
                                    vesselStatus: user?.vesselStatus && user?.vesselStatus.trim() !== '' ? user.vesselStatus?.toUpperCase() : null,
                                    currentVessel: user?.imoNumber && user?.imoNumber.trim() !== '' ? vesselMap.get(user.imoNumber)?.id || null : null,
                                    isRegistered: false, // to enter users in unregistered state
                                },
                            },
                        },
                    });


                    updatedEmpIds.push(user.civilIdOrPassport.toUpperCase());

                    vesselAssociations.push({
                        civilIdOrPassport: user.civilIdOrPassport,
                        imoNumber: user.imoNumber && user.imoNumber.trim() !== '' ? user.imoNumber || null : null,
                        vesselStatus: user?.vesselStatus && user?.vesselStatus.trim() !== '' ? user.vesselStatus?.toUpperCase() : null,
                        typeOfVessel: vesselMap.get(user.imoNumber)?.typeOfVessel,
                    });

                }


            } else if (existingEmailIdsMap) {

                const empId = existingEmailIdsMap?.[user?.email]?.toUpperCase();

                if (existingEmpIdsMap) {

                    const email = existingEmpIdsMap[user.civilIdOrPassport?.toUpperCase()];

                    if (email !== user.email?.toLowerCase() && existingEmpIdsInDB.has(user.email?.toLowerCase())) {

                        errors.push(errors.push(`Conflict in Row ${userIndex + 1}: The provided User ID or Email ID is already associated with another user`));
                        break;

                    } else {

                        updates.push({
                            updateMany: {
                                // filter: { email: user.civilIdOrPassport },
                                filter: { civilIdOrPassport: { $regex: `^${user.civilIdOrPassport}$`, $options: 'i' } },
                                update: {
                                    $set: {
                                        firstName: user.firstName,
                                        lastName: user.lastName,
                                        email: user.email,
                                        vesselStatus: user?.vesselStatus && user?.vesselStatus.trim() !== '' ? user.vesselStatus?.toUpperCase() : null,
                                        currentVessel: user?.imoNumber && user?.imoNumber.trim() !== '' ? vesselMap.get(user.imoNumber)?.id || null : null,
                                        isRegistered: false, // to enter users in unregistered state
                                    },
                                },
                            },
                        });


                        updatedEmpIds.push(user.civilIdOrPassport.toUpperCase());

                        vesselAssociations.push({
                            civilIdOrPassport: user.civilIdOrPassport,
                            imoNumber: user.imoNumber && user.imoNumber.trim() !== '' ? user.imoNumber || null : null,
                            vesselStatus: user?.vesselStatus && user?.vesselStatus.trim() !== '' ? user.vesselStatus?.toUpperCase() : null,
                            typeOfVessel: vesselMap.get(user.imoNumber)?.typeOfVessel,
                        });

                    }

                } else if (empId !== user.civilIdOrPassport?.toUpperCase() && existingEmailsInDB.has(user.civilIdOrPassport?.toUpperCase())) {

                    errors.push(errors.push(`Conflict in Row ${userIndex + 1}: The provided User ID or Email ID is already associated with another user`));
                    break;

                } else {

                    updates.push({
                        updateMany: {
                            filter: { email: user.email },
                            update: {
                                $set: {
                                    firstName: user.firstName,
                                    lastName: user.lastName,
                                    civilIdOrPassport: user.civilIdOrPassport,
                                    vesselStatus: user?.vesselStatus && user?.vesselStatus.trim() !== '' ? user.vesselStatus?.toUpperCase() : null,
                                    currentVessel: user?.imoNumber && user?.imoNumber.trim() !== '' ? vesselMap.get(user.imoNumber)?.id || null : null,
                                    isRegistered: false, // to enter users in unregistered state
                                },
                            },
                        },
                    });


                    updatedEmailIds.push(user.email);

                    vesselAssociations.push({
                        email: user.email,
                        imoNumber: user.imoNumber && user.imoNumber.trim() !== '' ? user.imoNumber || null : null,
                        vesselStatus: user?.vesselStatus && user?.vesselStatus.trim() !== '' ? user.vesselStatus?.toUpperCase() : null,
                        typeOfVessel: vesselMap.get(user.imoNumber)?.typeOfVessel,
                    });

                }


            } else {

                if (getAllDBEmails.includes(user.email)) {

                    errors.push(errors.push(`Conflict in Row ${userIndex + 1}: The provided User ID or Email ID is already associated with another user`));
                    break;


                } else if (getAllDBEmpIds.includes(user.civilIdOrPassport?.toLowerCase())) {

                    errors.push(errors.push(`Conflict in Row ${userIndex + 1}: The provided User ID or Email ID is already associated with another user`));
                    break;

                } else {

                    // Double-check for duplicates in inserts array before adding
                    const isDuplicateInInserts = inserts.some(existingUser =>
                        existingUser.email === user.email ||
                        existingUser.civilIdOrPassport === user.civilIdOrPassport
                    );

                    if (isDuplicateInInserts) {
                        errors.push(`Row ${userIndex + 1}: Duplicate entry detected in processing queue`);
                        userIndex++;
                        continue;
                    }

                    let password = dummyPassword.dummy_pwd;

                    inserts.push({
                        civilIdOrPassport: user.civilIdOrPassport,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        email: user.email,
                        vesselStatus: user?.vesselStatus && user?.vesselStatus.trim() !== '' ? user.vesselStatus?.toUpperCase() : null,
                        currentVessel: user.imoNumber && user.imoNumber.trim() !== '' ? vesselMap.get(user.imoNumber)?.id || null : null,
                        password: await CryptoHelper.hash(password, 10),
                        subscriber: subscriber_Id ?? null,
                        isSignupAdminAprroved: true,
                        isRegistered: false, // to enter users in unregistered state
                    });

                    if (user.imoNumber && user.vesselStatus.toUpperCase() !== VesselStatus.ONSHORE) {
                        vesselAssociations.push({
                            civilIdOrPassport: user.civilIdOrPassport,
                            imoNumber: user.imoNumber && user.imoNumber.trim() !== '' ? user.imoNumber || null : null,
                            vesselStatus: user?.vesselStatus && user?.vesselStatus.trim() !== '' ? user.vesselStatus?.toUpperCase() : null,
                            typeOfVessel: vesselMap.get(user.imoNumber)?.typeOfVessel,
                        });
                    }

                    passwordEmailList.push({ email: user.email, temp_password: password, firstName: user.firstName, buttonLink: `${process.env.APP_URL}/login?isResetPasswordDialog=false` });

                }
            }
            userIndex++;
        };
        console.timeEnd('userValidationLoop');

        if (errors.length > 0) {


            const createImportLog = await ImportLog.create({
                subscriber: subscriberId,
                uploadedBy: userId,
                fileName: newFileName,
                filePath: { url: saveCSV },
                importStatus: "FAILED",
                description: `${errors[0]}`,
            })


            if (!createImportLog) throw CustomError(ErrorName.FAILED, 'Failed to create import log');


            await sendNotificationOnBULK({
                subscriber: subscriberId,
                action: "Bulk Import Failed",
                createdBy: adminUser?._id,
                uploadedBy: adminUser?._id,
                isError: true,
                description: `${errors[0]}`,
                notificationType: 'BULK_IMPORT_FAILED',
                status: "FAILED",
                icon: notificationiconEnum.ERROR,
                creatorId: userInfo._id,
            });

            throw CustomError(
                ErrorName.VALIDATION_ERROR,
                `${errors[0]}`
            );


        }


        let bulkInsertUsers;
        let bulkUpdateUsers;


        let insertedUsers = [];
        let updatedUsersById = [];
        let updatedUsersByEmail = [];


        let endUsers = [];

        console.log(`About to insert ${inserts.length} users`);
        console.log('Sample insert emails:', inserts.slice(0, 3).map(u => u.email));

        const saveEmployees = await DbTransactionHelper.performDbTransaction(async session => {

            console.time("bulkInsertUsers")
            try {
                bulkInsertUsers = await User.insertMany(inserts, { session: session, ordered: false });
            } catch (error) {
                if (error.name === 'BulkWriteError') {
                    // Handle partial success - some users were inserted successfully
                    console.log(`Bulk insert partially successful. ${error.result.insertedCount} users inserted, ${error.writeErrors.length} errors`);
                    bulkInsertUsers = error.result.insertedIds ? Object.values(error.result.insertedIds) : [];

                    // Log the specific duplicate errors with more detail
                    error.writeErrors.forEach((writeError, index) => {
                        if (writeError.code === 11000) { // Duplicate key error
                            console.log(`Duplicate key error at index ${writeError.index}:`, writeError.errmsg);

                            // Try to find the original user data that caused this error
                            const failedUser = inserts[writeError.index];
                            if (failedUser) {
                                console.log(`Failed user data:`, {
                                    email: failedUser.email,
                                    civilIdOrPassport: failedUser.civilIdOrPassport
                                });
                            }

                            errors.push(`Duplicate entry detected at row ${writeError.index + 1}: Email or User ID already exists in database`);
                        } else {
                            console.log(`Other error at index ${writeError.index}:`, writeError.errmsg);
                            errors.push(`Error at row ${writeError.index + 1}: ${writeError.errmsg}`);
                        }
                    });
                } else {
                    throw error; // Re-throw if it's not a BulkWriteError
                }
            }
            console.timeEnd("bulkInsertUsers")


            insertedUsers = await User.find({ email: { $in: inserts.map(u => u.email) } }).session(session);


            console.time("bulkUpdateUsers")
            const bulkUpdateUsers = await User.bulkWrite(updates, { session });
            console.timeEnd("bulkUpdateUsers");


            if (updatedEmpIds.length > 0) {

                updatedUsersById = await User.find({
                    $or: updatedEmpIds.map(id => ({
                        civilIdOrPassport: { $regex: `^${id}$`, $options: 'i' }
                    }))
                }).session(session);

            }
            updatedUsersByEmail = await User.find({ email: { $in: updatedEmailIds } }).session(session);


            const designationMap = new Map(
                existingDesignations.map(designation => [
                    designation.name?.toLowerCase(),
                    { id: designation._id }
                ])
            );


            const bulkId = uuidv4();
            const allUpdatedUsers = [...insertedUsers, ...updatedUsersByEmail, ...updatedUsersById];
            userCount = allUpdatedUsers?.length || 0;

            const automateLearningPlanIds = [];

            if (allUpdatedUsers.length > 0) {

                const userVesselsInsert = [];
                for (const vesselData of vesselAssociations) {
                    const originalUserData = allUpdatedUsers.filter(
                        user => user.civilIdOrPassport?.toLowerCase() === vesselData.civilIdOrPassport?.toLowerCase() || user.email?.toLowerCase() === vesselData.email?.toLowerCase()
                    );

                    if (originalUserData.length > 0) {

                        originalUserData.forEach(user => {

                            if (vesselData.imoNumber || vesselData.imoNumber === '') {

                                if (vesselData.imoNumber !== '') {

                                    userVesselsInsert.push({
                                        updateMany: {
                                            filter: { user: user._id, vessel: { $ne: vesselMap.get(vesselData?.imoNumber).id } },
                                            update: {
                                                $set: { isActive: false }
                                            }
                                        }
                                    });

                                } else {

                                    userVesselsInsert.push({
                                        updateMany: {
                                            filter: { user: user._id },
                                            update: {
                                                $set: { isActive: false }
                                            }
                                        }
                                    });

                                }

                                if (vesselData.vesselStatus !== '') {

                                    userVesselsInsert.push({
                                        updateOne: {
                                            filter: { user: user._id, vessel: vesselMap.get(vesselData.imoNumber).id },
                                            update: {
                                                $set: {
                                                    user: user._id,
                                                    vessel: vesselMap.get(vesselData.imoNumber).id,
                                                    vesselStatus: vesselData?.vesselStatus && vesselData?.vesselStatus.trim() !== '' ? vesselData?.vesselStatus.toUpperCase() || null : null,
                                                    isActive: true,
                                                }
                                            },
                                            upsert: true
                                        }
                                    });
                                }

                            } else {

                                userVesselsInsert.push({
                                    updateMany: {
                                        filter: { user: user._id },
                                        update: {
                                            $set: { isActive: false, vesselStatus: vesselData?.vesselStatus && vesselData?.vesselStatus.trim() !== '' ? vesselData?.vesselStatus.toUpperCase() || null : null }
                                        }
                                    }
                                });

                            }

                        });
                    }
                }

                console.time('vesselBulkWrite')
                if (userVesselsInsert.length > 0) {
                    await UserVessel.bulkWrite(userVesselsInsert, { session });
                }
                console.timeEnd('vesselBulkWrite')

                const employeesToInsert = allUpdatedUsers.map(user => {
                    const originalUserData = users.find(u => u.civilIdOrPassport?.toLowerCase() === user.civilIdOrPassport?.toLowerCase());


                    return {
                        updateOne: {
                            filter: { user: user },
                            update: {
                                $set: {
                                    user: user,
                                    subscriber: subscriberId,
                                    empDesignation: designationMap.get(originalUserData.designation.toLowerCase())?.id,
                                    bulkId: bulkId,
                                    isDeleted: false,
                                    regType: 2
                                }
                            },
                            upsert: true
                        }
                    };
                });

                console.time('employeesToInsert')
                await Employee.bulkWrite(employeesToInsert, { session });
                console.timeEnd('employeesToInsert')


                const newEmployees = await Employee.find({ UID: { $exists: false } }).session(session).lean();

                console.time('generateEmployeeUID')
                const uidUpdates = await Promise.all(newEmployees.map(async (employee) => {
                    const UID = await generateEmployeeUID({ subscriberId, session });
                    return {
                        updateOne: {
                            filter: { _id: employee._id },
                            update: { UID },
                            upsert: false
                        }
                    };
                }));
                console.timeEnd('generateEmployeeUID')


                console.time('empBulkWriteuidUpdates')
                await Employee.bulkWrite(uidUpdates, { session });
                console.timeEnd('empBulkWriteuidUpdates')


            } else {

                const createImportLog = await ImportLog.create({
                    subscriber: subscriberId,
                    uploadedBy: userId,
                    fileName: newFileName,
                    filePath: { url: saveCSV },
                    importStatus: "FAILED",
                    description: `No new data created/updated`
                })


                if (!createImportLog) throw CustomError(ErrorName.FAILED, 'Failed to create import log');

                throw CustomError(
                    ErrorName.VALIDATION_ERROR,
                    `No new data created/updated`
                );
            }

            const userIDs = allUpdatedUsers?.map(user => mongoose.Types.ObjectId(user._id));
            const employees = await Employee.find(
                { user: { $in: userIDs } },
                null,
                { session }
            );
            const empDesignationMap = {};
            employees.forEach(employee => {
                empDesignationMap[employee.user] = employee.empDesignation;
            });
            const vesselIDs = allUpdatedUsers.map(user => user.currentVessel);
            const vessels = await Vessel.find({ _id: { $in: vesselIDs } });
            const vesselTypeMap = {};
            vessels.forEach(vessel => {
                vesselTypeMap[vessel._id] = {
                    typeOfVessel: vessel.typeOfVessel,
                    ownerName: vessel.ownerName,
                };
            });

            const learningPlans = await LearningPlan.find({ isDeleted: false, status: 'ACTIVE' });
            let conditionsList = []
            const elasticDocuments = []
            // console.log('employees---------->', employees)
            // console.log("allUpdatedUsers?.map(user => user._id",allUpdatedUsers?.map(user => user._id))
            // const updatedEmploees = await Employee.find({ user: { $in: allUpdatedUsers?.map(user => user._id) } });
            // console.log('updatedEmploees---------->', updatedEmploees)
            const updatedUsersVessels = await Vessel.find({ _id: { $in: allUpdatedUsers?.map(user => user.currentVessel) } });
            // const designations= await Designation.find({ isDeleted: false });
            // console.log('designations---------->', designations)
            const VesselTypes = await VesselType.find({ isDeleted: false });
            try {
                allUpdatedUsers.forEach(user => {
                    const savedEmployee = employees.find(emp => emp.user.toString() === user._id.toString());
                    const userVesselDetails = updatedUsersVessels.find(vessel => vessel._id.toString() === user.currentVessel.toString());
                    const designation = existingDesignations.find(designation => designation._id.toString() === savedEmployee?.empDesignation.toString());
                    const vesselType = VesselTypes.find(vesselType => vesselType._id.toString() === userVesselDetails?.typeOfVessel.toString());
                    const originalUserData = users.find(u => u.civilIdOrPassport === user.civilIdOrPassport);
                    // console.log("originalUserData--------->", originalUserData)
                    const empDesignation = designationMap.get(originalUserData?.designation?.toLowerCase())?.id;
                    // console.log("empDesignation--------->", empDesignation)
                    const typeOfVesselIds = vesselTypeMap[user.currentVessel]?.typeOfVessel;
                    // console.log("typeOfVesselIds--------->", typeOfVesselIds)
                    const vesselOwnerName = vesselTypeMap[user.currentVessel]?.ownerName;
                    // console.log("vesselOwnerName--------->", vesselOwnerName)
                    const conditions = {
                        designationID: empDesignation,
                        vesselID: user.currentVessel ?? null,
                        vesselTypeID: typeOfVesselIds ?? null,
                        owner: vesselOwnerName ?? null,
                        currentStatus: user?.vesselStatus ?? VesselStatus?.ONSHORE,
                        email: user?.email,
                        _id: user?._id,
                        role: 'LEARNER'
                    };

                    conditionsList.push(conditions);

                    const document = {
                        id: savedEmployee?._id,
                        employeeId: (savedEmployee._id !== null && savedEmployee._id !== undefined)
                            ? savedEmployee._id.toString()
                            : undefined,
                        UID: savedEmployee.UID,
                        designation: designation?.name,
                        empDesignation: (savedEmployee.empDesignation !== null && savedEmployee.empDesignation !== undefined)
                            ? savedEmployee.empDesignation.toString()
                            : undefined,
                        bulkId: savedEmployee.bulkId,
                        regType: savedEmployee.regType,
                        isActive: savedEmployee.isActive,
                        isDeleted: savedEmployee.isDeleted,
                        subscriber: (savedEmployee.subscriber !== null && savedEmployee.subscriber !== undefined)
                            ? savedEmployee.subscriber.toString()
                            : undefined,
                        createdAt: savedEmployee.createdAt,
                        updatedAt: savedEmployee.updatedAt,

                        // Nested user fields
                        userId: (user?._id !== null && user?._id !== undefined)
                            ? user._id.toString()
                            : undefined,
                        firstName: user?.firstName,
                        lastName: user?.lastName,
                        email: user?.email,
                        civilIdOrPassport: user?.civilIdOrPassport,
                        languagePreference: user?.languagePreference,
                        role: user?.role,
                        subRoles: user?.subRoles,
                        isVerified: user?.isVerified,
                        isRegistered: user?.isRegistered,
                        superAdmin: user?.superAdmin,
                        deleteRequest: user?.deleteRequest,
                        isDeleted_user: user?.isDeleted,
                        directSignup: user?.directSignup,
                        contentlanguages: user?.contentlanguages,
                        currentVessel: (user?.currentVessel !== null && user?.currentVessel !== undefined)
                            ? user.currentVessel.toString()
                            : undefined, vesselStatus: user?.vesselStatus,
                        isEmailNotification: user?.isEmailNotification,
                        isPushNotification: user?.isPushNotification,
                        lastLoginAt: user?.lastLoginAt,
                        isSignupAdminAprroved: user?.isSignupAdminAprroved,
                        userCreatedAt: user?.createdAt,
                        userUpdatedAt: user?.updatedAt,
                        vesselName: userVesselDetails?.name,
                        vesselId: userVesselDetails?._id,
                        vesselIsDeleted: userVesselDetails?.isDeleted,
                        vesselIsActive: userVesselDetails?.isActive,
                        typeOfVesselName: vesselType?.name,
                        tyepOfVesselId: userVesselDetails?.typeOfVessel,
                        isResetPasswordDialog: user?.isResetPasswordDialog,
                        indexedAt: new Date(),
                    };

                    elasticDocuments.push(document)
                });

                try {
                    // Index to cache within transaction for atomicity
                    await bulkIndexDocumentsToElasticSearch("users", elasticDocuments, session);
                } catch (error) {
                    throw CustomError(ErrorName.INDEX_DOC_ELASTIC_SEARCH, `Elastic Insert Error (users): ${error}`)
                }

                // console.time('filterPlans')
                // const filteredPlans = await filterLearningPlans(learningPlans, conditionsList, context, session);
                // console.timeEnd('filterPlans')

                // if (filteredPlans.length > 0) {
                //     console.log("filteredPlans: ", filteredPlans);
                // }
            } catch (error) {
                console.error(`Error in Autoenrollment Learning Plans ${error.message}`);
            }

            const decryptedPasswordEmailList = passwordEmailList?.map((item) => {
                return {
                    ...item,
                    email: decrypt(item.email),
                    firstName: decrypt(item.firstName),
                }
            })

            if (decryptedPasswordEmailList.length > 0) {

                // await sendBulkEmails(decryptedPasswordEmailList);

            }


        });

        if (insertedUsers.length > 0 || updatedUsersByEmail.length > 0 || updatedUsersById.length > 0) {

            const updatedUsersCount = updatedUsersByEmail.length + updatedUsersById.length;

            let importJob = await ImportJob.findOne({ jobId: jobId });

            importJob.processedBatches.updatedCount += updatedUsersCount;
            importJob.processedBatches.insertedCount += insertedUsers.length;

            if (importJob.totalRecords == (importJob?.processedBatches?.updatedCount + importJob?.processedBatches?.insertedCount)) {
                importJob.progressCompleted = !importJob.progressCompleted;
            }

            await importJob.save();

        }

    },

    bulkValidationHelper: async (createReadStream, empIds, emails, dbemployeeIds, dbEmails, designationNames, imoNumbers, vesselStatus, users, userId, subscriberId, newFileName, countriesListed, saveCSV) => {

        let validationErrors = [];

        try {

            // const fetchAdmin = await User.findOne({ superAdmin: { $ne: false } }).populate("currentVessel");
            // const fetchAdminEmployee = await Employee.findOne({ user: fetchAdmin._id }).populate("empDesignation");
            // const fetchAdminDesignation = fetchAdminEmployee?.empDesignation?.name;
            await new Promise((resolve, reject) => {
                const stream = createReadStream();
                const parser = csvParse({ columns: true, trim: true });
                stream.pipe(parser);

                let rowIndex = 0;
                let isEmptyFile = true;
                const MAX_ROWS = 1000;

                parser.on("data", async (row) => {

                    rowIndex++;

                    // if (rowIndex > MAX_ROWS) {
                    //     validationErrors.push("The CSV file exceeds the maximum allowed row limit of 1000.");
                    //     return;
                    // }

                    isEmptyFile = false;

                    validationErrors.push(await validateUserRow(row, { empIds, emails, dbemployeeIds, dbEmails, designationNames, imoNumbers, vesselStatus, countriesListed }, rowIndex));

                    const hasNonEmptyArray = validationErrors.some(innerArray => innerArray.length > 0);
                    if (hasNonEmptyArray) {

                        return validationErrors;

                    } else {
                        let formatedData;

                        if (Object.values(row).every(value => value === '' || value === null || value === undefined)) {
                            return;
                        }

                        formatedData = mapCSVRowToUser(row);
                        users.push(formatedData);
                    }

                });

                parser.on("end", async () => {

                    if (rowIndex === 0) {
                        validationErrors.push("The CSV file is empty.");
                    }
                    resolve()
                });
                parser.on("error", reject);

            });

            return validationErrors;

        } catch (error) {
            throw Error(error.message);
        }

    }
};
