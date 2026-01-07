const express = require('express');
const router = express.Router();
const { runTests } = require('../../test-ghl-direct');
const axios = require('axios');

// GET /api/test-ghl/calendars/:client_id - List GHL calendars for a client
router.get('/calendars/:client_id', async (req, res) => {
    try {
        const { client_id } = req.params;
        const { sequelize } = require('../models');

        // Get credentials
        const results = await sequelize.query(
            'SELECT id, business_name, ghl_api_key, ghl_location_id FROM clients WHERE id = :client_id',
            { replacements: { client_id }, type: sequelize.QueryTypes.SELECT }
        );

        if (!results || results.length === 0 || !results[0].ghl_api_key) {
            return res.status(404).json({ success: false, error: 'No GHL credentials found' });
        }

        const client = results[0];

        // Fetch calendars from GHL
        const calendarsRes = await axios.get(
            'https://services.leadconnectorhq.com/calendars/',
            {
                headers: {
                    'Authorization': `Bearer ${client.ghl_api_key}`,
                    'Version': '2021-07-28'
                },
                params: { locationId: client.ghl_location_id }
            }
        );

        const calendars = calendarsRes.data.calendars || [];

        res.json({
            success: true,
            clientId: client.id,
            businessName: client.business_name,
            locationId: client.ghl_location_id,
            calendarCount: calendars.length,
            calendars: calendars.map(c => ({
                id: c.id,
                name: c.name,
                description: c.description,
                calendarType: c.calendarType,
                isActive: c.isActive
            }))
        });

    } catch (error) {
        console.error('❌ Calendar fetch error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

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
