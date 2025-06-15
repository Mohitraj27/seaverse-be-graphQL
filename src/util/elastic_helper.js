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
      refresh: true,
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
      refresh: true,
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
   /*  throw CustomError(
      ErrorName.UPDATE_DOC_ELASTIC_SEARCH,
      `Elastic UpdateByQuery Error (${indexName}): ${err}`
    ); */
    console.error(`Elastic UpdateByQuery Error (${indexName}): ${err}`);
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
  // if (filterInput?.search) {
  //   must.push({
  //     multi_match: {
  //       query:encrypt(filterInput?.search?.trim()),
  //       fields: [
  //         "firstName",
  //         "lastName",
  //         "email",
  //         "civilIdOrPassport",
  //       ],
  //       type: "phrase_prefix",
  //     },
  //   });
  // }

  if (filterInput?.search?.trim()) {
  const searchTerm = filterInput.search.trim();
  const encryptedLower = encrypt(searchTerm.toLowerCase());
  const encryptedUpper = encrypt(searchTerm.toUpperCase());

  must.push({
    bool: {
      should: [
        { match_phrase_prefix: { firstName: encryptedLower } },
        { match_phrase_prefix: { lastName: encryptedLower } },
        { match_phrase_prefix: { email: encryptedLower } },
        { match_phrase_prefix: { civilIdOrPassport: encryptedUpper } },
      ],
      minimum_should_match: 1,
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
  if (filterInput?.includeDeletedUsers !== true) {
    mustNot.push({ term: { "isDeleted": true } });
  }
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

// Bulk Insert Documents
async function bulkIndexDocumentsToElasticSearch(indexName, documents = []) {
  try {
    if (!documents.length) return;

    const operations = documents.flatMap(({ id, ...doc }) => [
      { index: { _index: indexName, _id: id.toString() } },
      doc,
    ]);

    const response = await client.bulk({
      refresh: true,
      operations,
    });

    if (response.errors) {
      const errorDetails = response.items.filter(item => item.index && item.index.error);
      console.error(`Bulk index had errors in ${indexName}:`, errorDetails);
      throw CustomError(ErrorName.INDEX_DOC_ELASTIC_SEARCH, `Elastic Bulk Insert Error (${indexName})`);
    }

    console.log(`Bulk indexed ${documents.length} documents into ${indexName}`);
    return response;
  } catch (err) {
    throw CustomError(ErrorName.INDEX_DOC_ELASTIC_SEARCH, `Elastic Bulk Insert Error (${indexName}): ${err}`);
  }
}

/**
 * Simple bulk update helper for Elasticsearch.
 * 
 * @param {string} indexName - Elasticsearch index name.
 * @param {Array} updates - Array of update operations.
 *    Each update is an object: { id: string, doc: object, upsert?: boolean }
 * @param {boolean} refresh - Whether to refresh the index after bulk operation.
 */
async function bulkUpdateDocumentsInElastic(indexName, updatesMap, refresh = true) {
  const body = [];

  for (const [id, doc] of Object.entries(updatesMap)) {
    if (!id || !doc || typeof doc !== 'object') continue;

    body.push({ update: { _index: indexName, _id: id } });
    body.push({ doc });
  }

  if (body.length === 0) return;

  try {
    const response = await client.bulk({ refresh, body });

    if (response.errors) {
      const erroredItems = response.items.filter(item => {
        const actionType = Object.keys(item)[0];
        return item[actionType].error;
      });
      console.error('Bulk update errors:', erroredItems);
    } else {
      console.log(`Bulk update succeeded (${Object.keys(updatesMap).length} docs)`);
    }
  } catch (err) {
    console.error('Elasticsearch bulk update failed:', err);
  }
}

module.exports = {
  indexDocumenttoElasticSearch,
  updateDocumenttoElasticSearch,
  deleteDocumenttoElasticSearch,
  getDocumentfromElasticSearch,
  deleteByQueryFromElasticSearch,
  updateByQueryToElasticSearch,
  searchEmployeesFromElastic,
  bulkIndexDocumentsToElasticSearch,
  bulkUpdateDocumentsInElastic,
  client
};
