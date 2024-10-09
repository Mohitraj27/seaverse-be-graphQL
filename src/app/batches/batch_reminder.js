const { CronHelper, Moment } = require("../../tools");
const { SendEmail, EmailTemplate } = require("../../util");

const { Batch } = require("./batch_model");
const { TrainingRegistration } = require("../training-registrations/training_registration_model");

const BatchStatus = require("./batch_status.json");
const TrainingRegistrationStatus = require("../training-registrations/training_registration_status.json");

const sendBatchCompletionReminderMail = async data => {
    try {
        const receiverEmail = process.env.SUBSCRIBER_EMAIL;
        const subject = `Pending batch completion`;

        const message = `These are the batches with pending completion`;

        let html = `
            <div style="padding: 20px; text-align: center">        
                <p style="color: #281166">${message}</p>
                
                <hr/>
                
                <ul style="text-align: start">
                    ${data?.batches?.map(x => `<li>${x}</li>`).join("")}
                </ul>
            </div>
        `;

        SendEmail({
            receiverEmail,
            subject,
            htmlContent: EmailTemplate.emailTemplate(null, null, html),
        }).catch(e => {
            console.log("batch_reminder.sendBatchCompletionReminderMail:error:", e?.message);
        });
    } catch (e) {
        console.log("batch_reminder.sendBatchCompletionReminderMail:exception:", e?.message);
    }
};

const fetchAndSendEmailToAdminAboutBatchCompletionDue = async () => {
    try {
        const pendingBatches = await Batch.find({ status: BatchStatus.PENDING })
            .lean()
            .select("UID");

        if (pendingBatches?.length) {
            const completedRegistrations = await TrainingRegistration.find({
                batch: { $in: pendingBatches.map(x => x._id) },
                status: TrainingRegistrationStatus.COMPLETED,
                completedAt: { $lt: Moment().utc().subtract({ days: 7 }).startOf("day").toDate() },
            })
                .lean()
                .select("batchNumber")
                .distinct("batchNumber");

            if (completedRegistrations?.length) {
                sendBatchCompletionReminderMail({ batches: completedRegistrations });
            }
        }
    } catch (e) {
        console.log("batch_reminder.fetchAndSendEmailToAdminAboutBatchCompletionDue:error:", e);
    }
};

module.exports = {
    fetchAndSendEmailToAdminAboutBatchCompletionDue,
    batchCompletionRemainder: () => {
        CronHelper.schedule("30 10 * * *", async () => {
            await fetchAndSendEmailToAdminAboutBatchCompletionDue();
        });
    },
};
