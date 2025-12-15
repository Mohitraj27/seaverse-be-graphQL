const express = require('express');
const router = express.Router();
const { fork } = require('child_process');
const path = require('path');

// Store active migration processes
const activeMigrations = new Map();

// Serve the dashboard HTML
router.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/mongo-cache-dashboard.html'));
});

// Get status of all migrations
router.get('/status', (req, res) => {
    const statuses = [];

    activeMigrations.forEach((migration, id) => {
        statuses.push({
            id,
            scriptName: migration.scriptName,
            status: migration.status,
            startTime: migration.startTime,
            endTime: migration.endTime,
            logs: migration.logs.slice(-50), // Last 50 log entries
            stats: migration.stats
        });
    });

    res.json({ migrations: statuses });
});

// Get logs for a specific migration
router.get('/logs/:id', (req, res) => {
    const migration = activeMigrations.get(req.params.id);

    if (!migration) {
        return res.status(404).json({ error: 'Migration not found' });
    }

    res.json({
        id: req.params.id,
        scriptName: migration.scriptName,
        status: migration.status,
        logs: migration.logs,
        stats: migration.stats
    });
});

// Start OpenSearch to MongoDB full migration
router.post('/migrate/opensearch-to-mongodb', (req, res) => {
    const migrationId = `opensearch-full-${Date.now()}`;
    const scriptPath = path.join(__dirname, '../../scripts/migrate-elastic-to-mongodb.js');

    startMigration(migrationId, 'OpenSearch to MongoDB (Full)', scriptPath, res);
});

// Start course progress migration
router.post('/migrate/course-progress', (req, res) => {
    const migrationId = `course-progress-${Date.now()}`;
    const scriptPath = path.join(__dirname, '../../scripts/migrate-course-progress-from-elastic.js');

    startMigration(migrationId, 'Course Progress Migration', scriptPath, res);
});

// Stop a migration
router.post('/migrate/stop/:id', (req, res) => {
    const migration = activeMigrations.get(req.params.id);

    if (!migration) {
        return res.status(404).json({ error: 'Migration not found' });
    }

    if (migration.process) {
        migration.process.kill();
        migration.status = 'stopped';
        migration.endTime = new Date();
        migration.logs.push({ time: new Date(), message: '⛔ Migration stopped by user' });
    }

    res.json({ success: true, message: 'Migration stopped' });
});

// Helper function to start a migration
function startMigration(migrationId, scriptName, scriptPath, res) {
    // Check if script exists
    const fs = require('fs');
    if (!fs.existsSync(scriptPath)) {
        return res.status(404).json({ error: 'Migration script not found' });
    }

    const migration = {
        scriptName,
        status: 'running',
        startTime: new Date(),
        endTime: null,
        logs: [],
        stats: {},
        process: null
    };

    activeMigrations.set(migrationId, migration);

    // Fork the migration script
    const child = fork(scriptPath, [], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    migration.process = child;
    migration.logs.push({ time: new Date(), message: `🚀 Starting ${scriptName}...` });

    // Capture stdout
    child.stdout.on('data', (data) => {
        const message = data.toString();
        migration.logs.push({ time: new Date(), message });

        // Parse statistics from logs
        parseStats(message, migration.stats);
    });

    // Capture stderr
    child.stderr.on('data', (data) => {
        const message = data.toString();
        migration.logs.push({ time: new Date(), message: `❌ ${message}`, type: 'error' });
    });

    // Handle process exit
    child.on('exit', (code) => {
        migration.status = code === 0 ? 'completed' : 'failed';
        migration.endTime = new Date();
        migration.logs.push({
            time: new Date(),
            message: code === 0 ? '✅ Migration completed successfully' : `❌ Migration failed with code ${code}`
        });
    });

    // Handle errors
    child.on('error', (error) => {
        migration.status = 'failed';
        migration.endTime = new Date();
        migration.logs.push({ time: new Date(), message: `❌ Error: ${error.message}`, type: 'error' });
    });

    res.json({
        success: true,
        migrationId,
        message: `${scriptName} started successfully`
    });
}

// Helper function to parse statistics from log messages
function parseStats(message, stats) {
    // Parse total users
    const totalMatch = message.match(/Total users.*?(\d+)/i);
    if (totalMatch) {
        stats.total = parseInt(totalMatch[1]);
    }

    // Parse processed count
    const processedMatch = message.match(/Total processed.*?(\d+)/i);
    if (processedMatch) {
        stats.processed = parseInt(processedMatch[1]);
    }

    // Parse updated count
    const updatedMatch = message.match(/Total updated.*?(\d+)/i);
    if (updatedMatch) {
        stats.updated = parseInt(updatedMatch[1]);
    }

    // Parse errors
    const errorsMatch = message.match(/Total errors.*?(\d+)/i);
    if (errorsMatch) {
        stats.errors = parseInt(errorsMatch[1]);
    }

    // Parse batch progress
    const batchMatch = message.match(/Processing batch.*?(\d+)\s+to\s+(\d+)\s+of\s+(\d+)/i);
    if (batchMatch) {
        stats.currentBatch = parseInt(batchMatch[2]);
        stats.total = parseInt(batchMatch[3]);
    }
}

module.exports = router;
