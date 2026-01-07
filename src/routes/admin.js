// Admin Portal API Routes
// Only accessible by info@digit2ai.com
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const router = express.Router();
const { sequelize, Client, User, AdminCommunication, AdminNote } = require('../models');
const twilio = require('twilio');

// ============= ADMIN LOGIN (NO AUTH REQUIRED) =============

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        console.log(`🔐 Admin login attempt: ${email}`);

        // Allow CRM admin and Photo Studio admins
        const allowedAdmins = ['info@digit2ai.com', 'mstagg@digit2ai.com', 'pixlypro@digit2ai.com'];
        if (!allowedAdmins.includes(email)) {
            console.log(`🚨 Non-admin email attempted admin login: ${email}`);
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        // Find admin user
        const user = await User.findOne({ where: { email } });

        if (!user) {
            console.log(`❌ Admin user not found: ${email}`);
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            console.log(`❌ Invalid password for admin: ${email}`);
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Check if user is admin (note: underscored:true converts is_admin to isAdmin)
        console.log(`🔍 User admin status: isAdmin=${user.isAdmin}, is_admin=${user.is_admin}`);
        if (!user.isAdmin) {
            console.log(`🚨 Non-admin user attempted admin login: ${email}`);
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                isAdmin: true
            },
            process.env.JWT_SECRET || 'your-super-secret-jwt-key',
            { expiresIn: '24h' }
        );

        console.log(`✅ Admin login successful: ${email}`);

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                isAdmin: user.isAdmin
            }
        });

    } catch (error) {
        console.error('❌ Admin login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed',
            details: error.message
        });
    }
});

// Admin authentication middleware
const authenticateAdmin = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key');

        // Check if user is admin
        const user = await User.findByPk(decoded.userId);

        if (!user || !user.isAdmin) {
            console.log(`🚨 Non-admin user ${decoded.email} attempted to access admin portal`);
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        // Only allow info@digit2ai.com
        if (user.email !== 'info@digit2ai.com') {
            console.log(`🚨 Non-authorized admin ${user.email} attempted access`);
            return res.status(403).json({
                success: false,
                error: 'Unauthorized admin account'
            });
        }

        req.adminUser = user;
        req.adminId = user.id;

        console.log(`✅ Admin access granted: ${user.email}`);
        next();
    } catch (error) {
        console.error('Admin authentication error:', error.message);
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token'
        });
    }
};

// ============= QUICK ADMIN ENDPOINTS (NO JWT - API KEY ONLY) =============
// These endpoints use simple API key auth and must be defined BEFORE router.use(authenticateAdmin)

