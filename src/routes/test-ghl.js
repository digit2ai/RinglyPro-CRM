const express = require('express');
const router = express.Router();
const { runTests } = require('../../test-ghl-direct');
const axios = require('axios');

// Dual Calendar Service import
const dualCalendarService = require('../services/dualCalendarService');

// Simple test endpoint
router.get('/ping', (req, res) => {
    res.json({ success: true, message: 'pong', version: '2.2' });
});

// GET /api/test-ghl/debug-blocked/:client_id/:calendar_id - Debug blocked slots API
router.get('/debug-blocked/:client_id/:calendar_id', async (req, res) => {
    try {
        const { client_id, calendar_id } = req.params;
        const { sequelize } = require('../models');
        const { QueryTypes } = require('sequelize');

        const clientResult = await sequelize.query(
            'SELECT ghl_api_key, ghl_location_id FROM clients WHERE id = :clientId',
            { replacements: { clientId: parseInt(client_id) }, type: QueryTypes.SELECT }
        );

        if (!clientResult.length || !clientResult[0].ghl_api_key) {
            return res.json({ error: 'No credentials' });
        }

        const { ghl_api_key: ghlApiKey, ghl_location_id: locationId } = clientResult[0];
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);

        // Try multiple API endpoints
        const results = {};

        // 1. Try blocked-slots endpoint
        try {
            const blockedRes = await axios.get(
                'https://services.leadconnectorhq.com/calendars/blocked-slots',
                {
                    headers: { 'Authorization': `Bearer ${ghlApiKey}`, 'Version': '2021-07-28' },
                    params: { locationId, calendarId: calendar_id, startTime: startDate.getTime(), endTime: endDate.getTime() }
                }
            );
            results.blockedSlots = { status: 200, data: blockedRes.data };
        } catch (e) {
            results.blockedSlots = { status: e.response?.status, error: e.message, data: e.response?.data };
        }

        // 2. Try events endpoint
        try {
            const eventsRes = await axios.get(
                'https://services.leadconnectorhq.com/calendars/events',
                {
                    headers: { 'Authorization': `Bearer ${ghlApiKey}`, 'Version': '2021-07-28' },
                    params: { locationId, calendarId: calendar_id, startTime: startDate.getTime(), endTime: endDate.getTime() }
                }
            );
            results.events = { status: 200, data: eventsRes.data };
        } catch (e) {
            results.events = { status: e.response?.status, error: e.message, data: e.response?.data };
        }

        // 3. Try calendar resource endpoint (might have blocked time)
        try {
            const calRes = await axios.get(
                `https://services.leadconnectorhq.com/calendars/${calendar_id}`,
                {
                    headers: { 'Authorization': `Bearer ${ghlApiKey}`, 'Version': '2021-07-28' }
                }
            );
            results.calendarDetails = { status: 200, data: calRes.data };
        } catch (e) {
            results.calendarDetails = { status: e.response?.status, error: e.message };
        }

        // 4. Try to get calendar groups/resources
        try {
            const groupsRes = await axios.get(
                'https://services.leadconnectorhq.com/calendars/groups',
                {
                    headers: { 'Authorization': `Bearer ${ghlApiKey}`, 'Version': '2021-07-28' },
                    params: { locationId }
                }
            );
            results.groups = { status: 200, data: groupsRes.data };
        } catch (e) {
            results.groups = { status: e.response?.status, error: e.message };
        }

        res.json({
            clientId: parseInt(client_id),
            calendarId: calendar_id,
            locationId,
            dateRange: { start: startDate.toISOString(), end: endDate.toISOString() },
            results
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/test-ghl/dual-status/:client_id - Check dual calendar mode (simpler path)
router.get('/dual-status/:client_id', async (req, res) => {
    try {
        const { client_id } = req.params;
        console.log(`🔍 Checking dual status for client ${client_id}`);

        const status = await dualCalendarService.isDualModeEnabled(parseInt(client_id));

        res.json({
            success: true,
            clientId: parseInt(client_id),
            dualModeEnabled: status.enabled,
            ghlEnabled: status.ghlEnabled,
            calendarId: status.calendarId,
            locationId: status.locationId,
            message: status.enabled
                ? 'Dual calendar mode is ACTIVE'
                : 'Dual calendar mode is OFF - using RinglyPro only'
        });
    } catch (error) {
        console.error('❌ Dual status error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

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

// POST /api/test-ghl/sync-blocked-slots/:client_id - Sync blocked slots from specific calendar
router.post('/sync-blocked-slots/:client_id', async (req, res) => {
    try {
        const { client_id } = req.params;
        const { calendarId } = req.body;
        const { sequelize } = require('../models');
        const { QueryTypes } = require('sequelize');
        const GHL_API_VERSION = '2021-07-28';

        if (!calendarId) {
            return res.status(400).json({ success: false, error: 'calendarId is required' });
        }

        console.log(`🔄 Syncing blocked slots for client ${client_id}, calendar ${calendarId}`);

        // Get client credentials
        const clientResult = await sequelize.query(
            'SELECT ghl_api_key, ghl_location_id, business_name FROM clients WHERE id = :clientId',
            { replacements: { clientId: parseInt(client_id) }, type: QueryTypes.SELECT }
        );

        if (!clientResult || clientResult.length === 0 || !clientResult[0].ghl_api_key) {
            return res.status(404).json({ success: false, error: 'Client not found or no GHL credentials' });
        }

        const { ghl_api_key: ghlApiKey, ghl_location_id: locationId, business_name: businessName } = clientResult[0];

        // Delete existing appointments for this calendar
        const [deleted] = await sequelize.query(
            "DELETE FROM appointments WHERE client_id = :clientId AND ghl_calendar_id = :calendarId RETURNING id",
            { replacements: { clientId: parseInt(client_id), calendarId } }
        );
        console.log(`   Deleted ${deleted.length} old records`);

        // Get calendar name
        const calendarsRes = await axios.get(
            'https://services.leadconnectorhq.com/calendars/',
            {
                headers: { 'Authorization': `Bearer ${ghlApiKey}`, 'Version': GHL_API_VERSION },
                params: { locationId }
            }
        );
        const calendars = calendarsRes.data.calendars || [];
        const targetCalendar = calendars.find(c => c.id === calendarId);
        const calendarName = targetCalendar?.name || 'Unknown Calendar';

        // Date range
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 60);

        // Fetch blocked slots
        let blockedSlots = [];
        try {
            const blockedRes = await axios.get(
                'https://services.leadconnectorhq.com/calendars/blocked-slots',
                {
                    headers: { 'Authorization': `Bearer ${ghlApiKey}`, 'Version': GHL_API_VERSION },
                    params: { locationId, calendarId, startTime: startDate.getTime(), endTime: endDate.getTime() }
                }
            );
            blockedSlots = blockedRes.data.blockedSlots || blockedRes.data.events || [];
            console.log(`📋 Found ${blockedSlots.length} blocked slots`);
        } catch (err) {
            console.log(`⚠️ Blocked slots API: ${err.response?.status} - ${err.message}`);
        }

        // Fetch events
        let events = [];
        try {
            const eventsRes = await axios.get(
                'https://services.leadconnectorhq.com/calendars/events',
                {
                    headers: { 'Authorization': `Bearer ${ghlApiKey}`, 'Version': GHL_API_VERSION },
                    params: { locationId, calendarId, startTime: startDate.getTime(), endTime: endDate.getTime() }
                }
            );
            events = eventsRes.data.events || [];
            console.log(`📋 Found ${events.length} appointments`);
        } catch (err) {
            console.log(`⚠️ Events API: ${err.message}`);
        }

        // Insert blocked slots
        let insertedBlocked = 0;
        for (const slot of blockedSlots) {
            try {
                const slotStart = new Date(slot.startTime);
                const slotEnd = new Date(slot.endTime);
                const appointmentDate = slotStart.toISOString().substring(0, 10);
                const appointmentTime = slotStart.toISOString().substring(11, 19);
                const duration = Math.round((slotEnd - slotStart) / (1000 * 60));

                await sequelize.query(
                    `INSERT INTO appointments (
                        client_id, customer_name, customer_phone, customer_email,
                        appointment_date, appointment_time, duration, purpose,
                        status, source, confirmation_code, notes,
                        ghl_appointment_id, ghl_calendar_id,
                        created_at, updated_at
                    ) VALUES (:clientId, :name, '', '', :date, :time, :duration, :purpose,
                        'confirmed', 'ghl_blocked_slot', :code, :notes, :ghlId, :calId, NOW(), NOW())`,
                    {
                        replacements: {
                            clientId: parseInt(client_id),
                            name: `Busy - ${calendarName}`,
                            date: appointmentDate,
                            time: appointmentTime,
                            duration: duration || 60,
                            purpose: slot.title || 'Blocked Time',
                            code: `BS${Date.now().toString().slice(-6)}${insertedBlocked}`,
                            notes: `Blocked slot from GHL: ${calendarName}`,
                            ghlId: slot.id,
                            calId: calendarId
                        }
                    }
                );
                insertedBlocked++;
            } catch (e) {
                console.error(`Insert blocked error: ${e.message}`);
            }
        }

        // Insert events
        let insertedEvents = 0;
        for (const event of events) {
            try {
                let contactName = event.title || 'GHL Appointment';
                let contactPhone = '';
                let contactEmail = '';

                if (event.contactId) {
                    try {
                        const contactRes = await axios.get(
                            `https://services.leadconnectorhq.com/contacts/${event.contactId}`,
                            { headers: { 'Authorization': `Bearer ${ghlApiKey}`, 'Version': GHL_API_VERSION } }
                        );
                        const contact = contactRes.data.contact;
                        if (contact) {
                            contactName = contact.contactName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contactName;
                            contactPhone = contact.phone || '';
                            contactEmail = contact.email || '';
                        }
                    } catch (e) {}
                }

                const eventStart = new Date(event.startTime);
                const eventEnd = new Date(event.endTime);
                const appointmentDate = eventStart.toISOString().substring(0, 10);
                const appointmentTime = eventStart.toISOString().substring(11, 19);
                const duration = Math.round((eventEnd - eventStart) / (1000 * 60));

                await sequelize.query(
                    `INSERT INTO appointments (
                        client_id, customer_name, customer_phone, customer_email,
                        appointment_date, appointment_time, duration, purpose,
                        status, source, confirmation_code, notes,
                        ghl_appointment_id, ghl_contact_id, ghl_calendar_id,
                        created_at, updated_at
                    ) VALUES (:clientId, :name, :phone, :email, :date, :time, :duration, :purpose,
                        'confirmed', 'ghl_sync', :code, :notes, :ghlId, :contactId, :calId, NOW(), NOW())`,
                    {
                        replacements: {
                            clientId: parseInt(client_id),
                            name: contactName,
                            phone: contactPhone,
                            email: contactEmail,
                            date: appointmentDate,
                            time: appointmentTime,
                            duration: duration || 60,
                            purpose: event.title || calendarName,
                            code: `GS${Date.now().toString().slice(-6)}${insertedEvents}`,
                            notes: `Synced from GHL: ${calendarName}`,
                            ghlId: event.id,
                            contactId: event.contactId || null,
                            calId: calendarId
                        }
                    }
                );
                insertedEvents++;
            } catch (e) {
                console.error(`Insert event error: ${e.message}`);
            }
        }

        res.json({
            success: true,
            clientId: parseInt(client_id),
            businessName,
            calendarId,
            calendarName,
            deleted: deleted.length,
            blockedSlotsFound: blockedSlots.length,
            eventsFound: events.length,
            insertedBlocked,
            insertedEvents,
            total: insertedBlocked + insertedEvents
        });

    } catch (error) {
        console.error('❌ Sync error:', error);
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
