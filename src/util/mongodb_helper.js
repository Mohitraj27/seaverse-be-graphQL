const { MongoClient } = require('mongodb');

const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'seaverse';
const COLLECTION_NAME = 'OverallTrainingProgress';

const run = async () => {
    const client = new MongoClient(MONGO_URI);
    await client.connect();

    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    console.log('🚀 Connected to MongoDB');
    await client.close();
};

module.exports = run;