// Quick disable leads endpoint with API key auth (no JWT required)
// Used for quick admin operations like Client 15 Vagaro migration
router.post('/quick-disable-leads/:clientId', async (req, res) => {
    try {
        const { clientId } = req.params;
        const { apiKey } = req.body;

        // Simple API key check
        const expectedKey = process.env.ADMIN_API_KEY || 'ringlypro-quick-admin-2024';
        if (apiKey !== expectedKey) {
            return res.status(401).json({
                success: false,
                error: 'Invalid API key'
            });
        }

        console.log(`🔒 Quick Admin: Disabling leads for client ${clientId}`);

        // Get count before disabling
        const [countResult] = await sequelize.query(
            `SELECT COUNT(*) as total FROM business_directory
             WHERE client_id = :clientId AND (call_status IS NULL OR call_status != 'DISABLED')`,
            {
                replacements: { clientId: parseInt(clientId) },
                type: sequelize.QueryTypes.SELECT
            }
        );

        const leadsToDisable = parseInt(countResult.total);

        if (leadsToDisable === 0) {
            return res.json({
                success: true,
                message: 'No active leads to disable',
                disabled: 0,
                clientId: parseInt(clientId)
            });
        }

        // Disable all leads
        await sequelize.query(
            `UPDATE business_directory
             SET call_status = 'DISABLED',
                 notes = CONCAT(COALESCE(notes, ''), ' [DISABLED by quick-admin on ', TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI'), ']'),
                 updated_at = CURRENT_TIMESTAMP
             WHERE client_id = :clientId AND (call_status IS NULL OR call_status != 'DISABLED')`,
            {
                replacements: { clientId: parseInt(clientId) }
            }
        );

        console.log(`✅ Quick Admin: Disabled ${leadsToDisable} leads for client ${clientId}`);

        res.json({
            success: true,
            message: `Successfully disabled ${leadsToDisable} leads for client ${clientId}`,
            disabled: leadsToDisable,
            clientId: parseInt(clientId)
        });

    } catch (error) {
        console.error('❌ Error in quick-disable-leads:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============= SYNC GHL BLOCKED SLOTS (For specific calendar) =============
// POST /api/admin/sync-ghl-blocked-slots/:clientId
// Syncs blocked slots from a specific GHL calendar as "Busy" appointments
// Uses API key auth (no JWT required)
router.post('/sync-ghl-blocked-slots/:clientId', async (req, res) => {
    try {
        const { clientId } = req.params;
        const { apiKey, calendarId } = req.body;
        const axios = require('axios');
        const GHL_API_VERSION = '2021-07-28';

        // Simple API key check
        const expectedKey = process.env.ADMIN_API_KEY || 'ringlypro-quick-admin-2024';
        if (apiKey !== expectedKey) {
            return res.status(401).json({
                success: false,
                error: 'Invalid API key'
            });
        }

        if (!calendarId) {
            return res.status(400).json({
                success: false,
                error: 'calendarId is required'
            });
        }

        console.log(`🔄 Admin: Syncing GHL blocked slots for client ${clientId}, calendar ${calendarId}`);

        // Get client credentials
        const clientResult = await sequelize.query(
            'SELECT ghl_api_key, ghl_location_id, business_name FROM clients WHERE id = $1',
            { bind: [parseInt(clientId)], type: sequelize.QueryTypes.SELECT }
        );

        if (!clientResult || clientResult.length === 0 || !clientResult[0].ghl_api_key) {
            return res.status(404).json({
                success: false,
                error: 'Client not found or no GHL credentials'
            });
        }

        const { ghl_api_key: ghlApiKey, ghl_location_id: locationId, business_name: businessName } = clientResult[0];

        // Step 1: Delete all existing appointments for this client with this calendar ID
        console.log('🧹 Cleaning up existing appointments for this calendar...');
        const [deleted] = await sequelize.query(
            "DELETE FROM appointments WHERE client_id = $1 AND (ghl_calendar_id = $2 OR source = 'ghl_blocked_slot') RETURNING id",
            { bind: [parseInt(clientId), calendarId] }
        );
        console.log(`   Deleted ${deleted.length} old records`);

        // Step 2: Get calendar details
        const calendarsRes = await axios.get(
            'https://services.leadconnectorhq.com/calendars/',
            {
                headers: {
                    'Authorization': `Bearer ${ghlApiKey}`,
                    'Version': GHL_API_VERSION
                },
                params: { locationId }
            }
        );

        const calendars = calendarsRes.data.calendars || [];
        const targetCalendar = calendars.find(c => c.id === calendarId);
        const calendarName = targetCalendar?.name || 'Unknown Calendar';
        console.log(`📅 Syncing calendar: ${calendarName}`);

        // Step 3: Date range - today to end of month + next month
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 60); // 60 days ahead

        // Step 4: Fetch blocked slots from GHL
        // The GHL API uses GET /calendars/blocked-slots with query params
        let blockedSlots = [];
        try {
            const blockedRes = await axios.get(
                'https://services.leadconnectorhq.com/calendars/blocked-slots',
                {
                    headers: {
                        'Authorization': `Bearer ${ghlApiKey}`,
                        'Version': GHL_API_VERSION
                    },
                    params: {
                        locationId,
                        calendarId,
                        startTime: startDate.getTime(),
                        endTime: endDate.getTime()
                    }
                }
            );
            blockedSlots = blockedRes.data.blockedSlots || blockedRes.data.events || [];
            console.log(`📋 Found ${blockedSlots.length} blocked slots from GHL API`);
        } catch (blockedErr) {
            console.log(`⚠️ Blocked slots API error: ${blockedErr.message}`);
            // Try alternate endpoint or method
        }

        // Step 5: Also fetch calendar events (actual appointments)
        let events = [];
        try {
            const eventsRes = await axios.get(
                'https://services.leadconnectorhq.com/calendars/events',
                {
                    headers: {
                        'Authorization': `Bearer ${ghlApiKey}`,
                        'Version': GHL_API_VERSION
                    },
                    params: {
                        locationId,
                        calendarId,
                        startTime: startDate.getTime(),
                        endTime: endDate.getTime()
                    }
                }
            );
            events = eventsRes.data.events || [];
            console.log(`📋 Found ${events.length} actual appointments from GHL API`);
        } catch (eventsErr) {
            console.log(`⚠️ Events API error: ${eventsErr.message}`);
        }

        // Step 6: Insert blocked slots as "Busy" appointments
        let insertedBlocked = 0;
        for (const slot of blockedSlots) {
            try {
                const slotStart = new Date(slot.startTime);
                const slotEnd = new Date(slot.endTime);
                const appointmentDate = slotStart.toISOString().substring(0, 10);
                const appointmentTime = slotStart.toISOString().substring(11, 19);
                const duration = Math.round((slotEnd - slotStart) / (1000 * 60));

                const confirmationCode = `BS${Date.now().toString().slice(-6)}${insertedBlocked}`;
                await sequelize.query(
                    `INSERT INTO appointments (
                        client_id, customer_name, customer_phone, customer_email,
                        appointment_date, appointment_time, duration, purpose,
                        status, source, confirmation_code, notes,
                        ghl_appointment_id, ghl_calendar_id,
                        created_at, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())`,
                    {
                        bind: [
                            parseInt(clientId),
                            `Busy - ${calendarName}`,
                            '', // no phone
                            '', // no email
                            appointmentDate,
                            appointmentTime,
                            duration || 60,
                            slot.title || 'Blocked Time',
                            'confirmed',
                            'ghl_blocked_slot',
                            confirmationCode,
                            `Blocked slot from GHL calendar: ${calendarName}`,
                            slot.id,
                            calendarId
                        ]
                    }
                );
                insertedBlocked++;
            } catch (insertErr) {
                console.error(`Error inserting blocked slot: ${insertErr.message}`);
            }
        }

        // Step 7: Insert actual appointments
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
                            {
                                headers: {
                                    'Authorization': `Bearer ${ghlApiKey}`,
                                    'Version': GHL_API_VERSION
                                }
                            }
                        );
                        const contact = contactRes.data.contact;
                        if (contact) {
                            contactName = contact.contactName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contactName;
                            contactPhone = contact.phone || '';
                            contactEmail = contact.email || '';
                        }
                    } catch (e) {
                        // Contact fetch failed
                    }
                }

                const eventStart = new Date(event.startTime);
                const eventEnd = new Date(event.endTime);
                const appointmentDate = eventStart.toISOString().substring(0, 10);
                const appointmentTime = eventStart.toISOString().substring(11, 19);
                const duration = Math.round((eventEnd - eventStart) / (1000 * 60));

                const confirmationCode = `GS${Date.now().toString().slice(-6)}${insertedEvents}`;
                await sequelize.query(
                    `INSERT INTO appointments (
                        client_id, customer_name, customer_phone, customer_email,
                        appointment_date, appointment_time, duration, purpose,
                        status, source, confirmation_code, notes,
                        ghl_appointment_id, ghl_contact_id, ghl_calendar_id,
                        created_at, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())`,
                    {
                        bind: [
                            parseInt(clientId),
                            contactName,
                            contactPhone,
                            contactEmail,
                            appointmentDate,
                            appointmentTime,
                            duration || 60,
                            event.title || calendarName,
                            event.appointmentStatus === 'confirmed' ? 'confirmed' : 'pending',
                            'ghl_sync',
                            confirmationCode,
                            `Synced from GHL calendar: ${calendarName}`,
                            event.id,
                            event.contactId || null,
                            calendarId
                        ]
                    }
                );
                insertedEvents++;
            } catch (insertErr) {
                console.error(`Error inserting event: ${insertErr.message}`);
            }
        }

        console.log(`✅ Sync complete: ${insertedBlocked} blocked slots, ${insertedEvents} appointments`);

        res.json({
            success: true,
            clientId: parseInt(clientId),
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
        console.error('❌ Error syncing GHL blocked slots:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============= SYNC GHL APPOINTMENTS (Clean up Busy placeholders) =============
// POST /api/admin/sync-ghl-appointments/:clientId
// Cleans up old "Busy" placeholder records and syncs real appointments from GHL
// Uses API key auth (no JWT required)
router.post('/sync-ghl-appointments/:clientId', async (req, res) => {
    try {
        const { clientId } = req.params;
        const { apiKey } = req.body;
        const axios = require('axios');
        const GHL_API_VERSION = '2021-07-28';

        // Simple API key check
        const expectedKey = process.env.ADMIN_API_KEY || 'ringlypro-quick-admin-2024';
        if (apiKey !== expectedKey) {
            return res.status(401).json({
                success: false,
                error: 'Invalid API key'
            });
        }

        console.log(`🔄 Admin: Syncing GHL appointments for client ${clientId}`);

        // Get client credentials
        const [clients] = await sequelize.query(
            'SELECT ghl_api_key, ghl_location_id, business_name FROM clients WHERE id = $1',
            { bind: [parseInt(clientId)], type: sequelize.QueryTypes.SELECT }
        );

        if (!clients || !clients.ghl_api_key) {
            return res.status(404).json({
                success: false,
                error: 'Client not found or no GHL credentials'
            });
        }

        const { ghl_api_key: apiKey2, ghl_location_id: locationId, business_name: businessName } = clients;

        // Step 1: Clean up old "Busy" placeholder records
        console.log('🧹 Cleaning up old Busy/placeholder appointments...');
        const [deleted1] = await sequelize.query(
            "DELETE FROM appointments WHERE client_id = $1 AND customer_name LIKE 'Busy%' RETURNING id",
            { bind: [parseInt(clientId)] }
        );

        const [deleted2] = await sequelize.query(
            "DELETE FROM appointments WHERE client_id = $1 AND source = 'ghl_sync' AND notes LIKE '%Busy/Blocked%' RETURNING id",
            { bind: [parseInt(clientId)] }
        );

        const totalDeleted = deleted1.length + deleted2.length;
        console.log(`   Deleted ${totalDeleted} old placeholder records`);

        // Step 2: Get all calendars for this location
        const calendarsRes = await axios.get(
            'https://services.leadconnectorhq.com/calendars/',
            {
                headers: {
                    'Authorization': `Bearer ${apiKey2}`,
                    'Version': GHL_API_VERSION
                },
                params: { locationId }
            }
        );

        const calendars = calendarsRes.data.calendars || [];
        console.log(`📅 Found ${calendars.length} calendars`);

        // Step 3: Date range - today + 30 days
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);
        const startEpoch = startDate.getTime();
        const endEpoch = endDate.getTime();

        // Step 4: Fetch events from each calendar
        let totalInserted = 0;
        let totalUpdated = 0;
        const appointments = [];

        for (const calendar of calendars) {
            try {
                const eventsRes = await axios.get(
                    'https://services.leadconnectorhq.com/calendars/events',
                    {
                        headers: {
                            'Authorization': `Bearer ${apiKey2}`,
                            'Version': GHL_API_VERSION
                        },
                        params: {
                            locationId,
                            calendarId: calendar.id,
                            startTime: startEpoch,
                            endTime: endEpoch
                        }
                    }
                );

                const events = eventsRes.data.events || [];

                for (const event of events) {
                    // Get contact details
                    let contactName = event.title || 'GHL Appointment';
                    let contactPhone = '';
                    let contactEmail = '';

                    if (event.contactId) {
                        try {
                            const contactRes = await axios.get(
                                `https://services.leadconnectorhq.com/contacts/${event.contactId}`,
                                {
                                    headers: {
                                        'Authorization': `Bearer ${apiKey2}`,
                                        'Version': GHL_API_VERSION
                                    }
                                }
                            );
                            const contact = contactRes.data.contact;
                            if (contact) {
                                contactName = contact.contactName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contactName;
                                contactPhone = contact.phone || '';
                                contactEmail = contact.email || '';
                            }
                        } catch (e) {
                            // Contact fetch failed, use defaults
                        }
                    }

                    // Parse date and time from ISO string
                    const appointmentDate = event.startTime.substring(0, 10);
                    const appointmentTime = event.startTime.substring(11, 19);

                    // Calculate duration
                    let duration = 60;
                    if (event.endTime) {
                        const start = new Date(event.startTime);
                        const end = new Date(event.endTime);
                        duration = Math.round((end - start) / (1000 * 60));
                    }

                    // Check if appointment already exists
                    const [existing] = await sequelize.query(
                        'SELECT id FROM appointments WHERE client_id = $1 AND ghl_appointment_id = $2',
                        { bind: [parseInt(clientId), event.id], type: sequelize.QueryTypes.SELECT }
                    );

                    const statusMap = {
                        'confirmed': 'confirmed',
                        'showed': 'completed',
                        'noshow': 'no-show',
                        'no_show': 'no-show',
                        'cancelled': 'cancelled',
                        'canceled': 'cancelled',
                        'new': 'pending',
                        'pending': 'pending'
                    };
                    const status = statusMap[event.appointmentStatus?.toLowerCase()] || 'confirmed';

                    if (existing && existing.id) {
                        // Update existing
                        await sequelize.query(
                            `UPDATE appointments SET
                                customer_name = $1,
                                customer_phone = $2,
                                customer_email = $3,
                                appointment_date = $4,
                                appointment_time = $5,
                                duration = $6,
                                purpose = $7,
                                status = $8,
                                ghl_contact_id = $9,
                                ghl_calendar_id = $10,
                                updated_at = NOW()
                             WHERE id = $11`,
                            {
                                bind: [
                                    contactName, contactPhone, contactEmail,
                                    appointmentDate, appointmentTime, duration,
                                    event.title || calendar.name || 'GHL Appointment',
                                    status, event.contactId || null, calendar.id,
                                    existing.id
                                ]
                            }
                        );
                        totalUpdated++;
                    } else {
                        // Insert new
                        const confirmationCode = `GS${Date.now().toString().slice(-6)}`;
                        await sequelize.query(
                            `INSERT INTO appointments (
                                client_id, customer_name, customer_phone, customer_email,
                                appointment_date, appointment_time, duration, purpose,
                                status, source, confirmation_code, notes,
                                ghl_appointment_id, ghl_contact_id, ghl_calendar_id,
                                created_at, updated_at
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())`,
                            {
                                bind: [
                                    parseInt(clientId), contactName, contactPhone, contactEmail,
                                    appointmentDate, appointmentTime, duration,
                                    event.title || calendar.name || 'GHL Appointment',
                                    status, 'ghl_sync', confirmationCode,
                                    `Synced from GHL calendar: ${calendar.name}`,
                                    event.id, event.contactId || null, calendar.id
                                ]
                            }
                        );
                        totalInserted++;
                    }

                    appointments.push({
                        name: contactName,
                        date: appointmentDate,
                        time: appointmentTime,
                        title: event.title
                    });
                }
            } catch (calErr) {
                console.error(`Error processing calendar ${calendar.name}: ${calErr.message}`);
            }
        }

        console.log(`✅ Sync complete: ${totalInserted} inserted, ${totalUpdated} updated`);

        res.json({
            success: true,
            clientId: parseInt(clientId),
            businessName,
            deleted: totalDeleted,
            inserted: totalInserted,
            updated: totalUpdated,
            appointments: appointments.slice(0, 20) // Show first 20
        });

    } catch (error) {
        console.error('❌ Error syncing GHL appointments:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Apply admin authentication to all routes AFTER quick endpoints
router.use(authenticateAdmin);

// ============= ADMIN DASHBOARD - CLIENT LIST =============

router.get('/clients', async (req, res) => {
    try {
        const { search, sortBy = 'created_at', sortOrder = 'DESC', limit = 50, offset = 0 } = req.query;

        console.log(`📊 Admin loading clients list (search: ${search || 'none'})`);

        // Build query
        let query = `
            SELECT
                c.id,
                c.business_name,
                c.owner_name,
                c.owner_phone,
                c.owner_email,
                c.ringlypro_number,
                c.rachel_enabled,
                c.active,
                c.created_at as signup_date,
                c.monthly_free_minutes,
                c.per_minute_rate,

                -- Calculate last activity (most recent call, message, or appointment)
                GREATEST(
                    COALESCE(MAX(calls.created_at), c.created_at),
                    COALESCE(MAX(messages.created_at), c.created_at),
                    COALESCE(MAX(appointments.created_at), c.created_at),
                    c.created_at
                ) as last_activity_at,

                -- Calculate minutes used from calls table (duration is in seconds, convert to minutes)
                COALESCE(SUM(calls.duration) / 60.0, 0) as total_minutes_used,

                -- Count appointments
                COUNT(DISTINCT appointments.id) as total_appointments,

                -- Count messages
                COUNT(DISTINCT messages.id) as total_messages,

                -- Count calls
                COUNT(DISTINCT calls.id) as total_calls

            FROM clients c
            LEFT JOIN calls ON calls.client_id = c.id
            LEFT JOIN appointments ON appointments.client_id = c.id
            LEFT JOIN messages ON messages.client_id = c.id
        `;

        // Add search filter
        const replacements = {};
        if (search) {
            query += ` WHERE (
                c.business_name ILIKE :search
                OR c.owner_name ILIKE :search
                OR c.owner_phone ILIKE :search
                OR c.owner_email ILIKE :search
            )`;
            replacements.search = `%${search}%`;
        }

        query += ` GROUP BY c.id`;

        // Add sorting (default to signup_date which is aliased from c.created_at)
        const validSortColumns = ['business_name', 'signup_date', 'last_activity_at', 'total_minutes_used', 'dollar_amount'];
        const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'signup_date';
        const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        query += ` ORDER BY ${sortColumn} ${order}`;

        // Add pagination
        query += ` LIMIT :limit OFFSET :offset`;
        replacements.limit = parseInt(limit);
        replacements.offset = parseInt(offset);

        const clients = await sequelize.query(query, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

        // Get total count
        let countQuery = `SELECT COUNT(DISTINCT c.id) as total FROM clients c`;
        if (search) {
            countQuery += ` WHERE (
                c.business_name ILIKE :search
                OR c.owner_name ILIKE :search
                OR c.owner_phone ILIKE :search
                OR c.owner_email ILIKE :search
            )`;
        }

        const [{ total }] = await sequelize.query(countQuery, {
            replacements: search ? { search: `%${search}%` } : {},
            type: sequelize.QueryTypes.SELECT
        });

        console.log(`✅ Admin loaded ${clients.length} clients (total: ${total})`);

        res.json({
            success: true,
            clients,
            pagination: {
                total: parseInt(total),
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: parseInt(offset) + clients.length < parseInt(total)
            }
        });

    } catch (error) {
        console.error('❌ Admin clients list error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load clients',
            details: error.message
        });
    }
});

// ============= CLIENT PROFILE =============

router.get('/clients/:client_id', async (req, res) => {
    try {
        const { client_id } = req.params;

        console.log(`📋 Admin loading client profile: ${client_id}`);

        // Get client base info with referrer information
        const [client] = await sequelize.query(`
            SELECT
                c.*,
                ref.business_name as referrer_business_name
            FROM clients c
            LEFT JOIN clients ref ON c.referred_by = ref.id
            WHERE c.id = $1
        `, {
            bind: [parseInt(client_id)],
            type: sequelize.QueryTypes.SELECT
        });

        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }

        // Get aggregated stats for this client
        const callStats = await sequelize.query(`
            SELECT
                COALESCE(SUM(duration) / 60.0, 0) as total_minutes_used,
                COUNT(*) as total_calls,
                MAX(created_at) as last_call_at
            FROM calls
            WHERE client_id = $1
        `, {
            bind: [parseInt(client_id)],
            type: sequelize.QueryTypes.SELECT
        });

        const appointmentStats = await sequelize.query(`
            SELECT
                COUNT(*) as total_appointments,
                MAX(created_at) as last_appointment_at
            FROM appointments
            WHERE client_id = $1
        `, {
            bind: [parseInt(client_id)],
            type: sequelize.QueryTypes.SELECT
        });

        const messageStats = await sequelize.query(`
            SELECT
                COUNT(*) as total_messages,
                MAX(created_at) as last_message_at
            FROM messages
            WHERE client_id = $1
        `, {
            bind: [parseInt(client_id)],
            type: sequelize.QueryTypes.SELECT
        });

        // Merge all stats with safe access
        const callData = callStats && callStats[0] ? callStats[0] : { total_minutes_used: 0, total_calls: 0, last_call_at: null };
        const apptData = appointmentStats && appointmentStats[0] ? appointmentStats[0] : { total_appointments: 0, last_appointment_at: null };
        const msgData = messageStats && messageStats[0] ? messageStats[0] : { total_messages: 0, last_message_at: null };

        const stats = {
            total_minutes_used: parseFloat(callData.total_minutes_used) || 0,
            total_calls: parseInt(callData.total_calls) || 0,
            total_appointments: parseInt(apptData.total_appointments) || 0,
            total_messages: parseInt(msgData.total_messages) || 0,
            last_activity_at: [
                callData.last_call_at,
                apptData.last_appointment_at,
                msgData.last_message_at,
                client.created_at
            ].filter(Boolean).sort().reverse()[0] || client.created_at
        };

        // Merge stats into client object
        Object.assign(client, stats);

        // Get recent activity
        const recentActivity = await sequelize.query(`
            SELECT * FROM (
                SELECT
                    'call' as type,
                    created_at,
                    direction::text as direction,
                    duration,
                    from_number as phone
                FROM calls
                WHERE client_id = $1

                UNION ALL

                SELECT
                    'message' as type,
                    created_at,
                    direction::text as direction,
                    NULL::integer as duration,
                    from_number as phone
                FROM messages
                WHERE client_id = $1

                UNION ALL

                SELECT
                    'appointment' as type,
                    created_at,
                    NULL::text as direction,
                    NULL::integer as duration,
                    customer_phone as phone
                FROM appointments
                WHERE client_id = $1
            ) combined
            ORDER BY created_at DESC
            LIMIT 50
        `, {
            bind: [parseInt(client_id)],
            type: sequelize.QueryTypes.SELECT
        });

        // Get admin notes
        const notes = await AdminNote.findAll({
            where: { clientId: parseInt(client_id) },
            include: [{
                model: User,
                as: 'admin',
                attributes: ['email', 'first_name', 'last_name']
            }],
            order: [['created_at', 'DESC']],
            limit: 20
        });

        console.log(`✅ Admin loaded client profile: ${client.business_name}`);

        res.json({
            success: true,
            client,
            recentActivity,
            notes
        });

    } catch (error) {
        console.error('❌ Admin client profile error:', error);
        console.error('Stack trace:', error.stack);
        res.status(500).json({
            success: false,
            error: 'Failed to load client profile',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// ============= SEND SMS TO CLIENT =============

router.post('/clients/:client_id/send-sms', async (req, res) => {
    try {
        const { client_id } = req.params;
        const { message, to } = req.body;

        if (!message || !to) {
            return res.status(400).json({
                success: false,
                error: 'Message and phone number required'
            });
        }

        const client = await Client.findByPk(parseInt(client_id));
        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }

        console.log(`📤 Admin sending SMS to client ${client.business_name} (${to})`);

        // Initialize Twilio
        const twilioClient = twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
        );

        // Send SMS from admin number
        const adminPhone = '+18886103810';

        const twilioMessage = await twilioClient.messages.create({
            body: message,
            from: adminPhone,
            to: to
        });

        // Log to admin_communications table
        await AdminCommunication.create({
            adminUserId: req.adminId,
            clientId: parseInt(client_id),
            communicationType: 'sms',
            message,
            phoneNumber: to,
            twilioSid: twilioMessage.sid,
            direction: 'outbound',
            status: twilioMessage.status
        });

        // Also log to messages table with admin flag
        await sequelize.query(`
            INSERT INTO messages (
                client_id, twilio_sid, direction, from_number, to_number,
                body, status, is_admin_message, created_at
            ) VALUES (
                :client_id, :twilio_sid, 'outbound', :from_number, :to_number,
                :body, :status, TRUE, NOW()
            )
        `, {
            replacements: {
                client_id,
                twilio_sid: twilioMessage.sid,
                from_number: adminPhone,
                to_number: to,
                body: message,
                status: twilioMessage.status
            }
        });

        console.log(`✅ Admin SMS sent successfully: ${twilioMessage.sid}`);

        res.json({
            success: true,
            message: 'SMS sent successfully',
            twilioSid: twilioMessage.sid,
            status: twilioMessage.status
        });

    } catch (error) {
        console.error('❌ Admin SMS sending error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send SMS',
            details: error.message
        });
    }
});

// ============= GET SMS HISTORY WITH CLIENT =============

router.get('/clients/:client_id/sms-history', async (req, res) => {
    try {
        const { client_id } = req.params;
        const { limit = 50 } = req.query;

        const communications = await AdminCommunication.findAll({
            where: {
                clientId: parseInt(client_id),
                communicationType: 'sms'
            },
            include: [{
                model: User,
                as: 'admin',
                attributes: ['email', 'first_name', 'last_name']
            }],
            order: [['created_at', 'DESC']],
            limit: parseInt(limit)
        });

        res.json({
            success: true,
            communications
        });

    } catch (error) {
        console.error('❌ Admin SMS history error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load SMS history',
            details: error.message
        });
    }
});

// ============= EDIT CLIENT INFO =============

router.put('/clients/:client_id', async (req, res) => {
    try {
        const { client_id } = req.params;
        const { business_name, owner_name, owner_email, owner_phone } = req.body;

        console.log(`✏️ Admin editing client: ${client_id}`);

        const client = await Client.findByPk(parseInt(client_id));
        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }

        // Update allowed fields
        if (business_name !== undefined) client.business_name = business_name;
        if (owner_name !== undefined) client.owner_name = owner_name;
        if (owner_email !== undefined) client.owner_email = owner_email;
        if (owner_phone !== undefined) client.owner_phone = owner_phone;

        await client.save();

        console.log(`✅ Admin updated client: ${client.business_name}`);

        res.json({
            success: true,
            client: {
                id: client.id,
                business_name: client.business_name,
                owner_name: client.owner_name,
                owner_email: client.owner_email,
                owner_phone: client.owner_phone
            }
        });

    } catch (error) {
        console.error('❌ Admin edit client error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update client',
            details: error.message
        });
    }
});

// ============= ADD ADMIN NOTE =============

router.post('/clients/:client_id/notes', async (req, res) => {
    try {
        const { client_id } = req.params;
        const { note, noteType = 'general' } = req.body;

        if (!note) {
            return res.status(400).json({
                success: false,
                error: 'Note text required'
            });
        }

        const adminNote = await AdminNote.create({
            adminUserId: req.adminId,
            clientId: parseInt(client_id),
            note,
            noteType
        });

        console.log(`📝 Admin added note to client ${client_id}`);

        res.json({
            success: true,
            note: adminNote
        });

    } catch (error) {
        console.error('❌ Admin note creation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create note',
            details: error.message
        });
    }
});

// ============= SEARCH CLIENTS BY PHONE =============

router.get('/search/phone/:phone', async (req, res) => {
    try {
        const { phone } = req.params;

        console.log(`🔍 Admin searching for phone: ${phone}`);

        // First get matching clients
        const clientMatches = await sequelize.query(`
            SELECT * FROM clients
            WHERE owner_phone ILIKE :phone
               OR business_phone ILIKE :phone
        `, {
            replacements: { phone: `%${phone}%` },
            type: sequelize.QueryTypes.SELECT
        });

        // Then get stats for each client
        const clients = await Promise.all(clientMatches.map(async (c) => {
            const results = await sequelize.query(`
                SELECT
                    COALESCE(SUM(duration) / 60.0, 0) as total_minutes_used
                FROM calls
                WHERE client_id = $1
            `, {
                bind: [parseInt(c.id)],
                type: sequelize.QueryTypes.SELECT
            });
            const stats = results && results[0] ? results[0] : { total_minutes_used: 0 };
            const minutes = parseFloat(stats.total_minutes_used) || 0;
            return {
                ...c,
                total_minutes_used: minutes
            };
        }));

        res.json({
            success: true,
            clients
        });

    } catch (error) {
        console.error('❌ Admin phone search error:', error);
        res.status(500).json({
            success: false,
            error: 'Search failed',
            details: error.message
        });
    }
});

// ============= ADMIN REPORTS =============

router.get('/reports/overview', async (req, res) => {
    try {
        console.log('📊 Admin loading overview report');

        // Get overview statistics
        const overview = await sequelize.query(`
            WITH client_stats AS (
                SELECT
                    c.id,
                    c.active,
                    c.rachel_enabled,
                    COALESCE(SUM(calls.duration) / 60.0, 0) as client_minutes,
                    COUNT(DISTINCT calls.id) as client_calls
                FROM clients c
                LEFT JOIN calls ON calls.client_id = c.id
                GROUP BY c.id, c.active, c.rachel_enabled
            )
            SELECT
                COUNT(*) as total_clients,
                COUNT(CASE WHEN active = TRUE THEN 1 END) as active_clients,
                COUNT(CASE WHEN rachel_enabled = TRUE THEN 1 END) as rachel_enabled_clients,
                ROUND(COALESCE(SUM(client_minutes), 0), 2) as total_minutes_used,
                SUM(client_calls) as total_calls
            FROM client_stats
        `, {
            type: sequelize.QueryTypes.SELECT
        });

        // Get total appointments and messages separately (simpler query)
        const [activityStats] = await sequelize.query(`
            SELECT
                COUNT(DISTINCT appointments.id) as total_appointments,
                COUNT(DISTINCT messages.id) as total_messages
            FROM clients c
            LEFT JOIN appointments ON appointments.client_id = c.id
            LEFT JOIN messages ON messages.client_id = c.id
        `, {
            type: sequelize.QueryTypes.SELECT
        });

        // Merge the stats together
        res.json({
            success: true,
            overview: {
                ...overview[0],
                total_appointments: activityStats.total_appointments,
                total_messages: activityStats.total_messages
            }
        });

    } catch (error) {
        console.error('❌ Admin overview report error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load overview',
            details: error.message
        });
    }
});

// ============= GIFT TOKENS TO USER =============

router.post('/gift-tokens', async (req, res) => {
    try {
        const { email, tokens, amount, reason } = req.body;

        console.log(`🎁 Admin gifting tokens: ${tokens} tokens to ${email}`);

        // Validation
        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'User email is required'
            });
        }

        if (!tokens || tokens <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Token amount must be greater than 0'
            });
        }

        // Find user by email
        const user = await User.findOne({ where: { email } });

        if (!user) {
            console.log(`❌ User not found: ${email}`);
            return res.status(404).json({
                success: false,
                error: `User not found with email: ${email}`
            });
        }

        // Get previous balance
        const previousBalance = user.tokens_balance || 0;

        // Import tokenService
        const tokenService = require('../services/tokenService');

        // Add tokens to user account
        const result = await tokenService.addTokens(user.id, tokens, 'admin_gift', {
            reason: reason || 'Admin token gift',
            amount: amount || 0,
            currency: 'usd',
            gifted_by: req.adminUser.email,
            admin_user_id: req.adminId,
            timestamp: new Date().toISOString()
        });

        console.log(`✅ Admin gifted ${tokens} tokens to ${email}`);
        console.log(`   Previous balance: ${previousBalance} tokens`);
        console.log(`   New balance: ${result.balance} tokens`);

        res.json({
            success: true,
            message: `Successfully gifted ${tokens} tokens to ${email}`,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name
            },
            previousBalance,
            newBalance: result.balance,
            tokensGifted: tokens,
            giftedBy: req.adminUser.email,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Admin gift tokens error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to gift tokens',
            details: error.message
        });
    }
});

