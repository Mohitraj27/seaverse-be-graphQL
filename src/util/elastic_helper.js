const { Client } = require('@elastic/elasticsearch');
const {
    CustomError,
    ErrorName
} = require("../util");

require("dotenv").config();

const client = new Client({
    node: process.env.ELASTICSEARCH_URL,
    auth: {
        apiKey: process.env.ELASTICSEARCH_API_KEY,
    }
});


// Create or Insert Document
async function indexDocumenttoElasticSearch(indexName, id, document) {
  try {
    const response = await client.index({
      index: indexName,
      id: id.toString(),
      document,
    });
    console.log(`Indexed into ${indexName}:`, response);
  } catch (err) {
    throw CustomError(ErrorName.INDEX_DOC_ELASTIC_SEARCH,`Elastic Insert Error (${indexName}): ${err}`)
  }
}

// Update Existing Document
async function updateDocumenttoElasticSearch(indexName, id, document) {
  try {
    const response = await client.update({
      index: indexName,
      id: id.toString(),
      doc: document,
    });
    console.log(`Updated in ${indexName}:`, response);
  } catch (err) {
    throw CustomError(ErrorName.UPDATE_DOC_ELASTIC_SEARCH,`Elastic Update Error (${indexName}): ${err}`)
  }
}

// Delete Document
async function deleteDocumenttoElasticSearch(indexName, id) {
  try {
    const response = await client.delete({
      index: indexName,
      id: id.toString(),
    });
    console.log(`Deleted from ${indexName}:`, response);
  } catch (err) {
    throw CustomError(ErrorName.DELETE_DOC_ELASTIC_SEARCH,`Elastic Delete Error (${indexName}): ${err}`)
   }
}

// Get Document
async function getDocumentfromElasticSearch(indexName, id) {
  try {
    const response = await client.get({
      index: indexName,
      id: id.toString(),
    });
    console.log(`Fetched from ${indexName}:`, response);
    return response._source;
  } catch (err) {
    throw CustomError(ErrorName.GET_DOC_ELASTIC_SEARCH,`Elastic Get Error (${indexName}): ${err}`)
  }
}

module.exports = {
    indexDocumenttoElasticSearch,
    updateDocumenttoElasticSearch,
    deleteDocumenttoElasticSearch,
    getDocumentfromElasticSearch,
    client
};
