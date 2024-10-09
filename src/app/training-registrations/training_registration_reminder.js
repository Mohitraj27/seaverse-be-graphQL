const { CronHelper, Moment } = require("../../tools");
const { SendEmail, EmailTemplate } = require("../../util");

const { TrainingRegistration } = require("./training_registration_model");
const { User } = require("../user/user_model");

const sendTrainingRegistrationReminderMail = async data => {
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
        const trainingRegistrationId = data.trainingRegistrationId;

        let html = `<div style="padding: 20px; text-align: center">
            <h2 style="color: #281166">Hi, ${employeeName}</h2>
        
            <p style="color: #281166">${message}</p>
        
            <a href="${process.env.EMPLOYEE_DOMAIN_URL}en/course-details/${trainingRegistrationId}">
            <button type="button" style="border: none;border-radius: 5px;background-color: #5928E5;color: white;width: 200px;padding: 8px;margin-bottom: 30px;"> Click to view and resume the course</button>
            
            </a>
        </div>
    `;

        SendEmail({
            receiverEmail,
            subject,
            htmlContent: EmailTemplate.emailTemplate(subscriberLogo, subscriberDetails, html),
        }).catch(e => {
            console.log(
                "training_registration_reminder.sendTrainingRegistrationReminderMail:error:",
                e?.message
            );
        });
    } catch (e) {
        console.log(
            "training_registration_reminder.sendTrainingRegistrationReminderMail:exception:",
            e?.message
        );
    }
};

const TrainingRegistrationStatus = require("./training_registration_status");

const fetchAndSendEmailToTrainingRegistrationEmployeesAboutDue = async () => {
    try {
        const trainingRegistrations = await TrainingRegistration.find({
            status: { $ne: TrainingRegistrationStatus.COMPLETED },
            $or: [
                {
                    endDate: {
                        $lt: Moment().utc().startOf("day").toDate(),
                        $gte: Moment().utc().subtract(1, "days").startOf("day").toDate(),
                    },
                },
                {
                    endDate: {
                        $gte: Moment().utc().startOf("day").toDate(),
                        $lt: Moment().utc().add(1, "days").startOf("day").toDate(),
                    },
                },
                {
                    endDate: {
                        $gte: Moment().utc().add(1, "days").startOf("day").toDate(),
                        $lt: Moment().utc().add(2, "days").startOf("day").toDate(),
                    },
                },
            ],
            isActive: true,
        })
            .lean()
            .select("training employee endDate")
            .populate({ path: "training", select: "title" })
            .populate({
                path: "employee",
                select: "user",
                populate: { path: "user", select: "firstName lastName email languagePreference" },
            });

        for (const trainingRegistration of trainingRegistrations) {
            const trainingRegistrationEndDate = trainingRegistration.endDate;
            const trainingTitle = trainingRegistration.training?.title?.find(
                x => x.lang === "en" || x.lang === "ar"
            )?.value;

            const emailObject = {
                employeeEmail: trainingRegistration.employee?.user?.email,
                subject: "Course due warning",
                employeeName: trainingRegistration.employee?.user?.firstName,
                message: ``,
                trainingRegistrationId: trainingRegistration._id,
            };

            if (
                trainingRegistrationEndDate < Moment().utc().startOf("day").toDate() &&
                trainingRegistrationEndDate >=
                    Moment().utc().subtract(1, "days").startOf("day").toDate()
            ) {
                emailObject.message += `Due date for your course "${trainingTitle}" has been ended`;
            } else if (
                trainingRegistrationEndDate >= Moment().utc().startOf("day").toDate() &&
                trainingRegistrationEndDate < Moment().utc().add(1, "days").startOf("day").toDate()
            ) {
                emailObject.message += `Due date for your course "${trainingTitle}" will be ended today`;
            } else if (
                trainingRegistrationEndDate >=
                    Moment().utc().add(1, "days").startOf("day").toDate() &&
                trainingRegistrationEndDate < Moment().utc().add(2, "days").startOf("day").toDate()
            ) {
                emailObject.message += `Due date for your course "${trainingTitle}" will be end within two days`;
            }

            console.log(
                "trainingRegistrationRemainder:endDate:",
                Moment.utc(trainingRegistrationEndDate).format()
            );

            console.log("trainingRegistrationRemainder:emailObject:", emailObject);

            if (emailObject.message?.length) sendTrainingRegistrationReminderMail(emailObject);
        }
    } catch (e) {
        console.log("training_registration_reminder.trainingRegistrationRemainder:error:", e);
    }
};

module.exports = {
    trainingRegistrationRemainder: () => {
        CronHelper.schedule("30 9 * * *", async () => {
            await fetchAndSendEmailToTrainingRegistrationEmployeesAboutDue();
        });
    },
};
