const { ObjectId, Moment, MomentTimezone } = require("../../tools");
const {
    CustomError,
    ErrorName,
    AuthUser,
    Role,
    CurrentDateTime,
    ParseDateTime,
} = require("../../util");
const { Organization } = require("../organizations/organization_model");
const { TrainingRegistration } = require("../training-registrations/training_registration_model");
const { Training } = require("../trainings/training_model");
const { Employee } = require("../user/employee/employee_model");
const { User } = require("../user/user_model");
const {
    TrainingRegistrationInvoice,
} = require("../training-registrations/training-registration-invoices/training_registration_invoice_model");

let currentDate = null;

let currentDayStart = null;
let currentDayEnd = null;

let currentWeekStart = null;
let currentWeekEnd = null;

let currentMonthStart = null;
let currentMonthEnd = null;

let pastOneYear = null;

const setCurrentDate = timezoneVal => {
    currentDate = MomentTimezone.tz(timezoneVal).utcOffset(0, true);

    currentDayStart = currentDate.startOf("day").toISOString();
    currentDayEnd = Moment(currentDate).endOf("day").toISOString();

    currentWeekStart = Moment(currentDate).startOf("week").toISOString();
    currentWeekEnd = Moment(currentDate).endOf("week").toISOString();

    currentMonthStart = Moment(currentDate).startOf("month").toISOString();
    currentMonthEnd = Moment(currentDate).endOf("month").toISOString();

    pastOneYear = Moment(currentDate).subtract(12, "month").startOf("month").toISOString();
};

const fillMissingDatesforMonthly = existingArr => {
    var dateStart = Moment(pastOneYear).startOf("day");
    var dateEnd = Moment(currentDate).startOf("day");
    var timeValues = [];

    while (dateEnd > dateStart || dateStart.format("M") === dateEnd.format("M")) {
        timeValues.push({ _id: dateStart.format("MM YYYY"), value: 0 });
        dateStart.add(1, "month");
    }
    existingArr.map(obj => {
        timeValues[
            timeValues.findIndex(obj2 => {
                return obj2._id === obj._id;
            })
        ] = obj;
    });
    return timeValues.map(obj => {
        obj._id = Moment(Moment(obj._id, "MM YYYY").toDate()).format("MMM YYYY");
        return obj;
    });
};

const fillMissingDatesforMonth = existingArr => {
    var dateStart = Moment(currentMonthStart).startOf("month");
    var dateEnd = Moment(currentMonthStart).endOf("month");
    var timeValues = [];

    while (dateEnd > dateStart || dateStart.format("M") === dateEnd.format("M")) {
        timeValues.push({ _id: dateStart.format("MM DD"), value: 0 });
        dateStart.add(1, "day");
    }

    existingArr.map(obj => {
        timeValues[
            timeValues.findIndex(obj2 => {
                return obj2._id === obj._id;
            })
        ] = obj;
    });
    return timeValues.map(obj => {
        obj._id = Moment(Moment(obj._id, "MM DD").toDate()).format("MMM DD");
        return obj;
    });
};

const fillMissingDatesforWeek = existingArr => {
    var timeValues = [];
    for (let i = 1; i <= 7; i++) {
        timeValues.push({ _id: i, value: 0 });
    }
    existingArr.map(obj => {
        timeValues[
            timeValues.findIndex(obj2 => {
                return obj2._id === obj._id;
            })
        ] = obj;
    });
    return timeValues.map((obj, index) => {
        let textArr = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        obj._id = textArr[index];
        return obj;
    });
};

const fillMissingHoursforToday = existingArr => {
    var timeValues = [];
    for (let i = 0; i < 24; i++) {
        timeValues.push({ _id: i, value: 0 });
    }
    existingArr.map(obj => {
        timeValues[
            timeValues.findIndex(obj2 => {
                return obj2._id === obj._id;
            })
        ] = obj;
    });

    return timeValues.map(obj => {
        if (obj._id < 23) {
            if (obj._id < 12) {
                obj._id = obj._id.toString().concat(" - ", obj._id + 1, " am");
            } else if (obj._id === 12) {
                obj._id = obj._id.toString().concat(" - ", obj._id - 12 + 1, " pm");
            } else obj._id = (obj._id - 12).toString().concat(" - ", obj._id - 12 + 1, " pm");
        } else obj._id = (obj._id - 12).toString().concat(" - ", obj._id - 12 + 1, " pm");

        return obj;
    });
};

