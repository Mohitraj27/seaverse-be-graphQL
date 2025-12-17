#!/usr/bin/env node

/**
 * Quick Sync Script - Simple wrapper for common sync operations
 * 
 * Usage:
 *   npm run sync              # Full sync with verification
 *   npm run sync:quick        # Sync without verification
 *   npm run sync:check        # Only check for differences (no sync)
 *   npm run sync:opensearch   # Only sync to OpenSearch
 */

require("dotenv").config();
const OpenSearchMongoDBSync = require('./sync-opensearch-mongodb');

const COMMANDS = {
    'full': {
        description: 'Full sync with verification',
        options: {
            syncToOpenSearch: true,
            syncToMongoDB: true,
            verify: true
        }
    },
    'quick': {
        description: 'Quick sync without verification',
        options: {
            syncToOpenSearch: true,
            syncToMongoDB: true,
            verify: false
        }
    },
    'check': {
        description: 'Check for differences only (no sync)',
        options: {
            syncToOpenSearch: false,
            syncToMongoDB: false,
            verify: false
        }
    },
    'samples': {
        description: 'Get sample user IDs that differ (no sync)',
        mode: 'samples'
    },
    'opensearch': {
        description: 'Sync to OpenSearch only',
        options: {
            syncToOpenSearch: true,
            syncToMongoDB: false,
            verify: true
        }
    },
    'verify': {
        description: 'Verify data consistency only',
        options: {
            syncToOpenSearch: false,
            syncToMongoDB: false,
            verify: true
        }
    }
};

async function main() {
    const command = process.argv[2] || 'full';

    if (command === 'help' || command === '--help' || command === '-h') {
        console.log('\n📖 Quick Sync Script - Usage Guide\n');
        console.log('Available commands:\n');
        Object.entries(COMMANDS).forEach(([cmd, config]) => {
            console.log(`  node quick-sync.js ${cmd.padEnd(12)} - ${config.description}`);
        });
        console.log('\n  node quick-sync.js help         - Show this help message\n');
        console.log('Examples:');
        console.log('  node src/tools/quick-sync.js full');
        console.log('  node src/tools/quick-sync.js check');
        console.log('  node src/tools/quick-sync.js samples');
        console.log('  node src/tools/quick-sync.js opensearch\n');
        process.exit(0);
    }

    const config = COMMANDS[command];

    if (!config) {
        console.error(`\n❌ Unknown command: ${command}`);
        console.log('Run "node quick-sync.js help" for available commands\n');
        process.exit(1);
    }

    console.log(`\n🚀 Running: ${config.description}\n`);

    const sync = new OpenSearchMongoDBSync();

    try {
        // Handle samples mode separately
        if (config.mode === 'samples') {
            const sampleSize = parseInt(process.argv[3]) || 10;
            await sync.getSampleDifferences(sampleSize);
        } else {
            await sync.sync(config.options);
        }
        console.log('\n✅ Operation completed successfully!\n');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Operation failed:', error.message, '\n');
        process.exit(1);
    }
}

main();
