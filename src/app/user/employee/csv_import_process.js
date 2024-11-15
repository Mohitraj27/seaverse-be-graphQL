const { PubSubHelper } = require("../../../tools");
const { connectDb, closeDb } = require("../../../util/child_process_db_helper");
const { createEmployeesBackgroundTask } = require("./employee_helper");

process.on('message', async (data) => {

    const { users, emailsArray, empIdsArray, subscriberId, userId, newFileName, saveCSV } = data;

    try {
        await connectDb();
        await createEmployeesBackgroundTask(users, emailsArray, empIdsArray, subscriberId, userId, newFileName, saveCSV);

        await closeDb();

        
        process.send({ message: 'Background task completed successfully' });
        process.exit(0);

    } catch (error) {

        process.send({ error: error.message });
        process.exit(1);

    }

});