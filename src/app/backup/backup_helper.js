const { Moment, CronHelper } = require("../../tools");
const { UploadHelper } = require("../../util");

const { Log } = require("../logs/log_model");
const { Notification } = require("../notifications/notification_model");

const archiveOldData = async model => {
    try {
        if (model != null) {
            const archiveDurationDays = 180;
            const currentDateTimeObj = Moment.utc().add({ day: 0 });
            const oldDataDate = currentDateTimeObj
                .clone()
                .subtract({ day: archiveDurationDays })
                .endOf("day")
                .toDate();


            const existingData = await model.find({ createdAt: { $lte: oldDataDate } }).lean();

            if (existingData?.length) {
                const jsonUrl = await UploadHelper.uploadJsonObject({
                    jsonData: existingData,
                    folderName: currentDateTimeObj.format("YYYY-MM"),
                    fileName: `${model.collection.name.toLowerCase()}_${currentDateTimeObj.format(
                        "YYYY-MM-DD"
                    )}`,
                    uploadType: UploadHelper.uploadType.logJson,
                });

                if (jsonUrl) {
                    const deletedData = await model.deleteMany(
                        { _id: { $in: existingData.map(x => x._id) } },
                        { lean: true }
                    );
                    return jsonUrl;
                }
            }
        }
    } catch (e) {
        throw Error(e.message);
    }
};

module.exports = {
    archiveOldData,
    archivingOldLogsAndNotifications: () => {
        CronHelper.schedule("0 1 * * *", async () => {
            await archiveOldData(Log);
            await archiveOldData(Notification);
        });
    },
};
