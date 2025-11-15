console.log('✅ Migration Worker is ready');
const QUEUE_URL = process.env.SQS_MIGRATION_QUEUE_URL;
console.log(`✅ Queue URL: ${QUEUE_URL}`);
// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Shutting down Migration Worker (SIGTERM)');
});

process.on('SIGINT', () => {
    console.log('🛑 Shutting down Migration Worker (SIGINT)');
});