// ============= BUSINESS DIRECTORY ADMIN (JWT AUTHENTICATED) =============

// Disable all leads for a specific client (sets call_status to DISABLED)
// Requires JWT authentication
router.post('/disable-leads/:clientId', authenticateAdmin, async (req, res) => {
    try {
        const { clientId } = req.params;

        console.log(`🔒 Admin: Disabling leads for client ${clientId} (requested by ${req.adminUser.email})`);

        // Get count before disabling
        const [countResult] = await sequelize.query(
            `SELECT COUNT(*) as total FROM business_directory
             WHERE client_id = :clientId AND (call_status IS NULL OR call_status != 'DISABLED')`,
            {
                replacements: { clientId: parseInt(clientId) },
                type: sequelize.QueryTypes.SELECT
            }
        );

        const leadsToDisable = parseInt(countResult.total);

        if (leadsToDisable === 0) {
            return res.json({
                success: true,
                message: 'No active leads to disable',
                disabled: 0,
                clientId: parseInt(clientId)
            });
        }

        // Disable all leads
        await sequelize.query(
            `UPDATE business_directory
             SET call_status = 'DISABLED',
                 notes = CONCAT(COALESCE(notes, ''), ' [DISABLED by admin on ', TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI'), ']'),
                 updated_at = CURRENT_TIMESTAMP
             WHERE client_id = :clientId AND (call_status IS NULL OR call_status != 'DISABLED')`,
            {
                replacements: { clientId: parseInt(clientId) }
            }
        );

        console.log(`✅ Disabled ${leadsToDisable} leads for client ${clientId}`);

        res.json({
            success: true,
            message: `Successfully disabled ${leadsToDisable} leads for client ${clientId}`,
            disabled: leadsToDisable,
            clientId: parseInt(clientId),
            disabledBy: req.adminUser.email
        });

    } catch (error) {
        console.error('❌ Error disabling leads:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get stats for a client's business directory
router.get('/leads-stats/:clientId', authenticateAdmin, async (req, res) => {
    try {
        const { clientId } = req.params;

        const stats = await sequelize.query(
            `SELECT
               COALESCE(call_status, 'NO_STATUS') as call_status,
               COUNT(*) as count
             FROM business_directory
             WHERE client_id = :clientId
             GROUP BY call_status
             ORDER BY count DESC`,
            {
                replacements: { clientId: parseInt(clientId) },
                type: sequelize.QueryTypes.SELECT
            }
        );

        const total = stats.reduce((sum, s) => sum + parseInt(s.count), 0);

        res.json({
            success: true,
            clientId: parseInt(clientId),
            total,
            byStatus: stats
        });

    } catch (error) {
        console.error('❌ Error getting stats:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
