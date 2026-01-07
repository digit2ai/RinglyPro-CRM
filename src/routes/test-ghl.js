const express = require('express');
const router = express.Router();
const { runTests } = require('../../test-ghl-direct');
const axios = require('axios');

// Dual Calendar Service import
const dualCalendarService = require('../services/dualCalendarService');

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

// GET /api/test-ghl/events/:client_id - List GHL calendar events/appointments for a client
router.get('/events/:client_id', async (req, res) => {
    try {
        const { client_id } = req.params;
        const days = parseInt(req.query.days) || 14;
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

        // First get calendars
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
        if (calendars.length === 0) {
            return res.json({ success: true, message: 'No calendars found', events: [] });
        }

        // Calculate date range
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + days);

        const startEpoch = startDate.getTime();
        const endEpoch = endDate.getTime();

        // Fetch events from each calendar
        const allEvents = [];
        for (const calendar of calendars) {
            try {
                const eventsRes = await axios.get(
                    'https://services.leadconnectorhq.com/calendars/events',
                    {
                        headers: {
                            'Authorization': `Bearer ${client.ghl_api_key}`,
                            'Version': '2021-07-28'
                        },
                        params: {
                            locationId: client.ghl_location_id,
                            calendarId: calendar.id,
                            startTime: startEpoch,
                            endTime: endEpoch
                        }
                    }
                );

                const events = eventsRes.data.events || [];

                // Fetch contact details for each event
                for (const event of events) {
                    let contactName = 'Unknown';
                    let contactPhone = '';
                    let contactEmail = '';

                    if (event.contactId) {
                        try {
                            const contactRes = await axios.get(
                                `https://services.leadconnectorhq.com/contacts/${event.contactId}`,
                                {
                                    headers: {
                                        'Authorization': `Bearer ${client.ghl_api_key}`,
                                        'Version': '2021-07-28'
                                    }
                                }
                            );
                            const contact = contactRes.data.contact;
                            if (contact) {
                                contactName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown';
                                contactPhone = contact.phone || '';
                                contactEmail = contact.email || '';
                            }
                        } catch (e) {
                            // Contact fetch failed, use defaults
                        }
                    }

                    allEvents.push({
                        id: event.id,
                        calendarId: calendar.id,
                        calendarName: calendar.name,
                        title: event.title || event.name || 'Appointment',
                        startTime: event.startTime,
                        endTime: event.endTime,
                        startTimeFormatted: new Date(event.startTime).toLocaleString(),
                        endTimeFormatted: new Date(event.endTime).toLocaleString(),
                        status: event.appointmentStatus || event.status,
                        contactId: event.contactId,
                        contactName,
                        contactPhone,
                        contactEmail
                    });
                }
            } catch (calError) {
                console.error(`Error fetching events for calendar ${calendar.name}:`, calError.message);
            }
        }

        // Sort by start time
        allEvents.sort((a, b) => a.startTime - b.startTime);

        res.json({
            success: true,
            clientId: client.id,
            businessName: client.business_name,
            locationId: client.ghl_location_id,
            dateRange: {
                start: startDate.toISOString().split('T')[0],
                end: endDate.toISOString().split('T')[0]
            },
            eventCount: allEvents.length,
            events: allEvents
        });

    } catch (error) {
        console.error('❌ Events fetch error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/test-ghl/dual-calendar-status/:client_id - Check dual calendar mode status
router.get('/dual-calendar-status/:client_id', async (req, res) => {
    try {
        const { client_id } = req.params;
        console.log(`🔍 Checking dual calendar status for client ${client_id}`);

        const status = await dualCalendarService.isDualModeEnabled(parseInt(client_id));

        res.json({
            success: true,
            clientId: parseInt(client_id),
            dualModeEnabled: status.enabled,
            ghlEnabled: status.ghlEnabled,
            calendarId: status.calendarId,
            locationId: status.locationId,
            message: status.enabled
                ? 'Dual calendar mode is ACTIVE - appointments will be checked/created in both RinglyPro and GHL'
                : 'Dual calendar mode is OFF - using RinglyPro calendar only'
        });
    } catch (error) {
        console.error('❌ Dual calendar status error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/test-ghl/availability/:client_id/:date - Test combined availability
router.get('/availability/:client_id/:date', async (req, res) => {
    try {
        const { client_id, date } = req.params;
        console.log(`🔍 Checking availability for client ${client_id} on ${date}`);

        const businessHours = { start: 9, end: 17, slotDuration: 60 };
        const availability = await dualCalendarService.getCombinedAvailability(
            parseInt(client_id),
            date,
            { businessHours }
        );

        res.json({
            success: true,
            clientId: parseInt(client_id),
            date,
            availableSlots: availability.availableSlots,
            ringlyProSlots: availability.ringlyProSlots,
            ghlSlots: availability.ghlSlots,
            dualModeActive: availability.dualModeActive,
            source: availability.source,
            businessHours
        });
    } catch (error) {
        console.error('❌ Availability check error:', error.message);
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
