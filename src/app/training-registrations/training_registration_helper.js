const { ObjectId, Validator } = require("../../tools");
const { AuthUser, Role, CustomError, ErrorName, SendEmail, DbTransactionHelper, SqliteEmailHelper } = require("../../util");

const { TrainingRegistration } = require("./training_registration_model");
const { Employee } = require("../user/employee/employee_model");
const { User } = require("../user/user_model");
const { SubRole } = require("../user/sub-roles/sub_role_model");
const NotificationHelper = require("../notifications/notification_helper");

const NotificationType = require("../notifications/notification_type.json");

const { groupTypes } = require("../../util");
const { Designation } = require("../designations/designation_model");
const { UserVessel } = require("../user/user-vessel-bridge/userVessel_model");
const { Vessel } = require("../vessle/vessel_model");
const { GroupMember } = require("../user/group-user/group_member_model");
const { Group } = require("../user/group-user/group_model");
const { TrainingProgress } = require("./training-progress/training_progress_model");

const TrainingRegistrationHelper = require("../training-registrations/training_registration_helper");

const LogHelper = require("../logs/log_helper");
const SubRoleHelper = require("../user/sub-roles/sub_role_helper");
const { BatchHelper } = require("../batches/batch_helper");
const { sendEmail } = require("../../util/aws_helper");
const Permission = require("../user/sub-roles/permission.json");
const LogType = require("../logs/log_type.json");
const { OverallTrainingProgress } = require("./overall-course-progress/overall_progress_model");
const { TrainingModuleContent } = require("../trainings/training_modules/training_module_contents/training_module_content_model")
const { TrainingModule } = require("../trainings/training_modules/training_module_model")
const { TrainingContentBridge } = require("../trainings/training_content_bridge/training_content_model")
const notificationiconEnum = require("../notifications/notification_icon.json");
const courseEnrollment = require("../email-template/courseEnrollment");
const courseUnenrollmentEmail = require("../email-template/courseUnenrollment");
const { Training } = require("../trainings/training_model");
const { sendNotifications } = require("../../util/firebase_helper");
const { LearningPlan } = require("../learning-plan/learning_plan_model");
const Roles = require("../../util/role.json");
const AWS_HELPER = require("../../util/aws_helper");
const mongoose = require("mongoose");
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const { decrypt, encrypt } = require('../../util/encryption_helper');
const { updateCoursesCountAndProgressInElasticSearch } = require("./overall-course-progress/overall_progress_helper");
const { bulkUpdateDocumentsInElastic } = require("../../util/elastic_helper");
const fetchUserFromAutoSyncedGroups = (async (groups, fromGetGroups) => {

    try {
        const users = [];

        const designationIds = [];
        const roleIds = [];
        const subRoleIds = [];
        const regStatusIds = [];
        const vesselIds = [];
        const vesselStatusIds = [];
        const vesselTypeIds = [];
        const ownernameIds = [];

        for (let group of groups) {
            const { groupType, groupId } = group;

            switch (groupType) {
                case groupTypes.designation:
                    designationIds.push(groupId);
                    break;
                case groupTypes.role:
                    if (Array.isArray(groupId)) {
                        roleIds.push(...groupId);
                    } else {
                        roleIds.push(groupId);
                    }
                    break;
                case groupTypes.subRole:
                    subRoleIds.push(groupId);
                    break;
                case groupTypes.vessel:
                    vesselIds.push(groupId);
                    break;
                case groupTypes.vesselStatus:
                    if (Array.isArray(groupId)) {
                        vesselStatusIds.push(...groupId);
                    } else {
                        vesselStatusIds.push(groupId);
                    }
                    break;
                case groupTypes.vesselType:
                    vesselTypeIds.push(groupId);
                    break;
                case groupTypes.owner:
                    if (Array.isArray(groupId)) {
                        ownernameIds.push(...groupId);
                    } else {
                        ownernameIds.push(groupId);
                    }
                    break;
                default:
                    break;
            }
        }

        const designationQuery = designationIds.length > 0 ? Employee.find({ empDesignation: { $in: designationIds } })
            .select({ user: 1 })
            .lean()
            .then(results => results.map(doc => ({ _id: doc.user }))) : Promise.resolve([]);

        const adminUsers = [];
        const learnerUsers = [];

        const roleUsersQuery = await User.find({ role: "LEARNER", isDeleted: { $ne: true }, isSignupAdminAprroved: true }).populate("subRoles", "name").select('-consents');
        if (Array.isArray(roleUsersQuery)) {
            learnerUsers.push(...roleUsersQuery);
        }
        roleUsersQuery.forEach(user => {
            if (user.subRoles.length > 0) {
                user.subRoles.forEach(subRole => {
                    if (roleIds.includes(subRole.name)) {
                        if (subRole.name === "ADMIN" && roleIds.includes("ADMIN")) {
                            adminUsers.push(user);
                        }
                    }
                });
            }
        });

        let roleQuery = [];
        if (roleIds.includes("ADMIN")) {
            roleQuery = adminUsers;
        } else if (roleIds.includes("LEARNER")) {
            roleQuery = learnerUsers;
        } else {
            roleQuery = Promise.resolve([]);
        }

        const subRoleQuery = subRoleIds.length > 0 ? User.find({ subRoles: { $in: subRoleIds }, isDeleted: { $ne: false } }).select('-consents') : Promise.resolve([]);
        const regStatusQuery = regStatusIds.length > 0 ? User.find({ isRegistered: { $in: regStatusIds }, isDeleted: { $ne: false } }).select('-consents') : Promise.resolve([]);

        const vesselQuery = vesselIds.length > 0 ? User.find({ currentVessel: { $in: vesselIds }, isDeleted: { $ne: true } }).select('-consents') : Promise.resolve([]);

        const vesselStatusQuery = vesselStatusIds.length > 0 ? User.find({ vesselStatus: { $in: vesselStatusIds }, isDeleted: { $ne: true } }).select('-consents') : Promise.resolve([]);
        let vesselTypeQuery;
        if (vesselTypeIds.length > 0) {
            const vessels = await Vessel.find({ typeOfVessel: { $in: vesselTypeIds } });
            const vesselIdsFromType = vessels.map(x => x._id);
            vesselTypeQuery = vesselIdsFromType.length > 0 ? UserVessel.find({ vessel: { $in: vesselIdsFromType }, isActive: { $ne: false } })
                .select({ user: 1 })
                .lean()
                .then(results => results.map(doc => ({ _id: doc.user }))) : Promise.resolve([]);
        } else {
            vesselTypeQuery = Promise.resolve([]);
        }
        let ownernameQuery;
        if (ownernameIds?.length > 0) {

            ownernameQuery = ownernameIds?.length > 0 ? Vessel.find({ ownerName: { $in: ownernameIds } }, { _id: 1 }) // Fetch vessel IDs
                .then(vessels => {
                    const vesselIds = vessels.map(v => v._id);
                    return Vessel.find({
                        $or: [
                            { ownerName: { $in: ownernameIds } }, // Match by ownerName
                            { vesselId: { $in: vesselIds } } // Match by vesselId
                        ],
                        isDeleted: { $ne: true }
                    });
                }) : Promise.resolve([]);
        } else {
            ownernameQuery = Promise.resolve([]);
        }

        const [
            designationUsersIds,
            roleUsers,
            subRoleUsers,
            regStatusUsers,
            vesselUsersIds,
            vesselStatusUserIds,
            vesselTypeUserIds,
            ownernameUsersIds
        ] = await Promise.all([
            designationQuery,
            roleQuery,
            subRoleQuery,
            regStatusQuery,
            vesselQuery,
            vesselStatusQuery,
            vesselTypeQuery,
            ownernameQuery
        ]);

        let vesselStatusUsers = [];
        if (vesselStatusUserIds.length) {
            vesselStatusUsers = await User.find({ _id: { $in: vesselStatusUserIds }, isDeleted: { $ne: true } }).select('-consents');
        }

        let vesselTypeUsers = [];
        if (vesselTypeUserIds.length) {
            vesselTypeUsers = await User.find({ _id: { $in: vesselTypeUserIds }, isDeleted: { $ne: true } }).select('-consents');
        }

        let vesselUsers = [];
        if (vesselUsersIds.length) {
            vesselUsers = await User.find({ _id: { $in: vesselUsersIds }, isDeleted: { $ne: true } }).select('-consents');
        }

        let designationUsers = [];
        if (designationUsersIds.length) {
            designationUsers = await User.find({ _id: { $in: designationUsersIds }, isDeleted: { $ne: true } }).select('-consents');
        }
        let ownernameUsers = [];
        const ownerIds = ownernameUsersIds.map(user => user._id);


        if (ownerIds.length > 0) {
            ownernameUsers = await User.find({ currentVessel: { $in: ownerIds }, isDeleted: { $ne: true } }).select('-consents');
        }

        if (fromGetGroups) {

            let result = [];

            for (let group of groups) {
                const { groupType, groupId } = group;

                switch (groupType) {
                    case groupTypes.designation:
                        result.push({ groupId, groupType, member: designationUsers });
                        break;
                    case groupTypes.role:
                        result.push({ groupId, groupType, member: roleUsers });
                        break;
                    case groupTypes.subRole:
                        result.push({ groupId, groupType, member: subRoleUsers });
                        break;
                    case groupTypes.regStatus:
                        result.push({ groupId, groupType, member: regStatusUsers });
                        break;
                    case groupTypes.vessel:
                        result.push({ groupId, groupType, member: vesselUsers });
                        break;
                    case groupTypes.vesselStatus:
                        result.push({ groupId, groupType, member: vesselStatusUsers });
                        break;
                    case groupTypes.vesselType:
                        result.push({ groupId, groupType, member: vesselTypeUsers });
                        break;
                    case groupTypes.owner:
                        result.push({ groupId, groupType, member: ownernameUsers });
                        break;
                    default:
                        break;
                }
            }
            return result;

        }

        return [
            ...designationUsers,
            ...roleUsers,
            ...subRoleUsers,
            ...regStatusUsers,
            ...vesselUsers,
            ...vesselStatusUsers,
            ...vesselTypeUsers,
            ...ownernameUsers
        ];

    } catch (error) {
        throw Error(error.message);
    }

})

// const enrolUserVerificationHelper = (async (inputUsers, existingTrainings, fromUnenroll) => {

//     try {

//         let remainingUsers = [];
//         let invalidEmails = [];
//         let unRegEmails = [];
//         let alreadyEnrolledEmails = [];
//         let notEnrolledEmails = [];

