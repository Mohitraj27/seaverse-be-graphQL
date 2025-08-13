const { MigrationCourse } = require("./migration_courses_model");
const { CustomError, ErrorName, AuthUser } = require("../../../util");
const { ObjectId } = require("../../../tools");
const { runQuery } = require("../../../util/mysql_helper");

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
    extractMigrationCourses: async () => {

        try {

            const sql = `
      SELECT COURSE_ID, COURSE_NAME FROM (
        SELECT DISTINCT COURSE_ID, COURSE_NAME FROM crew_certificates_synergy
        UNION
        SELECT DISTINCT COURSE_ID, COURSE_NAME FROM crew_certificates_denmark
      ) AS combined
      WHERE COURSE_ID IS NOT NULL AND COURSE_ID != ''
    `;

            const courses = await runQuery(sql);

            // 3️⃣ Prepare MongoDB bulk operations
            const bulkOps = courses.map(course => ({
                updateOne: {
                    filter: { UID: course.COURSE_ID },
                    update: {
                        $setOnInsert: {
                            UID: course.COURSE_ID,
                            subscriber: ObjectId('66975e0e7835373dbcebf1e8'),
                            title: [{ lang: 'en', value: course.COURSE_NAME }],
                            isCertificate: false,
                            isFromMigration: true,
                            isDeleted: false
                        }
                    },
                    upsert: true
                }
            }));


            if (bulkOps.length > 0) {
                const result = await MigrationCourse.bulkWrite(bulkOps);
                console.log(`✅ Upserted: ${result.upsertedCount}, Matched: ${result.matchedCount}`);

                return {
                    message: 'Success'
                };

            } else {
                console.log('⚠ No courses to insert.');
            }

        } catch (error) {
            console.error(error);
        }
    }
};
