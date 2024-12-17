const { ApiHelper } = require("../../tools");
const { AuthUser, CurrentDateTime, ParseDateTime, Role } = require("../../util");

const { AppSettings } = require("../app-settings/app_settings_model");
const { User } = require("../user/user_model");

const SubscriptionHelper = require("../saas/subscriber/subscription/subscription_helper");

const refreshCurrencyTable = async ({ appSettings, currentDateTime }) => {
    if (appSettings) {
        const currentDate = currentDateTime.utcDate;
        const currencyDate = ParseDateTime(appSettings.currencyTable?.date)?.utcDate;

        if (currencyDate !== currentDate && appSettings.supportedCurrencies?.length) {
            const baseCurrency = appSettings.currencyTable?.baseCurrency ?? "USD";
            const requiredExchangeRates = appSettings.supportedCurrencies
                ?.map(x => `${baseCurrency}/${x.symbol}`)
                ?.join(",");

            const response = await ApiHelper.get(
                `https://fcsapi.com/api-v3/forex/latest?symbol=${requiredExchangeRates}&access_key=oE1QGfZTdBwg8O0pBT7akEY`
            )
                .then(response => {
                    try {
                        if (response?.data?.response) {
                            return {
                                currencyItems: response.data.response.map(x => ({
                                    symbol: x.s,
                                    rate: x.c,
                                })),
                            };
                        } else {
                            console.log(
                                "app_data_resolver.getAppData:currency:then:",
                                response?.data?.msg
                            );
                        }
                    } catch (e) {
                        console.log(
                            "app_data_resolver.getAppData:currency:then:exception:",
                            e.message
                        );
                    }
                })
                .catch(error => {
                    throw Error(error.message);
                });

            if (response?.currencyItems) {
                return {
                    baseCurrency,
                    date: currentDate,
                    items: response.currencyItems,
                };
            }
        }
    }
};

module.exports.queries = {
    getAppData: async ({}, context) => {
        const { isAuthenticated, userId, subscriberId } = AuthUser(context, false);

        const appSettings = await AppSettings.findOne();
        const currentDateTime = CurrentDateTime();

        const currencyTable = await refreshCurrencyTable({
            appSettings,
            currentDateTime,
        });

        if (currencyTable) {
            appSettings.currencyTable = currencyTable;
            await appSettings.save();
        }

        return {
            appInfo: `${process.env.npm_package_name} v${
                process.env.npm_package_version
            } ${process.env.NODE_ENV?.toLowerCase()}`,
            appSettings,
            currentDateTime,
            user: isAuthenticated
                ? await User.findById(userId)
                      .lean()
                      .populate({
                          path: "subRoles",
                          match: { isActive: true, isDeleted: { $ne: true } },
                      })
                : null,
            subscriptionInfo: await SubscriptionHelper.getActiveSubscriptionInfo(subscriberId),
        };
    },
};
