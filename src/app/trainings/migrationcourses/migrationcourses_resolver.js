const { MigrationCourses } = require("./migrationcourses_model");
const { CustomError, ErrorName } = require("../../../util");
const { ObjectId } = require("../../../tools");
module.exports.queries = {
    getMigrationCourses: async ({ pageInput, filterInput }) => {
        const skip = pageInput?.skip ?? 0;
        const limit = pageInput?.limit ?? 50; 
            let filterConditions = {};
            if (filterInput?.search && filterInput.search.trim()) {
                const searchTerm = filterInput.search.trim();
                if (ObjectId.isValid(searchTerm)) { 
                    filterConditions["_id"] = ObjectId(searchTerm);
                } else {
                    const searchRegex = {
                        $regex: searchTerm,  
                        $options: "i",       
                    };
                    filterConditions["courseName"] = searchRegex;
                }
            }
        try {
            const MigrationCourse = await MigrationCourses.find(filterConditions)
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 });
            const totalCount = await MigrationCourses.countDocuments(filterConditions);
            return {
                MigrationCourses: MigrationCourse,
                totalCount,
            };
        } catch (error) {
            throw CustomError(ErrorName.MIGRATION_COURSES_NOT_FOUND,error.message);
        }
    },
};
