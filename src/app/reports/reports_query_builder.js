const singleLearnerEnrollmentReportQuery = queryStages => {

    const {
        matchUsers,
        matchUsersFromTrainingProgresses,
        matchStage,
        sortingStage,
        pageLimit,
        deletedUsersStage,
    } = queryStages;

    const pipeline = [
        {
            $lookup: {
                from: "trainings",
                localField: "training",
                foreignField: "_id",
                as: "trainingInfo",
                pipeline: [
                    {
                        $project: {
                            _id: 1,
                            title: 1,
                        },
                    },
                ],
            },
        },
        {
            $lookup: {
                from: "users",
                localField: "user",
                foreignField: "_id",
                as: "userInfo",
                pipeline: [
                    {
                        $project: {
                            _id: 1,
                            isRegistered: 1,
                            firstName: 1,
                            lastName: 1,
                            email: 1,
                            civilIdOrPassport: 1,
                            currentVessel: 1,
                            isDeleted: 1,
                            vesselStatus: 1,
                        },
                    },
                ],
            },
        },
        {
            $lookup: {
                from: "employees",
                localField: "user",
                foreignField: "user",
                as: "employeeInfo",
                pipeline: [
                    {
                        $project: {
                            empDesignation: 1,
                            isDeleted: 1,
                        },
                    },
                ],
            },
        },
        {
            $match: {
                $or: [{ isEnrolled: true }, { status: "COMPLETED" }],
            },
        },
        ...matchUsers,
        {
            $lookup: {
                from: "trainingprogresses",
                localField: "_id",
                foreignField: "overallTrainingProgress",
                as: "quizevaluationInfo",
                let: {
                    attemptCount: "$attemptCount",
                },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $eq: ["$attemptCount", "$$attemptCount"],
                            },
                        },
                    },
                    {
                        $lookup: {
                            from: "trainingmodulecontents",
                            localField: "trainingModuleContent",
                            foreignField: "_id",
                            as: "contentInfo",
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $eq: ["$contentType", "QUIZ"],
                                        },
                                    },
                                },
                                {
                                    $project: {
                                        _id: 1,
                                        contentType: 1,
                                        quizAttemptDetails: 1,
                                    },
                                },
                            ],
                        },
                    },
                    {
                        $unwind: {
                            path: "$contentInfo",
                            preserveNullAndEmptyArrays: false,
                        },
                    },
                    {
                        $sort: {
                            updatedAt: -1,
                        },
                    },
                    {
                        $limit: 1,
                    },
                    {
                        $project: {
                            percentage: "$quizAttemptDetails.percentage",
                            isPassed: "$quizAttemptDetails.isPassed",
                        },
                    },
                ],
            },
        },
        {
            $unwind: {
                path: "$quizevaluationInfo",
                preserveNullAndEmptyArrays: true,
            },
        },
        {
            $unwind: {
                path: "$userInfo",
                preserveNullAndEmptyArrays: true,
            },
        },
        {
            $unwind: {
                path: "$employeeInfo",
                preserveNullAndEmptyArrays: true,
            },
        },
        ...deletedUsersStage,
        {
            $lookup: {
                from: "designations",
                localField: "employeeInfo.empDesignation",
                foreignField: "_id",
                as: "designationInfo",
                pipeline: [
                    {
                        $project: {
                            _id: 1,
                            name: 1,
                        },
                    },
                ],
            },
        },
        {
            $unwind: {
                path: "$designationInfo",
                preserveNullAndEmptyArrays: true,
            },
        },
        {
            $lookup: {
                from: "vessels",
                localField: "userInfo.currentVessel",
                foreignField: "_id",
                as: "vesselInfo",
                pipeline: [
                    {
                        $project: {
                            _id: 1,
                            name: 1,
                            typeOfVessel: 1,
                        },
                    },
                ],
            },
        },
        {
            $unwind: {
                path: "$vesselInfo",
                preserveNullAndEmptyArrays: true,
            },
        },
        {
            $lookup: {
                from: "vesseltypes",
                localField: "vesselInfo.typeOfVessel",
                foreignField: "_id",
                as: "vesselTypeInfo",
                pipeline: [
                    {
                        $project: {
                            _id: 1,
                            name: 1,
                        },
                    },
                ],
            },
        },
        {
            $unwind: { path: "$vesselTypeInfo", preserveNullAndEmptyArrays: true },
        },
        {
            $lookup: {
                from: "trainingprogress",
                localField: "training",
                foreignField: "training",
                as: "trainingProgressInfo",
                pipeline: [
                    ...matchUsersFromTrainingProgresses,
                    {
                        $lookup: {
                            from: "trainingmodulecontents",
                            localField: "trainingModuleContent",
                            foreignField: "_id",
                            as: "moduleContentInfo",
                        },
                    },
                    {
                        $unwind: {
                            path: "$moduleContentInfo",
                            preserveNullAndEmptyArrays: true,
                        },
                    },
                    {
                        $project: {
                            duration: "$moduleContentInfo.duration",
                        },
                    },
                ],
            },
        },
        ...matchStage,
        {
            $project: {
                firstName: "$userInfo.firstName",
                lastName: { $ifNull: ["$userInfo.lastName", ""] },
                email: "$userInfo.email",
                employeeId: "$userInfo.civilIdOrPassport",
                designation: "$designationInfo.name",
                isRegistered: "$userInfo.isRegistered",
                vesselName: "$vesselInfo.name",
                vesselTypeName: "$vesselTypeInfo.name",
                courseId: "$training",
                courseName: {
                    $arrayElemAt: ["$trainingInfo.title.value", 0],
                },
                createdAt: 1,
                unenrollmentDate: 1,
                startDate: "$startDate",
                completionDate: "$endDate",
                status: 1,
                adminMarkedAsCompleted: 1,
                updatedAt: 1,
                quizPercentage: {
                    $ifNull: ["$quizevaluationInfo.percentage", null],
                },
                isPassed: {
                    $ifNull: ["$quizevaluationInfo.isPassed", null],
                },
                totalTimeSpent: "$timeSpend",
            },
        },
        {
            $sort: {
                createdAt: -1,
            },
        },
        ...sortingStage,
        ...pageLimit,
    ];
    return pipeline;
};

