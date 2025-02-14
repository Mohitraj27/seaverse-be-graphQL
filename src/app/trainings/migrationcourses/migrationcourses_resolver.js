const { MigrationCourse } = require("./migration_courses_model");
const { CustomError, ErrorName, AuthUser } = require("../../../util");
const { ObjectId } = require("../../../tools");

module.exports.queries = {
    getMigrationCourses: async ({ pageInput, filterInput }, context) => {
        
        const { subscriberId } = AuthUser(context);

        try {

            const skip = pageInput?.skip ?? 0;
            const limit = pageInput?.limit ?? 50;
            let filterConditions = {};

            if (filterInput?.search && filterInput.search.trim()) {

                const searchTerm = filterInput.search.trim();
                if (ObjectId.isValid(searchTerm)) {
                    filterConditions["_id"] = ObjectId(searchTerm);
                } else {
                    filterConditions["title.value"] = {
                        $regex: searchTerm,
                        $options: "i",
                    };
                }

            }

            const fetchMigrationCourse = await MigrationCourse.find(filterConditions)
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 });

            const totalCount = await MigrationCourse.countDocuments(filterConditions);

            return {
                migrationCourses: fetchMigrationCourse,
                totalCount,
            };

        } catch (error) {
            throw CustomError(ErrorName.MIGRATION_COURSES_NOT_FOUND, error.message);
        }

    },
};