//         for (let user of inputUsers) {
//             const existEmail = await User.findOne({ email: user.email });
//             if (!Validator.isEmail(user.email ?? '')) {
//                 if (!invalidEmails.includes(user.email ?? '')) {
//                     invalidEmails.push(user.email)
//                 }
//             } else if (!user.isRegistered) {
//                 unRegEmails.push(user.email)
//                 if (fromUnenroll) {
//                     remainingUsers.push(user);
//                 }
//             } else if (!existEmail) {
//                 if (!invalidEmails.includes(user.email?? '')) {
//                     invalidEmails.push(user.email ?? '')
//                 }
//             } else {
//                 remainingUsers.push(user);
//             }
//         }

//         const userObjectIds = remainingUsers.map(user => user._id);
//         const userObjectIdStrings = userObjectIds.map(id => id.toString());

//         let alreadyEnrolledUserIds = [];
//         let notEnrolledUserIds = [];

//         if (existingTrainings) {
//             existingTrainings.forEach(training => {
//                 if (userObjectIdStrings.includes(training.user.toString()) && training.isEnrolled === true) {
//                     alreadyEnrolledUserIds.push(training.user.toString());
//                 } else {
//                     notEnrolledUserIds.push(training.user.toString());
//                 }
//             });
//             alreadyEnrolledUserIds = [...new Set(alreadyEnrolledUserIds)];
//             notEnrolledUserIds = [...new Set(notEnrolledUserIds)];

//             if (alreadyEnrolledUserIds.length > 0) {
//                 const enrolledUsers = await User.find({ _id: { $in: alreadyEnrolledUserIds } });
//                 alreadyEnrolledEmails.push(...enrolledUsers.map(user => user.email ?? ''));
//             }

//             if (notEnrolledUserIds.length > 0) {
//                 const nonEnrolledUsers = await User.find({ _id: { $in: notEnrolledUserIds } });
//                 notEnrolledEmails.push(...nonEnrolledUsers.map(user => user.email ?? ''));
//             }
//         }


//         return { invalidEmails, unRegEmails, alreadyEnrolledEmails, notEnrolledEmails };
//     } catch (error) {
//         throw Error(error.message);
//     }

// });

const enrolUserVerificationHelper = async (inputUsers, existingTrainings, fromUnenroll) => {
    try {
        let remainingUsers = [];
        let invalidEmails = [];
        let unRegEmails = [];
        let alreadyEnrolledEmails = [];
        let notEnrolledEmails = [];

        // Extract emails from inputUsers
        const userEmails = inputUsers.map(user => user.email).filter(email => email);

        // Fetch all users in a single query
        const existingUsers = await User.find({ email: { $in: userEmails } }).lean();
        const userMap = new Map(existingUsers.map(user => [user.email, user])); // Map email to user object

        for (let user of inputUsers) {
            const existUser = userMap.get(user.email);

            if (!Validator.isEmail(decrypt(user.email) ?? '')) {
                invalidEmails.push(user.email);
            } else if (!user.isRegistered) {
                unRegEmails.push(decrypt(user.email));
                if (fromUnenroll) {
                    remainingUsers.push(user);
                }
            } else if (!existUser) {
                invalidEmails.push(user.email);
            } else {
                remainingUsers.push(user);
            }
        }

        // Fetch userObjectIds for training checks
        const userObjectIds = remainingUsers.map(user => user._id.toString());

        let alreadyEnrolledUserIds = new Set();
        let notEnrolledUserIds = new Set();

        if (existingTrainings) {
            for (let training of existingTrainings) {
                if (userObjectIds.includes(training.user.toString())) {
                    if (training.isEnrolled) {
                        alreadyEnrolledUserIds.add(training.user.toString());
                    } else {
                        notEnrolledUserIds.add(training.user.toString());
                    }
                }
            }

            // Fetch users who are already enrolled
            if (alreadyEnrolledUserIds.size > 0) {
                const enrolledUsers = await User.find({ _id: { $in: Array.from(alreadyEnrolledUserIds) } }).lean();
                alreadyEnrolledEmails = enrolledUsers.map(user => user.email);
            }

            // Fetch users who are not enrolled
            if (notEnrolledUserIds.size > 0) {
                const nonEnrolledUsers = await User.find({ _id: { $in: Array.from(notEnrolledUserIds) } }).lean();
                notEnrolledEmails = nonEnrolledUsers.map(user => user.email);
            }
        }

        return { invalidEmails, unRegEmails, alreadyEnrolledEmails, notEnrolledEmails };
    } catch (error) {
        throw Error(error.message);
    }
};

const extractTrainingContentData = async (trainings, isFromMigration) => {

    let trainingContentBridges;

    if (!isFromMigration) {
        trainingContentBridges = await TrainingContentBridge.find({
            training: { $in: trainings.map(training => training._id) }, isDeleted: false
        });
    } else {
        trainingContentBridges = await TrainingContentBridge.find({
            training: ObjectId(trainings), isDeleted: { $ne: true }
        })
    }


    const trainingModulesMap = trainingContentBridges.reduce((result, bridge) => {
        const moduleId = bridge.trainingModule.toString();
        const contentId = bridge.trainingContent.toString();


        const existingModule = result.find(module => module.moduleId === moduleId);

        if (existingModule) {

            existingModule.contentIds.push(mongoose.Types.ObjectId(contentId));
        } else {

            result.push({
                moduleId: ObjectId(moduleId),
                contentIds: [ObjectId(contentId)]
            });
        }

        return result;
    }, []);

    const trainingTotalModules = trainingModulesMap.length
    return { trainingModulesMap, trainingTotalModules };
};

const createTrainingProgressForMigrationUsersHelper = async (userIds, trainingId, subscriberId, trainingRegistrationId, errors, userIssuedExpiryMap, session) => {

    try {

        const missing = [];
        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) missing.push('userIds');
        if (!trainingId) missing.push('trainingId');
        if (!trainingRegistrationId) missing.push('trainingRegistrationId');
        if (!subscriberId) missing.push('subscriberId');
        if (!session) missing.push('session');
        if (!userIssuedExpiryMap) missing.push('userIssuedExpiryMap');

        if (missing.length > 0) {
            const msg = `Missing or invalid parameter(s): ${missing.join(', ')}`;
            console.log(`⚠️ ${msg}`);
            errors.push(msg);
            return msg;
        }

        // Make sure trainingId is ObjectId
        trainingId = typeof trainingId === 'string' ? ObjectId(trainingId) : trainingId;

        // Make sure userIds are ObjectIds
        userIds = userIds.map(userId => (typeof userId === 'string' ? ObjectId(userId) : userId));

        // Make sure trainingRegistrationId is ObjectId
        trainingRegistrationId = typeof trainingRegistrationId === 'string' ? ObjectId(trainingRegistrationId) : trainingRegistrationId;

        let trainingModuleCount;

        let contentData = [];
        let moduleCount = 0;
        let overallIds = [];
        if (trainingId) {

            const trainingModules = await TrainingModule.find({ training: trainingId, isDeleted: { $ne: true } }).session(session).lean();

            trainingModuleCount = trainingModules.length;

            const contents = await TrainingContentBridge.find({
                training: trainingId,
                isDeleted: { $ne: true },
            })
                .sort({ order: 1 })
                .session(session)
                .lean();

            if (!contents.length) {
                errors.push(`Training content not found`);
                return;
            }

            const contentDataMap = new Map();

            for (const content of contents) {
                const moduleId = content.trainingModule.toString();
                const contentId = content.trainingContent.toString();
                if (!contentDataMap.has(moduleId)) {
                    contentDataMap.set(moduleId, []);
                }
                contentDataMap.get(moduleId).push(contentId);
            }

            const moduleIds = Array.from(contentDataMap.keys());

            const modules = await TrainingModule.find({ _id: { $in: moduleIds } })
                .select("_id order")
                .session(session)
                .lean();

            moduleCount = modules.length;

            const moduleOrderMap = new Map(modules.map((m) => [m._id.toString(), m.order]));

            contentData = Array.from(contentDataMap.entries())
                .map(([moduleId, contentIds]) => ({ moduleId, contentIds }))
                .sort((a, b) => (moduleOrderMap.get(a.moduleId) || 0) - (moduleOrderMap.get(b.moduleId) || 0));

        }


        const trainingData = await Training.find({ _id: trainingId })
            .select('_id isCertificate durationHours').session(session).lean();

        const trainingDataById = trainingData.reduce((acc, training) => {
            acc[training._id.toString()] = training;
            return acc;
        }, {});

        // Newly added
        const existingProgressDocs = await OverallTrainingProgress.find(
            {
                user: { $in: userIds },
                training: trainingId,
            },
            { _id: 1, user: 1 }
        ).session(session).lean();

        const existingMap = new Map();
        for (const doc of existingProgressDocs) {
            existingMap.set(doc.user.toString(), doc._id);
        }

        const newProgressEntries = [];
        for (const user of userIds) {
            let overallId;

            let issuedDate = null;
            let expiryDate = null;

            if (userIssuedExpiryMap) {
                let entry;

                if (userIssuedExpiryMap instanceof Map) {
                    entry = userIssuedExpiryMap.get(user.toString()) || userIssuedExpiryMap.get(user);
                } else if (Array.isArray(userIssuedExpiryMap)) {
                    entry = userIssuedExpiryMap.find(e =>
                        e.user === user || (e.user && e.user.toString && e.user.toString() === user.toString())
                    );
                } else {
                    entry = userIssuedExpiryMap[user.toString()] || userIssuedExpiryMap[user];
                }

                if (entry) {
                    const asDate = v => (v ? (v instanceof Date ? v : new Date(v)) : null);
                    issuedDate = asDate(entry.issuedAt ?? null);
                    expiryDate = asDate(entry.expiryDate ?? null);
                }
            }

            if (existingMap.has(user.toString())) {
                overallId = existingMap.get(user.toString());
                console.log("existingId", overallId);
            } else {
                overallId = new ObjectId();
                console.log("newId", overallId);
            }


            overallIds.push(overallId);

            console.log("overallId", overallId);
            console.log("user", user);
            console.log("trainingId", trainingId);
            newProgressEntries.push({
                updateOne: {
                    filter: { user: user, training: trainingId },
                    update: {
                        $set: {
                            status: "COMPLETED",
                            isEnrolled: true,
                            progressPercentage: 100,
                            completedModules: trainingModuleCount || 0,
                            contentData: contentData || [],
                            totalTrainingModules: trainingModuleCount || 0,
                            unenrollmentDate: null,
                            isFromMigration: true,
                            certificateExpiryDate: expiryDate,
                            endDate: issuedDate,
                        },
                        $setOnInsert: {
                            _id: overallId,
                            training: trainingId,
                            directEnrollment: true,
                            user: user,
                            trainingRegistration: trainingRegistrationId,
                            subscriberId: subscriberId,
                            isCertificatePresent: trainingDataById[trainingId.toString()]?.isCertificate ?? false,
                            startDate: null,
                            totalDuration: trainingDataById[trainingId.toString()]?.durationHours ?? 0,
                        },
                    },
                    upsert: true,
                },
            });
        }

        if (newProgressEntries.length > 0) {
            await OverallTrainingProgress.bulkWrite(newProgressEntries, { session });
        }

        const bulkOps = [];

        if (overallIds.length > 0) {
            await TrainingProgress.updateMany(
                { overallTrainingProgress: { $in: overallIds } },
                {
                    $set: {
                        attemptCount: 1,
                        status: "COMPLETED",
                        lastAccessedDuration: 0,
                        progressPercentage: 100,
                        playerSettings: null,
                        videoId: null,
                    }
                },
                { session }
            );
        }

        for (const overallId of overallIds) {
            for (const { moduleId, contentIds } of contentData) {
                for (const contentId of contentIds) {
                    bulkOps.push({
                        updateOne: {
                            filter: {
                                overallTrainingProgress: overallId,
                                trainingModule: moduleId,
                                trainingModuleContent: contentId,
                            },
                            update: {
                                $setOnInsert: {
                                    attemptCount: 1,
                                    status: "COMPLETED",
                                    lastAccessedDuration: 0,
                                    progressPercentage: 100,
                                    playerSettings: null,
                                    videoId: null,
                                },
                            },
                            upsert: true,
                        },
                    });
                }
            }
        }

        if (bulkOps.length > 0) {
            await TrainingProgress.bulkWrite(bulkOps, { session });
            await updateCoursesCountAndProgressInElasticSearch(userIds, session);
            return overallIds.length;
        }


    } catch (error) {
        throw Error(error.message);
    }
};