const project = timezoneVal => {
    return {
        $project: {
            _id: 1,
            invoiceAmount: 1,
            kuwaitTime: {
                $dateToString: {
                    date: "$createdAt",
                    timezone: timezoneVal,
                },
            },
            monthlyDate: {
                year: { $year: { date: "$createdAt", timezone: timezoneVal } },
                month: {
                    $dateToString: { date: "$createdAt", format: "%m", timezone: timezoneVal },
                },
            },
            date: {
                month: {
                    $dateToString: { date: "$createdAt", format: "%m", timezone: timezoneVal },
                },
                day: {
                    $dateToString: { date: "$createdAt", format: "%d", timezone: timezoneVal },
                },
            },
            week: {
                $dayOfWeek: {
                    date: "$createdAt",
                    timezone: timezoneVal,
                },
            },
            hour: {
                $hour: {
                    date: "$createdAt",
                    timezone: timezoneVal,
                },
            },
        },
    };
};

const facet = valueObj => {
    return {
        $facet: {
            monthly: [
                {
                    $match: {
                        kuwaitTime: {
                            $lte: currentMonthEnd,
                            $gte: pastOneYear,
                        },
                    },
                },
                {
                    $group: {
                        _id: "$monthlyDate",
                        value: valueObj,
                    },
                },

                { $sort: { _id: 1 } },
                {
                    $addFields: {
                        _id: {
                            $concat: [
                                {
                                    $toString: "$_id.month",
                                },
                                " ",
                                { $toString: "$_id.year" },
                            ],
                        },
                    },
                },
            ],
            thisMonth: [
                {
                    $match: {
                        kuwaitTime: {
                            $lte: currentMonthEnd,
                            $gte: currentMonthStart,
                        },
                    },
                },
                {
                    $group: {
                        _id: "$date",
                        value: valueObj,
                    },
                },
                { $sort: { _id: 1 } },
                {
                    $addFields: {
                        _id: {
                            $concat: [
                                {
                                    $toString: "$_id.month",
                                },
                                " ",
                                { $toString: "$_id.day" },
                            ],
                        },
                    },
                },
            ],
            thisWeek: [
                {
                    $match: {
                        kuwaitTime: {
                            $lte: currentWeekEnd,
                            $gte: currentWeekStart,
                        },
                    },
                },
                {
                    $group: {
                        _id: "$week",
                        value: valueObj,
                    },
                },
                { $sort: { _id: 1 } },
            ],
            today: [
                {
                    $match: {
                        kuwaitTime: {
                            $lte: currentDayEnd,
                            $gte: currentDayStart,
                        },
                    },
                },
                {
                    $group: {
                        _id: "$hour",
                        value: valueObj,
                    },
                },
                { $sort: { _id: 1 } },
            ],
        },
    };
};

