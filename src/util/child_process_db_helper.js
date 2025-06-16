require("dotenv").config();
const { connect, connection, set } = require("mongoose");

const connectDb = async () => {
    await connect(process.env.MONGO_DB, {
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
    connectDb,
    closeDb: () => {
        connection.close();
    },
};