const updateTrainingProgressesForMigrationUsersHelper = async (trainingProgressIds, userIds, subscriberId, session) => {



}

const createTrainingProgressHelper = async (users, trainings, subscriberId, latestRegistrationId, learningPlanId, session, fromBackground) => {

    let trainingProgressData;
    try {

        let existingProgressRecords;
        if (fromBackground) {
            existingProgressRecords = await OverallTrainingProgress.find({
                training: { $in: trainings.map(training => training) },
                user: { $in: users.map(user => user._id) }
            }).session(session);
        } else {
            existingProgressRecords = await OverallTrainingProgress.find({
                training: { $in: trainings.map(training => training._id) },
                user: { $in: users.map(user => user._id) }
            }).session(session);
        }

        let trainingIds, trainingModuleCounts, trainingIdToModuleCount;
        let totalModuleCount;

        if (trainings.length > 0) {

            if (fromBackground) {
                trainingIds = trainings.map(training => ObjectId(training));
            } else {
                trainingIds = trainings.map(training => training._id);
            }

            trainingModuleCounts = await TrainingModule.aggregate([
                {
                    $match: { training: { $in: trainingIds }, isDeleted: { $ne: true } }
                },
                {
                    $group: {
                        _id: "$training",
                        count: { $sum: 1 }
                    }
                }
            ]).session(session);

            trainingIdToModuleCount = trainingModuleCounts.reduce((acc, { _id, count }) => {
                acc[_id] = count;
                return acc;
            }, {});

        }

        let trainingData;
        if (fromBackground) {
            trainingData = await Training.find({ _id: { $in: trainings.map(training => ObjectId(training)) } }).select('_id isCertificate durationHours').session(session).lean();
        } else {
            trainingData = await Training.find({ _id: { $in: trainings.map(training => training._id) } }).select('_id isCertificate durationHours').session(session).lean();
        }

        const trainingDataById = trainingData.reduce((acc, training) => {
            acc[training._id.toString()] = training;
            return acc;
        }, {});

        const existingProgressSet = new Set(
            existingProgressRecords.map(record => `${record.training.toString()}-${record.user.toString()}`)
        );

        const newProgressEntries = latestRegistrationId.flatMap(({ _id: registrationId, training }) =>
            users.map(user => {
                const progressKey = `${training.toString()}-${user._id.toString()}`;

                const isCertificatePresent = trainingDataById[training.toString()]?.isCertificate ?? false;
                const durationHours = trainingDataById[training.toString()]?.durationHours ?? 0;

                if (existingProgressSet.has(progressKey)) {
                    if (learningPlanId) {
                        return {
                            updateOne: {
                                filter: { training, user: user._id },
                                update: {
                                    $addToSet: { learningPlan: learningPlanId },
                                    $set: { unenrollmentDate: null, totalDuration: durationHours },
                                },
                            },
                        };
                    }

                    if (!learningPlanId) {
                        return {
                            updateOne: {
                                filter: { training, user: user._id },
                                update: {
                                    $set: { directEnrollment: true, unenrollmentDate: null, totalDuration: durationHours },
                                },
                            },
                        };
                    }

                    return null;
                }

                return {
                    updateOne: {
                        filter: { training, user: user._id },
                        update: {
                            $setOnInsert: {
                                learningPlan: learningPlanId ? [learningPlanId] : [],
                                directEnrollment: learningPlanId ? false : true,
                                training: training,
                                user: user._id,
                                trainingRegistration: registrationId,
                                subscriberId: subscriberId.toString(),
                                status: 'NOT_STARTED',
                                isEnrolled: true,
                                progressPercentage: 0.0,
                                completedModules: 0,
                                contentData: [],
                                totalDuration: durationHours,
                                totalTrainingModules: trainingIdToModuleCount[training],
                                startDate: null,
                                endDate: null,
                                unenrollmentDate: null,
                                isCertificatePresent: isCertificatePresent,
                            },
                        },
                        upsert: true,
                    },
                };

                // return {
                //     learningPlan: learningPlanId ? [learningPlanId] : [],
                //     directEnrollment: learningPlanId ? false : true,
                //     training: training,
                //     user: user._id,
                //     trainingRegistration: registrationId,
                //     subscriberId: subscriberId.toString(),
                //     status: 'NOT_STARTED',
                //     isEnrolled: true,
                //     progressPercentage: 0.0,
                //     completedModules: 0,
                //     contentData: [],
                //     totalTrainingModules: trainingIdToModuleCount[training] || 0,
                //     startDate: null,
                //     endDate: null,
                //     unenrollmentDate: null,
                // };

            })
        ).filter(entry => entry !== null);

        if (newProgressEntries.length > 0) {

            await OverallTrainingProgress.bulkWrite(newProgressEntries, { session });
        }
    } catch (error) {
        throw Error(error.message);
    }

    return true;
};

const getAutoSyncUsers = (async (groups) => {

    if (groups.length <= 0) {
        return [];
    }

    const autoSyncedUsers = await fetchUserFromAutoSyncedGroups(groups);
    if (autoSyncedUsers && autoSyncedUsers.length > 0) {
        return autoSyncedUsers;
    } else {
        return [];
    }
});
const getAutoSyncUsersOfSingleGroup = async (group) => {
    const groupArray = [{ groupType: group.groupType, groupId: group.groupId }];
    const autoSyncedUsers = await fetchUserFromAutoSyncedGroups(groupArray);
    if (autoSyncedUsers && autoSyncedUsers.length > 0) {
        return autoSyncedUsers;
    } else {
        return [];
    }
}

const getCustomGroupUsers = (async (groups) => {
    if (groups.length <= 0) {
        return [];
    }

    const users = [];
    const groupIds = groups.map(group => group.groupId);

    const getGroups = await GroupMember.find({ group: { $in: groupIds }, isDeleted: false });

    if (getGroups.length > 0) {

        users.push(...getGroups.map(group => group.member).filter(member => member != null));

        const groupOfGroups = getGroups.filter(group => group.groupType != null && group.groupData != null);

        if (groupOfGroups && groupOfGroups.length > 0) {

            const formattedGroups = groupOfGroups.map(group => ({
                groupType: group.groupType,
                groupId: group.groupData
            }));

            const membersInGroupGroups = await fetchUserFromAutoSyncedGroups(formattedGroups);

            users.push(...membersInGroupGroups);
            return [...users];
        }

        return users;
    }
    return [];

});

const combineTrainingModules = (data) => {

    const mergedData = {};

    data.forEach(item => {
        const { _id, trainingModules, ...rest } = item;

        if (!mergedData[_id]) {
            mergedData[_id] = { _id, ...rest, trainingModules: [] };
        }

        Object.keys(rest).forEach(key => {
            if (!mergedData[_id][key] && rest[key] !== undefined) {
                mergedData[_id][key] = rest[key];
            }
        });

        mergedData[_id].trainingModules.push(...trainingModules);
    });
    Object.keys(mergedData).forEach(id => {
        mergedData[id].trainingModules = Array.from(
            new Set(mergedData[id].trainingModules.map(JSON.stringify))
        ).map(JSON.parse);
    });

    return Object.values(mergedData);

}
const mergeContentDetails = (combineTrainingDetails, contentData) => {

    const contentDataMap = contentData.reduce((map, item) => {
        map[item._id] = item.contentData.reduce((contentMap, content) => {
            contentMap[content.contentId] = content;
            return contentMap;
        }, {});
        return map;
    }, {});

    combineTrainingDetails.forEach(entry => {
        entry.trainingModules.forEach(module => {
            module.trainingModuleContents.forEach(content => {
                content.trainingModuleContentDetails.forEach(detail => {
                    const moduleContentMap = contentDataMap[module._id];
                    if (moduleContentMap && moduleContentMap[detail._id]) {
                        const matchedContent = moduleContentMap[detail._id];
                        detail.progressPercentage = matchedContent.progressPercentage;
                        detail.status = matchedContent.status;
                        detail.lastAccessedDuration = matchedContent.lastAccessedDuration;
                        detail.videoId = matchedContent.videoId;
                        detail.videoDuration = matchedContent.videoDuration;
                        detail.quizAttemptDetails = matchedContent.quizAttemptDetails || {};
                    }
                });
            });
        });
    });

    return combineTrainingDetails;

}

