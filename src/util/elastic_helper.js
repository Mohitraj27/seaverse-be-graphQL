const { Client } = require('@elastic/elasticsearch');
const {
  CustomError,
  ErrorName
} = require("../util");
const { encrypt } = require('./encryption_helper');

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
      refresh: true,
      id: id.toString(),
      document,
    });
    console.log(`Indexed into ${indexName}:`, response);
  } catch (err) {
    throw CustomError(ErrorName.INDEX_DOC_ELASTIC_SEARCH, `Elastic Insert Error (${indexName}): ${err}`)
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
    throw CustomError(ErrorName.UPDATE_DOC_ELASTIC_SEARCH, `Elastic Update Error (${indexName}): ${err}`)
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
    throw CustomError(ErrorName.DELETE_DOC_ELASTIC_SEARCH, `Elastic Delete Error (${indexName}): ${err}`)
  }
}

// Get Document
async function getDocumentfromElasticSearch(indexName, id) {
  if (id) {
    try {
      const response = await client.get({
        index: indexName,
        id: id.toString(),
      });
      console.log(`Fetched from ${indexName}:`, response);
      return response._source;
    } catch (err) {
      throw CustomError(ErrorName.GET_DOC_ELASTIC_SEARCH, `Elastic Get Error (${indexName}): ${err}`)
    }
  } else {
    try {
      const response = await client.search({
        index: indexName
      });
      console.log(`Fetched from ${indexName}:`, response);
      return response.hits.hits.map(hit => hit._source);
    } catch (err) {
      throw CustomError(ErrorName.GET_DOC_ELASTIC_SEARCH, `Elastic Get Error (${indexName}): ${err}`)
    }
  }
}

// Delete multiple documents based on a query
async function deleteByQueryFromElasticSearch(indexName, query) {
  try {
    const response = await client.deleteByQuery({
      index: indexName,
      refresh: true,
      body: {
        query: query
      }
    });
    console.log(`Deleted documents from ${indexName} by query:`, response);
    return response;
  } catch (err) {
    throw CustomError(ErrorName.DELETE_DOC_ELASTIC_SEARCH, `Elastic DeleteByQuery Error (${indexName}): ${err}`)
  }
}

// Update multiple documents based on a query
async function updateByQueryToElasticSearch(indexName, scriptSource, query, params = {}) {
  try {
    const response = await client.updateByQuery({
      index: indexName,
      refresh: true,
      body: {
        script: {
          source: scriptSource,
          lang: "painless",
          params: params
        },
        query: query
      }
    });
    console.log(`Updated documents in ${indexName} by query:`, response);
    return response;
  } catch (err) {
    throw CustomError(
      ErrorName.UPDATE_DOC_ELASTIC_SEARCH,
      `Elastic UpdateByQuery Error (${indexName}): ${err}`
    );
  }
}

const searchEmployeesFromElastic = async ({
  indexName,
  filterInput = {},
  subRoleAdminId = null,
  lastSeenStart = null,
  lastSeenEnd = null,
  sortField = "user.firstName.keyword",
  sortOrder = "asc",
  skip = 0,
  limit = 10,
}) => {
  const must = [];
  const mustNot = [];

  console.log("Searching in index:", indexName);
  console.log("Search parameters in filter input now came---->", filterInput);
  console.log("sortField:", sortField);
  console.log("sortOrder:", sortOrder);

  // Match search keyword (full name, email, civilIdOrPassport)
  if (filterInput?.search) {
    must.push({
      multi_match: {
        query:encrypt(filterInput?.search?.trim()),
        fields: [
          "fullName",
          "email",
          "civilIdOrPassport",
        ],
        type: "phrase_prefix",
      },
    });
  }

  if (filterInput?.empDesignation?.length > 0) {
    must.push({ terms: { "empDesignation": filterInput?.empDesignation } });
  }

  if (filterInput?.regType && filterInput?.regType != 0) {
    must.push({ term: { "regType": filterInput?.regType } });
  }

  if (filterInput?.vesselStatus?.length > 0) {
    must.push({ terms: { "vesselStatus.keyword": filterInput?.vesselStatus } });
  }

  if (typeof filterInput?.isRegistered === "boolean") {
    must.push({ term: { "isRegistered": filterInput?.isRegistered } });
  }

  if (filterInput?.country?.length > 0) {
    must.push({ terms: { "country.keyword": filterInput?.country } });
  }

  if (lastSeenStart && lastSeenEnd) {
    must.push({
      range: {
        "lastLoginAt": {
          gte: lastSeenStart,
          lte: lastSeenEnd,
        },
      },
    });
    must.push({
      term: { "isResetPasswordDialog": true },
    });
  }

  if (typeof filterInput?.showInvited === "boolean" && filterInput?.showInvited===true) {
    must.push({
      term: { "isResetPasswordDialog": !filterInput?.showInvited },
    });
  }

  if (filterInput?.role?.length > 0) {
    must.push({
      bool: {
        should: [
          ...filterInput?.role?.includes("ADMIN")
            ? [{ term: { "subRoles.keyword": subRoleAdminId } }]
            : [],
          ...filterInput?.role?.includes("LEARNER")
            ? [{ term: { "role.keyword": "LEARNER" } }]
            : [],
        ],
        minimum_should_match: 1,
      },
    });
  }

  if (filterInput?.vesselName?.length > 0) {
    must.push({
      terms: { "currentVessel": filterInput?.vesselName },
    });
  }

  if (filterInput?.vesselType?.length > 0) {
    must.push({
      terms: {
        "tyepOfVesselId": filterInput?.vesselType,
      },
    });
  }

  // Remove deleted or not approved
  mustNot.push({ term: { "isDeleted": true } });
  mustNot.push({ term: { "isSignupAdminAprroved": false } });

  const query = {
    bool: {
      must,
      must_not: mustNot,
    },
  };

  const sort = [{ [sortField]: { order: sortOrder } }];
  console.log("sort---------->", sort);

  const result = await client.search({
    index: indexName,
    body: {
      from: skip,
      size: limit,
      sort,
      query,
    },
  });

  console.log("result---->", result);

  return {
    total: result?.hits?.total?.value,
    employees: result?.hits?.hits?.map(hit => hit._source),
  };
};


module.exports = {
  indexDocumenttoElasticSearch,
  updateDocumenttoElasticSearch,
  deleteDocumenttoElasticSearch,
  getDocumentfromElasticSearch,
  deleteByQueryFromElasticSearch,
  updateByQueryToElasticSearch,
  searchEmployeesFromElastic,
  client
};
