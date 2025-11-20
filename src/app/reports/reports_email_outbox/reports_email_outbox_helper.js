const { ReportsEmailOutbox } = require("./reports_email_outbox_model");

const createOutboxEntry = async ({ from, to, cc, subject, filePath }) => {
    try {
        const entry = await ReportsEmailOutbox.create({
            from,
            to,
            cc,
            subject,
            filePath,
            status: "IN_PROGRESS",
        });
        return entry._id;
    } catch (error) {
        console.error("Failed to create email outbox entry:", error);
        return null;
    }
};

const updateOutboxStatus = async (id, status, error = null) => {
    try {
        if (!id) return;
        const update = { status };
        if (error) {
            update.error = error;
        }
        await ReportsEmailOutbox.findByIdAndUpdate(id, update);
    } catch (err) {
        console.error("Failed to update email outbox status:", err);
    }
};

module.exports = {
    createOutboxEntry,
    updateOutboxStatus,
};