const sendCourseMailsWithRetry = async (emailBatch, retryCount = 0) => {
    try {
        const emailPromises = emailBatch.map(async (email) => {
            const { to, subject, html } = email;
            if (to?.trim()?.length) {
                const result = await sendEmail({ receiverEmail: to, subject: subject, htmlContent: html });

                return result;
            } else {
                return Promise.reject(new Error("Invalid email address"));
            }
        });
        return await Promise.allSettled(emailPromises);
    } catch (error) {
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
const sendCourseEmailBulk = async (action = 'ENROLL') => {
    try {
        let results = [];
        while (true) {
            const emailBatch = await SqliteEmailHelper.fetchCourseEmailBatch(action);
            if (!emailBatch.length) break;

            // Generate HTML content dynamically
            const emailsToSend = emailBatch.map(email => {
                let html;
                const coursesData = JSON.parse(email.courses);

                switch (email.action) {
                    case 'ENROLL':
                        html = courseEnrollment({
                            firstName: email.firstName,
                            courses: coursesData,
                            isAdmin: Boolean(email.isAdmin),
                        });
                        break;
                    /*
                        case 'UNENROLL':
                             html = courseUnenrollmentEmail({
                            firstName: email.firstName,
                            courseTitle: coursesData.courseTitle,
                            email: email.email,
                        });
                        break;
                    */
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
            await SqliteEmailHelper.deleteCourseEmailBatch(emailIds);
        }

        // Return summary ( in case you have to verify success and errors, console the results)
        const { successCount, errorCount, errors } = summarizeResults(results);

        return { success: true, message: `Sent ${successCount}, failed ${errorCount}`, errors };

    } catch (error) {
        return { success: false, message: error.message };
    }
};

// Example helper to summarize results (adjust as needed)
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


module.exports = {
    enrolUserVerificationHelper,
    createTrainingProgressForMigrationUsersHelper,
    updateTrainingProgressesForMigrationUsersHelper,
    createTrainingProgressHelper,
    getAutoSyncUsers,
    getCustomGroupUsers,
    fetchUserFromAutoSyncedGroups,
    getAutoSyncUsersOfSingleGroup,
    combineTrainingModules,
    mergeContentDetails,
    extractTrainingContentData,
    sendCourseEmailBulk,
    createTrainingRegistration: async (input, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [Permission.CREATE_TRAINING_REGISTRATION],
                requiredAll: false,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
        try {
            if (!input.groups && !input.users) {
                throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Pass all the required fields!");
            }

            let existingTrainingRegs = [];
            if (input.trainings?.length) {
                existingTrainingRegs = await TrainingRegistration.find({ training: { $in: input.trainings } });
            }

            const userIds = [];
            const emails = [];
            let allUsersFetched = [];
            let autoSyncUsers;
            let customGroups;
            let customGroupUsers = [];

            if (input.users?.length > 0) {
                for (const user of input.users) {
                    if (ObjectId.isValid(user)) {
                        userIds.push(user);
                    } else {
                        emails.push(user);
                    }
                }

                const criteria = [];
                if (userIds.length) criteria.push({ _id: { $in: userIds } });
                if (emails.length) criteria.push({ email: { $in: emails?.map(email => encrypt(email)) } });

                const inputUsers = await User.find({ $or: criteria }).select('-consents');

                allUsersFetched = [...allUsersFetched, ...inputUsers];
            }

            if (input.groups && input.groups.length > 0) {

                autoSyncUsers = await getAutoSyncUsers(input.groups);

                customGroups = input.groups.filter(group => group.groupType === 'custom' || group.groupType === 'MEMBER' || group.groupType === 'GROUP');


                if (customGroups?.length > 0) {
                    customGroupUsers = await getCustomGroupUsers(customGroups);
                }

                allUsersFetched = [...autoSyncUsers, ...customGroupUsers];

            }

            const fetchedUserIds = allUsersFetched.map(user => user._id);

            let existingOverallProgresses = await OverallTrainingProgress.find({ training: { $in: input.trainings }, user: { $in: fetchedUserIds } });
            let nonNotificationRecievers = await OverallTrainingProgress.find({ training: { $in: input.trainings }, user: { $in: fetchedUserIds }, isEnrolled: { $ne: false } });

            const existingSetOfUserTrainings = new Set(
                nonNotificationRecievers.map(e => `${e.user.toString()}-${e.training.toString()}`)
            );

            const newEnrollments = [];

            for (const userId of fetchedUserIds) {
                for (const trainingId of input.trainings) {
                    const key = `${userId}-${trainingId}`;
                    if (!existingSetOfUserTrainings.has(key)) {
                        newEnrollments.push({ userId, trainingId });
                    }
                }
            }

            if (input.type === "ENROLL") {

                let users = [];

                users = Array.from(
                    new Map(allUsersFetched.map(user => [user._id.toString(), user])).values()
                );

                if (input.learningPlan) {
                    if (users.length > 0) {

                        const verifiedUsers = await enrolUserVerificationHelper(users);

                        if (verifiedUsers.unRegEmails.length > 0) {
                            throw CustomError(ErrorName.EMPLOYEE_NOT_REGISTERED);
                        }

                        if (verifiedUsers.invalidEmails.length > 0) {
                            throw CustomError(ErrorName.INVALID_EMAIL, 'Email is not valid for enrollment!');
                        }

                    }
                }

                let verifyRegistrationForReEnrollment;
                if (existingOverallProgresses?.length) {

                    // During re-enrollment
                    verifyRegistrationForReEnrollment = await enrolUserVerificationHelper(users, existingOverallProgresses, false);
                    if (verifyRegistrationForReEnrollment.unRegEmails.length > 0) {
                        throw CustomError(ErrorName.EMPLOYEE_NOT_REGISTERED, "Selected user is not registered!");
                    };

                }

                let userObjectIds = [];
                if (users?.length) {
                    userObjectIds = users.map(user => user._id);
                }

                if (!input.learningPlan) {

                    const alreadyExistInCourse = await OverallTrainingProgress.find({ user: { $in: userObjectIds }, training: { $in: input.trainings }, isEnrolled: false });
                    if (alreadyExistInCourse?.length) {
                        await OverallTrainingProgress.updateMany(
                            { user: { $in: userObjectIds }, training: { $in: input.trainings }, isEnrolled: false },
                            { $set: { isEnrolled: true, directEnrollment: true, unenrollmentDate: null } }
                        );
                    }
                }

                const savedTrainingRegistration = await DbTransactionHelper.performDbTransaction(
                    async session => {

                        const batchUID = await BatchHelper.generateBatchUID({ subscriberId, session });

                        const existingTrainingIds = existingTrainingRegs.map(t => t.training.toString());
                        const existingTrainingRegIds = existingTrainingRegs.map(t => t._id);

                        const newTrainingIds = input.trainings.filter(id => !existingTrainingIds.includes(id.toString()));

                        const updateFields = { subscriber: subscriberId, $addToSet: {} };
                        if (userObjectIds?.length) {
                            updateFields.$addToSet.users = { $each: userObjectIds };
                        }

                        if (input.groups?.length) {
                            updateFields.$addToSet.groups = { $each: input.groups };
                        }

                        let savedTrainingRegistration;
                        let trainingRegistrationIds = [];
                        let notEnrolledUsers = [];

                        if (existingTrainingRegs?.length) {

                            savedTrainingRegistration = await TrainingRegistration.updateMany(
                                { _id: { $in: existingTrainingRegIds } },
                                updateFields,
                                { session }
                            );

                            const updatedRegistrations = await TrainingRegistration.find({
                                training: { $in: existingTrainingIds }
                            }).session(session);
                            trainingRegistrationIds = updatedRegistrations && updatedRegistrations.map(({ _id, training }) => ({ _id, training }));
                        }

                        const newRegistrations = newTrainingIds.map(trainingId => ({
                            ...updateFields,
                            training: trainingId,
                            users: userObjectIds || [],
                            groups: input.groups || []
                        }));

                        if (newRegistrations?.length) {

                            savedTrainingRegistration = await TrainingRegistration.insertMany(newRegistrations, { session });

                            trainingRegistrationIds = savedTrainingRegistration && savedTrainingRegistration.map(({ _id, training }) => ({ _id, training }));
                        }

                        if (savedTrainingRegistration) {

                            let trainingProgressData;

                            let learningPlanId = input.learningPlan ? input.learningPlan._id : null;

                            const alreadyEnrolledUsers = await OverallTrainingProgress.find({
                                training: { $in: input.trainings.map(training => training._id) },
                                user: { $in: users.map(user => user._id) },
                                isEnrolled: { $ne: false },
                                isDeleted: { $ne: true }
                            }).session(session);

                            const enrollmentMap = {};
                            alreadyEnrolledUsers.forEach(enrollment => {
                                const key = `${enrollment.user.toString()}-${enrollment.training.toString()}`;
                                enrollmentMap[key] = true;
                            });

                            notEnrolledUsers = users.filter(user => {
                                return input.trainings.some(training => {
                                    const key = `${user._id.toString()}-${training._id.toString()}`;
                                    return !enrollmentMap[key];
                                });
                            });

                            trainingProgressData = await createTrainingProgressHelper(users, input.trainings, subscriberId, trainingRegistrationIds, learningPlanId, session);

                        }

                        const learningPlan = await LearningPlan.findById(input.learningPlan).select('emailNotification -_id');
                        if (input.learningPlan && learningPlan?.emailNotification === false) {
                            return savedTrainingRegistration;
                        }
                        const trainingsData = await Training.find({ _id: { $in: input.trainings } });
                        const subRoleAdminId = await SubRole.findOne({ name: Roles.ADMIN, primaryRole: Roles.ADMIN }).select("_id");

                        // users.forEach(async user => {
                        //     const isAdmin = user?.subRoles?.includes(subRoleAdminId?._id);
                        //     const coursesData = await Promise.all(
                        //         trainingsData.map(async (training) => {
                        //             const courseImage = await AWS_HELPER.fetchFile(training?.coverImage?.url) ||
                        //                 'https://squadra-media-assets.s3.amazonaws.com/public/course-image.png';
                        //             return {
                        //                 trainingTitle: training?.title?.[0]?.value || ' ',
                        //                 durationHours: ((training?.durationHours || 0) / 60).toFixed(1),
                        //                 courseImage,
                        //             };
                        //         })
                        //     );
                        //     const emailContent = courseEnrollment({
                        //         firstName: user.firstName,
                        //         courses: coursesData,
                        //         isAdmin: isAdmin
                        //     });
                        //     // sendEmail({
                        //     //     receiverEmail: user.email,
                        //     //     subject: "Course Enrollment",
                        //     //     htmlContent: emailContent,
                        //     // });
                        // });
                        // Fetch all course images in one go and store them in a Map

                        const imageUrlMap = new Map(await Promise.all(
                            trainingsData.map(async training => [
                                training?._id,
                                await AWS_HELPER.fetchFile(training?.coverImage?.url) ||
                                'https://squadra-media-assets.s3.amazonaws.com/public/course-image.png'
                            ])
                        ));

                        // Preprocess course data once

                        if (!input.learningPlan) {
                            const coursesDataMap = trainingsData.map(training => ({
                                trainingTitle: training?.title?.[0]?.value || ' ',
                                durationHours: ((training?.durationHours || 0) / 60).toFixed(1),
                                courseImage: imageUrlMap.get(training?._id),
                            }));

                            // Prepare email data for insertion into SQLite queue
                            const emailData = notEnrolledUsers
                                .filter(user => user.isEmailNotification)
                                .map(user => {
                                    let firstName = "";
                                    let email = "";

                                    if (user.firstName) {
                                        firstName = decrypt(user.firstName, true);
                                    }

                                    if (user.email) {
                                        email = decrypt(user.email, false);
                                    }

                                    return {
                                        receiverEmail: email,
                                        firstName: firstName,
                                        courses: coursesDataMap,
                                        isAdmin: user?.subRoles?.includes(subRoleAdminId?._id),
                                    };
                                });

                            // Insert emails into the course_emails table
                            SqliteEmailHelper.insertCourseEmails(emailData);
                            // Send the emails batch by batch. Uncomment for sending emails.
                            await sendCourseEmailBulk();
                        }
                        if (input.learningPlan) {

                            const usersData = await User.find({ _id: { $in: userIds } });
                            const trainingsData = await Training.find({ _id: { $in: input.trainings } });
                            const progressEntries = await OverallTrainingProgress.find({
                                user: { $in: userIds },
                                training: { $in: input.trainings },
                            }).select("user training").lean();

                            // Step 2: Map user -> Set of enrolled trainingIds
                            const userProgressMap = new Map(); // userId -> Set of trainingIds

                            for (const entry of progressEntries) {
                                const userId = entry.user.toString();
                                const trainingId = entry.training.toString();
                                if (!userProgressMap.has(userId)) {
                                    userProgressMap.set(userId, new Set());
                                }
                                userProgressMap.get(userId).add(trainingId);
                            }

                            // Step 3: Prepare email data
                            const emailData = [];

                            for (const user of usersData) {
                                if (!user.isEmailNotification) continue;

                                const userId = user._id.toString();
                                const enrolledTrainings = userProgressMap.get(userId) || new Set();

                                const isMissingAnyTraining = input?.trainings?.some(
                                    tId => !enrolledTrainings.has(tId)
                                );

                                if (!isMissingAnyTraining) continue; // skip if already enrolled in all

                                // ⬇️ ✅ Send all trainings, not just missing ones
                                const courses = trainingsData?.map(training => ({
                                    trainingTitle: training?.title?.[0]?.value || ' ',
                                    durationHours: ((training?.durationHours || 0) / 60).toFixed(1),
                                    courseImage: imageUrlMap.get(training._id.toString())
                                }));

                                let decryptedFirstName1 = '';
                                let decryptedEmail1 = '';

                                if (user?.firstName) {
                                    decryptedFirstName1 = decrypt(user.firstName);
                                }
                                if (user?.email) {
                                    decryptedEmail1 = decrypt(user.email);
                                }

                                emailData.push({
                                    receiverEmail: decryptedFirstName1,
                                    firstName: decryptedEmail1,
                                    isAdmin: user?.subRoles?.includes(subRoleAdminId?._id),
                                    courses
                                });
                            }

                            // Step 4: Insert into SQLite queue and send
                            SqliteEmailHelper.insertCourseEmails(emailData);
                            await sendCourseEmailBulk();
                        }

                        const elasticSearchUpdateStatus = await updateCoursesCountAndProgressInElasticSearch(userObjectIds, session);

                        return savedTrainingRegistration;
                    }
                );
                const learningPlan = await LearningPlan.findById(input.learningPlan).select('pushNotification -_id');
                if (input.learningPlan && learningPlan?.pushNotification === false) {
                    return {
                        message: "Course enrollment successful!",
                    };
                }

                const trainingProgressDocuments = await OverallTrainingProgress.find({
                    user: { $in: userObjectIds },
                    training: { $in: input.trainings }
                });

                const trainingProgressMap = new Map();

                trainingProgressDocuments.forEach(doc => {
                    const key = `${doc.user.toString()}_${doc.training.toString()}`;
                    trainingProgressMap.set(key, doc._id);
                });

                // Batch fetch all training titles and store in a Map for quick lookup
                const trainingTitlesMap = new Map(
                    (await Training.find({ _id: { $in: input.trainings } }).select('title'))
                        .map(({ _id, title }) => [_id.toString(), title?.[0]?.value || "a new course"])
                );

                // Precompute training progress IDs for quick lookup
                const trainingProgressMapComputed = new Map(
                    userObjectIds.flatMap(userId =>
                        input.trainings.map(trainingId => {
                            const key = `${userId}_${trainingId}`;
                            return [key, trainingProgressMap.get(key)];
                        })
                    )
                );
                // Generate notifications using flatMap()
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
                } else {
                    throw CustomError(ErrorName.SELECTED_GROUP_DONOT_HAVE_ANY_MEMEBER, "Selected Group doesn't have members enrollment is not possible");
                }
                const trainingtitle = await Training.find({ _id: input.trainings }).select('title -_id');

                LogHelper.logActivity({
                    subscriber: subscriberId,
                    logType: LogType.TRAINING_REGISTRATION_LOG,
                    operation: "CREATE",
                    ipInfo: context.ipInfo,
                    affected: [
                        {
                            targetRef: "TrainingRegistration",
                            target: savedTrainingRegistration._id,
                        },
                    ],
                    additionalInfo: [
                        {
                            infoType: "TRAINING_REGISTRATION_INFO",
                            infoData: JSON.stringify(input),
                        },
                    ],
                    createdBy: userInfo,
                });

                let decryptedFirstName2;
                let decryptedLastName2;

                if (userInfo?.firstName) {
                    decryptedFirstName2 = decrypt(userInfo.firstName);
                }
                if (userInfo?.lastName) {
                    decryptedLastName2 = decrypt(userInfo.lastName);
                }
                await sendNotifications({
                    userIds: userObjectIds,
                    title: "Course Enrollment",
                    body: `You have been enrolled in a new course by ${decryptedFirstName2} ${decryptedLastName2 || ''}.`,
                    content: { type: "COURSE_ENROLLMENT", courseIds: input.trainings },
                    webUrl: ""
                });
                return {
                    message: "Course enrollment successful!",
                };

            }

            if (input.type === "UNENROLL") {

                if (!input.users) {
                    throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Pass all the required fields!");
                }

                const userIds = [];
                const emails = [];

                for (const user of input.users) {
                    if (ObjectId.isValid(user)) {
                        userIds.push(user);
                    } else {
                        emails.push(user);
                    }
                }

                const criteria = [];
                if (userIds.length) criteria.push({ _id: { $in: userIds } });
                if (emails.length) criteria.push({ email: { $in: emails?.map(email => encrypt(email)) } });

                const inputUsers = await User.find({ $or: criteria });

                let userObjectIds = [];
                if (inputUsers?.length) {
                    userObjectIds = inputUsers.map(user => user._id);

                    const verifiedUsers = await enrolUserVerificationHelper(inputUsers, existingOverallProgresses, true);

                    if (verifiedUsers.invalidEmails.length > 0) {
                        throw CustomError(ErrorName.INVALID_EMAIL, 'Email is not valid!');
                    }

                    if (verifiedUsers.alreadyEnrolledEmails.length != userObjectIds.length) {
                        throw CustomError(ErrorName.EMPLOYEE_NOT_ENROLLED, "Selected employee is not enrolled before!");
                    }
                }

                const unenrollTrainingRegistration = await DbTransactionHelper.performDbTransaction(
                    async session => {

                        if (!existingOverallProgresses) {
                            throw CustomError(ErrorName.NOT_FOUND, "Pass the training ID");
                        }

                        const userObjectIdStrings = userObjectIds.map(id => id.toString());

                        const existTrainingReg = await TrainingRegistration.find({ training: { $in: input.trainings } });
                        const updatedUsersInTraining = existTrainingReg[0].users.filter(
                            userId => !userObjectIdStrings.includes(userId.toString())
                        );

                        existTrainingReg[0].users = updatedUsersInTraining;
                        const updateTrainingRegistration = await existTrainingReg[0].save({ session });

                        if (!updateTrainingRegistration) throw CustomError(ErrorName.FAILED);
                        const unenrollmentDate = new Date();
                        const unenrollUsers = await OverallTrainingProgress.updateMany(
                            { user: { $in: userObjectIds }, training: { $in: existingOverallProgresses.map(t => t.training) } },
                            {
                                $set: {
                                    isEnrolled: false,
                                    directEnrollment: false,
                                    unenrollmentDate: unenrollmentDate,
                                }
                            },
                            { session }
                        );

                        const resetUsers = await OverallTrainingProgress.updateMany(
                            { user: { $in: userObjectIds }, training: { $in: existingOverallProgresses.map(t => t.training) }, status: { $ne: 'COMPLETED' } },
                            {
                                $set: {
                                    contentData: [],
                                    progressPercentage: 0.00,
                                    lastConsumedContent: {},
                                    startDate: null,
                                    endDate: null,
                                    unenrollmentDate: new Date(),
                                    status: 'NOT_STARTED',
                                    attemptCount: 1,
                                    timeSpend: 0,
                                    learningPlan: [],
                                    finishedCourseFirstTime: false,
                                }
                            },
                            { session }
                        );

                        const unenrolledUsers = await OverallTrainingProgress.find({
                            user: { $in: userObjectIds },
                            training: { $in: existingOverallProgresses.map(t => t.training) },
                            status: { $ne: 'COMPLETED' }
                        }).session(session);

                        const unenrolledUserIds = unenrolledUsers.map(user => user._id);

                        const deleteTrainingProgresses = await TrainingProgress.deleteMany({
                            overallTrainingProgress: { $in: unenrolledUserIds }
                        });

                        const trainings = await Training.aggregate([
                            { $match: { _id: { $in: input.trainings } } },
                            { $project: { title: 1 } }
                        ]);

                        const elasticSearchUpdateStatus = await updateCoursesCountAndProgressInElasticSearch(userObjectIds, session);
                        // inputUsers.forEach(user => {
                        //     trainings.forEach(training => {
                        //         const trainingTitle = training.title && training.title.length > 0 ? training.title[0].value : ' ';
                        //         const emailContent = courseUnenrollmentEmail({
                        //             firstName: user.firstName,
                        //             email: user.email,
                        //             courseTitle: trainingTitle,
                        //         });
                        //         sendEmail({
                        //             receiverEmail: user.email,
                        //             subject: `Unenrolled from ${trainingTitle}`,
                        //             htmlContent: emailContent,
                        //         });
                        //     });
                        // });

                        // // Create a map of training IDs to titles
                        // const trainingMap = new Map(
                        //     trainings.map(training => [
                        //         training._id.toString(),
                        //         training.title?.[0]?.value || ' '
                        //     ])
                        // );

                        // // Generate email payloads
                        // const emailData = inputUsers.flatMap(user =>
                        //     input.trainings.map(trainingId => ({
                        //         receiverEmail: user.email,
                        //         subject: `Unenrolled from ${trainingMap.get(trainingId.toString()) || ' '}`,
                        //         firstName: user.firstName,
                        //         courses: JSON.stringify({ courseTitle: trainingMap.get(trainingId.toString()) || ' ' }),
                        //         action: 'UNENROLL',
                        //         status: 'PENDING'
                        //     }))
                        // );

                        // // Insert emails into the course_emails table
                        // SqliteEmailHelper.insertCourseEmails(emailData);
                        // // Send the emails batch by batch
                        // await sendCourseEmailBulk(action = 'UNENROLL');

                        return updateTrainingRegistration;
                    }
                );
                // for (const userId of userObjectIds) {
                //     await Promise.all(
                //         input.trainings.map(async (trainingId) => {
                //             try {
                //                 const trainingtitle = await Training.find({ _id: trainingId }).select('title -_id');
                //                 await NotificationHelper.createNotificationhelper({
                //                     subscriber: subscriberId,
                //                     titleValue: `${trainingtitle[0]?.title?.[0]?.value} has been unenrolled to you`,
                //                     messageValue: ` You have been successfully unenrolled to a new Course: ${trainingtitle[0]?.title?.[0]?.value}.`,
                //                     notificationType: NotificationType.COURSE_UNENROLLMENT,
                //                     notifyAllAdmin: false,
                //                     notifiers: [
                //                         userId
                //                     ],
                //                     employeeNotifiers: [userId],
                //                     affected: [],
                //                     status: 'SENT',
                //                     icon: notificationiconEnum.SUCCESS,
                //                     createdBy: userInfo,
                //                     additionalInfo: [
                //                         {
                //                             infoType: "VIEW_COURSE",
                //                             infoData: {
                //                                 filePath: trainingId
                //                             }
                //                         }
                //                     ]
                //                 });
                //             } catch (error) {
                //                 throw Error(error.message);
                //             }
                //         })
                //     );
                // }

                // Fetch all training titles in one go
                const trainingTitles = await Training.find({ _id: { $in: input.trainings } }).select('_id title');

                const trainingMap = new Map(
                    trainingTitles.map(training => [
                        training._id.toString(),
                        training.title?.[0]?.value || 'Unknown Training'
                    ])
                );

                /* 
                    const notifications = userObjectIds.flatMap(userId =>
                        input.trainings.map(trainingId => ({
                        subscriber: subscriberId,
                        titleValue: `${trainingMap.get(trainingId.toString())} has been unenrolled to you`,
                        messageValue: `You have been successfully unenrolled from the course: ${trainingMap.get(trainingId.toString())}.`,
                        notificationType: NotificationType.COURSE_UNENROLLMENT,
                        notifyAllAdmin: false,
                        isNotificatonForAdmin : false,
                        notifiers: [userId],
                        employeeNotifiers: [userId],
                        affected: [],
                        status: 'SENT',
                        icon: notificationiconEnum.SUCCESS,
                        createdBy: userInfo,
                            additionalInfo: [
                                {
                                infoType: "VIEW_COURSE",
                                infoData: { filePath: trainingId }
                            }
                        ]
                    }))
                ); 
                */

                // Send all notifications in parallel
                /* await Promise.all(notifications.map(n => NotificationHelper.createNotificationhelper(n)));
                const trainingtitle = await Training.find({ _id: input.trainings }).select('title -_id');
                if (userObjectIds.length > 1) {
                    
                        await NotificationHelper.createNotificationhelper({
                        subscriber: subscriberId,
                        titleValue: `Course Unenrollment`,
                        messageValue: `${userInfo?.firstName} ${userInfo?.lastName ?? ''} has unenrolled ${userObjectIds.length} users from Course: ${trainingtitle[0]?.title?.[0]?.value}.`,
                        notificationType: NotificationType.NEW_COURSE_ENROLLMENT,
                        notifyAllAdmin: true,
                        notifiers: [],
                        employeeNotifiers: [],
                        affected: [],
                        status: 'SENT',
                        icon: notificationiconEnum.SUCCESS,
                        createdBy: userInfo,
                    });
                
                } else {
                    
                    const user = await User.find({ _id: { $in: userObjectIds } }).select('firstName -_id');
                        await NotificationHelper.createNotificationhelper({
                        subscriber: subscriberId,
                        titleValue: `Course Unenrollment`,
                        messageValue: `${userInfo?.firstName} ${userInfo?.lastName ?? ''} has unenrolled ${user[0].firstName} from the Course: ${trainingtitle[0]?.title?.[0]?.value}.`,
                        notificationType: NotificationType.NEW_COURSE_ENROLLMENT,
                        notifyAllAdmin: true,
                        notifiers: [],
                        employeeNotifiers: [],
                        affected: [],
                        status: 'SENT',
                        icon: notificationiconEnum.SUCCESS,
                        createdBy: userInfo,
                    });
                } */
                return {
                    message: "Course unenrollment successful!",
                }

            }

        } catch (error) {
            throw CustomError(ErrorName.FAILED, error.message);
        }
    },

    createTrainingRegistrationBackgroundProcess: async (input, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        // console.log("createTrainingRegistrationBackgroundProcess input:", input);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [Permission.CREATE_TRAINING_REGISTRATION],
                requiredAll: false,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);
        try {
            if (!input.groups && !input.users) {
                throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Pass all the required fields!");
            }

            let existingTrainingRegs = [];
            if (input.trainings?.length) {
                existingTrainingRegs = await TrainingRegistration.find({ training: { $in: input.trainings } });
            }

            const userIds = [];
            const emails = [];
            let allUsersFetched = [];
            let autoSyncUsers;
            let customGroups;
            let customGroupUsers = [];

            if (input.users?.length > 0) {
                for (const user of input.users) {
                    if (ObjectId.isValid(user)) {
                        userIds.push(user);
                    } else {
                        emails.push(user);
                    }
                }

                const criteria = [];
                if (userIds.length) criteria.push({ _id: { $in: userIds } });
                if (emails.length) criteria.push({ email: { $in: emails } });

                const inputUsers = await User.find({ $or: criteria }).select('-consents');

                allUsersFetched = [...allUsersFetched, ...inputUsers];
            }

            if (input?.groups && input?.groups.length > 0) {

                autoSyncUsers = await getAutoSyncUsers(input?.groups);

                customGroups = input?.groups.filter(group => group.groupType === 'custom' || group.groupType === 'MEMBER' || group.groupType === 'GROUP');


                if (customGroups?.length > 0) {
                    customGroupUsers = await getCustomGroupUsers(customGroups);
                }

                allUsersFetched = [...autoSyncUsers, ...customGroupUsers];

            }

            const fetchedUserIds = allUsersFetched.map(user => user._id);

            let existingOverallProgresses = await OverallTrainingProgress.find({ training: { $in: input.trainings }, user: { $in: fetchedUserIds } });
            let nonNotificationRecievers = await OverallTrainingProgress.find({ training: { $in: input.trainings }, user: { $in: fetchedUserIds }, isEnrolled: { $ne: false } });

            const existingSetOfUserTrainings = new Set(
                nonNotificationRecievers.map(e => `${e.user.toString()}-${e.training.toString()}`)
            );

            const newEnrollments = [];

            for (const userId of fetchedUserIds) {
                for (const trainingId of input.trainings) {
                    const key = `${userId}-${trainingId}`;
                    if (!existingSetOfUserTrainings.has(key)) {
                        newEnrollments.push({ userId, trainingId });
                    }
                }
            }

            if (input.type === "ENROLL") {

                let users = [];

                users = Array.from(
                    new Map(allUsersFetched.map(user => [user._id.toString(), user])).values()
                );

                if (input.learningPlan) {
                    if (users.length > 0) {

                        const verifiedUsers = await enrolUserVerificationHelper(users);

                        if (verifiedUsers.unRegEmails.length > 0) {
                            throw CustomError(ErrorName.EMPLOYEE_NOT_REGISTERED);
                        }

                        if (verifiedUsers.invalidEmails.length > 0) {
                            throw CustomError(ErrorName.INVALID_EMAIL, 'Email is not valid for enroll 1!');
                        }

                    }
                }

                let verifyRegistrationForReEnrollment;
                if (existingOverallProgresses?.length) {

                    // During re-enrollment
                    verifyRegistrationForReEnrollment = await enrolUserVerificationHelper(users, existingOverallProgresses, false);
                    if (verifyRegistrationForReEnrollment.unRegEmails.length > 0) {
                        throw CustomError(ErrorName.EMPLOYEE_NOT_REGISTERED, "Selected user is not registered!");
                    };

                }

                let userObjectIds = [];
                if (users?.length) {
                    userObjectIds = users.map(user => user._id);
                }

                if (!input.learningPlan) {

                    const alreadyExistInCourse = await OverallTrainingProgress.find({ user: { $in: userObjectIds }, training: { $in: input.trainings }, isEnrolled: false });
                    if (alreadyExistInCourse?.length) {
                        await OverallTrainingProgress.updateMany(
                            { user: { $in: userObjectIds }, training: { $in: input.trainings }, isEnrolled: false },
                            { $set: { isEnrolled: true, directEnrollment: true, unenrollmentDate: null } }
                        );
                    }
                }

                const savedTrainingRegistration = await DbTransactionHelper.performDbTransaction(
                    async session => {

                        const batchUID = await BatchHelper.generateBatchUID({ subscriberId, session });

                        const existingTrainingIds = existingTrainingRegs.map(t => t.training.toString());
                        const existingTrainingRegIds = existingTrainingRegs.map(t => t._id);

                        const newTrainingIds = input.trainings.filter(id => !existingTrainingIds.includes(id.toString()));

                        const updateFields = { subscriber: subscriberId, $addToSet: {} };
                        if (userObjectIds?.length) {
                            updateFields.$addToSet.users = { $each: userObjectIds };
                        }

                        if (input?.groups?.length > 0) {
                            updateFields.$addToSet.groups = { $each: input.groups };
                        }

                        let savedTrainingRegistration;
                        let trainingRegistrationIds = [];
                        let notEnrolledUsers = [];

                        if (existingTrainingRegs?.length > 0) {

                            savedTrainingRegistration = await TrainingRegistration.updateMany(
                                { _id: { $in: existingTrainingRegIds } },
                                updateFields,
                                { session }
                            );

                            const updatedRegistrations = await TrainingRegistration.find({
                                training: { $in: existingTrainingIds }
                            }).session(session);
                            trainingRegistrationIds = updatedRegistrations && updatedRegistrations.map(({ _id, training }) => ({ _id, training }));
                        }

                        const newRegistrations = newTrainingIds.map(trainingId => ({
                            ...updateFields,
                            training: trainingId,
                            users: userObjectIds || [],
                            groups: input?.groups || []
                        }));

                        if (newRegistrations?.length) {

                            savedTrainingRegistration = await TrainingRegistration.insertMany(newRegistrations, { session });

                            trainingRegistrationIds = savedTrainingRegistration && savedTrainingRegistration.map(({ _id, training }) => ({ _id, training }));
                        }

                        if (savedTrainingRegistration) {

                            let trainingProgressData;

                            let learningPlanId = input.learningPlan ? input.learningPlan : null;

                            const alreadyEnrolledUsers = await OverallTrainingProgress.find({
                                training: { $in: input.trainings.map(training => training) },
                                user: { $in: users.map(user => user._id) },
                                isEnrolled: { $ne: false },
                                isDeleted: { $ne: true }
                            }).session(session);

                            const enrollmentMap = {};
                            alreadyEnrolledUsers.forEach(enrollment => {
                                const key = `${enrollment.user.toString()}-${enrollment.training.toString()}`;
                                enrollmentMap[key] = true;
                            });

                            notEnrolledUsers = users.filter(user => {
                                return input.trainings.some(training => {
                                    // const key = `${user._id.toString()}-${training._id.toString()}`;
                                    const key = `${user._id.toString()}-${training.toString()}`;
                                    return !enrollmentMap[key];
                                });
                            });

                            const fromBackground = true;

                            trainingProgressData = await createTrainingProgressHelper(users, input.trainings, subscriberId, trainingRegistrationIds, learningPlanId, session, fromBackground);

                        }

                        const learningPlan = await LearningPlan.findById(input.learningPlan).select('emailNotification -_id');
                        if (input.learningPlan && learningPlan?.emailNotification === false) {
                            return savedTrainingRegistration;
                        }
                        const trainingsData = await Training.find({ _id: { $in: input.trainings } });
                        const subRoleAdminId = await SubRole.findOne({ name: Roles.ADMIN, primaryRole: Roles.ADMIN }).select("_id");

                        // users.forEach(async user => {
                        //     const isAdmin = user?.subRoles?.includes(subRoleAdminId?._id);
                        //     const coursesData = await Promise.all(
                        //         trainingsData.map(async (training) => {
                        //             const courseImage = await AWS_HELPER.fetchFile(training?.coverImage?.url) ||
                        //                 'https://squadra-media-assets.s3.amazonaws.com/public/course-image.png';
                        //             return {
                        //                 trainingTitle: training?.title?.[0]?.value || ' ',
                        //                 durationHours: ((training?.durationHours || 0) / 60).toFixed(1),
                        //                 courseImage,
                        //             };
                        //         })
                        //     );
                        //     const emailContent = courseEnrollment({
                        //         firstName: user.firstName,
                        //         courses: coursesData,
                        //         isAdmin: isAdmin
                        //     });
                        //     // sendEmail({
                        //     //     receiverEmail: user.email,
                        //     //     subject: "Course Enrollment",
                        //     //     htmlContent: emailContent,
                        //     // });
                        // });
                        // Fetch all course images in one go and store them in a Map

                        const imageUrlMap = new Map(await Promise.all(
                            trainingsData.map(async training => [
                                training?._id,
                                await AWS_HELPER.fetchFile(training?.coverImage?.url) ||
                                'https://squadra-media-assets.s3.amazonaws.com/public/course-image.png'
                            ])
                        ));

                        // Preprocess course data once

                        if (!input.learningPlan) {
                            const coursesDataMap = trainingsData.map(training => ({
                                trainingTitle: training?.title?.[0]?.value || ' ',
                                durationHours: ((training?.durationHours || 0) / 60).toFixed(1),
                                courseImage: imageUrlMap.get(training?._id),
                            }));

                            // Prepare email data for insertion into SQLite queue
                            const emailData = notEnrolledUsers.filter(user => user.isEmailNotification).map(user => {
                                let decryptedEmail3 = '';
                                let decryptedFirstName3 = '';
                                if (user.email) {
                                    decryptedEmail3 = decrypt(user.email);
                                }
                                if (user.firstName) {
                                    decryptedFirstName3 = decrypt(user.firstName, true);
                                }
                                return {
                                    receiverEmail: decryptedEmail3,
                                    firstName: decryptedFirstName3,
                                    courses: coursesDataMap,
                                    isAdmin: user?.subRoles?.includes(subRoleAdminId?._id),
                                };
                            });

                            // Insert emails into the course_emails table
                            SqliteEmailHelper.insertCourseEmails(emailData);
                            // Send the emails batch by batch
                            await sendCourseEmailBulk();
                        }
                        if (input.learningPlan) {

                            const usersData = await User.find({ _id: { $in: userIds } });
                            const trainingsData = await Training.find({ _id: { $in: input.trainings } });
                            const progressEntries = await OverallTrainingProgress.find({
                                user: { $in: userIds },
                                training: { $in: input.trainings },
                            }).select("user training").lean();

                            // Step 2: Map user -> Set of enrolled trainingIds
                            const userProgressMap = new Map(); // userId -> Set of trainingIds

                            for (const entry of progressEntries) {
                                const userId = entry.user.toString();
                                const trainingId = entry.training.toString();
                                if (!userProgressMap.has(userId)) {
                                    userProgressMap.set(userId, new Set());
                                }
                                userProgressMap.get(userId).add(trainingId);
                            }

                            // Step 3: Prepare email data
                            const emailData = [];

                            for (const user of usersData) {
                                if (!user.isEmailNotification) continue;

                                const userId = user._id.toString();
                                const enrolledTrainings = userProgressMap.get(userId) || new Set();

                                const isMissingAnyTraining = input?.trainings?.some(
                                    tId => !enrolledTrainings.has(tId)
                                );

                                if (!isMissingAnyTraining) continue;

                                // ⬇️ ✅ Send all trainings, not just missing ones
                                const courses = trainingsData?.map(training => ({
                                    trainingTitle: training?.title?.[0]?.value || ' ',
                                    durationHours: ((training?.durationHours || 0) / 60).toFixed(1),
                                    courseImage: imageUrlMap.get(training._id.toString())
                                }));

                                let decryptedFirstName4 = '';
                                let decryptedEmail4 = '';

                                if (user?.firstName) {
                                    decryptedFirstName4 = decrypt(user.firstName);
                                }
                                if (user?.email) {
                                    decryptedEmail4 = decrypt(user.email);
                                }
                                emailData.push({
                                    receiverEmail: decryptedEmail4,
                                    firstName: decryptedFirstName4,
                                    isAdmin: user?.subRoles?.includes(subRoleAdminId?._id),
                                    courses
                                });
                            }

                            // Step 4: Insert into SQLite queue and send
                            SqliteEmailHelper.insertCourseEmails(emailData);
                            await sendCourseEmailBulk();
                        }

                        return savedTrainingRegistration;
                    }
                );
                const learningPlan = await LearningPlan.findById(input.learningPlan).select('pushNotification -_id');
                if (input.learningPlan && learningPlan?.pushNotification === false) {
                    return {
                        message: "Course enrollment successful!",
                    };
                }

                const trainingProgressDocuments = await OverallTrainingProgress.find({
                    user: { $in: userObjectIds },
                    training: { $in: input.trainings }
                });

                const trainingProgressMap = new Map();

                trainingProgressDocuments.forEach(doc => {
                    const key = `${doc.user.toString()}_${doc.training.toString()}`;
                    trainingProgressMap.set(key, doc._id);
                });

                // Batch fetch all training titles and store in a Map for quick lookup
                const trainingTitlesMap = new Map(
                    (await Training.find({ _id: { $in: input.trainings } }).select('title'))
                        .map(({ _id, title }) => [_id.toString(), title?.[0]?.value || "a new course"])
                );

                // Precompute training progress IDs for quick lookup
                const trainingProgressMapComputed = new Map(
                    userObjectIds.flatMap(userId =>
                        input.trainings.map(trainingId => {
                            const key = `${userId}_${trainingId}`;
                            return [key, trainingProgressMap.get(key)];
                        })
                    )
                );
                // Generate notifications using flatMap()
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

                /**
                 * i have no idea why this error is being thrown and 
                 * it is throwing this error when there is no users matching the learning plan condition 
                 * 
                 * if someone finds a valid reason , @todo: please uncomment the code 
                 */

                /* else { 
                    throw CustomError(ErrorName.SELECTED_GROUP_DONOT_HAVE_ANY_MEMEBER, "Selected Group doesn't have members enrollment is not possible");
                } */
                const trainingtitle = await Training.find({ _id: input.trainings }).select('title -_id');

                LogHelper.logActivity({
                    subscriber: subscriberId,
                    logType: LogType.TRAINING_REGISTRATION_LOG,
                    operation: "CREATE",
                    ipInfo: context.ipInfo,
                    affected: [
                        {
                            targetRef: "TrainingRegistration",
                            target: savedTrainingRegistration._id,
                        },
                    ],
                    additionalInfo: [
                        {
                            infoType: "TRAINING_REGISTRATION_INFO",
                            infoData: JSON.stringify(input),
                        },
                    ],
                    createdBy: userInfo,
                });

                let decryptedFirstName5 = '';
                let decryptedLastName5 = '';
                if (userInfo?.firstName) {
                    decryptedFirstName5 = decrypt(userInfo.firstName, true);
                }
                if (userInfo?.lastName) {
                    decryptedLastName5 = decrypt(userInfo.lastName, true);
                }

                await sendNotifications({
                    userIds: userObjectIds,
                    title: "Course Enrollment",
                    body: `You have been enrolled in a new course by ${decryptedFirstName5 || ''} ${decryptedLastName5 || ''}.`,
                    content: { type: "COURSE_ENROLLMENT", courseIds: input.trainings },
                    webUrl: ""
                });
                return {
                    message: "Course enrollment successful!",
                };

            }

            if (input.type === "UNENROLL") {

                if (!input.users) {
                    throw CustomError(ErrorName.ARGUMENTS_REQUIRED, "Pass all the required fields!");
                }

                const userIds = [];
                const emails = [];

                for (const user of input.users) {
                    if (ObjectId.isValid(user)) {
                        userIds.push(user);
                    } else {
                        emails.push(user);
                    }
                }

                const criteria = [];
                if (userIds.length) criteria.push({ _id: { $in: userIds } });
                if (emails.length) criteria.push({ email: { $in: emails } });

                const inputUsers = await User.find({ $or: criteria });

                let userObjectIds = [];
                if (inputUsers?.length) {
                    userObjectIds = inputUsers.map(user => user._id);

                    const verifiedUsers = await enrolUserVerificationHelper(inputUsers, existingOverallProgresses, true);

                    if (verifiedUsers.invalidEmails.length > 0) {
                        throw CustomError(ErrorName.INVALID_EMAIL, 'Email is not valid for unenroll!');
                    }

                    if (verifiedUsers.alreadyEnrolledEmails.length != userObjectIds.length) {
                        throw CustomError(ErrorName.EMPLOYEE_NOT_ENROLLED, "Selected employee is not enrolled before!");
                    }
                }

                const unenrollTrainingRegistration = await DbTransactionHelper.performDbTransaction(
                    async session => {

                        if (!existingOverallProgresses) {
                            throw CustomError(ErrorName.NOT_FOUND, "Pass the training ID");
                        }

                        const userObjectIdStrings = userObjectIds.map(id => id.toString());

                        const existTrainingReg = await TrainingRegistration.find({ training: { $in: input.trainings } });
                        const updatedUsersInTraining = existTrainingReg[0].users.filter(
                            userId => !userObjectIdStrings.includes(userId.toString())
                        );

                        existTrainingReg[0].users = updatedUsersInTraining;
                        const updateTrainingRegistration = await existTrainingReg[0].save({ session });

                        if (!updateTrainingRegistration) throw CustomError(ErrorName.FAILED);
                        const unenrollmentDate = new Date();
                        const unenrollUsers = await OverallTrainingProgress.updateMany(
                            { user: { $in: userObjectIds }, training: { $in: existingOverallProgresses.map(t => t.training) } },
                            {
                                $set: {
                                    isEnrolled: false,
                                    directEnrollment: false,
                                    unenrollmentDate: unenrollmentDate,
                                }
                            },
                            { session }
                        );

                        const resetUsers = await OverallTrainingProgress.updateMany(
                            { user: { $in: userObjectIds }, training: { $in: existingOverallProgresses.map(t => t.training) }, status: { $ne: 'COMPLETED' } },
                            {
                                $set: {
                                    contentData: [],
                                    progressPercentage: 0.00,
                                    lastConsumedContent: {},
                                    startDate: null,
                                    endDate: null,
                                    unenrollmentDate: new Date(),
                                    status: 'NOT_STARTED',
                                    attemptCount: 1,
                                    timeSpend: 0,
                                    learningPlan: [],
                                    finishedCourseFirstTime: false,
                                }
                            },
                            { session }
                        );

                        const unenrolledUsers = await OverallTrainingProgress.find({
                            user: { $in: userObjectIds },
                            training: { $in: existingOverallProgresses.map(t => t.training) },
                            status: { $ne: 'COMPLETED' }
                        }).session(session);

                        const unenrolledUserIds = unenrolledUsers.map(user => user._id);

                        const deleteTrainingProgresses = await TrainingProgress.deleteMany({
                            overallTrainingProgress: { $in: unenrolledUserIds }
                        });

                        const trainings = await Training.aggregate([
                            { $match: { _id: { $in: input.trainings } } },
                            { $project: { title: 1 } }
                        ]);
                        // inputUsers.forEach(user => {
                        //     trainings.forEach(training => {
                        //         const trainingTitle = training.title && training.title.length > 0 ? training.title[0].value : ' ';
                        //         const emailContent = courseUnenrollmentEmail({
                        //             firstName: user.firstName,
                        //             email: user.email,
                        //             courseTitle: trainingTitle,
                        //         });
                        //         sendEmail({
                        //             receiverEmail: user.email,
                        //             subject: `Unenrolled from ${trainingTitle}`,
                        //             htmlContent: emailContent,
                        //         });
                        //     });
                        // });

                        // // Create a map of training IDs to titles
                        // const trainingMap = new Map(
                        //     trainings.map(training => [
                        //         training._id.toString(),
                        //         training.title?.[0]?.value || ' '
                        //     ])
                        // );

                        // // Generate email payloads
                        // const emailData = inputUsers.flatMap(user =>
                        //     input.trainings.map(trainingId => ({
                        //         receiverEmail: user.email,
                        //         subject: `Unenrolled from ${trainingMap.get(trainingId.toString()) || ' '}`,
                        //         firstName: user.firstName,
                        //         courses: JSON.stringify({ courseTitle: trainingMap.get(trainingId.toString()) || ' ' }),
                        //         action: 'UNENROLL',
                        //         status: 'PENDING'
                        //     }))
                        // );

                        // // Insert emails into the course_emails table
                        // SqliteEmailHelper.insertCourseEmails(emailData);
                        // // Send the emails batch by batch
                        // await sendCourseEmailBulk(action = 'UNENROLL');

                        return updateTrainingRegistration;
                    }
                );
                // for (const userId of userObjectIds) {
                //     await Promise.all(
                //         input.trainings.map(async (trainingId) => {
                //             try {
                //                 const trainingtitle = await Training.find({ _id: trainingId }).select('title -_id');
                //                 await NotificationHelper.createNotificationhelper({
                //                     subscriber: subscriberId,
                //                     titleValue: `${trainingtitle[0]?.title?.[0]?.value} has been unenrolled to you`,
                //                     messageValue: ` You have been successfully unenrolled to a new Course: ${trainingtitle[0]?.title?.[0]?.value}.`,
                //                     notificationType: NotificationType.COURSE_UNENROLLMENT,
                //                     notifyAllAdmin: false,
                //                     notifiers: [
                //                         userId
                //                     ],
                //                     employeeNotifiers: [userId],
                //                     affected: [],
                //                     status: 'SENT',
                //                     icon: notificationiconEnum.SUCCESS,
                //                     createdBy: userInfo,
                //                     additionalInfo: [
                //                         {
                //                             infoType: "VIEW_COURSE",
                //                             infoData: {
                //                                 filePath: trainingId
                //                             }
                //                         }
                //                     ]
                //                 });
                //             } catch (error) {
                //                 throw Error(error.message);
                //             }
                //         })
                //     );
                // }

                // Fetch all training titles in one go
                const trainingTitles = await Training.find({ _id: { $in: input.trainings } }).select('_id title');

                const trainingMap = new Map(
                    trainingTitles.map(training => [
                        training._id.toString(),
                        training.title?.[0]?.value || 'Unknown Training'
                    ])
                );

                /* 
                    const notifications = userObjectIds.flatMap(userId =>
                        input.trainings.map(trainingId => ({
                        subscriber: subscriberId,
                        titleValue: `${trainingMap.get(trainingId.toString())} has been unenrolled to you`,
                        messageValue: `You have been successfully unenrolled from the course: ${trainingMap.get(trainingId.toString())}.`,
                        notificationType: NotificationType.COURSE_UNENROLLMENT,
                        notifyAllAdmin: false,
                        isNotificatonForAdmin : false,
                        notifiers: [userId],
                        employeeNotifiers: [userId],
                        affected: [],
                        status: 'SENT',
                        icon: notificationiconEnum.SUCCESS,
                        createdBy: userInfo,
                            additionalInfo: [
                                {
                                infoType: "VIEW_COURSE",
                                infoData: { filePath: trainingId }
                            }
                        ]
                    }))
                ); 
                */

                // Send all notifications in parallel
                /* await Promise.all(notifications.map(n => NotificationHelper.createNotificationhelper(n)));
                const trainingtitle = await Training.find({ _id: input.trainings }).select('title -_id');
                if (userObjectIds.length > 1) {
                    
                        await NotificationHelper.createNotificationhelper({
                        subscriber: subscriberId,
                        titleValue: `Course Unenrollment`,
                        messageValue: `${userInfo?.firstName} ${userInfo?.lastName ?? ''} has unenrolled ${userObjectIds.length} users from Course: ${trainingtitle[0]?.title?.[0]?.value}.`,
                        notificationType: NotificationType.NEW_COURSE_ENROLLMENT,
                        notifyAllAdmin: true,
                        notifiers: [],
                        employeeNotifiers: [],
                        affected: [],
                        status: 'SENT',
                        icon: notificationiconEnum.SUCCESS,
                        createdBy: userInfo,
                    });
                
                } else {
                    
                    const user = await User.find({ _id: { $in: userObjectIds } }).select('firstName -_id');
                        await NotificationHelper.createNotificationhelper({
                        subscriber: subscriberId,
                        titleValue: `Course Unenrollment`,
                        messageValue: `${userInfo?.firstName} ${userInfo?.lastName ?? ''} has unenrolled ${user[0].firstName} from the Course: ${trainingtitle[0]?.title?.[0]?.value}.`,
                        notificationType: NotificationType.NEW_COURSE_ENROLLMENT,
                        notifyAllAdmin: true,
                        notifiers: [],
                        employeeNotifiers: [],
                        affected: [],
                        status: 'SENT',
                        icon: notificationiconEnum.SUCCESS,
                        createdBy: userInfo,
                    });
                } */
                return {
                    message: "Course unenrollment successful!",
                }

            }

        } catch (error) {
            throw CustomError(ErrorName.FAILED, error.message);
        }

    },
    sendNotificationOnCRUD: async notificationData => {
        try {
            const employeeName = notificationData.trainingRegistration.employee?.user?.firstName;

            const notification = {
                subscriber: notificationData.subscriber,
                title: [{ lang: "en", value: `Course registration ${notificationData.action}` }],
                message: [
                    {
                        lang: "en",
                        value: `Admin User "${decrypt(notificationData.createdBy.firstName)}" ${notificationData.action} training registration for "${employeeName}"`,
                    },
                ],
                notificationType:
                    NotificationType["TRAINING_REGISTRATION_" + notificationData.action],
                notifyAllAdmin: true,
                isNotificatonForAdmin: true,
                notifiers: [],
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
                                    notificationData.trainingRegistration.employee?.user?.firstName,
                                lastName:
                                    notificationData.trainingRegistration.employee?.user?.lastName,
                            },
                        },
                    },
                ],
                createdBy: notificationData.createdBy,
            };

            // await NotificationHelper.createNotification(notification);
        } catch (e) {
            throw CustomError(ErrorName.FAILED, e.message);
        }
    }
};
