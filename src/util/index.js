const { JwtHelper, Moment, ObjectId, IpHelper } = require("../tools");
const { FormatError, CustomError, ErrorName } = require("./error_helper");

const { User } = require("../app/user/user_model");

const AwsHelper = require("./aws_helper");
const SubscriptionHelper = require("../app/saas/subscriber/subscription/subscription_helper");

const Role = require("./role");
const VesselStatus = require("./vessel_status");

const parseDateTime = dateTime => {
    try {
        if (dateTime) {
            const formattedDateTime = Moment(dateTime);
            const formattedUtcDateTime = Moment.utc(dateTime);
            const formattedKwtDateTime = Moment.utc(dateTime).add({ hours: 3 });

            return {
                dateTimeObj: formattedDateTime,
                utcDateTimeObj: formattedUtcDateTime,
                kwtDateTimeObj: formattedKwtDateTime,
                dateTime: formattedDateTime.format(),
                utcDateTime: formattedUtcDateTime.format(),
                kwtDateTime: formattedKwtDateTime.format(),
                date: formattedDateTime.format("yyyy-MM-DD"),
                utcDate: formattedUtcDateTime.format("yyyy-MM-DD"),
                kwtDate: formattedKwtDateTime.format("yyyy-MM-DD"),
                time: formattedDateTime.format("HH:mm"),
                utcTime: formattedUtcDateTime.format("HH:mm"),
                kwtTime: formattedKwtDateTime.format("HH:mm"),
                hours: Moment.duration(formattedDateTime.format("HH:mm")).asHours(),
                utcHours: Moment.duration(formattedUtcDateTime.format("HH:mm")).asHours(),
                kwtHours: Moment.duration(formattedKwtDateTime.format("HH:mm")).asHours(),
            };
        }
    } catch (e) {
        console.log("util.index:parseDateTime:Exception:", e.message);
    }
};

const VerifySubscription = async context => {
    try {
        const { hasSubscription } = await SubscriptionHelper.getActiveSubscriptionInfo(
            context?.subscriberId
        );

        context.hasSubscription = hasSubscription;

    } catch (e) {
        console.log("Invalid Subscription Data");
    }

    return context ?? {};
};

const VerifyUser = async context => {
    try {
        if (context.userId) {
            const existingUser = await User.findOne({
                _id: context.userId,
                isDeleted: { $ne: true },
            })
                .lean()
                .select(
                    "firstName lastName civilIdOrPassport email companyEmail phone role subRoles isOrganizationManager managingOrganization"
                )
                .populate({
                    path: "subRoles",
                    match: { isActive: true, isDeleted: { $ne: true } },
                });

            if (existingUser) {
                context.userInfo = existingUser;
                context.isActive = existingUser.isActive;
                context.permissions = [
                    ...new Set(existingUser.subRoles?.map(x => x.permissions).flat(1)),
                ];
                context.isOrganizationManager = existingUser.isOrganizationManager;
                context.managingOrganization = existingUser.managingOrganization;
            } else {
                context.userId = "";
            }
        }
    } catch (e) {
        console.log("Invalid User Data");
    }

    return context ?? {};
};

module.exports = {
    AuthUser: (context, throwError = true) => {
        let isAuthenticated = false,
            masterLogin = false,
            role = Role.GUEST,
            userId,
            userInfo,
            userPermissions = [],
            subscriberId,
            primaryRole,
            employeeId,
            hasSubscription = false,
            isOrganizationManager = false,
            managingOrganization;

        try {
            if (context?.user) {
                isAuthenticated = ObjectId.isValid(context.user.userId);

                if (isAuthenticated) {
                    masterLogin = context.user.masterLogin ?? false;
                    role = context.user.role ?? Role.GUEST;
                    userId = ObjectId(context.user.userId);
                    userInfo = context.user.userInfo;
                    primaryRole = context.user.userInfo.subRoles.map((role) => { if (role.primaryRole === "ADMIN") return role.primaryRole });
                    userPermissions = context.user.permissions ?? [];
                    if (ObjectId.isValid(context.user.subscriberId))
                        subscriberId = ObjectId(context.user.subscriberId);
                    if (ObjectId.isValid(context.user.employeeId))
                        employeeId = ObjectId(context.user.employeeId);
                    hasSubscription = context.user.hasSubscription ?? false;

                    if (ObjectId.isValid(context.user.managingOrganization)) {
                        isOrganizationManager = context.user.isOrganizationManager ?? false;
                        managingOrganization = ObjectId(context.user.managingOrganization);
                    }
                }
            }
        } catch (e) {
            console.log("util:index.authUser:exception:", e.message);
        }

        if (!isAuthenticated && throwError) {
            console.log(`util:index.authUser:UNAUTHORIZED:`, context?.resolverName);
            throw CustomError(ErrorName.UNAUTHORIZED);
        }

        return {
            isAuthenticated,
            masterLogin,
            role,
            userId,
            userInfo,
            primaryRole,
            userPermissions,
            subscriberId,
            employeeId,
            hasSubscription,
            isOrganizationManager,
            managingOrganization,
        };
    },
    CurrentDateTime: () => parseDateTime(Moment().format()),
    ParseDateTime: parseDateTime,
    VerifySubscription,
    VerifyToken: async context => {
        try {
            const token = (context?.Authorization ?? context?.authorization)?.split(" ")[1] ?? [];

            if (token.length > 0) {
                context.user = await JwtHelper.verify(token, process.env.APP_SECRET);
                context.user = await VerifyUser(context.user);
                context.user = await VerifySubscription(context.user);
            }
        } catch (e) {
            console.log("Invalid Access Token");
        }

        return context ?? {};
    },
    IpInfo: req => {
        const getIpDetails = () => {
            try {
                const xForwardedFor = (req.headers["x-forwarded-for"] || "").replace(/:\d+$/, "");
                let ip = req.ip || xForwardedFor || req.connection.remoteAddress;
                if (ip.includes("::ffff:")) ip = ip.split(":").reverse()[0];
                if (ip !== "127.0.0.1" && ip !== "::1") return IpHelper.lookup(ip);
            } catch (_) {}
        };

        const ipInfo = getIpDetails();
        let ipCountry;

        if (ipInfo) ipCountry = ipInfo.country;

        return { ipInfo, ipCountry };
    },
    Wait: async (waitTime = 3000) => {
        await new Promise(resolve => setTimeout(resolve, waitTime));
    },

    AuthHelper: require("./auth_helper"),
    FormatError,
    CustomError,
    ErrorName,
    FirebaseHelper: require("./firebase_helper"),
    DeleteFile: AwsHelper.deleteFile,
    CalculateDistance: require("./geolocator_helper").findDistance,
    GenerateOtp: require("./otp_helper").generateOtp,
    SendEmail: AwsHelper.sendEmail,
    SendSms: require("./sms_helper").sendSms,
    StringNormalize: require("./string_helper").stringNormalize,
    UploadHelper: require("./upload_helper"),
    DbTransactionHelper: require("./db_transaction_helper"),

    AppConfig: require("./app_config"),
    Event: require("./event"),
    Role,
    groupTypes: require("./group_types"),
    courseStatus: require("./course_status"),
    VesselStatus,
    Language: require("./language"),
    EmailTemplate: require("./email_template"),
};
