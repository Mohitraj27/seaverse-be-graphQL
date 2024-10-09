const { connect, connection } = require("mongoose");

const connectDb = () => {
    connect(process.env.MONGO_DB, {
        useCreateIndex: true,
        useNewUrlParser: true,
        useUnifiedTopology: true,
        useFindAndModify: false,
        autoIndex: true,
    }).catch(error => {
        console.log(`MongoInitialError:${error}`);
    });
};

module.exports = {
    initDb: ({ httpsServer, httpServer, apolloServer }) => {
        connectDb();

        connection
            .once("open", () => {
                console.log(`Environment: ${process.env.NODE_ENV}`);

                const callback = (suffix = "") => {
                    console.log(
                        `Server: http${suffix}://localhost:${process.env.PORT}${apolloServer.graphqlPath}`
                    );

                    console.log(
                        `Subscription: ws${suffix}://localhost:${process.env.PORT}${apolloServer.subscriptionsPath}`
                    );
                };

                if (
                    process.env.NODE_ENV === "development" ||
                    process.env.NODE_ENV === "development-production" ||
                    process.env.NODE_ENV === "stage"
                ) {
                    httpServer.listen({ port: process.env.PORT }, () => callback());
                } else {
                    httpsServer.listen({ port: process.env.PORT }, () => callback("s"));
                }
            })
            .on("connecting", () => {
                console.log(`MongoConnecting`);
            })
            .on("connected", () => {
                console.log(`MongoConnected`);
            })
            .on("disconnected", () => {
                console.log(`MongoDisconnected`);
                setTimeout(connectDb, 5000);
            })
            .on("reconnected", () => {
                console.log(`MongoReconnected`);
            })
            .on("error", error => {
                console.log(`MongoError:${error}`);
            });
    },
};