const singleLearnerModuleReportQuery = queryStages => {
    const { matchUsers, deteledUsersStage, matchStage } = queryStages;

    const pipline = [
        ...(matchUsers ?? []),
        {
            $match: {
                $or: [{ isEnrolled: true }, { status: "COMPLETED" }],
            },
        },
        {
            $lookup: {
                from: "trainings",
                localField: "training",
                foreignField: "_id",
                as: "trainingInfo",
                pipeline: [
                    {
                        $project: {
                            _id: 1,
                            title: 1,
                        },
                    },
                ],
            },
        },
        {
            $unwind: {
                path: "$trainingInfo",
                preserveNullAndEmptyArrays: true,
            },
        },
        {
            $lookup: {
                from: "users",
                localField: "user",
                foreignField: "_id",
                as: "userInfo",
                pipeline: [
                    {
                        $match: {
                            isDeleted: false,
                        },
                    },
                    {
                        $project: {
                            _id: 1,
                            isRegistered: 1,
                            firstName: 1,
                            lastName: 1,
                            email: 1,
                            civilIdOrPassport: 1,
                            vesselStatus: 1,
                            currentVessel: 1,
                            isDeleted: 1,
                        },
                    },
                ],
            },
        },
        {
            $unwind: {
                path: "$userInfo",
                preserveNullAndEmptyArrays: false,
            },
        },
        {
            $lookup: {
                from: "employees",
                localField: "user",
                foreignField: "user",
                as: "employeeInfo",
                pipeline: [
                    {
                        $match: {
                            isDeleted: false,
                        },
                    },
                    {
                        $project: {
                            _id: 1,
                            empDesignation: 1,
                            isDeleted: 1,
                        },
                    },
                ],
            },
        },
        {
            $unwind: {
                path: "$employeeInfo",
                preserveNullAndEmptyArrays: true,
            },
        },
        {
            $lookup: {
                from: "designations",
                localField: "employeeInfo.empDesignation",
                foreignField: "_id",
                as: "designationInfo",
                pipeline: [
                    {
                        $project: {
                            _id: 1,
                            name: 1,
                        },
                    },
                ],
            },
        },
        {
            $unwind: {
                path: "$designationInfo",
                preserveNullAndEmptyArrays: true,
            },
        },
        {
            $lookup: {
                from: "vessels",
                localField: "userInfo.currentVessel",
                foreignField: "_id",
                as: "vesselInfo",
                pipeline: [
                    {
                        $project: {
                            _id: 1,
                            name: 1,
                            typeOfVessel: 1,
                        },
                    },
                ],
            },
        },
        {
            $unwind: {
                path: "$vesselInfo",
                preserveNullAndEmptyArrays: true,
            },
        },
        {
            $lookup: {
                from: "vesseltypes",
                localField: "vesselInfo.typeOfVessel",
                foreignField: "_id",
                as: "vesselTypeInfo",
                pipeline: [
                    {
                        $project: {
                            _id: 1,
                            name: 1,
                        },
                    },
                ],
            },
        },
        {
            $unwind: {
                path: "$vesselTypeInfo",
                preserveNullAndEmptyArrays: true,
            },
        },
        ...(deteledUsersStage ?? []),
        {
            $lookup: {
                from: "trainingprogresses",
                localField: "_id",
                foreignField: "overallTrainingProgress",
                as: "quizEvaluations",
                let: {
                    // attemptCount: "$attemptCount",
                    status: "$status",
                },
                pipeline: [
                    // {
                    //     $match: {
                    //         $expr: {
                    //             $eq: ["$attemptCount", "$$attemptCount"],
                    //         },
                    //     },
                    // },
                    {
                        $lookup: {
                            from: "trainingmodules",
                            localField: "trainingModule",
                            foreignField: "_id",
                            as: "moduleInfo",
                        },
                    },
                    {
                        $unwind: {
                            path: "$moduleInfo",
                            preserveNullAndEmptyArrays: true,
                        },
                    },
                    {
                        $lookup: {
                            from: "trainingmodulecontents",
                            localField: "trainingModuleContent",
                            foreignField: "_id",
                            as: "contentInfo",
                        },
                    },
                    {
                        $unwind: {
                            path: "$contentInfo",
                            preserveNullAndEmptyArrays: true,
                        },
                    },
                    {
                        $project: {
                            moduleId: "$moduleInfo._id",
                            moduleName: "$moduleInfo.title",
                            contentName: "$contentInfo.title",
                            displayOrder: "$moduleInfo.order",
                            percentage: "$quizAttemptDetails.percentage",
                            isPassed: "$quizAttemptDetails.isPassed",
                            contentType: "$contentInfo.contentType",
                            updatedAt: 1,
                            contentStatus: {
                                $cond: {
                                    if: {
                                        $gt: [
                                            {
                                                $type: "$quizAttemptDetails",
                                            },
                                            "missing",
                                        ],
                                    },
                                    then: "COMPLETED",
                                    else: "NOT_STARTED",
                                },
                            },
                            timeSpendInContent: "$lastAccessedDuration",
                        },
                    },
                    {
                        $sort: {
                            displayOrder: -1,
                        },
                    },
                ],
            },
        },
        {
            $lookup: {
                from: "trainingcontentbridges",
                localField: "training",
                foreignField: "training",
                as: "initialContents",
                let: {
                    status: "$status",
                    adminMarkedAsCompleted: "$adminMarkedAsCompleted",
                },
                pipeline: [
                    {
                        $match: {
                            isDeleted: {
                                $ne: true,
                            },
                        },
                    },
                    {
                        $match: {
                            $expr: {
                                $or: [
                                    { $eq: ["$$status", "NOT_STARTED"] },
                                    { $eq: ["$$adminMarkedAsCompleted", true] },
                                ],
                            },
                        },
                    },
                    {
                        $lookup: {
                            from: "trainingmodules",
                            localField: "trainingModule",
                            foreignField: "_id",
                            as: "moduleInfo",
                        },
                    },
                    {
                        $unwind: {
                            path: "$moduleInfo",
                            preserveNullAndEmptyArrays: true,
                        },
                    },
                    {
                        $lookup: {
                            from: "trainingmodulecontents",
                            localField: "trainingContent",
                            foreignField: "_id",
                            as: "contentInfo",
                        },
                    },
                    {
                        $unwind: {
                            path: "$contentInfo",
                            preserveNullAndEmptyArrays: true,
                        },
                    },
                    {
                        $project: {
                            moduleId: "$moduleInfo._id",
                            moduleName: "$moduleInfo.title",
                            contentName: "$contentInfo.title",
                            contentStatus: "$contentInfo.status",
                            displayOrder: "$moduleInfo.order",
                            percentage: "$quizAttemptDetails.percentage",
                            isPassed: "$quizAttemptDetails.isPassed",
                            contentType: "$contentInfo.contentType",
                            updatedAt: 1,
                            contentStatus: {
                                $cond: {
                                    if: {
                                        $gt: [
                                            {
                                                $type: "$quizAttemptDetails",
                                            },
                                            "missing",
                                        ],
                                    },
                                    then: "COMPLETED",
                                    else: "NOT_STARTED",
                                },
                            },
                        },
                    },
                ],
            },
        },
        {
            $addFields: {
                quizEvaluations: {
                    $cond: {
                        if: {
                            $or: [
                                { $eq: ["$status", "NOT_STARTED"] },
                                { $eq: ["$adminMarkedAsCompleted", true] },
                            ],
                        },
                        then: "$initialContents",
                        else: "$quizEvaluations",
                    },
                },
            },
        },
        {
            $unwind: {
                path: "$quizEvaluations",
                preserveNullAndEmptyArrays: false,
            },
        },
        ...(matchStage ?? []),
        {
            $group: {
                _id: {
                    userId: "$user",
                    moduleId: "$quizEvaluations.moduleId",
                },
                userId: {
                    $first: "$user",
                },
                startDate: {
                    $first: "$startDate",
                },
                endDate: {
                    $first: "$endDate",
                },
                unenrollmentDate: {
                    $first: "$unenrollmentDate",
                },
                timeSpend: {
                    $first: "$timeSpend",
                },
                training: {
                    $first: "$training",
                },
                trainingTitle: {
                    $first: "$trainingInfo.title",
                },
                userId: {
                    $first: "$userInfo._id",
                },
                firstName: {
                    $first: "$userInfo.firstName",
                },
                lastName: {
                    $first: "$userInfo.lastName",
                },
                email: {
                    $first: "$userInfo.email",
                },
                empId: {
                    $first: "$userInfo.civilIdOrPassport",
                },
                status: {
                    $first: "$status",
                },
                adminMarkedAsCompleted: {
                    $first: "$adminMarkedAsCompleted",
                },
                currentVessel: {
                    $first: "$vesselInfo.name",
                },
                vesselType: {
                    $first: "$vesselTypeInfo.name",
                },
                designation: {
                    $first: "$designationInfo.name",
                },
                createdAt: {
                    $first: "$createdAt",
                },
                lastSeen: {
                    $first: "$updatedAt",
                },
                moduleContents: {
                    $push: {
                        $cond: {
                            if: {
                                $eq: ["$quizEvaluations.contentType", "QUIZ"],
                            },
                            then: {
                                moduleName: "$quizEvaluations.moduleName",
                                contentName: "$quizEvaluations.contentName",
                                percentage: "$quizEvaluations.percentage",
                                order: "$quizEvaluations.displayOrder",
                                isQuizPassed: "$quizEvaluations.isPassed",
                                contentType: "$quizEvaluations.contentType",
                                updatedAt: "$quizEvaluations.updatedAt",
                                quizStatus: "$quizEvaluations.contentStatus",
                                timeSpendInContent: "$quizEvaluations.timeSpendInContent",
                            },
                            else: {
                                moduleName: "$quizEvaluations.moduleName",
                                contentName: "$quizEvaluations.contentName",
                                percentage: "NOT APPLICABLE",
                                order: "$quizEvaluations.displayOrder",
                                isQuizPassed: "$quizEvaluations.isPassed",
                                contentType: "$quizEvaluations.contentType",
                                updatedAt: "$quizEvaluations.updatedAt",
                                quizStatus: "$quizEvaluations.contentStatus",
                                timeSpendInContent: "$quizEvaluations.timeSpendInContent",
                            },
                        },
                    },
                },
            },
        },
        {
            $group: {
                _id: {
                    userId: "$userId",
                    trainingId: "$training",
                },
                firstName: {
                    $first: "$firstName",
                },
                lastName: {
                    $first: "$lastName",
                },
                trainingTitle: {
                    $first: "$trainingTitle",
                },
                email: {
                    $first: "$email",
                },
                country: {
                    $first: "$country",
                },
                empId: {
                    $first: "$empId",
                },
                status: {
                    $first: "$status",
                },
                adminMarkedAsCompleted: {
                    $first: "$adminMarkedAsCompleted",
                },
                currentVessel: {
                    $first: "$currentVessel",
                },
                vesselType: {
                    $first: "$vesselType",
                },
                designation: {
                    $first: "$designation",
                },
                createdAt: {
                    $first: "$createdAt",
                },
                startDate: {
                    $first: "$startDate",
                },
                endDate: {
                    $first: "$endDate",
                },
                unenrollmentDate: {
                    $first: "$unenrollmentDate",
                },
                lastSeen: {
                    $first: "$lastSeen",
                },
                modules: {
                    $push: {
                        moduleName: "$moduleContents",
                        hasQuiz: "$hasQuiz",
                        moduleName: {
                            $arrayElemAt: ["$moduleContents.moduleName", 0],
                        },
                        moduleId: {
                            $arrayElemAt: [
                                {
                                    $arrayElemAt: ["$moduleContents.moduleName._id", 0],
                                },
                                0,
                            ],
                        },
                        order: {
                            $arrayElemAt: ["$moduleContents.order", 0],
                        },
                        moduleContents: "$moduleContents",
                    },
                },
            },
        },
        {
            $project: {
                courseId: "$_id.trainingId",
                user: "$_id.userId",
                firstName: 1,
                lastName: 1,
                currentVessel: 1,
                vesselType: 1,
                email: 1,
                designation: 1,
                status: 1,
                adminMarkedAsCompleted: 1,
                createdAt: 1,
                startDate: 1,
                endDate: 1,
                unenrollmentDate: 1,
                empId: 1,
                trainingTitle: 1,
                lowercaseTitle: {
                    $toLower: { $arrayElemAt: ["$trainingTitle.value", 0] },
                },
                modules: {
                    $sortArray: {
                        input: "$modules",
                        sortBy: {
                            order: 1,
                        },
                    },
                },
                lastSeen: 1,
            },
        },
        {
            $sort: {
                createdAt: -1,
            },
        },
        {
            $sort: {
                lowercaseTitle: 1,
            },
        },
    ];
    return pipline;
};

