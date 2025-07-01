require("dotenv").config();

require('./src/app//workers/course_enrollment_worker');
require('./src/app/workers/csv_import_worker');

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
const firebaseHelper = require('./src/util/firebase_helper');
const EmployeeHelper = require("./src/app/user/employee/employee_helper");
const { client } = require("./src/util/elastic_helper");
const { connectToMongo } = require("./src/util/mongodb_helper");
const { toUpperCaseFirstLetter } = require("./src/util/string_helper");
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



function transformNamesDeep(obj) {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (Array.isArray(obj)) {
        obj.forEach(item => transformNamesDeep(item));
        return obj;
    }
    if (typeof obj === 'object') {
        const keys = Object.getOwnPropertyNames(obj);

        keys.forEach(key => {
            const value = obj[key];

            switch (key) {
                case 'firstName':
                    if (typeof value === 'string') {
                        obj.firstName = typeof value === 'string' ? toUpperCaseFirstLetter(value) : value;
                    }
                    break;
                case 'lastName':
                    if (typeof value === 'string') {
                        obj.lastName = typeof value === 'string' ? toUpperCaseFirstLetter(value) : value;
                    }
                    break;
                default:
                    if (value !== null && (typeof value === 'object' || Array.isArray(value))) {
                        transformNamesDeep(value);
                    }
            }
        });
    }

    return obj;
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
            if (response.data) {
                transformNamesDeep(response.data);
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
// setInterval(async () => {
//     console.log('Checking Redis connection...');
//     if (!redis.status || redis.status !== 'ready') {
//         console.error('❌ Redis is not ready');
//         return;
//     }
//     try {
//         const pong = await redis.ping();
//         console.log(`✅ Redis ping: ${pong}`);
//     } catch (err) {
//         console.error('❌ Redis ping failed:', err);
//     }
// }, 2000);


// ExpressServer.get('/redis-health-check', async (req, res) => {
//     try {
//         if (!redis.status || redis.status !== 'ready') {
//             console.error('❌ Redis is not ready');
//             res.status(500).send('Redis is not ready');
//             return;
//         }
//         const pong = await redis.ping();
//         console.log(`✅ Redis ping: ${pong}`);
//         res.status(200).send(`Redis is healthy: ${pong}`);
//     } catch (err) {
//         console.error('❌ Redis ping failed:', err);
//         res.status(500).send('Redis ping failed');
//     }
// });

DbHelper.initDb({ httpsServer, httpServer, apolloServer });

ExpressServer.use("/api", RestResolver);

ExpressServer.get('/health-check', (req, res) => {
    res.status(200).send('App is up and running');
});

ExpressServer.get('/', (req, res) => {
    res.status(200).send('Welcome to Squadra API V2');
});

// connectToMongo(process.env.MONGO_DB);

TrainingRegistrationRemainder.trainingRegistrationRemainder();
TrainingCertificateRemainder.trainingCertificateRemainder();
BatchRemainder.batchCompletionRemainder();
EmployeeHelper.scheduledForEveryDayMidnight();

