require("dotenv").config();

const { ExpressServer, ApolloServer, HttpsHelper, HttpHelper, FileHelper } = require("./src/tools");
const { FormatError, VerifyToken, FirebaseHelper, IpInfo } = require("./src/util");
var express = require('express');
var path = require('path');
const DbHelper = require("./src/util/db_helper");
const { GraphqlSchema, GraphqlResolver } = require("./src/graphql");
const { RestResolver } = require("./src/rest");

const SubscriptionRemainder = require("./src/app/saas/subscriber/subscription/subscription_reminder");
const TrainingRegistrationRemainder = require("./src/app/training-registrations/training_registration_reminder");
const TrainingCertificateRemainder = require("./src/app/training-registrations/training-certificates/training_certificate_reminder");
const BatchRemainder = require("./src/app/batches/batch_reminder");
const BackupHelper = require("./src/app/backup/backup_helper");

if (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "development-production") {
    process.env.PORT = process.env.PORT_LIVE;
    process.env.MONGO_DB = process.env.MONGO_DB_LIVE;
    process.env.APP_SECRET = process.env.APP_SECRET_LIVE;
    process.env.S3_BUCKET = process.env.S3_BUCKET_LIVE;
    process.env.FILES_URL = process.env.FILES_URL_LIVE;
    process.env.ADMIN_DOMAIN_URL = process.env.ADMIN_DOMAIN_URL_LIVE_HTTPS;
    process.env.EMPLOYEE_DOMAIN_URL = process.env.EMPLOYEE_DOMAIN_URL_LIVE_HTTPS;
    process.env.AWS_REGION = process.env.AWS_REGION_LIVE;
} else if (process.env.NODE_ENV === "stage") {
    process.env.PORT = process.env.PORT_STAGE;
    process.env.MONGO_DB = process.env.MONGO_DB_STAGE;
} else if (process.env.NODE_ENV === "development") {
    process.env.PORT = process.env.PORT_DEVELOP;
}

//init servers
const { httpsServer, httpServer, apolloServer } = (() => {
    const apolloServer = new ApolloServer({
        typeDefs: GraphqlSchema,
        resolvers: GraphqlResolver,
        introspection: true,
        playground: true,
        uploads: false,
        subscriptions: { keepAlive: 15000 },
        context: async ({ req, connection }) => {
            return {
                ...IpInfo(req),
                ...(await VerifyToken(connection ? connection.context : req.headers)),
            };
        },
        formatError: error => FormatError(error),
    });

    apolloServer.applyMiddleware({ app: ExpressServer, cors: false });


    var public = path.join(__dirname, 'uploads');
    // ExpressServer.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
    ExpressServer.use('/uploads', express.static(path.join(__dirname, 'uploads')));


    //  ExpressServer.use('/', express.static(public));

    const httpsServer = HttpsHelper.createServer(
        {
            // cert: FileHelper.readFileSync("./ssl/sea_verse_io.crt", "utf8"),
            // ca: FileHelper.readFileSync("./ssl/sea_verse_io.ca-bundle", "utf8"),
            // key: FileHelper.readFileSync("./ssl/sea_verse_io.key", "utf8"),
        },
        ExpressServer
    );

    apolloServer.installSubscriptionHandlers(httpsServer);

    const httpServer = HttpHelper.createServer(ExpressServer);
    apolloServer.installSubscriptionHandlers(httpServer);

    return { httpsServer, httpServer, apolloServer };
})();

//init db
DbHelper.initDb({ httpsServer, httpServer, apolloServer });

ExpressServer.use("/api", RestResolver);

// TODO: firebase service json init
// FirebaseHelper.init();

// TODO: subscription reminder cron job
// SubscriptionRemainder.sendSubscriptionRemainder();

TrainingRegistrationRemainder.trainingRegistrationRemainder();
TrainingCertificateRemainder.trainingCertificateRemainder();
BatchRemainder.batchCompletionRemainder();
// BackupHelper.archivingOldLogsAndNotifications();
