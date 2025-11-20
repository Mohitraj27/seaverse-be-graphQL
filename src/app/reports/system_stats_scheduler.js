const { CronHelper } = require("../../tools");
const { fork } = require("child_process");
const path = require("path");

const scheduleSystemStatsReport = () => {
    // Schedule to run every day at 10:30 AM
    CronHelper.schedule("30 10 * * *", () => {
        console.log("Starting scheduled system stats report generation...");

        try {
            const child = fork(path.resolve(__dirname, 'system_stats_generator.js'), [], { execArgv: ["--expose-gc"] });

            child.on('error', (err) => {
                console.error("Scheduled system stats report generation failed:", err);
            });

            child.on('exit', (code) => {
                if (code !== 0) {
                    console.error(`Scheduled system stats report generation process exited with code ${code}`);
                } else {
                    console.log("Scheduled system stats report generation completed successfully.");
                }
            });

            child.on("message", msg => {
                if (msg.type === "REPORT_EXPORT_SUCCESS") {
                    console.log("Scheduled report generated successfully. Download Link:", msg.payload.downloadLink);
                } else if (msg.type === "REPORT_EXPORT_FAILED") {
                    console.error("Scheduled report generation failed:", msg.payload.messageValue);
                }
            });

            // Send initial payload if needed, though system_stats_generator seems to need one.
            // Looking at system_stats_generator.js, it waits for a message to start.
            // We need to send a dummy payload to trigger it.
            // The generator expects: { input, subscriberId, userId, userInfo }
            // Since this is a system task, we might need to mock these or adjust the generator to handle system calls.
            // For now, passing null/system values.

            const payload = {
                input: {},
                subscriberId: null, // Or a system subscriber ID if available
                userId: null,       // System user ID
                userInfo: { firstName: "System", lastName: "Scheduler", _id: "SYSTEM" }
            };

            if (child.connected) {
                child.send({ payload });
            } else {
                console.error("Child process not connected, cannot send payload.");
            }
        } catch (error) {
            console.error("Error initiating system stats report generation:", error);
        }
    });
};

module.exports = {
    scheduleSystemStatsReport
};
