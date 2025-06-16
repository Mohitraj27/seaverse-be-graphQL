require("dotenv").config();

const { ExpressServer, ApolloServer, HttpsHelper, HttpHelper, FileHelper } = require("./src/tools");
const { FormatError, VerifyToken, FirebaseHelper, IpInfo } = require("./src/util");
var express = require('express');
var path = require('path');
const DbHelper = require("./src/util/db_helper");
const { GraphqlSchema, GraphqlResolver } = require("./src/graphql");
const { RestResolver } = require("./src/rest");

require('./src/app/user/employee/csv_import_worker');
require('./src/app/training-registrations/course_enrollment_worker');


const SubscriptionRemainder = require("./src/app/saas/subscriber/subscription/subscription_reminder");
const TrainingRegistrationRemainder = require("./src/app/training-registrations/training_registration_reminder");
const TrainingCertificateRemainder = require("./src/app/training-registrations/training-certificates/training_certificate_reminder");
const BatchRemainder = require("./src/app/batches/batch_reminder");
const BackupHelper = require("./src/app/backup/backup_helper");
const firebaseHelper = require('./src/util/firebase_helper');
const EmployeeHelper = require("./src/app/user/employee/employee_helper");
const {client} = require("./src/util/elastic_helper");
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

const { httpsServer, httpServer, apolloServer } = (() => {
    const apolloServer = new ApolloServer({
        typeDefs: GraphqlSchema,
        resolvers: GraphqlResolver,
        introspection: true,
        playground: true,
        uploads: false,
        subscriptions: { keepAlive: 15000 },
        formatError: error => FormatError(error),
        formatResponse: (response) => {
            if (response.errors && response.errors.length > 0) {
                return { errors: response.errors };
            }
            return response;
        },
        context: async ({ req, connection }) => {
            return {
                ...IpInfo(req),
                ...(await VerifyToken(connection ? connection.context : req.headers)),
            };
        },
    });

    apolloServer.applyMiddleware({ app: ExpressServer, cors: false });


    var public = path.join(__dirname, 'uploads');
    ExpressServer.use('/uploads', express.static(path.join(__dirname, 'uploads')));
    const httpsServer = HttpsHelper.createServer(
        {
        },
        ExpressServer
    );

    apolloServer.installSubscriptionHandlers(httpsServer);

    const httpServer = HttpHelper.createServer(ExpressServer);
    apolloServer.installSubscriptionHandlers(httpServer);

    return { httpsServer, httpServer, apolloServer };
})();
firebaseHelper.init();
const elasticConnect = async () => {
    try {
      await client.info();
        console.log("Elasticsearch is connected");
    } catch (error) {
        console.error("Elasticsearch connection failed:", error);
    }
};
elasticConnect();

DbHelper.initDb({ httpsServer, httpServer, apolloServer });

ExpressServer.use("/api", RestResolver);

ExpressServer.get('/health-check', (req, res) => {
    res.status(200).send('App is up and running');
});


TrainingRegistrationRemainder.trainingRegistrationRemainder();
TrainingCertificateRemainder.trainingCertificateRemainder();
BatchRemainder.batchCompletionRemainder();
EmployeeHelper.scheduledForEveryDayMidnight();

