
const { CustomError, ErrorName, UploadHelper } = require("../../util");
const ExcelJS = require('exceljs');
const aws_helper = require("../../util/aws_helper");
const NotificationType = require("../notifications/notification_type.json");
const notificationiconEnum = require("../notifications/notification_icon.json");
const NotificationHelper = require("../notifications/notification_helper");
const ReportsHelper = require("./reports_helper");
const { decrypt, encrypt } = require("../../util/encryption_helper");
const { connectDb, closeDb } = require("../../util/child_process_db_helper");
const { Types } = require('mongoose');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ReportsEmailOutboxHelper = require("./reports_email_outbox/reports_email_outbox_helper");
const { SystemStatsEmailConfig } = require("./system_stats_email_config_model");


// Mongoose Models
const { Vessel } = require("../vessle/vessel_model");
const { User } = require("../user/user_model");
const { OverallTrainingProgress } = require("../training-registrations/overall-course-progress/overall_progress_model");

const performSystemStatsGeneration = async ({ subscriberId, userId, userInfo }) => {
    if (!subscriberId) throw new Error("Forbidden: subscriberId is missing.");

    try {
        console.log("Starting system stats aggregation...");

        // 1. Main Pipeline: Stats per Vessel
        const pipeline = [
            {
                $match: { isDeleted: false, isActive: true },
            },
            {
                $lookup: {
                    from: "companies",
                    localField: "companyName",
                    foreignField: "name",
                    as: "company",
                },
            },
            {
                $unwind: { path: "$company", preserveNullAndEmptyArrays: true },
            },
            // Lookup Users and their progress in a nested way to avoid exploding the main pipeline
            {
                $lookup: {
                    from: "users",
                    let: { vesselId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$currentVessel", "$$vesselId"] },
                                isDeleted: false,
                                isActive: true,
                                vesselStatus: { $in: ["ONBOARDED", "ASSIGNED"] },
                                isSignupAdminAprroved: true
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                isResetPasswordDialog: 1,
                                firebaseTokens: 1
                            }
                        },
                        // Nested lookup for progress
                        {
                            $lookup: {
                                from: "overalltrainingprogresses",
                                localField: "_id",
                                foreignField: "user",
                                pipeline: [
                                    { $match: { isDeleted: { $ne: true } } },
                                    { $project: { status: 1, isFromMigration: 1, training: 1 } }
                                ],
                                as: "progress"
                            }
                        },
                        // Calculate flags per user
                        {
                            $addFields: {
                                hasEnrollment: { $gt: [{ $size: "$progress" }, 0] },
                                enrolledTrainingIds: {
                                    $map: { input: "$progress", as: "p", in: "$$p.training" }
                                },
                                hasStarted: {
                                    $gt: [
                                        {
                                            $size: {
                                                $filter: {
                                                    input: "$progress",
                                                    cond: {
                                                        $and: [
                                                            { $in: ["$$this.status", ["IN_PROGRESS", "COMPLETED"]] },
                                                            { $ne: ["$$this.isFromMigration", true] }
                                                        ]
                                                    }
                                                }
                                            }
                                        },
                                        0
                                    ]
                                },
                                completedCoursesCount: {
                                    $size: {
                                        $filter: {
                                            input: "$progress",
                                            cond: { $eq: ["$$this.status", "COMPLETED"] }
                                        }
                                    }
                                },
                                // Logic: Logged In if isResetPasswordDialog is true
                                hasLoggedIn: { $eq: ["$isResetPasswordDialog", true] },
                                // Logic: Mobile if firebaseTokens array is not empty
                                isMobile: { $gt: [{ $size: { $ifNull: ["$firebaseTokens", []] } }, 0] }
                            }
                        }
                    ],
                    as: "vesselUsers"
                }
            },
            // Project final stats by reducing the vesselUsers array
            {
                $project: {
                    _id: 0,
                    vesselName: "$name",
                    companyName: "$companyName",
                    totalUsers: { $size: "$vesselUsers" },
                    usersLoggedIn: {
                        $size: {
                            $filter: {
                                input: "$vesselUsers",
                                cond: { $eq: ["$$this.hasLoggedIn", true] }
                            }
                        }
                    },
                    usersNotLoggedIn: {
                        $size: {
                            $filter: {
                                input: "$vesselUsers",
                                cond: { $eq: ["$$this.hasLoggedIn", false] }
                            }
                        }
                    },
                    totalEnrolledUsers: {
                        $size: {
                            $setUnion: {
                                $reduce: {
                                    input: "$vesselUsers.enrolledTrainingIds",
                                    initialValue: [],
                                    in: { $concatArrays: ["$$value", "$$this"] }
                                }
                            }
                        }
                    },
                    usersStartedCourses: {
                        $size: {
                            $filter: {
                                input: "$vesselUsers",
                                cond: { $eq: ["$$this.hasStarted", true] }
                            }
                        }
                    },
                    totalCoursesCompleted: { $sum: "$vesselUsers.completedCoursesCount" },
                    usersWithNoEnrollment: {
                        $size: {
                            $filter: {
                                input: "$vesselUsers",
                                cond: { $eq: ["$$this.hasEnrollment", false] }
                            }
                        }
                    },
                    usersMobileApp: {
                        $size: {
                            $filter: {
                                input: "$vesselUsers",
                                cond: {
                                    $and: [
                                        { $eq: ["$$this.hasLoggedIn", true] },
                                        { $eq: ["$$this.isMobile", true] }
                                    ]
                                }
                            }
                        }
                    },
                    usersWebOnly: {
                        $size: {
                            $filter: {
                                input: "$vesselUsers",
                                cond: {
                                    $and: [
                                        { $eq: ["$$this.hasLoggedIn", true] },
                                        { $eq: ["$$this.isMobile", false] }
                                    ]
                                }
                            }
                        }
                    }
                }
            },
            {
                $sort: {
                    companyName: 1,
                    vesselName: 1
                }
            }
        ];

        // 2. Pipeline for Users with NO Vessel
        const noVesselPipeline = [
            {
                $match: {
                    $or: [{ currentVessel: null }, { currentVessel: { $exists: false } }],
                    isDeleted: false,
                    isActive: true,
                    vesselStatus: { $in: ["ONBOARDED", "ASSIGNED"] },
                    isSignupAdminAprroved: true
                }
            },
            {
                $project: {
                    _id: 1,
                    isResetPasswordDialog: 1,
                    firebaseTokens: 1
                }
            },
            {
                $lookup: {
                    from: "overalltrainingprogresses",
                    localField: "_id",
                    foreignField: "user",
                    pipeline: [
                        { $match: { isDeleted: { $ne: true } } },
                        { $project: { status: 1, isFromMigration: 1, training: 1 } }
                    ],
                    as: "progress"
                }
            },
            {
                $addFields: {
                    hasEnrollment: { $gt: [{ $size: "$progress" }, 0] },
                    enrolledTrainingIds: {
                        $map: { input: "$progress", as: "p", in: "$$p.training" }
                    },
                    hasStarted: {
                        $gt: [
                            {
                                $size: {
                                    $filter: {
                                        input: "$progress",
                                        cond: {
                                            $and: [
                                                { $in: ["$$this.status", ["IN_PROGRESS", "COMPLETED"]] },
                                                { $ne: ["$$this.isFromMigration", true] }
                                            ]
                                        }
                                    }
                                }
                            },
                            0
                        ]
                    },
                    completedCoursesCount: {
                        $size: {
                            $filter: {
                                input: "$progress",
                                cond: { $eq: ["$$this.status", "COMPLETED"] }
                            }
                        }
                    },
                    hasLoggedIn: { $eq: ["$isResetPasswordDialog", true] },
                    isMobile: { $gt: [{ $size: { $ifNull: ["$firebaseTokens", []] } }, 0] }
                }
            },
            {
                $group: {
                    _id: null,
                    totalUsers: { $sum: 1 },
                    usersLoggedIn: { $sum: { $cond: ["$hasLoggedIn", 1, 0] } },
                    usersNotLoggedIn: { $sum: { $cond: [{ $not: "$hasLoggedIn" }, 1, 0] } },
                    allEnrolledTrainingIds: { $push: "$enrolledTrainingIds" },

                    usersStartedCourses: { $sum: { $cond: ["$hasStarted", 1, 0] } },
                    totalCoursesCompleted: { $sum: "$completedCoursesCount" },
                    usersWithNoEnrollment: { $sum: { $cond: [{ $not: "$hasEnrollment" }, 1, 0] } },
                    usersMobileApp: { $sum: { $cond: [{ $and: ["$hasLoggedIn", "$isMobile"] }, 1, 0] } },
                    usersWebOnly: { $sum: { $cond: [{ $and: ["$hasLoggedIn", { $not: "$isMobile" }] }, 1, 0] } }
                }
            },
            {
                $project: {
                    totalUsers: 1,
                    usersLoggedIn: 1,
                    usersNotLoggedIn: 1,
                    totalEnrolledUsers: {
                        $size: {
                            $setUnion: {
                                $reduce: {
                                    input: "$allEnrolledTrainingIds",
                                    initialValue: [],
                                    in: { $concatArrays: ["$$value", "$$this"] }
                                }
                            }
                        }
                    },
                    usersStartedCourses: 1,
                    totalCoursesCompleted: 1,
                    usersWithNoEnrollment: 1,
                    usersMobileApp: 1,
                    usersWebOnly: 1
                }
            }
        ];

        // Setup ExcelJS Workbook and Stream
        const tempFilePath = path.join(os.tmpdir(), `Vessel_Report-${Date.now()}.xlsx`);
        const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
            filename: tempFilePath,
            useStyles: true,
            useSharedStrings: true
        });

        const worksheet = workbook.addWorksheet('System Stats');

        worksheet.columns = [
            { header: 'Company Name', key: 'companyName', width: 30 },
            { header: 'Vessel Name', key: 'vesselName', width: 30 },
            { header: 'Total Users', key: 'totalUsers', width: 15 },
            { header: 'Users Accepted the Invite', key: 'usersLoggedIn', width: 25 },
            { header: 'Users Not Accepted the Invite', key: 'usersNotLoggedIn', width: 25 },
            { header: 'Total Courses Enrolled', key: 'totalEnrolledUsers', width: 25 },
            { header: 'Total Courses Completed', key: 'totalCoursesCompleted', width: 25 },
            { header: 'Users Started At Least One Course', key: 'usersStartedCourses', width: 25 },
            { header: 'Users Enrolled to Zero Courses', key: 'usersWithNoEnrollment', width: 25 },
            { header: 'Users Logged In on Web Only', key: 'usersWebOnly', width: 25 },
            { header: 'Users Logged In on Mobile App', key: 'usersMobileApp', width: 25 }
        ];

        // Initialize Grand Totals
        let grandTotal = {
            totalUsers: 0,
            usersLoggedIn: 0,
            usersNotLoggedIn: 0,
            totalEnrolledUsers: 0,
            totalCoursesCompleted: 0,
            usersStartedCourses: 0,
            usersWithNoEnrollment: 0,
            usersWebOnly: 0,
            usersMobileApp: 0
        };

        const addToTotal = (doc) => {
            grandTotal.totalUsers += doc.totalUsers || 0;
            grandTotal.usersLoggedIn += doc.usersLoggedIn || 0;
            grandTotal.usersNotLoggedIn += doc.usersNotLoggedIn || 0;
            grandTotal.totalEnrolledUsers += doc.totalEnrolledUsers || 0;
            grandTotal.totalCoursesCompleted += doc.totalCoursesCompleted || 0;
            grandTotal.usersStartedCourses += doc.usersStartedCourses || 0;
            grandTotal.usersWithNoEnrollment += doc.usersWithNoEnrollment || 0;
            grandTotal.usersWebOnly += doc.usersWebOnly || 0;
            grandTotal.usersMobileApp += doc.usersMobileApp || 0;
        };

        // Execute Main Vessel Pipeline
        const cursor = Vessel.aggregate(pipeline).option({ allowDiskUse: true }).cursor({ batchSize: 100 });

        let count = 0;
        for await (const doc of cursor) {
            worksheet.addRow({
                companyName: doc.companyName || "No Company",
                vesselName: doc.vesselName || "No Vessel",
                totalUsers: doc.totalUsers || 0,
                usersLoggedIn: doc.usersLoggedIn || 0,
                usersNotLoggedIn: doc.usersNotLoggedIn || 0,
                totalEnrolledUsers: doc.totalEnrolledUsers || 0,
                usersStartedCourses: doc.usersStartedCourses || 0,
                totalCoursesCompleted: doc.totalCoursesCompleted || 0,
                usersWithNoEnrollment: doc.usersWithNoEnrollment || 0,
                usersWebOnly: doc.usersWebOnly || 0,
                usersMobileApp: doc.usersMobileApp || 0
            }).commit();

            addToTotal(doc);
            count++;
        }

        // Execute No-Vessel Pipeline
        const noVesselStats = await User.aggregate(noVesselPipeline).option({ allowDiskUse: true });

        if (noVesselStats.length > 0) {
            const doc = noVesselStats[0];
            worksheet.addRow({
                companyName: "N/A",
                vesselName: "Users without Vessel",
                totalUsers: doc.totalUsers || 0,
                usersLoggedIn: doc.usersLoggedIn || 0,
                usersNotLoggedIn: doc.usersNotLoggedIn || 0,
                totalEnrolledUsers: doc.totalEnrolledUsers || 0,
                usersStartedCourses: doc.usersStartedCourses || 0,
                totalCoursesCompleted: doc.totalCoursesCompleted || 0,
                usersWithNoEnrollment: doc.usersWithNoEnrollment || 0,
                usersWebOnly: doc.usersWebOnly || 0,
                usersMobileApp: doc.usersMobileApp || 0
            }).commit();

            addToTotal(doc);
            count++;
        }

        // Add Grand Total Row
        worksheet.addRow({
            companyName: "TOTAL",
            vesselName: "",
            totalUsers: grandTotal.totalUsers,
            usersLoggedIn: grandTotal.usersLoggedIn,
            usersNotLoggedIn: grandTotal.usersNotLoggedIn,
            totalEnrolledUsers: grandTotal.totalEnrolledUsers,
            totalCoursesCompleted: grandTotal.totalCoursesCompleted,
            usersStartedCourses: grandTotal.usersStartedCourses,
            usersWithNoEnrollment: grandTotal.usersWithNoEnrollment,
            usersWebOnly: grandTotal.usersWebOnly,
            usersMobileApp: grandTotal.usersMobileApp
        }).commit();

        console.log(`Aggregation and writing complete. Processed ${count} rows (including no-vessel and total).`);

        await worksheet.commit();
        await workbook.commit();

        const fileBuffer = fs.readFileSync(tempFilePath);

        const excelFilePath = await UploadHelper.uploadExcel({
            data: fileBuffer,
            folderName: "Vessel_Progress_Reports",
            fileName: `Vessel_Report-${await ReportsHelper.generateFileNameTimestamp()}.xlsx`,
            uploadType: UploadHelper.uploadType.exportLearnersCoursesReportAsExcel,
        });

        // Clean up temp file
        fs.unlinkSync(tempFilePath);

        if (excelFilePath) {
            const s3PresignedUrl = await aws_helper.fetchFile(excelFilePath);
            console.log("---------------------------------------------------");
            console.log("GENERATED REPORT URL:", s3PresignedUrl);
            console.log("---------------------------------------------------");

            const emailConfig = await SystemStatsEmailConfig.findOne({ subscriber: subscriberId, type: "SYSTEM_STATS" });
            const recipientEmails = emailConfig?.to?.length > 0 ? emailConfig.to : ["arya.g@squadramedia.com"];
            const ccEmails = emailConfig?.cc || ["aantika@squadramedia.com", "ashwin@squadramedia.com"];

            const emailSubject = "Daily Vessel-wise User Activity Report";

            let outboxId = null;

            try {
                outboxId = await ReportsEmailOutboxHelper.createOutboxEntry({
                    from: `${process.env.SUBSCRIBER_NAME} <${process.env.EMAIL_VERIFIED_SENDER}>`,
                    to: recipientEmails,
                    cc: ccEmails,
                    subject: emailSubject,
                    filePath: excelFilePath
                });

                await aws_helper.sendEmailWithAttachment({
                    receiverEmail: recipientEmails,
                    ccEmail: ccEmails,
                    subject: emailSubject,
                    text: `Dear Team,

Please find attached the Vessel-wise User Activity Report for today.

The report includes the following metrics:
- Total Users (Onboard + Assigned)
- Users Accepted the Invite
- Users Not Accepted the invite
- Total Courses Enrolled
- Total courses completed
- Users Started at least one Course
- Users Enrolled to 0 Courses
- Users Logged in on Web Only
- Users Logged in on Mobile App

Please feel free to reach out in case of any queries or concerns.

Thanks,
Seaverse LMS – Automated Reporting System`,
                    filename: `Vessel_Report-${new Date().toISOString().split('T')[0]}.xlsx`,
                    fileBuffer: fileBuffer
                });

                if (outboxId) {
                    await ReportsEmailOutboxHelper.updateOutboxStatus(outboxId, "COMPLETED");
                }

            } catch (emailError) {
                console.error("Failed to send email:", emailError);
                if (outboxId) {
                    await ReportsEmailOutboxHelper.updateOutboxStatus(outboxId, "ERROR", emailError.message);
                }
            }

            process.send({
                type: "REPORT_EXPORT_SUCCESS",
                payload: {
                    subscriber: subscriberId,
                    titleValue: `Main Vessel Report Exported Successfully`,
                    messageValue: `The main vessel report has been successfully generated and exported by ${userInfo._id === "SYSTEM" ? userInfo.firstName : decrypt(userInfo?.firstName)} ${userInfo._id === "SYSTEM" ? (userInfo.lastName || '') : (userInfo?.lastName ? decrypt(userInfo?.lastName) : '')}.`,
                    notificationType: NotificationType.REPORT_EXPORT_SUCCESS,
                    notifyAllAdmin: false,
                    isNotificatonForAdmin: true,
                    notifiers: [userInfo._id],
                    additionalInfo: [
                        {
                            infoType: "EXPORT_URL",
                            infoData: {
                                filePath: excelFilePath
                            }
                        }
                    ],
                    status: 'SENT',
                    createdBy: userInfo,
                    icon: notificationiconEnum.SUCCESS,
                    downloadLink: s3PresignedUrl
                }
            });
        }

        console.log("Child process finished successfully.");

    } catch (error) {
        console.error("Error in child process:", error);
        process.send({
            type: "REPORT_EXPORT_FAILED",
            payload: {
                subscriber: subscriberId,
                titleValue: `Main Vessel Report Export Failed`,
                messageValue: `An error occurred while generating the vessel report.`,
                notificationType: NotificationType.REPORT_EXPORT_FAILED,
                notifyAllAdmin: false,
                isNotificatonForAdmin: true,
                notifiers: [userInfo._id],
                status: 'FAILED',
                icon: notificationiconEnum.ERROR,
                createdBy: userInfo,
            }
        });
    }
};

const monitorMemory = () => {
    const usage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    console.log(`[MEMORY] Heap used: ${usage}MB`);
    return usage;
};

const memoryInterval = setInterval(monitorMemory, 30000);

(async () => {
    await connectDb();

    process.on('message', async (message) => {
        console.log('Child process received a message from parent.');
        const { payload } = message;
        try {
            if (global.gc) {
                global.gc();
            }
            await performSystemStatsGeneration(payload);
            if (global.gc) {
                global.gc();
            }
        } catch (err) {
            console.error("Error:", err);
        } finally {
            clearInterval(memoryInterval);
            closeDb();
            process.exit(0);
        }
    });
})();

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});