module.exports = {
    fetchTotalTrainingRegistrationStatisticsGraph: async ({ filterConditions, timezone }) => {
        setCurrentDate(timezone);
        let graphStatistics = [];
        graphStatistics = await TrainingRegistration.aggregate([
            {
                $match: { ...filterConditions },
            },
            { ...project(timezone) },
            {
                ...facet({ $sum: 1 }),
            },
        ]);

        return {
            monthly: graphStatistics.length
                ? fillMissingDatesforMonthly(graphStatistics[0].monthly)
                : [],
            today: graphStatistics.length
                ? fillMissingHoursforToday(graphStatistics[0].today)
                : null,
            thisWeek: graphStatistics.length
                ? fillMissingDatesforWeek(graphStatistics[0].thisWeek)
                : [],
            thisMonth: graphStatistics.length
                ? fillMissingDatesforMonth(graphStatistics[0].thisMonth)
                : [],
        };
    },

    fetchTotalTrainingStatisticsGraph: async ({ filterConditions, timezone }) => {
        setCurrentDate(timezone);
        let graphStatistics = [];
        graphStatistics = await Training.aggregate([
            {
                $match: { ...filterConditions },
            },
            { ...project(timezone) },
            {
                ...facet({ $sum: 1 }),
            },
        ]);
        return {
            monthly: graphStatistics.length
                ? fillMissingDatesforMonthly(graphStatistics[0].monthly)
                : [],
            today: graphStatistics.length
                ? fillMissingHoursforToday(graphStatistics[0].today)
                : null,
            thisWeek: graphStatistics.length
                ? fillMissingDatesforWeek(graphStatistics[0].thisWeek)
                : [],
            thisMonth: graphStatistics.length
                ? fillMissingDatesforMonth(graphStatistics[0].thisMonth)
                : [],
        };
    },

    fetchTotalTrainerStatisticsGraph: async ({ filterConditions, timezone }) => {
        setCurrentDate(timezone);
        let graphStatistics = [];
        graphStatistics = await User.aggregate([
            {
                $lookup: {
                    from: "subroles",
                    localField: "subRoles",
                    foreignField: "_id",
                    as: "subRoles",
                },
            },
            {
                $unwind: "$subRoles",
            },
            {
                $match: { "subRoles.name": "TRAINER" },
            },

            { ...project(timezone) },
            {
                ...facet({ $sum: 1 }),
            },
        ]);
        return {
            monthly: graphStatistics.length
                ? fillMissingDatesforMonthly(graphStatistics[0].monthly)
                : [],
            today: graphStatistics.length
                ? fillMissingHoursforToday(graphStatistics[0].today)
                : null,
            thisWeek: graphStatistics.length
                ? fillMissingDatesforWeek(graphStatistics[0].thisWeek)
                : [],
            thisMonth: graphStatistics.length
                ? fillMissingDatesforMonth(graphStatistics[0].thisMonth)
                : [],
        };
    },

    fetchTotalEmployeesStatisticsGraph: async ({ filterConditions, timezone }) => {
        setCurrentDate(timezone);
        let graphStatistics = [];
        graphStatistics = await Employee.aggregate([
            {
                $match: { ...filterConditions },
            },
            { ...project(timezone) },
            {
                ...facet({ $sum: 1 }),
            },
        ]);
        return {
            monthly: graphStatistics.length
                ? fillMissingDatesforMonthly(graphStatistics[0].monthly)
                : [],
            today: graphStatistics.length
                ? fillMissingHoursforToday(graphStatistics[0].today)
                : null,
            thisWeek: graphStatistics.length
                ? fillMissingDatesforWeek(graphStatistics[0].thisWeek)
                : [],
            thisMonth: graphStatistics.length
                ? fillMissingDatesforMonth(graphStatistics[0].thisMonth)
                : [],
        };
    },

    fetchTotalOrganizationStatisticsGraph: async ({ timezone }) => {
        setCurrentDate(timezone);
        let graphStatistics = [];
        graphStatistics = await Organization.aggregate([
            { ...project(timezone) },
            {
                ...facet({ $sum: 1 }),
            },
        ]);
        return {
            monthly: graphStatistics.length
                ? fillMissingDatesforMonthly(graphStatistics[0].monthly)
                : [],
            today: graphStatistics.length
                ? fillMissingHoursforToday(graphStatistics[0].today)
                : null,
            thisWeek: graphStatistics.length
                ? fillMissingDatesforWeek(graphStatistics[0].thisWeek)
                : [],
            thisMonth: graphStatistics.length
                ? fillMissingDatesforMonth(graphStatistics[0].thisMonth)
                : [],
        };
    },

    fetchTotalRevenueStatisticsGraph: async ({ filterConditions, timezone }) => {
        setCurrentDate(timezone);
        let graphStatistics = [];
        graphStatistics = await TrainingRegistrationInvoice.aggregate([
            {
                $match: { ...filterConditions },
            },
            { ...project(timezone) },
            {
                ...facet({ $sum: "$invoiceAmount" }),
            },
        ]);

        return {
            monthly: graphStatistics.length
                ? fillMissingDatesforMonthly(graphStatistics[0].monthly)
                : [],
            today: graphStatistics.length
                ? fillMissingHoursforToday(graphStatistics[0].today)
                : null,
            thisWeek: graphStatistics.length
                ? fillMissingDatesforWeek(graphStatistics[0].thisWeek)
                : [],
            thisMonth: graphStatistics.length
                ? fillMissingDatesforMonth(graphStatistics[0].thisMonth)
                : [],
        };
    },
};
