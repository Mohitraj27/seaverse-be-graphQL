const { MigrationCourses } = require("./migrationcourses_model");
const { CustomError, ErrorName, AuthUser } = require("../../../util");
const { createOrUpdateTrainingMigrationCourses } = require("./migrationcourses_helper");
module.exports.queries = {
    getMigrationCourses: async (_, { pageInput }) => {
        const skip = pageInput?.skip ?? 0;
        const limit = pageInput?.limit ?? 50;
        try {
            const MigrationCourse = await MigrationCourses.find()
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 });
            const totalCount = await MigrationCourses.countDocuments();
            return {
                MigrationCourses: MigrationCourse,
                totalCount,
                skip,
            };
        } catch (error) {
            throw CustomError(ErrorName.MIGRATION_COURSES_NOT_FOUND,error.message);
        }
    },
};

module.exports.mutations = {
    
};
