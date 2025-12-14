/**
 * User Search Helper - MongoDB Implementation with Session Support
 * Replaces elastic_helper.js with MongoDB-based search
 * Supports transactions for atomic operations across User/Employee/Cache
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { UserSearchCache } = require('../app/user/user_search_cache/user_search_cache_model');
const { CustomError, ErrorName } = require("../util");
const { encrypt } = require('./encryption_helper');

// Create or Insert Document (with optional session for transactions)
async function indexDocumenttoElasticSearch(indexName, id, document, session = null) {
    try {
        const options = {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true
        };

        if (session) {
            options.session = session;
        }

        await UserSearchCache.findOneAndUpdate(
            { userId: id.toString() },
            {
                ...document,
                userId: id.toString(),
                indexedAt: new Date(),
                updatedAt: new Date()
            },
            options
        );
    } catch (err) {
        throw CustomError(ErrorName.INDEX_DOC_ELASTIC_SEARCH, `MongoDB Insert Error (${indexName}): ${err}`)
    }
}

// Update Existing Document (with optional session for transactions)
async function updateDocumenttoElasticSearch(indexName, id, document, session = null) {
    try {
        const options = {
            upsert: true,
            new: true
        };

        if (session) {
            options.session = session;
        }

        await UserSearchCache.findOneAndUpdate(
            { userId: id.toString() },
            {
                $set: {
                    ...document,
                    updatedAt: new Date()
                }
            },
            options
        );
    } catch (err) {
        throw CustomError(ErrorName.UPDATE_DOC_ELASTIC_SEARCH, `MongoDB Update Error (${indexName}): ${err}`);
    }
}

// Delete Document (with optional session for transactions)
async function deleteDocumenttoElasticSearch(indexName, id, session = null) {
    try {
        const options = session ? { session } : {};
        await UserSearchCache.deleteOne({ userId: id.toString() }, options);
    } catch (err) {
        throw CustomError(ErrorName.DELETE_DOC_ELASTIC_SEARCH, `MongoDB Delete Error (${indexName}): ${err}`)
    }
}

// Get Document
async function getDocumentfromElasticSearch(indexName, id) {
    if (id) {
        try {
            const doc = await UserSearchCache.findOne({ userId: id.toString() }).lean();
            return doc;
        } catch (err) {
            throw CustomError(ErrorName.GET_DOC_ELASTIC_SEARCH, `MongoDB Get Error (${indexName}): ${err}`)
        }
    } else {
        try {
            const docs = await UserSearchCache.find({}).lean();
            return docs;
        } catch (err) {
            throw CustomError(ErrorName.GET_DOC_ELASTIC_SEARCH, `MongoDB Get Error (${indexName}): ${err}`)
        }
    }
}

// Delete multiple documents based on a query (with optional session for transactions)
async function deleteByQueryFromElasticSearch(indexName, query, session = null) {
    try {
        const mongoQuery = convertElasticQueryToMongo(query);
        const options = session ? { session } : {};
        const result = await UserSearchCache.deleteMany(mongoQuery, options);
        return {
            deleted: result.deletedCount
        };
    } catch (err) {
        throw CustomError(ErrorName.DELETE_DOC_ELASTIC_SEARCH, `MongoDB DeleteByQuery Error (${indexName}): ${err}`)
    }
}

// Update multiple documents based on a query (with optional session for transactions)
async function updateByQueryToElasticSearch(indexName, scriptSource, query, params = {}, session = null) {
    try {
        const mongoQuery = convertElasticQueryToMongo(query);
        console.log(mongoQuery, "mquery")
        const updateDoc = parseScriptToUpdate(scriptSource, params);
        console.log(updateDoc, "updateDoc")
        console.log(session, "session")

        const options = session ? { session } : {};
        const result = await UserSearchCache.updateMany(
            mongoQuery,
            updateDoc,
            options
        );

        return {
            updated: result.modifiedCount,
            total: result.matchedCount
        };
    } catch (err) {
        throw CustomError(
            ErrorName.UPDATE_DOC_ELASTIC_SEARCH,
            `MongoDB UpdateByQuery Error (${indexName}): ${err}`
        );
    }
}

// Search employees with filters
const searchEmployeesFromElastic = async ({
    indexName,
    filterInput = {},
    subRoleAdminId = null,
    lastSeenStart = null,
    lastSeenEnd = null,
    sortField = "firstName",
    sortOrder = "asc",
    skip = 0,
    limit = 10,
    reports = false
}) => {
    try {
        const query = { $and: [] };
        const mustNot = [];

        // Search filter
        if (filterInput?.search?.trim()) {
            const searchTerm = filterInput.search.trim();
            const encryptedLower = encrypt(searchTerm.toLowerCase());
            const encryptedUpper = encrypt(searchTerm.toUpperCase());

            const hasSpace = searchTerm.includes(' ');
            const orConditions = [];

            if (hasSpace) {
                const nameParts = searchTerm.split(' ').filter(part => part.trim());

                if (nameParts.length >= 2) {
                    const firstName = nameParts[0];
                    const lastName = nameParts.slice(1).join(' ');

                    const encryptedFirstName = encrypt(firstName.toLowerCase());
                    const encryptedLastName = encrypt(lastName.toLowerCase());

                    // Full name search strategies
                    orConditions.push(
                        {
                            $and: [
                                { firstName: { $regex: `^${escapeRegex(encryptedFirstName)}`, $options: 'i' } },
                                { lastName: { $regex: `^${escapeRegex(encryptedLastName)}`, $options: 'i' } }
                            ]
                        },
                        {
                            $and: [
                                { firstName: { $regex: escapeRegex(encryptedFirstName), $options: 'i' } },
                                { lastName: { $regex: escapeRegex(encryptedLastName), $options: 'i' } }
                            ]
                        }
                    );
                }
            }

            // Individual field searches
            orConditions.push(
                { firstName: { $regex: escapeRegex(encryptedLower), $options: 'i' } },
                { lastName: { $regex: escapeRegex(encryptedLower), $options: 'i' } },
                { email: { $regex: escapeRegex(encryptedLower), $options: 'i' } },
                { civilIdOrPassport: { $regex: escapeRegex(encryptedUpper), $options: 'i' } }
            );

            // Additional fields for reports
            if (reports) {
                orConditions.push(
                    { designation: { $regex: escapeRegex(searchTerm), $options: 'i' } },
                    { vesselName: { $regex: escapeRegex(searchTerm), $options: 'i' } }
                );
            }

            query.$and.push({ $or: orConditions });
        }


        if (filterInput?.empDesignation?.length > 0) {
            query.$and.push({ empDesignation: { $in: filterInput?.empDesignation } });
        }

        if (filterInput?.regType && filterInput?.regType != 0) {
            query.$and.push({ regType: filterInput?.regType });
        }

        if (filterInput?.vesselStatus?.length > 0) {
            query.$and.push({ vesselStatus: { $in: filterInput?.vesselStatus } });
        }

        if (typeof filterInput?.isRegistered === "boolean") {
            query.$and.push({ isRegistered: filterInput?.isRegistered });
        }



        if (lastSeenStart && lastSeenEnd) {
            query.$and.push({
                lastLoginAt: {
                    $gte: new Date(lastSeenStart),
                    $lte: new Date(lastSeenEnd)
                }
            });
            query.$and.push({ isResetPasswordDialog: true });
        }

        if (typeof filterInput?.showInvited === "boolean") {
            if (filterInput?.showInvited === true) {
                query.$and.push({ isResetPasswordDialog: !filterInput?.showInvited });
            } else if (filterInput?.showInvited === false) {
                query.$and.push({ isResetPasswordDialog: !filterInput?.showInvited });
            }
        }

        if (filterInput?.role?.length > 0) {
            const roleConditions = [];

            if (filterInput.role.includes("ADMIN")) {
                roleConditions.push({ subRoles: subRoleAdminId });
            }
            if (filterInput.role.includes("LEARNER")) {
                roleConditions.push({ role: "LEARNER" });
            }

            if (roleConditions.length > 0) {
                query.$and.push({ $or: roleConditions });
            }
        }

        if (filterInput?.vesselName?.length > 0) {
            query.$and.push({ currentVessel: { $in: filterInput?.vesselName } });
        }

        if (filterInput?.vesselType?.length > 0) {
            query.$and.push({ tyepOfVesselId: { $in: filterInput?.vesselType } });
        }

        if (filterInput?.includeDeletedUsers != true) {
            query.$and.push({ isDeleted: { $ne: true } });
        }
        query.$and.push({ isSignupAdminAprroved: { $ne: false } });

        // Build final query
        const finalQuery = query.$and.length > 0 ? { $and: query.$and } : {};

        // Sort configuration
        const sortConfig = {};
        sortConfig[sortField.replace('.keyword', '')] = sortOrder === 'asc' ? 1 : -1;

        // Execute query
        const total = await UserSearchCache.countDocuments(finalQuery);
        const employees = await UserSearchCache.find(finalQuery)
            .sort(sortConfig)
            .skip(skip)
            .limit(limit)
            .lean();

        return {
            total,
            employees
        };
    } catch (err) {
        throw CustomError(
            ErrorName.GET_DOC_ELASTIC_SEARCH,
            `MongoDB Search Error: ${err}`
        );
    }
};

// Bulk Insert Documents (with optional session for transactions)
async function bulkIndexDocumentsToElasticSearch(indexName, documents = [], session = null) {
    try {
        if (!documents.length) return;

        const bulkOps = documents.map(({ id, ...doc }) => ({
            updateOne: {
                filter: { userId: id.toString() },
                update: {
                    $set: {
                        ...doc,
                        userId: id.toString(),
                        indexedAt: new Date(),
                        updatedAt: new Date()
                    }
                },
                upsert: true
            }
        }));

        const options = session ? { session } : {};
        const result = await UserSearchCache.bulkWrite(bulkOps, options);

        return {
            errors: false,
            items: result
        };
    } catch (err) {
        throw CustomError(ErrorName.INDEX_DOC_ELASTIC_SEARCH, `MongoDB Bulk Insert Error (${indexName}): ${err}`);
    }
}

// Bulk Update Documents (with optional session for transactions)
async function bulkUpdateDocumentsInElastic(indexName, documents = [], session = null) {
    try {
        if (!documents.length) return;

        const bulkOps = documents.map(({ id, ...doc }) => ({
            updateOne: {
                filter: { userId: id.toString() },
                update: {
                    $set: {
                        ...doc,
                        updatedAt: new Date()
                    }
                }
            }
        }));

        const options = session ? { session } : {};
        const result = await UserSearchCache.bulkWrite(bulkOps, options);

        return {
            errors: false,
            items: result
        };
    } catch (err) {
        throw CustomError(ErrorName.UPDATE_DOC_ELASTIC_SEARCH, `MongoDB Bulk Update Error (${indexName}): ${err}`);
    }
}

// Helper: Convert Elasticsearch query to MongoDB query
function convertElasticQueryToMongo(elasticQuery) {
    if (!elasticQuery) return {};

    // Handle term query
    if (elasticQuery.term) {
        const field = Object.keys(elasticQuery.term)[0];
        const value = elasticQuery.term[field];
        return { [field]: value };
    }

    // Handle terms query
    if (elasticQuery.terms) {
        const field = Object.keys(elasticQuery.terms)[0];
        const values = elasticQuery.terms[field];
        return { [field]: { $in: values } };
    }

    // Handle match query
    if (elasticQuery.match) {
        const field = Object.keys(elasticQuery.match)[0];
        const value = elasticQuery.match[field];
        return { [field]: { $regex: escapeRegex(value), $options: 'i' } };
    }

    // Handle bool query
    if (elasticQuery.bool) {
        const mongoQuery = { $and: [] };

        if (elasticQuery.bool.must) {
            const mustConditions = Array.isArray(elasticQuery.bool.must)
                ? elasticQuery.bool.must
                : [elasticQuery.bool.must];

            mustConditions.forEach(condition => {
                mongoQuery.$and.push(convertElasticQueryToMongo(condition));
            });
        }

        if (elasticQuery.bool.must_not) {
            const mustNotConditions = Array.isArray(elasticQuery.bool.must_not)
                ? elasticQuery.bool.must_not
                : [elasticQuery.bool.must_not];

            mustNotConditions.forEach(condition => {
                const converted = convertElasticQueryToMongo(condition);
                const field = Object.keys(converted)[0];
                mongoQuery.$and.push({ [field]: { $ne: converted[field] } });
            });
        }

        return mongoQuery.$and.length > 0 ? mongoQuery : {};
    }

    return {};
}

// Helper: Parse Painless script to MongoDB update
function parseScriptToUpdate(scriptSource, params) {
    const update = { $set: {} };

    // Parse simple assignment patterns like: ctx._source.field = params.value
    const assignmentRegex = /ctx\._source\.(\w+)\s*=\s*params\.(\w+)/g;
    let match;

    // Reset regex lastIndex to ensure it starts from beginning
    assignmentRegex.lastIndex = 0;

    while ((match = assignmentRegex.exec(scriptSource)) !== null) {
        const field = match[1];
        const paramName = match[2];

        if (params[paramName] !== undefined) {
            update.$set[field] = params[paramName];
        }
    }

    // Pattern 2: ctx._source.field = literal value (true, false, null, etc.)
    const literalRegex = /ctx\._source\.(\w+)\s*=\s*(true|false|null|\d+|"[^"]*"|'[^']*')/g;
    while ((match = literalRegex.exec(scriptSource)) !== null) {
        const field = match[1];
        const value = match[2];

        // Convert string literals to actual values
        if (value === 'true') update.$set[field] = true;
        else if (value === 'false') update.$set[field] = false;
        else if (value === 'null') update.$set[field] = null;
        else if (!isNaN(value)) update.$set[field] = Number(value);
        else update.$set[field] = value.replace(/['"]/g, ''); // Remove quotes
    }

    // Pattern 3: ctx._source.field = []; (empty array)
    const arrayRegex = /ctx\._source\.(\w+)\s*=\s*\[\]/g;
    while ((match = arrayRegex.exec(scriptSource)) !== null) {
        const field = match[1];
        update.$set[field] = [];
    }

    // If no matches found, try to set all params directly
    if (Object.keys(update.$set).length === 0 && Object.keys(params).length > 0) {
        update.$set = { ...params };
    }

    return update;
}

// Helper: Escape regex special characters
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Mock client for compatibility
const client = {
    ping: async () => ({ statusCode: 200 }),
    info: async () => ({ version: { number: 'MongoDB' } }),
    indices: {
        refresh: async () => ({ acknowledged: true })
    }
};

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
