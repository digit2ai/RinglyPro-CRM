const express = require('express');
const router = express.Router();
const { runTests } = require('../../test-ghl-direct');

// GET /api/test-ghl/:client_id - Run GHL API tests for a client
router.get('/:client_id', async (req, res) => {
    try {
        const { client_id } = req.params;
        const { sequelize } = require('../models');

        console.log(`🧪 Running GHL API tests for client ${client_id}...`);

        // Get credentials from database
        const [results] = await sequelize.query(
            'SELECT ghl_api_key, ghl_location_id FROM clients WHERE id = :client_id',
            {
                replacements: { client_id },
                type: sequelize.QueryTypes.SELECT
            }
        );

        const client = results[0];

        if (!client || !client.ghl_api_key || !client.ghl_location_id) {
            return res.status(404).json({
                success: false,
                error: 'No GHL credentials found for this client'
            });
        }

        console.log('✅ Credentials loaded, running tests...');

        // Capture console.log output
        const logs = [];
        const originalLog = console.log;
        console.log = (...args) => {
            logs.push(args.map(arg =>
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' '));
            originalLog.apply(console, args);
        };

        // Run tests
        const testResults = await runTests(client.ghl_api_key, client.ghl_location_id);

        // Restore console.log
        console.log = originalLog;

        // Send results
        res.json({
            success: true,
            results: testResults,
            logs: logs,
            summary: {
                total: testResults.passed.length + testResults.failed.length,
                passed: testResults.passed.length,
                failed: testResults.failed.length,
                passRate: Math.round((testResults.passed.length / (testResults.passed.length + testResults.failed.length)) * 100)
            }
        });

    } catch (error) {
        console.error('❌ Test error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
