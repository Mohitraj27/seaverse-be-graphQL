const { connectDb, closeDb } = require("../../util/child_process_db_helper");
const { dataMigrationBackground } = require("./training_helper");

process.on('message', async (data) => {

    const { migrationcourseId, trainingId } = data;

    try {
        await connectDb();
        await dataMigrationBackground(migrationcourseId, trainingId);

        await closeDb();

        process.send({ message: 'Background task completed successfully' });
        process.exit(0);

    } catch (error) {
        process.send({ error: error.message });
        process.exit(1);
    }

});