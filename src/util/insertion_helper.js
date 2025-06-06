const pLimit = require('p-limit');
function chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

const CONCURRENCY_LIMIT = 10;

const insertManyHelper = async (documents, model) => {
    const totalDocs = documents.length || 0;

    // Calculate batch size = totalDocs / 10, minimum 1
    const batchSize = Math.max(1, Math.floor(totalDocs / 10));

    console.log(`Total docs: ${totalDocs}, Batch size: ${batchSize}, Model: ${model}`);

    console.time(`⏱ Bulk Insert Time for ${model}`);

    const limit = pLimit(CONCURRENCY_LIMIT);

    const batches = chunkArray(documents, batchSize);

    const insertTasks = batches.map(batch =>
        limit(() => model.collection.insertMany(batch, { ordered: true }))
    );

    try {
        await Promise.all(insertTasks);
    } catch (err) {
        console.error('❌ Error during batch insertion:', err);
    }

    console.timeEnd(`⏱ Bulk Insert Time for ${model}`);
};

module.exports = {
    insertManyHelper,
};