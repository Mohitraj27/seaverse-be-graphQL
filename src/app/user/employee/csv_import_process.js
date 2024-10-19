const { createEmployeesBackgroundTask } = require("./employee_helper");

process.on('message', async (data) => {
    
    const { input, context } = data;

    try {

        await createEmployeesBackgroundTask(input, context);
        
        process.send({ message: 'Background task completed successfully' });

        process.exit(0);

    } catch (error) {

        process.send({ error: error.message });

        process.exit(1);

    }

});