const express = require('express');
const path = require('path');
const { spawn } = require('child_process');

const router = express.Router();

// Store active operations
const activeOperations = new Map();

/**
 * Sync Dashboard API - Polling-based (more reliable than streaming)
 */

// Serve the dashboard HTML (with inline styles)
router.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/sync-dashboard.html'));
});

// Serve the JavaScript file
router.get('/dashboard-script.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'dashboard-script.js'));
});

// Serve the CSS file (if needed)
router.get('/sync-dashboard.css', (req, res) => {
    res.setHeader('Content-Type', 'text/css');
    res.sendFile(path.join(__dirname, 'sync-dashboard.css'));
});

// Start a sync operation
router.post('/start', (req, res) => {
    const { operation, sampleSize } = req.body;
    const operationId = Date.now().toString();

    // Build command arguments
    const args = [path.join(__dirname, 'quick-sync.js'), operation];
    if (operation === 'samples' && sampleSize) {
        args.push(sampleSize.toString());
    }

    console.log('Starting operation:', operationId, args);

    // Spawn the sync process
    const syncProcess = spawn('node', args, {
        cwd: path.join(__dirname, '..'),
        env: process.env,
        shell: true
    });

    const operationData = {
        id: operationId,
        operation,
        status: 'running',
        logs: [],
        stats: {
            mongoTotal: null,
            openSearchTotal: null,
            missingInOpenSearch: null,
            missingInMongoDB: null
        },
        startTime: new Date(),
        endTime: null,
        exitCode: null
    };

    activeOperations.set(operationId, operationData);

    // Process stdout
    syncProcess.stdout.on('data', (data) => {
        const output = data.toString();
        const lines = output.split('\n');

        lines.forEach(line => {
            if (!line.trim()) return;

            operationData.logs.push({ type: 'log', message: line, timestamp: new Date() });

            // Extract statistics
            const mongoMatch = line.match(/Total MongoDB Users:\s*(\d+)/);
            const osMatch = line.match(/Total OpenSearch Users:\s*(\d+)/);
            const missingOSMatch = line.match(/Users in MongoDB only:\s*(\d+)/);
            const orphanedMatch = line.match(/Users in OpenSearch only.*?:\s*(\d+)/);

            if (mongoMatch) operationData.stats.mongoTotal = parseInt(mongoMatch[1]);
            if (osMatch) operationData.stats.openSearchTotal = parseInt(osMatch[1]);
            if (missingOSMatch) operationData.stats.missingInOpenSearch = parseInt(missingOSMatch[1]);
            if (orphanedMatch) operationData.stats.missingInMongoDB = parseInt(orphanedMatch[1]);
        });
    });

    // Process stderr
    syncProcess.stderr.on('data', (data) => {
        const output = data.toString();
        const lines = output.split('\n');

        lines.forEach(line => {
            if (!line.trim()) return;
            if (!line.includes('DeprecationWarning') && !line.includes('NOTE:') && !line.includes('npm warn')) {
                operationData.logs.push({ type: 'error', message: line, timestamp: new Date() });
            }
        });
    });

    // Handle process completion
    syncProcess.on('close', (code) => {
        console.log(`Operation ${operationId} completed with code:`, code);
        operationData.status = code === 0 ? 'completed' : 'failed';
        operationData.exitCode = code;
        operationData.endTime = new Date();

        // Clean up after 5 minutes
        setTimeout(() => {
            activeOperations.delete(operationId);
        }, 5 * 60 * 1000);
    });

    // Handle errors
    syncProcess.on('error', (error) => {
        console.error(`Operation ${operationId} error:`, error);
        operationData.status = 'failed';
        operationData.logs.push({ type: 'error', message: `Process error: ${error.message}`, timestamp: new Date() });
        operationData.endTime = new Date();
    });

    res.json({ success: true, operationId });
});

// Poll for operation status
router.get('/status/:operationId', (req, res) => {
    const { operationId } = req.params;
    const operation = activeOperations.get(operationId);

    if (!operation) {
        return res.status(404).json({ error: 'Operation not found' });
    }

    res.json({
        id: operation.id,
        operation: operation.operation,
        status: operation.status,
        logs: operation.logs,
        stats: operation.stats,
        startTime: operation.startTime,
        endTime: operation.endTime,
        exitCode: operation.exitCode
    });
});

// Get list of active operations
router.get('/operations', (req, res) => {
    const operations = Array.from(activeOperations.values()).map(op => ({
        id: op.id,
        operation: op.operation,
        status: op.status,
        startTime: op.startTime,
        endTime: op.endTime
    }));

    res.json({ operations });
});

module.exports = router;
