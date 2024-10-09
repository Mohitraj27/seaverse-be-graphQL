const { ObjectId } = require("../../tools");
const { AuthUser, CustomError, ErrorName, UploadHelper } = require("../../util");

const { AppSettings } = require("./app_settings_model");

const LogHelper = require("../logs/log_helper");

const LogType = require("../logs/log_type.json");

module.exports.queries = {
    getAppSettings: async ({}) => {
        return AppSettings.findOne().lean();
    },
};

module.exports.mutations = {
    createOrUpdateAppSettings: async ({ input }, context) => {
        const { userInfo } = AuthUser(context);

        const existingAppSettings = (await AppSettings.findOne()) ?? new AppSettings();

        if (input.supportedCurrencies)
            existingAppSettings.supportedCurrencies = input.supportedCurrencies;

        if (input.contactInfo) {
            if (input.contactInfo.email)
                existingAppSettings.contactInfo.email = input.contactInfo.email;

            if (input.contactInfo.phone)
                existingAppSettings.contactInfo.phone = input.contactInfo.phone;

            if (input.contactInfo.whatsapp)
                existingAppSettings.contactInfo.whatsapp = input.contactInfo.whatsapp;

            if (input.contactInfo.instagram)
                existingAppSettings.contactInfo.instagram = input.contactInfo.instagram;

            if (input.contactInfo.twitter)
                existingAppSettings.contactInfo.twitter = input.contactInfo.twitter;

            if (input.contactInfo.facebook)
                existingAppSettings.contactInfo.facebook = input.contactInfo.facebook;

            if (input.contactInfo.snapchat)
                existingAppSettings.contactInfo.snapchat = input.contactInfo.snapchat;

            if (input.contactInfo.mapUrl)
                existingAppSettings.contactInfo.mapUrl = input.contactInfo.mapUrl;

            if (input.contactInfo.address)
                existingAppSettings.contactInfo.address = input.contactInfo.address;
        }

        if (input.paymentConfig) {
            if (input.paymentConfig.deliveryCharge)
                existingAppSettings.paymentConfig.deliveryCharge =
                    input.paymentConfig.deliveryCharge;

            if (input.paymentConfig.paymentConfigType)
                existingAppSettings.paymentConfig.paymentConfigType =
                    input.paymentConfig.paymentConfigType;

            if (input.paymentConfig.paymentUrl)
                existingAppSettings.paymentConfig.paymentUrl = input.paymentConfig.paymentUrl;

            if (input.paymentConfig.paymentTestUrl)
                existingAppSettings.paymentConfig.paymentTestUrl =
                    input.paymentConfig.paymentTestUrl;

            if (input.paymentConfig.paymentKey)
                existingAppSettings.paymentConfig.paymentKey = input.paymentConfig.paymentKey;

            if (input.paymentConfig.paymentTestKey)
                existingAppSettings.paymentConfig.paymentTestKey =
                    input.paymentConfig.paymentTestKey;

            if (input.paymentConfig.liveMode != null)
                existingAppSettings.paymentConfig.liveMode = input.paymentConfig.liveMode;

            if (input.paymentConfig.cod != null)
                existingAppSettings.paymentConfig.cod = input.paymentConfig.cod;
        }

        if (input.termsAndConditions)
            existingAppSettings.termsAndConditions = input.termsAndConditions;

        if (input.privacyPolicy) existingAppSettings.privacyPolicy = input.privacyPolicy;

        if (input.updateConfig) {
            if (input.updateConfig.iosLink)
                existingAppSettings.updateConfig.iosLink = input.updateConfig.iosLink;

            if (input.updateConfig.androidLink)
                existingAppSettings.updateConfig.androidLink = input.updateConfig.androidLink;

            if (input.updateConfig.minimumRequiredVersion)
                existingAppSettings.updateConfig.minimumRequiredVersion =
                    input.updateConfig.minimumRequiredVersion;

            if (input.updateConfig.latestVersion)
                existingAppSettings.updateConfig.latestVersion = input.updateConfig.latestVersion;
        }

        if (input.introVideos) {
            existingAppSettings.introVideos = [];

            for (const item of input.introVideos) {
                item._id = item._id ?? ObjectId();

                const savedItem = await UploadHelper.uploadVideo({
                    data: item.url,
                    folderName: existingAppSettings._id,
                    fileName: `intro_video_${item._id}_${Date.now()}`,
                    uploadType: UploadHelper.uploadType.introVideo,
                });

                if (savedItem)
                    existingAppSettings.introVideos.push({
                        _id: item._id,
                        lang: item.lang,
                        url: savedItem,
                    });
            }
        }

        const savedAppSettings = await existingAppSettings.save();

        if (!savedAppSettings) throw CustomError(ErrorName.FAILED);

        //region logging
        LogHelper.logActivity({
            logType: LogType.APP_SETTINGS_LOG,
            operation: "UPDATE",
            ipInfo: context.ipInfo,
            affected: [
                {
                    targetRef: "AppSettings",
                    target: savedAppSettings._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "APP_SETTINGS_INFO",
                    infoData: JSON.stringify(input),
                },
            ],
            createdBy: userInfo,
        });
        //endregion

        return savedAppSettings;
    },
};
