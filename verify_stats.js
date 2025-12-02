require('dotenv').config();
const mongoose = require('mongoose');
const { Vessel } = require('./src/app/vessle/vessel_model');
const { User } = require('./src/app/user/user_model');
const { OverallTrainingProgress } = require('./src/app/training-registrations/overall-course-progress/overall_progress_model');

const connectDb = async () => {
    try {
        await mongoose.connect(process.env.MONGO_DB, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('Connected to DB');
    } catch (err) {
        console.error('DB Connection Error:', err);
        process.exit(1);
    }
};

const runVerification = async () => {
    await connectDb();

    console.log("Running aggregation...");

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
                    }
                ],
                as: "vesselUsers"
            }
        },
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
        { $limit: 5 }
    ];

    const results = await Vessel.aggregate(pipeline);
    console.log(JSON.stringify(results, null, 2));

    process.exit(0);
};

runVerification();
