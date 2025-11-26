const { CronHelper } = require("../../tools");
const { fork } = require("child_process");
const path = require("path");
const { Subscriber } = require("../saas/subscriber/subscriber_model");

const scheduleSystemStatsReport = () => {
    // Schedule to run every day at 10:30 AM
    CronHelper.schedule("30 10 * * *", async () => {
        console.log("Starting scheduled system stats report generation...");

        try {
            // Fetch a valid subscriber ID (e.g., the first active one)
            const subscriber = await Subscriber.findOne({ isActive: true }).select('_id');
            const subscriberId = subscriber ? subscriber._id : null;

            if (!subscriberId) {
                console.error("No active subscriber found. Cannot generate system stats report.");
                return;
            }

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

            const payload = {
                input: {},
                subscriberId: subscriberId,
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
