const { PubSubHelper } = require("../../tools");
const { connectDb, closeDb } = require("../../util/child_process_db_helper");
const { customReportGenBackgroundProcess } = require("./reports_helper");

process.on('message', async (data) => {

    const { matchStage, input, subscriberId, userInfo, userId } = data;

    try {
        await connectDb();
        await customReportGenBackgroundProcess(matchStage, input, subscriberId, userInfo, userId);

        await closeDb();

        process.send({ message: 'Background task completed successfully' });
        process.exit(0);

    } catch (error) {

        process.send({ error: error.message });
        process.exit(1);

    }

});