const customEnrollmentReportQuery = (matchStage = []) => {
    pipeline = [
        // Stage 1: Get basic training info (course title)
        {
            $lookup: {
                from: "trainings",
                localField: "training",
                foreignField: "_id",
                as: "trainingInfo",
                pipeline: [{ $project: { title: 1 } }],
            },
        },
        // Stage 2: Initial filter for relevant progress records
        {
            $match: {
                $or: [{ isEnrolled: true }, { status: "COMPLETED" }],
            },
        },
        // Stage 3: Get details for active and approved users.
        {
            $lookup: {
                from: "users",
                localField: "user",
                foreignField: "_id",
                as: "userInfo",
                pipeline: [
                    {
                        $match: {
                            isDeleted: { $ne: true },
                            isSignupAdminAprroved: { $ne: false },
                        },
                    },
                    {
                        $project: {
                            firstName: 1,
                            lastName: 1,
                            email: 1,
                            civilIdOrPassport: 1,
                            isRegistered: 1,
                            vesselStatus: 1,
                            currentVessel: 1,
                        },
                    },
                ],
            },
        },
        // Stage 4: Get employee designation.
        {
            $lookup: {
                from: "employees",
                localField: "user",
                foreignField: "user",
                as: "employeeInfo",
                pipeline: [{ $project: { empDesignation: 1 } }],
            },
        },
        // Unwind user and employee info. We use `preserveNullAndEmptyArrays: false`
        // to filter out any training progress records for which a valid user/employee doesn't exist.
        // This effectively acts like an INNER JOIN.
        { $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: false } },
        { $unwind: { path: "$employeeInfo", preserveNullAndEmptyArrays: false } },

        // Stage 5: Get the latest quiz attempt details for the current enrollment.
        {
            $lookup: {
                from: "trainingprogresses",
                localField: "_id",
                foreignField: "overallTrainingProgress",
                as: "quizevaluationInfo",
                let: { attemptCount: "$attemptCount" },
                pipeline: [
                    { $match: { $expr: { $eq: ["$attemptCount", "$$attemptCount"] } } },
                    {
                        $lookup: {
                            from: "trainingmodulecontents",
                            localField: "trainingModuleContent",
                            foreignField: "_id",
                            as: "contentInfo",
                            pipeline: [{ $match: { $expr: { $eq: ["$contentType", "QUIZ"] } } }],
                        },
                    },
                    { $unwind: { path: "$contentInfo", preserveNullAndEmptyArrays: true } },
                    { $sort: { updatedAt: -1 } },
                    { $limit: 1 },
                    {
                        $project: {
                            percentage: "$quizAttemptDetails.percentage",
                            isPassed: "$quizAttemptDetails.isPassed",
                        },
                    },
                ],
            },
        },
        { $unwind: { path: "$quizevaluationInfo", preserveNullAndEmptyArrays: true } },

        // Stage 6: Get current vessel details
        {
            $lookup: {
                from: "vessels",
                localField: "userInfo.currentVessel",
                foreignField: "_id",
                as: "vesselDetails",
                pipeline: [{ $project: { name: 1, typeOfVessel: 1 } }],
            },
        },
        { $unwind: { path: "$vesselDetails", preserveNullAndEmptyArrays: true } },

        // Stage 7: Get vessel type name
        {
            $lookup: {
                from: "vesseltypes",
                localField: "vesselDetails.typeOfVessel",
                foreignField: "_id",
                as: "vesselTypeInfo",
                pipeline: [{ $project: { name: 1 } }],
            },
        },
        { $unwind: { path: "$vesselTypeInfo", preserveNullAndEmptyArrays: true } },

        // Stage 8: Get designation name
        {
            $lookup: {
                from: "designations",
                localField: "employeeInfo.empDesignation",
                foreignField: "_id",
                as: "designationInfo",
                pipeline: [{ $project: { name: 1 } }],
            },
        },
        { $unwind: { path: "$designationInfo", preserveNullAndEmptyArrays: true } },

        // Stage 9: Get time spent information (duration of completed modules)
        // Note: This could be further optimized if not all fields are used.
        {
            $lookup: {
                from: "trainingprogress",
                localField: "training",
                foreignField: "training",
                as: "trainingProgressInfo",
                pipeline: [
                    { $match: { status: "COMPLETED" } },
                    {
                        $lookup: {
                            from: "trainingmodulecontents",
                            localField: "trainingModuleContent",
                            foreignField: "_id",
                            as: "moduleContentInfo",
                            pipeline: [{ $project: { duration: 1 } }],
                        },
                    },
                    { $unwind: { path: "$moduleContentInfo", preserveNullAndEmptyArrays: true } },
                    { $project: { duration: "$moduleContentInfo.duration" } },
                ],
            },
        },

        // Stage 10: Inject dynamic filters (e.g., search, date range) passed into the function
        ...matchStage,

        // Final Stage: Project and shape the final output document
        {
            $project: {
                firstName: "$userInfo.firstName",
                lowercaseFirstName: { $toLower: "$userInfo.firstName" }, // For case-insensitive sorting
                lastName: "$userInfo.lastName",
                currentVessel: "$vesselDetails.name",
                vesselType: "$vesselTypeInfo.name",
                email: "$userInfo.email",
                employeeId: "$userInfo.civilIdOrPassport",
                isRegistered: "$userInfo.isRegistered",
                designation: "$designationInfo.name",
                courseName: { $arrayElemAt: ["$trainingInfo.title.value", 0] },
                createdAt: 1,
                startDate: "$startDate",
                endDate: 1,
                unenrollmentDate: 1,
                status: 1,
                adminMarkedAsCompleted: 1,
                updatedAt: 1, // 'Last Seen'
                quizPercentage: { $ifNull: ["$quizevaluationInfo.percentage", null] },
                isPassed: { $ifNull: ["$quizevaluationInfo.isPassed", null] },
                totalTimeSpent: "$timeSpend",
            },
        },
        // Default Sort Stage
        {
            $sort: {
                lowercaseFirstName: 1,
            },
        },
    ];
    return pipeline;
};

