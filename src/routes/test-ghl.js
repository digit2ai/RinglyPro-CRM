const express = require('express');
const router = express.Router();
const { runTests } = require('../../test-ghl-direct');
const axios = require('axios');

// Dual Calendar Service import
const dualCalendarService = require('../services/dualCalendarService');

// Simple test endpoint
router.get('/ping', (req, res) => {
    res.json({ success: true, message: 'pong', version: '2.14' });
});

// Debug endpoint to check ghl_calendar_id values in database
router.get('/check-calendar-ids/:client_id', async (req, res) => {
    try {
        const { client_id } = req.params;
        const { sequelize } = require('../models');
        const { QueryTypes } = require('sequelize');

        const result = await sequelize.query(
            `SELECT ghl_calendar_id, COUNT(*) as count
             FROM appointments
             WHERE client_id = :clientId
             GROUP BY ghl_calendar_id`,
            { replacements: { clientId: parseInt(client_id) }, type: QueryTypes.SELECT }
        );

        const sample = await sequelize.query(
            `SELECT id, customer_name, ghl_calendar_id, appointment_date
             FROM appointments
             WHERE client_id = :clientId
             ORDER BY id DESC LIMIT 5`,
            { replacements: { clientId: parseInt(client_id) }, type: QueryTypes.SELECT }
        );

        res.json({
            success: true,
            clientId: parseInt(client_id),
            byCalendarId: result,
            sampleAppointments: sample
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/test-ghl/delete-messages-by-phone/:client_id - Delete messages by phone number
router.delete('/delete-messages-by-phone/:client_id', async (req, res) => {
    try {
        const { client_id } = req.params;
        const { phone } = req.body;
        const { sequelize } = require('../models');
        const { QueryTypes } = require('sequelize');

        if (!phone) {
            return res.status(400).json({ success: false, error: 'phone is required in request body' });
        }

        // First count how many will be deleted
        const countResult = await sequelize.query(
            `SELECT COUNT(*) as count FROM messages WHERE client_id = :clientId AND from_number = :phone`,
            { replacements: { clientId: parseInt(client_id), phone }, type: QueryTypes.SELECT }
        );

        const count = parseInt(countResult[0].count);

        if (count === 0) {
            return res.json({ success: true, deleted: 0, message: 'No messages found with that phone number' });
        }

        // Delete the messages
        await sequelize.query(
            `DELETE FROM messages WHERE client_id = :clientId AND from_number = :phone`,
            { replacements: { clientId: parseInt(client_id), phone } }
        );

        res.json({
            success: true,
            deleted: count,
            clientId: parseInt(client_id),
            phone
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/test-ghl/debug-day/:client_id/:calendar_id - Debug slot comparison for a single day
router.get('/debug-day/:client_id/:calendar_id', async (req, res) => {
    try {
        const { client_id, calendar_id } = req.params;
        const { date } = req.query;
        const { sequelize } = require('../models');
        const { QueryTypes } = require('sequelize');
        const GHL_API_VERSION = '2021-07-28';

        const clientResult = await sequelize.query(
            'SELECT ghl_api_key FROM clients WHERE id = :clientId',
            { replacements: { clientId: parseInt(client_id) }, type: QueryTypes.SELECT }
        );
        if (!clientResult.length) return res.json({ error: 'No client' });
        const ghlApiKey = clientResult[0].ghl_api_key;

        // Get calendar details
        const calRes = await axios.get(
            `https://services.leadconnectorhq.com/calendars/${calendar_id}`,
            { headers: { 'Authorization': `Bearer ${ghlApiKey}`, 'Version': GHL_API_VERSION } }
        );
        const calendar = calRes.data.calendar;
        const slotDuration = calendar?.slotDuration || 60;

        // Check date
        const checkDate = date || new Date().toISOString().substring(0, 10);
        const dateObj = new Date(checkDate + 'T12:00:00');
        const dayOfWeek = dateObj.getDay();

        // Find day config
        const dayConfig = calendar?.openHours?.find(oh =>
            (oh.daysOfTheWeek?.includes(dayOfWeek)) || (oh.days?.includes(dayOfWeek))
        );

        if (!dayConfig) {
            return res.json({ date: checkDate, dayOfWeek, error: 'Day is closed', openHours: calendar?.openHours });
        }

        const hours = dayConfig.hours[0];
        const openHour = hours.openHour;
        const closeHour = hours.closeHour;

        // Generate all slots
        const allSlots = [];
        for (let h = openHour; h < closeHour; h++) {
            for (let m = 0; m < 60; m += slotDuration) {
                if (h === closeHour - 1 && m + slotDuration > 60) break;
                allSlots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`);
            }
        }

        // Get free slots from GHL
        const [year, month, day] = checkDate.split('-').map(Number);
        const startTime = new Date(Date.UTC(year, month - 1, day, 5, 0, 0));
        const endTime = new Date(Date.UTC(year, month - 1, day + 1, 4, 59, 59));

        const slotsRes = await axios.get(
            `https://services.leadconnectorhq.com/calendars/${calendar_id}/free-slots`,
            {
                headers: { 'Authorization': `Bearer ${ghlApiKey}`, 'Version': GHL_API_VERSION },
                params: { startDate: startTime.getTime(), endDate: endTime.getTime() }
            }
        );

        // Extract free slots
        const freeSlots = [];
        for (const key of Object.keys(slotsRes.data)) {
            if (key !== 'traceId' && slotsRes.data[key]?.slots) {
                for (const slot of slotsRes.data[key].slots) {
                    freeSlots.push(slot.substring(11, 19));
                }
            }
        }

        // Calculate blocked
        const blockedSlots = allSlots.filter(s => !freeSlots.includes(s));

        res.json({
            date: checkDate,
            dayOfWeek,
            dayConfig: { days: dayConfig.days, daysOfTheWeek: dayConfig.daysOfTheWeek, hours: dayConfig.hours },
            openHour,
            closeHour,
            slotDuration,
            allSlots,
            freeSlots,
            blockedSlots,
            freeSlotsRaw: slotsRes.data
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/test-ghl/test-free-slots/:client_id/:calendar_id - Test free slots API directly
router.get('/test-free-slots/:client_id/:calendar_id', async (req, res) => {
    try {
        const { client_id, calendar_id } = req.params;
        const { date } = req.query;
        const { sequelize } = require('../models');
        const { QueryTypes } = require('sequelize');
        const GHL_API_VERSION = '2021-07-28';

        const clientResult = await sequelize.query(
            'SELECT ghl_api_key, ghl_location_id FROM clients WHERE id = :clientId',
            { replacements: { clientId: parseInt(client_id) }, type: QueryTypes.SELECT }
        );

        if (!clientResult.length || !clientResult[0].ghl_api_key) {
            return res.json({ error: 'No credentials' });
        }

        const { ghl_api_key: ghlApiKey } = clientResult[0];
        const checkDate = date || new Date().toISOString().substring(0, 10);
        const [year, month, day] = checkDate.split('-').map(Number);

        // Use EST timezone (UTC-5)
        const startTime = new Date(Date.UTC(year, month - 1, day, 5, 0, 0));
        const endTime = new Date(Date.UTC(year, month - 1, day + 1, 4, 59, 59));

        console.log(`🔍 Testing free slots for ${checkDate}: ${startTime.toISOString()} to ${endTime.toISOString()}`);

        const slotsRes = await axios.get(
            `https://services.leadconnectorhq.com/calendars/${calendar_id}/free-slots`,
            {
                headers: { 'Authorization': `Bearer ${ghlApiKey}`, 'Version': GHL_API_VERSION },
                params: { startDate: startTime.getTime(), endDate: endTime.getTime() }
            }
        );

        res.json({
            success: true,
            date: checkDate,
            startTimestamp: startTime.getTime(),
            endTimestamp: endTime.getTime(),
            rawResponse: slotsRes.data
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/test-ghl/sync-from-availability/:client_id - Sync blocked slots by checking availability
router.post('/sync-from-availability/:client_id', async (req, res) => {
    try {
        const { client_id } = req.params;
        const { calendarId, days = 7 } = req.body;
        const { sequelize } = require('../models');
        const { QueryTypes } = require('sequelize');
        const GHL_API_VERSION = '2021-07-28';

        if (!calendarId) {
            return res.status(400).json({ success: false, error: 'calendarId is required' });
        }

        console.log(`🔄 Syncing from availability for client ${client_id}, calendar ${calendarId}, days=${days}`);

        // Get client credentials
        const clientResult = await sequelize.query(
            'SELECT ghl_api_key, ghl_location_id, business_name FROM clients WHERE id = :clientId',
            { replacements: { clientId: parseInt(client_id) }, type: QueryTypes.SELECT }
        );

        if (!clientResult.length || !clientResult[0].ghl_api_key) {
            return res.status(404).json({ success: false, error: 'No GHL credentials' });
        }

        const { ghl_api_key: ghlApiKey, ghl_location_id: locationId, business_name: businessName } = clientResult[0];

        // Get calendar details for business hours
        const calRes = await axios.get(
            `https://services.leadconnectorhq.com/calendars/${calendarId}`,
            { headers: { 'Authorization': `Bearer ${ghlApiKey}`, 'Version': GHL_API_VERSION } }
        );
        const calendar = calRes.data.calendar;
        const calendarName = calendar?.name || 'Unknown';
        const slotDuration = calendar?.slotDuration || 60;

        // Delete existing appointments for this calendar
        const [deleted] = await sequelize.query(
            "DELETE FROM appointments WHERE client_id = :clientId AND ghl_calendar_id = :calendarId RETURNING id",
            { replacements: { clientId: parseInt(client_id), calendarId } }
        );
        console.log(`   Deleted ${deleted.length} old records`);

        // Process each day
        let totalInserted = 0;
        const insertedSlots = [];
        const debugDays = []; // Track what happens each day

        for (let d = 0; d < days; d++) {
            // Use same date handling as debug-day endpoint
            const today = new Date();
            today.setDate(today.getDate() + d);
            const dateStr = today.toISOString().substring(0, 10);

            // Use T12:00:00 to avoid timezone day shifts (same as debug-day)
            const dateObj = new Date(dateStr + 'T12:00:00');
            const dayOfWeek = dateObj.getDay(); // 0=Sun, 1=Mon, ...
            const dayDebug = { dateStr, dayOfWeek, dOffset: d };

            // Get business hours for this day (GHL uses 'daysOfTheWeek' in some responses, 'days' in others)
            const dayConfig = calendar?.openHours?.find(oh =>
                (oh.daysOfTheWeek?.includes(dayOfWeek)) || (oh.days?.includes(dayOfWeek))
            );
            if (!dayConfig || !dayConfig.hours?.length) {
                dayDebug.status = 'closed';
                dayDebug.matchedConfig = null;
                debugDays.push(dayDebug);
                console.log(`   ${dateStr} (day ${dayOfWeek}): Closed`);
                continue;
            }
            dayDebug.status = 'open';
            dayDebug.matchedConfig = { days: dayConfig.days, daysOfTheWeek: dayConfig.daysOfTheWeek };

            const hours = dayConfig.hours[0];
            const openHour = hours.openHour;
            const closeHour = hours.closeHour;
            dayDebug.hours = { openHour, closeHour };

            // Generate all possible slots for this day
            const allSlots = [];
            for (let h = openHour; h < closeHour; h++) {
                for (let m = 0; m < 60; m += slotDuration) {
                    if (h === closeHour - 1 && m + slotDuration > 60) break;
                    allSlots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`);
                }
            }
            dayDebug.allSlotsCount = allSlots.length;

            // Get free slots from GHL - use same calculation as debug-day
            let freeSlots = [];
            try {
                const [year, month, day] = dateStr.split('-').map(Number);
                const startTime = new Date(Date.UTC(year, month - 1, day, 5, 0, 0));
                const endTime = new Date(Date.UTC(year, month - 1, day + 1, 4, 59, 59));

                const slotsRes = await axios.get(
                    `https://services.leadconnectorhq.com/calendars/${calendarId}/free-slots`,
                    {
                        headers: { 'Authorization': `Bearer ${ghlApiKey}`, 'Version': GHL_API_VERSION },
                        params: { startDate: startTime.getTime(), endDate: endTime.getTime() }
                    }
                );

                // Extract slots from response
                for (const key of Object.keys(slotsRes.data)) {
                    if (key !== 'traceId' && slotsRes.data[key]?.slots) {
                        for (const slot of slotsRes.data[key].slots) {
                            // slot format: "2026-01-07T10:00:00-05:00"
                            const time = slot.substring(11, 19);
                            freeSlots.push(time);
                        }
                    }
                }
            } catch (e) {
                dayDebug.error = e.message;
                dayDebug.freeSlotsCount = 0;
                dayDebug.blockedSlotsCount = 0;
                debugDays.push(dayDebug);
                console.log(`   ${dateStr}: Error getting free slots: ${e.message}`);
                continue;
            }

            // Blocked slots = all slots - free slots
            const blockedSlots = allSlots.filter(s => !freeSlots.includes(s));
            dayDebug.freeSlotsCount = freeSlots.length;
            dayDebug.blockedSlotsCount = blockedSlots.length;
            console.log(`   ${dateStr}: allSlots=${JSON.stringify(allSlots)}`);
            console.log(`   ${dateStr}: freeSlots=${JSON.stringify(freeSlots)}`);
            console.log(`   ${dateStr}: ${blockedSlots.length} blocked / ${allSlots.length} total (${freeSlots.length} free)`);

            // Insert blocked slots as "Busy" appointments
            let dayInserted = 0;
            const insertErrors = [];
            for (const slot of blockedSlots) {
                try {
                    const code = `BS${Date.now().toString().slice(-6)}${totalInserted}`;
                    console.log(`   Inserting: client=${client_id}, date=${dateStr}, time=${slot}`);
                    await sequelize.query(
                        `INSERT INTO appointments (
                            client_id, customer_name, customer_phone, customer_email,
                            appointment_date, appointment_time, duration, purpose,
                            status, source, confirmation_code, notes,
                            ghl_calendar_id, created_at, updated_at
                        ) VALUES ($1, $2, '', '', $3, $4, $5, 'Blocked Time',
                            'confirmed', 'manual', $6, $7, $8, NOW(), NOW())`,
                        {
                            bind: [
                                parseInt(client_id),
                                `Busy - ${calendarName}`,
                                dateStr,
                                slot,
                                slotDuration,
                                code,
                                `Blocked slot derived from GHL availability`,
                                calendarId
                            ]
                        }
                    );
                    totalInserted++;
                    dayInserted++;
                    insertedSlots.push({ date: dateStr, time: slot });
                } catch (e) {
                    console.error(`   Insert error: ${e.message}`);
                    insertErrors.push({ slot, error: e.message });
                }
            }
            dayDebug.inserted = dayInserted;
            if (insertErrors.length > 0) {
                dayDebug.insertErrors = insertErrors;
            }
            debugDays.push(dayDebug);
        }

        console.log(`✅ Sync complete: ${totalInserted} blocked slots inserted`);

        // Get calendar open hours for debug
        const openHoursDebug = calendar?.openHours?.map(oh => ({
            daysOfTheWeek: oh.daysOfTheWeek,
            days: oh.days,
            hours: oh.hours
        }));

        res.json({
            success: true,
            clientId: parseInt(client_id),
            businessName,
            calendarId,
            calendarName,
            slotDuration,
            deleted: deleted.length,
            inserted: totalInserted,
            days,
            slots: insertedSlots.slice(0, 50), // Show first 50
            debug: {
                openHours: openHoursDebug,
                todayDayOfWeek: new Date().getDay(),
                serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                serverDate: new Date().toISOString(),
                daysProcessed: debugDays
            }
        });

    } catch (error) {
        console.error('❌ Sync error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
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
                        'confirmed', 'ghl_sync', :code, :notes, :ghlId, :calId, NOW(), NOW())`,
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
