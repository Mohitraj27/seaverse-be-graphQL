const { CronHelper, Moment } = require("../../../tools");
const { SendEmail, EmailTemplate } = require("../../../util");

const { TrainingCertificate } = require("./training_certificate_model");
const { User } = require("../../user/user_model");

const sendTrainingCertificateReminderMail = async data => {
    try {
        let subscriberLogo = null;
        let subscriberDetails = {};

        if (data?.employeeEmail) {
            let userData = await User.findOne({
                email: data.employeeEmail,
            })
                .lean()
                .populate({
                    path: "subscriber",
                    select: "user",
                    populate: { path: "user" },
                });
            subscriberLogo = userData?.subscriber?.user?.avatar;
            subscriberDetails.name = `${userData?.subscriber?.user?.firstName ?? ""} ${
                userData?.subscriber?.user?.lastName ?? ""
            }`;
        }

        const receiverEmail = data.employeeEmail;
        const subject = data.subject;

        const employeeName = data.employeeName;
        const message = data.message;

        let html = `<div style="padding: 20px; text-align: center">
            <h2 style="color: #281166">Hi, ${employeeName}</h2>
        
            <p style="color: #281166">${message}</p>
        
            <a href="${process.env.EMPLOYEE_DOMAIN_URL}">
            <button type="button" style="border: none;border-radius: 5px;background-color: #5928E5;color: white;width: 200px;padding: 8px;margin-bottom: 30px;"> Click to visit site</button>
            
            </a>
        </div>
    `;

        SendEmail({
            receiverEmail,
            subject,
            htmlContent: EmailTemplate.emailTemplate(subscriberLogo, subscriberDetails, html),
        }).catch(e => {
            console.log(
                "training_certificate_reminder.sendTrainingCertificateReminderMail:error:",
                e?.message
            );
        });
    } catch (e) {
        console.log(
            "training_certificate_reminder.sendTrainingCertificateReminderMail:exception:",
            e?.message
        );
    }
};

const fetchAndSendEmailToTrainingCertificateEmployeesAboutDue = async () => {
    try {
        const trainingCertificates = await TrainingCertificate.find({
            $or: [
                {
                    expiresAt: {
                        $lt: Moment().utc().startOf("day").toDate(),
                        $gte: Moment().utc().subtract(1, "days").startOf("day").toDate(),
                    },
                },
                {
                    expiresAt: {
                        $gte: Moment().utc().startOf("day").toDate(),
                        $lt: Moment().utc().add(1, "days").startOf("day").toDate(),
                    },
                },
                {
                    expiresAt: {
                        $gte: Moment().utc().add(1, "days").startOf("day").toDate(),
                        $lt: Moment().utc().add(2, "days").startOf("day").toDate(),
                    },
                },
            ],
            isActive: true,
            isDeleted: { $ne: true },
        })
            .lean()
            .select("training employee trainingTitle expiresAt")
            .populate({
                path: "employee",
                select: "user",
                populate: { path: "user", select: "firstName lastName email languagePreference" },
            });

        for (const trainingCertificate of trainingCertificates) {
            const trainingCertificateExpiresAt = trainingCertificate.expiresAt;
            const trainingTitle = trainingCertificate.trainingTitle?.find(
                x => x.lang === "en" || x.lang === "ar"
            )?.value;
            const emailObject = {
                employeeEmail: trainingCertificate.employee?.user?.email,
                subject: "Certificate Expiry warning",
                employeeName: trainingCertificate.employee?.user?.firstName,
                message: ``,
                trainingCertificateId: trainingCertificate._id,
            };

            if (
                trainingCertificateExpiresAt < Moment().utc().startOf("day").toDate() &&
                trainingCertificateExpiresAt >=
                    Moment().utc().subtract(1, "days").startOf("day").toDate()
            ) {
                emailObject.message += `Your certificate for the course "${trainingTitle}" has expired.`;
            } else if (
                trainingCertificateExpiresAt >= Moment().utc().startOf("day").toDate() &&
                trainingCertificateExpiresAt < Moment().utc().add(1, "days").startOf("day").toDate()
            ) {
                emailObject.message += `Your certificate for the course "${trainingTitle}" will expire today.`;
            } else if (
                trainingCertificateExpiresAt >=
                    Moment().utc().add(1, "days").startOf("day").toDate() &&
                trainingCertificateExpiresAt < Moment().utc().add(2, "days").startOf("day").toDate()
            ) {
                emailObject.message += `Your certificate for the course "${trainingTitle}" will expire in two days.`;
            }

            console.log(
                "trainingCertificateRemainder:expiresAt:",
                Moment.utc(trainingCertificateExpiresAt).format()
            );

            console.log("trainingCertificateRemainder:emailObject:", emailObject);

            if (emailObject.message?.length) sendTrainingCertificateReminderMail(emailObject);
        }
    } catch (e) {
        console.log("training_certificate_reminder.trainingCertificateRemainder:error:", e);
    }
};

module.exports = {
    trainingCertificateRemainder: () => {
        CronHelper.schedule("0 10 * * *", async () => {
            await fetchAndSendEmailToTrainingCertificateEmployeesAboutDue();
        });
    },
};
