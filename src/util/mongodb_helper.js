const mongoose = require('mongoose');

let connection;

const connectToMongo = async (uri) => {
    if (connection) return connection;

    await mongoose.connect(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });

    connection = mongoose.connection;

    console.log('✅ MongoDB connected to', connection.db.databaseName);
    return connection;
};

const getDb = () => {
    if (!connection) throw new Error('MongoDB not connected yet!');
    return connection;
};

module.exports = { connectToMongo, getDb };