const customQuizReportQuery = (matchStage = []) => {
    const pipeline = [
        {
            $lookup: {
                from: "trainings",
                localField: "training",
                foreignField: "_id",
                as: "trainingInfo",

                pipeline: [{ $project: { title: 1 } }],
            },
        },
        {
            $match: {
                $or: [{ isEnrolled: true }, { status: "COMPLETED" }],
            },
        },
        {
            $unwind: {
                path: "$trainingInfo",
                preserveNullAndEmptyArrays: true,
            },
        },
        {
            $lookup: {
                from: "users",
                localField: "user",
                foreignField: "_id",
                as: "userInfo",
                pipeline: [
                    {
                        $match: {
                            isDeleted: false,
                            isSignupAdminAprroved: { $ne: false },
                        },
                    },
                    {
                        $project: {
                            firstName: 1,
                            lastName: 1,
                            email: 1,
                            civilIdOrPassport: 1,
                            currentVessel: 1,
                            vesselStatus: 1,
                        },
                    },
                ],
            },
        },
        {
            $unwind: {
                path: "$userInfo",
                preserveNullAndEmptyArrays: false,
            },
        },
        {
            $lookup: {
                from: "employees",
                localField: "user",
                foreignField: "user",
                as: "employeeInfo",
                pipeline: [
                    {
                        $match: { isDeleted: false },
                    },

                    {
                        $project: { empDesignation: 1 },
                    },
                ],
            },
        },
        {
            $unwind: {
                path: "$employeeInfo",
                preserveNullAndEmptyArrays: true,
            },
        },
        {
            $lookup: {
                from: "designations",
                localField: "employeeInfo.empDesignation",
                foreignField: "_id",
                as: "designationInfo",
                pipeline: [{ $project: { name: 1 } }],
            },
        },
        {
            $unwind: {
                path: "$designationInfo",
                preserveNullAndEmptyArrays: true,
            },
        },
        {
            $lookup: {
                from: "vessels",
                localField: "userInfo.currentVessel",
                foreignField: "_id",
                as: "vesselDetails",
                pipeline: [{ $project: { name: 1, typeOfVessel: 1 } }],
            },
        },
        {
            $unwind: {
                path: "$vesselDetails",
                preserveNullAndEmptyArrays: true,
            },
        },
        {
            $lookup: {
                from: "vesseltypes",
                localField: "vesselDetails.typeOfVessel",
                foreignField: "_id",
                as: "vesselTypeInfo",
                pipeline: [{ $project: { name: 1 } }],
            },
        },
        {
            $unwind: {
                path: "$vesselTypeInfo",
                preserveNullAndEmptyArrays: true,
            },
        },
        {
            $lookup: {
                from: "trainingprogresses",
                localField: "_id",
                foreignField: "overallTrainingProgress",
                as: "quizEvaluations",
                // let: { attemptCount: "$attemptCount", status: "$status" },
                pipeline: [
                    // { $match: { $expr: { $eq: ["$attemptCount", "$$attemptCount"] } } },
                    {
                        $lookup: {
                            from: "trainingmodules",
                            localField: "trainingModule",
                            foreignField: "_id",
                            as: "moduleInfo",

                            pipeline: [{ $project: { title: 1, order: 1 } }],
                        },
                    },
                    { $unwind: { path: "$moduleInfo", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup: {
                            from: "trainingmodulecontents",
                            localField: "trainingModuleContent",
                            foreignField: "_id",
                            as: "contentInfo",

                            pipeline: [{ $project: { title: 1, contentType: 1 } }],
                        },
                    },
                    { $unwind: { path: "$contentInfo", preserveNullAndEmptyArrays: true } },
                    {
                        $project: {
                            moduleId: "$moduleInfo._id",
                            moduleName: "$moduleInfo.title",
                            contentName: "$contentInfo.title",
                            displayOrder: "$moduleInfo.order",
                            percentage: "$quizAttemptDetails.percentage",
                            isPassed: "$quizAttemptDetails.isPassed",
                            contentType: "$contentInfo.contentType",
                            updatedAt: 1,
                            contentStatus: {
                                $cond: {
                                    if: { $gt: [{ $type: "$quizAttemptDetails" }, "missing"] },
                                    then: "COMPLETED",
                                    else: "NOT_STARTED",
                                },
                            },
                            timeSpendInContent: "$lastAccessedDuration",
                        },
                    },
                    { $sort: { displayOrder: -1 } },
                ],
            },
        },
        {
            $lookup: {
                from: "trainingcontentbridges",
                localField: "training",
                foreignField: "training",
                as: "initialContents",
                let: { status: "$status", adminMarkedAsCompleted: "$adminMarkedAsCompleted" },
                pipeline: [
                    { $match: { isDeleted: { $ne: true } } },
                    {
                        $match: {
                            $expr: {
                                $or: [
                                    { $eq: ["$$status", "NOT_STARTED"] },
                                    { $eq: ["$$adminMarkedAsCompleted", true] },
                                ],
                            },
                        },
                    },
                    {
                        $lookup: {
                            from: "trainingmodules",
                            localField: "trainingModule",
                            foreignField: "_id",
                            as: "moduleInfo",

                            pipeline: [{ $project: { title: 1, order: 1 } }],
                        },
                    },
                    { $unwind: { path: "$moduleInfo", preserveNullAndEmptyArrays: true } },
                    {
                        $lookup: {
                            from: "trainingmodulecontents",
                            localField: "trainingContent",
                            foreignField: "_id",
                            as: "contentInfo",

                            pipeline: [{ $project: { title: 1, contentType: 1, status: 1 } }],
                        },
                    },
                    { $unwind: { path: "$contentInfo", preserveNullAndEmptyArrays: true } },
                    {
                        $project: {
                            moduleId: "$moduleInfo._id",
                            moduleName: "$moduleInfo.title",
                            contentName: "$contentInfo.title",
                            contentStatus: "$contentInfo.status",
                            displayOrder: "$moduleInfo.order",
                            percentage: "$quizAttemptDetails.percentage",
                            isPassed: "$quizAttemptDetails.isPassed",
                            contentType: "$contentInfo.contentType",
                            updatedAt: 1,
                            contentStatus: {
                                $cond: {
                                    if: { $gt: [{ $type: "$quizAttemptDetails" }, "missing"] },
                                    then: "COMPLETED",
                                    else: "NOT_STARTED",
                                },
                            },
                        },
                    },
                ],
            },
        },
        {
            $addFields: {
                quizEvaluations: {
                    $cond: {
                        if: {
                            $or: [
                                { $eq: ["$status", "NOT_STARTED"] },
                                { $eq: ["$adminMarkedAsCompleted", true] },
                            ],
                        },
                        then: "$initialContents",
                        else: "$quizEvaluations",
                    },
                },
            },
        },
        {
            $unwind: {
                path: "$quizEvaluations",
                preserveNullAndEmptyArrays: false,
            },
        },
        ...matchStage,
        {
            $group: {
                _id: {
                    userId: "$user",
                    moduleId: "$quizEvaluations.moduleId",
                },
                userId: { $first: "$user" },
                startDate: { $first: "$startDate" },
                endDate: { $first: "$endDate" },
                unenrollmentDate: { $first: "$unenrollmentDate" },
                timeSpend: { $first: "$timeSpend" },
                training: { $first: "$training" },
                trainingTitle: { $first: "$trainingInfo.title" },
                userId: { $first: "$userInfo._id" },
                firstName: { $first: "$userInfo.firstName" },
                lastName: { $first: "$userInfo.lastName" },
                email: { $first: "$userInfo.email" },
                empId: { $first: "$userInfo.civilIdOrPassport" },
                status: { $first: "$status" },
                adminMarkedAsCompleted: { $first: "$adminMarkedAsCompleted" },
                currentVessel: { $first: "$vesselDetails.name" },
                vesselType: { $first: "$vesselTypeInfo.name" },
                designation: { $first: "$designationInfo.name" },
                createdAt: { $first: "$createdAt" },
                lastSeen: { $first: "$updatedAt" },
                moduleContents: {
                    $push: {
                        $cond: {
                            if: { $eq: ["$quizEvaluations.contentType", "QUIZ"] },
                            then: {
                                moduleName: "$quizEvaluations.moduleName",
                                contentName: "$quizEvaluations.contentName",
                                percentage: "$quizEvaluations.percentage",
                                order: "$quizEvaluations.displayOrder",
                                isQuizPassed: "$quizEvaluations.isPassed",
                                contentType: "$quizEvaluations.contentType",
                                updatedAt: "$quizEvaluations.updatedAt",
                                quizStatus: "$quizEvaluations.contentStatus",
                                timeSpendInContent: "$quizEvaluations.timeSpendInContent",
                            },
                            else: {
                                moduleName: "$quizEvaluations.moduleName",
                                contentName: "$quizEvaluations.contentName",
                                percentage: "NOT APPLICABLE",
                                order: "$quizEvaluations.displayOrder",
                                isQuizPassed: "$quizEvaluations.isPassed",
                                contentType: "$quizEvaluations.contentType",
                                updatedAt: "$quizEvaluations.updatedAt",
                                quizStatus: "$quizEvaluations.contentStatus",
                                timeSpendInContent: "$quizEvaluations.timeSpendInContent",
                            },
                        },
                    },
                },
            },
        },
        {
            $group: {
                _id: { userId: "$userId", trainingId: "$training" },
                firstName: { $first: "$firstName" },
                lastName: { $first: "$lastName" },
                trainingTitle: { $first: "$trainingTitle" },
                email: { $first: "$email" },
                empId: { $first: "$empId" },
                status: { $first: "$status" },
                adminMarkedAsCompleted: { $first: "$adminMarkedAsCompleted" },
                currentVessel: { $first: "$currentVessel" },
                vesselType: { $first: "$vesselType" },
                designation: { $first: "$designation" },
                createdAt: { $first: "$createdAt" },
                startDate: { $first: "$startDate" },
                endDate: { $first: "$endDate" },
                unenrollmentDate: { $first: "$unenrollmentDate" },
                lastSeen: { $first: "$lastSeen" },
                modules: {
                    $push: {
                        moduleName: "$moduleContents",
                        hasQuiz: "$hasQuiz",
                        moduleName: { $arrayElemAt: ["$moduleContents.moduleName", 0] },
                        moduleId: {
                            $arrayElemAt: [
                                { $arrayElemAt: ["$moduleContents.moduleName._id", 0] },
                                0,
                            ],
                        },
                        order: { $arrayElemAt: ["$moduleContents.order", 0] },
                        moduleContents: "$moduleContents",
                    },
                },
            },
        },
        {
            $project: {
                courseId: "$_id.trainingId",
                user: "$_id.userId",
                firstName: 1,
                lowercaseFirstName: { $toLower: "$firstName" },
                currentVessel: 1,
                vesselType: 1,
                lastName: 1,
                email: 1,
                designation: 1,
                status: 1,
                adminMarkedAsCompleted: 1,
                createdAt: 1,
                startDate: 1,
                endDate: 1,
                unenrollmentDate: 1,
                empId: 1,
                trainingTitle: 1,
                modules: { $sortArray: { input: "$modules", sortBy: { order: 1 } } },
                lastSeen: 1,
            },
        },
        { $sort: { createdAt: -1 } },
        { $sort: { lowercaseFirstName: 1 } },
    ];
    return pipeline;
};
module.exports = {
    singleLearnerEnrollmentReportQuery,
    singleLearnerModuleReportQuery,
    customEnrollmentReportQuery,
    customQuizReportQuery,
};
