const { Client } = require('@elastic/elasticsearch');
require("dotenv").config();

const client = new Client({
    node: process.env.ELASTICSEARCH_URL || "http://localhost:9200",
    auth: {
        apiKey: process.env.ELASTICSEARCH_API_KEY || "default_api_key",
    }
});

module.exports = client;