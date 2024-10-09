const GraphStatisticsType = require("./graph_statistics_type.json");
module.exports = {
    types: `
        type TraineeStatistics {
            assignedCourses: Int
            ongoingCourses: Int
            completedCourses: Int
            aboutDueCourses: Int
        }
        type SubscriberStatistics {
            totalRegistrations: Int
            totalCompletions: Int
            totalTrainings: Int
            totalAvailableTrainings: Int
            totalApprovalPendingTrainings: Int
            totalDisabledTrainings: Int
            totalRejectedTrainings: Int
            totalTrainers: Int
            totalEmployees: Int
            totalOrganizations: Int
            totalRevenue: Float
        }
        type Graph{
            _id: String,
            value: Float
        }
        type GraphStatistics {
            monthly: [Graph],
            today: [Graph],
            thisWeek: [Graph],
            thisMonth: [Graph]
        }
        enum GraphStatisticsType {
            ${Object.keys(GraphStatisticsType).join(" ")}
        }
    `,
    queries: `
        getTraineeStatistics(id: ID): TraineeStatistics!
        getSubscriberStatistics: SubscriberStatistics!
        getGraphStatistics(type: GraphStatisticsType!): GraphStatistics!
    `,
};
