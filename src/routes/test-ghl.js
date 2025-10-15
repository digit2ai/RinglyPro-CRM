const express = require('express');
const router = express.Router();
const { runTests } = require('../../test-ghl-direct');

// GET /api/test-ghl/:client_id - Run GHL API tests for a client
// GET /api/test-ghl/auto - Automatically find a client with GHL credentials
router.get('/:client_id', async (req, res) => {
    try {
        let { client_id } = req.params;
        const { sequelize } = require('../models');

        let client;
        let results;

        // If client_id is "auto", find the first client with GHL credentials
        if (client_id === 'auto') {
            console.log('🔍 Auto-detecting client with GHL credentials...');
            results = await sequelize.query(
                'SELECT id, business_name, ghl_api_key, ghl_location_id FROM clients WHERE ghl_api_key IS NOT NULL AND ghl_location_id IS NOT NULL LIMIT 1',
                {
                    type: sequelize.QueryTypes.SELECT
                }
            );

            if (!results || results.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'No clients found with GHL credentials configured'
                });
            }

            client = results[0];
            client_id = client.id;
            console.log(`✅ Found client ${client_id}: ${client.business_name || 'Unknown'}`);
        } else {
            console.log(`🧪 Running GHL API tests for client ${client_id}...`);

            // Get credentials from database
            results = await sequelize.query(
                'SELECT id, business_name, ghl_api_key, ghl_location_id FROM clients WHERE id = :client_id',
                {
                    replacements: { client_id },
                    type: sequelize.QueryTypes.SELECT
                }
            );

            if (!results || results.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: `Client ${client_id} not found`
                });
            }

            client = results[0];

            if (!client.ghl_api_key || !client.ghl_location_id) {
                return res.status(404).json({
                    success: false,
                    error: `No GHL credentials found for client ${client_id}`
                });
            }
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
