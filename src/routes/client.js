const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

// DEBUG: Get all clients (temporary for debugging)
router.get('/debug/all-clients', async (req, res) => {
    try {
        const { sequelize } = require('../models');

        const clients = await sequelize.query(
            'SELECT id, business_name, ringlypro_number, rachel_enabled, active FROM clients ORDER BY id',
            { type: sequelize.QueryTypes.SELECT }
        );

        res.json({
            success: true,
            count: clients.length,
            clients: clients
        });

    } catch (error) {
        console.error('Debug clients error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// DEBUG: Check GHL credentials configuration
router.get('/debug/ghl-credentials', async (req, res) => {
    try {
        const { sequelize } = require('../models');

        const clients = await sequelize.query(`
            SELECT
                id,
                business_name,
                owner_email,
                CASE
                    WHEN ghl_api_key IS NOT NULL AND ghl_api_key != ''
                    THEN LEFT(ghl_api_key, 20) || '...'
                    ELSE NULL
                END as api_key_preview,
                ghl_location_id,
                CASE
                    WHEN ghl_api_key IS NOT NULL AND ghl_api_key != ''
                        AND ghl_location_id IS NOT NULL AND ghl_location_id != ''
                    THEN 'configured'
                    ELSE 'not_configured'
                END as status
            FROM clients
            ORDER BY id
        `, { type: sequelize.QueryTypes.SELECT });

        // Check for duplicate credentials
        const duplicates = await sequelize.query(`
            SELECT
                LEFT(ghl_api_key, 20) as api_key_prefix,
                ghl_location_id,
                COUNT(*) as client_count,
                STRING_AGG(id::text, ', ') as client_ids,
                STRING_AGG(business_name, ', ') as business_names
            FROM clients
            WHERE ghl_api_key IS NOT NULL AND ghl_api_key != ''
            GROUP BY ghl_api_key, ghl_location_id
            HAVING COUNT(*) > 1
        `, { type: sequelize.QueryTypes.SELECT });

        const configured = clients.filter(c => c.status === 'configured').length;
        const notConfigured = clients.filter(c => c.status === 'not_configured').length;

        res.json({
            success: true,
            summary: {
                total: clients.length,
                configured,
                notConfigured
            },
            clients,
            duplicates: duplicates.length > 0 ? {
                found: true,
                count: duplicates.length,
                details: duplicates
            } : {
                found: false,
                message: 'No duplicate GHL credentials found'
            }
        });

    } catch (error) {
        console.error('Debug GHL credentials error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// DEBUG: Get IVR settings for a client (for loop prevention debugging)
router.get('/debug/ivr/:client_id', async (req, res) => {
    try {
        const { client_id } = req.params;
        const { sequelize } = require('../models');

        const [client] = await sequelize.query(
            `SELECT id, business_name, ringlypro_number, business_phone, owner_phone,
                    ivr_enabled, ivr_options
             FROM clients
             WHERE id = :client_id`,
            {
                replacements: { client_id },
                type: sequelize.QueryTypes.SELECT
            }
        );

        if (!client) {
            return res.status(404).json({
                success: false,
                error: `Client ${client_id} not found`
            });
        }

        // Analyze IVR options for potential loops
        // business_phone has call forwarding TO the DID, so forwarding to it will loop!
        const normalizePhone = (phone) => (phone || '').replace(/\D/g, '');
        const didPhone = normalizePhone(client.ringlypro_number);
        const businessPhone = normalizePhone(client.business_phone);
        const ownerPhone = normalizePhone(client.owner_phone);

        const ivrAnalysis = (client.ivr_options || []).map((opt, idx) => {
            const optPhone = normalizePhone(opt.phone);

            // Check if matches DID
            const matchesDID = optPhone === didPhone ||
                               optPhone.endsWith(didPhone) ||
                               didPhone.endsWith(optPhone);

            // Check if matches business_phone (which forwards to DID = loop!)
            const matchesBusinessPhone = optPhone === businessPhone ||
                                          optPhone.endsWith(businessPhone) ||
                                          businessPhone.endsWith(optPhone);

            const wouldLoop = matchesDID || matchesBusinessPhone;

            // Check if owner_phone is a safe fallback
            const ownerMatchesDID = ownerPhone === didPhone ||
                                    ownerPhone.endsWith(didPhone) ||
                                    didPhone.endsWith(ownerPhone);
            const ownerMatchesBusiness = ownerPhone === businessPhone ||
                                          ownerPhone.endsWith(businessPhone) ||
                                          businessPhone.endsWith(ownerPhone);
            const ownerIsSafe = client.owner_phone && !ownerMatchesDID && !ownerMatchesBusiness;

            return {
                index: idx,
                name: opt.name,
                phone: opt.phone,
                enabled: opt.enabled,
                normalized_phone: optPhone,
                matches_did: matchesDID,
                matches_business_phone: matchesBusinessPhone,
                would_loop: wouldLoop,
                safe_fallback: wouldLoop ? (ownerIsSafe ? 'owner_phone' : 'none') : 'not_needed'
            };
        });

        res.json({
            success: true,
            client: {
                id: client.id,
                business_name: client.business_name,
                ringlypro_number: client.ringlypro_number,
                ringlypro_normalized: didPhone,
                business_phone: client.business_phone,
                business_phone_normalized: businessPhone,
                owner_phone: client.owner_phone,
                owner_phone_normalized: ownerPhone,
                ivr_enabled: client.ivr_enabled
            },
            ivr_options: client.ivr_options,
            ivr_analysis: ivrAnalysis,
            warnings: ivrAnalysis.filter(opt => opt.would_loop && opt.safe_fallback === 'none').map(opt =>
                `IVR option "${opt.name}" (${opt.phone}) would cause a loop and NO safe fallback is available!`
            ),
            info: ivrAnalysis.filter(opt => opt.would_loop && opt.safe_fallback !== 'none').map(opt =>
                `IVR option "${opt.name}" (${opt.phone}) would loop but will fallback to ${opt.safe_fallback}`
            )
        });

    } catch (error) {
        console.error('Debug IVR error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// DEBUG: Get appointments for a client
router.get('/debug/appointments/:client_id', async (req, res) => {
    try {
        const { client_id } = req.params;
        const { sequelize } = require('../models');

        const appointments = await sequelize.query(
            `SELECT id, client_id, customer_name, customer_phone, appointment_date,
                    appointment_time, status, confirmation_code, created_at
             FROM appointments
             WHERE client_id = :client_id
             ORDER BY created_at DESC
             LIMIT 50`,
            {
                replacements: { client_id },
                type: sequelize.QueryTypes.SELECT
            }
        );

        res.json({
            success: true,
            client_id: parseInt(client_id),
            count: appointments.length,
            appointments: appointments
        });

    } catch (error) {
        console.error('Debug appointments error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/client/rachel-status/:client_id - Multi-tenant by client ID
router.get('/rachel-status/:client_id', async (req, res) => {
    try {
        const { client_id } = req.params;
        const { sequelize } = require('../models');
        
        const client = await sequelize.query(
            'SELECT id, business_name, rachel_enabled, business_phone, ringlypro_number FROM clients WHERE id = :client_id',
            { 
                replacements: { client_id: client_id },
                type: sequelize.QueryTypes.SELECT 
            }
        );

        if (!client || client.length === 0) {
            return res.status(404).json({
                success: false,
                error: `Client with ID ${client_id} not found`
            });
        }

        res.json({
            success: true,
            client: client[0]
        });

    } catch (error) {
        console.error('Rachel status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get Rachel status',
            details: error.message
        });
    }
});

// PUT endpoint to update Rachel status for a specific client
router.put('/rachel-status/:client_id', async (req, res) => {
    const { client_id } = req.params;
    const { rachel_enabled } = req.body;

    // Validate input
    if (typeof rachel_enabled !== 'boolean') {
        return res.status(400).json({
            success: false,
            error: 'rachel_enabled must be a boolean value'
        });
    }

    try {
        const { sequelize } = require('../models');
        
        // Update the client's Rachel status in the database using raw SQL
        const updateResult = await sequelize.query(
            'UPDATE clients SET rachel_enabled = :rachel_enabled, updated_at = NOW() WHERE id = :client_id RETURNING id, business_name, rachel_enabled, updated_at',
            { 
                replacements: { rachel_enabled, client_id },
                type: sequelize.QueryTypes.UPDATE 
            }
        );

        // Get the updated client data
        const client = await sequelize.query(
            'SELECT id, business_name, rachel_enabled, updated_at FROM clients WHERE id = :client_id',
            { 
                replacements: { client_id },
                type: sequelize.QueryTypes.SELECT 
            }
        );

        if (!client || client.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }

        // Return success response
        res.json({
            success: true,
            message: `Rachel Voice Bot ${rachel_enabled ? 'enabled' : 'disabled'} successfully`,
            client: {
                id: client[0].id,
                business_name: client[0].business_name,
                rachel_enabled: client[0].rachel_enabled,
                updated_at: client[0].updated_at
            }
        });

    } catch (error) {
        console.error('Error updating Rachel status:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
});

// GET /api/client/list - Show all clients (for testing)
router.get('/list', async (req, res) => {
    try {
        const { sequelize } = require('../models');
        
        const clients = await sequelize.query(
            'SELECT id, business_name, business_phone, ringlypro_number, rachel_enabled FROM clients ORDER BY id',
            { type: sequelize.QueryTypes.SELECT }
        );

        res.json({
            success: true,
            clients: clients,
            count: clients.length
        });

    } catch (error) {
        console.error('Client list error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get client list',
            details: error.message
        });
    }
});

// GET /api/client/calendar-settings/:client_id - Get calendar settings
router.get('/calendar-settings/:client_id', async (req, res) => {
    try {
        const { client_id } = req.params;
        const { Client } = require('../models');

        const client = await Client.findByPk(client_id, {
            attributes: ['id', 'business_name', 'booking_enabled', 'calendar_settings', 'business_hours_start', 'business_hours_end', 'business_days', 'appointment_duration']
        });

        if (!client) {
            return res.status(404).json({
                success: false,
                error: `Client with ID ${client_id} not found`
            });
        }

        // Return calendar settings with defaults if not set
        res.json({
            success: true,
            settings: {
                booking_enabled: client.booking_enabled,
                appointment_duration: client.appointment_duration,
                calendar_settings: client.calendar_settings || getDefaultCalendarSettings(client),
                legacy_hours: {
                    business_hours_start: client.business_hours_start,
                    business_hours_end: client.business_hours_end,
                    business_days: client.business_days
                }
            }
        });

    } catch (error) {
        console.error('Error fetching calendar settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch calendar settings',
            details: error.message
        });
    }
});

// PUT /api/client/calendar-settings/:client_id - Update calendar settings
router.put('/calendar-settings/:client_id', async (req, res) => {
    try {
        const { client_id } = req.params;
        const { booking_enabled, calendar_settings, appointment_duration } = req.body;
        const { Client } = require('../models');

        // Validate input
        if (typeof booking_enabled !== 'boolean') {
            return res.status(400).json({
                success: false,
                error: 'booking_enabled must be a boolean'
            });
        }

        if (!calendar_settings || typeof calendar_settings !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'calendar_settings must be an object'
            });
        }

        // Validate calendar_settings structure
        const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        for (const day of validDays) {
            if (!calendar_settings[day]) {
                return res.status(400).json({
                    success: false,
                    error: `Missing configuration for ${day}`
                });
            }

            const dayConfig = calendar_settings[day];
            if (typeof dayConfig.enabled !== 'boolean') {
                return res.status(400).json({
                    success: false,
                    error: `Invalid enabled value for ${day}`
                });
            }

            if (dayConfig.enabled && (!dayConfig.start || !dayConfig.end)) {
                return res.status(400).json({
                    success: false,
                    error: `Missing start or end time for ${day}`
                });
            }
        }

        // Update client
        const client = await Client.findByPk(client_id);

        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }

        client.booking_enabled = booking_enabled;
        client.calendar_settings = calendar_settings;
        if (appointment_duration) {
            client.appointment_duration = appointment_duration;
        }

        await client.save();

        console.log(`✅ Calendar settings updated for client ${client_id} (${client.business_name})`);

        res.json({
            success: true,
            message: 'Calendar settings updated successfully',
            settings: {
                booking_enabled: client.booking_enabled,
                appointment_duration: client.appointment_duration,
                calendar_settings: client.calendar_settings
            }
        });

    } catch (error) {
        console.error('Error updating calendar settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update calendar settings',
            details: error.message
        });
    }
});

// GET /api/client/ivr-settings/:client_id - Get IVR settings
router.get('/ivr-settings/:client_id', async (req, res) => {
    try {
        const { client_id } = req.params;
        const { Client } = require('../models');

        const client = await Client.findByPk(client_id, {
            attributes: ['id', 'business_name', 'ivr_enabled', 'ivr_options']
        });

        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }

        res.json({
            success: true,
            settings: {
                ivr_enabled: client.ivr_enabled || false,
                ivr_options: client.ivr_options || []
            }
        });

    } catch (error) {
        console.error('Error fetching IVR settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch IVR settings',
            details: error.message
        });
    }
});

// PUT /api/client/ivr-settings/:client_id - Update IVR settings
router.put('/ivr-settings/:client_id', async (req, res) => {
    try {
        const { client_id } = req.params;
        const { ivr_enabled, ivr_options } = req.body;
        const { Client } = require('../models');

        // Validate input
        if (typeof ivr_enabled !== 'boolean') {
            return res.status(400).json({
                success: false,
                error: 'ivr_enabled must be a boolean'
            });
        }

        if (!Array.isArray(ivr_options)) {
            return res.status(400).json({
                success: false,
                error: 'ivr_options must be an array'
            });
        }

        // Validate max 3 departments
        if (ivr_options.length > 3) {
            return res.status(400).json({
                success: false,
                error: 'Maximum 3 IVR departments allowed'
            });
        }

        // Validate each department
        for (const dept of ivr_options) {
            if (!dept.name || !dept.phone) {
                return res.status(400).json({
                    success: false,
                    error: 'Each department must have a name and phone number'
                });
            }

            if (typeof dept.enabled !== 'boolean') {
                return res.status(400).json({
                    success: false,
                    error: 'Each department must have an enabled boolean'
                });
            }
        }

        // Update client
        const client = await Client.findByPk(client_id);

        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }

        client.ivr_enabled = ivr_enabled;
        client.ivr_options = ivr_options;

        await client.save();

        console.log(`✅ IVR settings updated for client ${client_id} (${client.business_name})`);
        console.log(`   IVR Enabled: ${ivr_enabled}`);
        console.log(`   Departments: ${ivr_options.length}`);

        res.json({
            success: true,
            message: 'IVR settings updated successfully',
            settings: {
                ivr_enabled: client.ivr_enabled,
                ivr_options: client.ivr_options
            }
        });

    } catch (error) {
        console.error('Error updating IVR settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update IVR settings',
            details: error.message
        });
    }
});

// GET /api/client/crm-settings/:client_id - Get CRM integration settings
router.get('/crm-settings/:client_id', async (req, res) => {
    try {
        const { client_id } = req.params;
        const { sequelize } = require('../models');

        // Use raw SQL to query CRM fields directly
        const result = await sequelize.query(
            'SELECT id, business_name, ghl_api_key, ghl_location_id, sendgrid_api_key, sendgrid_from_email, sendgrid_from_name, sendgrid_reply_to, outbound_voicemail_message FROM clients WHERE id = :client_id',
            {
                replacements: { client_id },
                type: sequelize.QueryTypes.SELECT
            }
        );

        if (!result || result.length === 0) {
            return res.status(404).json({
                success: false,
                error: `Client with ID ${client_id} not found`
            });
        }

        const client = result[0];

        // Return CRM settings (mask API keys for security - only show last 4 chars)
        const maskApiKey = (key) => {
            if (!key) return null;
            return key.length > 8 ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}` : '****';
        };

        res.json({
            success: true,
            settings: {
                ghl_api_key: client.ghl_api_key ? maskApiKey(client.ghl_api_key) : null,
                ghl_api_key_set: !!client.ghl_api_key,
                ghl_location_id: client.ghl_location_id,
                sendgrid_api_key_set: !!client.sendgrid_api_key,
                sendgrid_from_email: client.sendgrid_from_email,
                sendgrid_from_name: client.sendgrid_from_name,
                sendgrid_reply_to: client.sendgrid_reply_to,
                outbound_voicemail_message: client.outbound_voicemail_message
            }
        });

    } catch (error) {
        console.error('Error fetching CRM settings:', error);

        // If columns don't exist yet (migration not run), return empty settings
        if (error.message && error.message.includes('column') && error.message.includes('does not exist')) {
            console.log('⚠️ CRM columns not yet created - migration needed');
            return res.json({
                success: true,
                settings: {
                    ghl_api_key: null,
                    ghl_api_key_set: false,
                    ghl_location_id: null
                }
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to fetch CRM settings',
            details: error.message
        });
    }
});

// PUT /api/client/crm-settings/:client_id - Update CRM integration settings
router.put('/crm-settings/:client_id', async (req, res) => {
    try {
        const { client_id } = req.params;
        const { ghl_api_key, ghl_location_id, sendgrid_api_key, sendgrid_from_email, sendgrid_from_name, sendgrid_reply_to, outbound_voicemail_message } = req.body;
        const { sequelize } = require('../models');

        // First verify client exists
        const result = await sequelize.query(
            'SELECT id, business_name FROM clients WHERE id = :client_id',
            {
                replacements: { client_id },
                type: sequelize.QueryTypes.SELECT
            }
        );

        const client = result[0];

        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }

        // Build dynamic UPDATE query for partial updates
        const updates = [];
        const replacements = { client_id };

        // GoHighLevel fields
        if (ghl_api_key !== undefined) {
            updates.push('ghl_api_key = :ghl_api_key');
            replacements.ghl_api_key = ghl_api_key || null;
        }
        if (ghl_location_id !== undefined) {
            updates.push('ghl_location_id = :ghl_location_id');
            replacements.ghl_location_id = ghl_location_id || null;
        }

        // SendGrid fields
        if (sendgrid_api_key !== undefined) {
            updates.push('sendgrid_api_key = :sendgrid_api_key');
            replacements.sendgrid_api_key = sendgrid_api_key || null;
        }
        if (sendgrid_from_email !== undefined) {
            updates.push('sendgrid_from_email = :sendgrid_from_email');
            replacements.sendgrid_from_email = sendgrid_from_email || null;
        }
        if (sendgrid_from_name !== undefined) {
            updates.push('sendgrid_from_name = :sendgrid_from_name');
            replacements.sendgrid_from_name = sendgrid_from_name || null;
        }
        if (sendgrid_reply_to !== undefined) {
            updates.push('sendgrid_reply_to = :sendgrid_reply_to');
            replacements.sendgrid_reply_to = sendgrid_reply_to || null;
        }

        // Outbound voicemail message
        if (outbound_voicemail_message !== undefined) {
            updates.push('outbound_voicemail_message = :outbound_voicemail_message');
            replacements.outbound_voicemail_message = outbound_voicemail_message || null;
        }

        if (updates.length === 0) {
            return res.json({
                success: true,
                message: 'No changes to update'
            });
        }

        // Update with raw SQL
        updates.push('updated_at = NOW()');
        const updateQuery = `UPDATE clients SET ${updates.join(', ')} WHERE id = :client_id`;

        await sequelize.query(updateQuery, {
            replacements,
            type: sequelize.QueryTypes.UPDATE
        });

        console.log(`✅ CRM integration settings updated for client ${client_id} (${client.business_name})`);
        if (ghl_api_key !== undefined || ghl_location_id !== undefined) {
            console.log(`   GHL API Key: ${ghl_api_key !== undefined ? (ghl_api_key ? 'Set' : 'Cleared') : 'Unchanged'}`);
            console.log(`   GHL Location ID: ${ghl_location_id !== undefined ? (ghl_location_id || 'Cleared') : 'Unchanged'}`);
        }
        if (sendgrid_api_key !== undefined || sendgrid_from_email !== undefined) {
            console.log(`   SendGrid API Key: ${sendgrid_api_key !== undefined ? (sendgrid_api_key ? 'Set' : 'Cleared') : 'Unchanged'}`);
            console.log(`   SendGrid From Email: ${sendgrid_from_email || 'Unchanged'}`);
        }

        res.json({
            success: true,
            message: 'CRM integration settings updated successfully',
            settings: {
                ghl_api_key_set: ghl_api_key !== undefined ? !!ghl_api_key : undefined,
                ghl_location_id: ghl_location_id !== undefined ? ghl_location_id : undefined,
                sendgrid_api_key_set: sendgrid_api_key !== undefined ? !!sendgrid_api_key : undefined,
                sendgrid_from_email: sendgrid_from_email !== undefined ? sendgrid_from_email : undefined
            }
        });

    } catch (error) {
        console.error('Error updating CRM settings:', error);
        console.error('Error stack:', error.stack);

        // If columns don't exist, provide helpful message
        if (error.message && error.message.includes('column') && error.message.includes('does not exist')) {
            return res.status(500).json({
                success: false,
                error: 'CRM columns not yet created in database',
                details: 'Please run the database migration first',
                migration_needed: true
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to update CRM settings',
            details: error.message
        });
    }
});

// GET /api/client/crm-credentials/:client_id - Get full CRM credentials (for MCP Copilot auto-load)
// Returns credentials for ALL supported CRMs: GoHighLevel, HubSpot, Vagaro
// Used by: Dashboard Contacts modal, MCP Copilot
router.get('/crm-credentials/:client_id', async (req, res) => {
    console.log(`📋 CRM credentials requested for client ${req.params.client_id}`);
    try {
        const { client_id } = req.params;
        const { sequelize } = require('../models');

        // Query ALL CRM fields - GHL, HubSpot, and Vagaro settings
        const result = await sequelize.query(
            `SELECT id, business_name,
                    ghl_api_key, ghl_location_id,
                    hubspot_api_key, hubspot_meeting_slug,
                    settings
             FROM clients WHERE id = :client_id`,
            {
                replacements: { client_id },
                type: sequelize.QueryTypes.SELECT
            }
        );

        const client = result[0];

        if (!client) {
            return res.status(404).json({
                success: false,
                error: `Client with ID ${client_id} not found`
            });
        }

        // Parse Vagaro settings from JSONB
        const vagaroSettings = client.settings?.integration?.vagaro || {};
        const vagaroConfigured = !!(vagaroSettings.enabled && vagaroSettings.merchantId);

        // Determine which CRM is configured (priority: GHL > HubSpot > Vagaro)
        const ghlConfigured = !!(client.ghl_api_key && client.ghl_location_id);
        const hubspotConfigured = !!client.hubspot_api_key;

        let activeCRM = 'none';
        if (ghlConfigured) activeCRM = 'ghl';
        else if (hubspotConfigured) activeCRM = 'hubspot';
        else if (vagaroConfigured) activeCRM = 'vagaro';

        // Return full credentials for all CRMs
        // CRM AI Agent uses this to auto-connect to the appropriate CRM
        res.json({
            success: true,
            activeCRM,
            credentials: {
                // GoHighLevel - requires BOTH api_key AND location_id
                gohighlevel: {
                    api_key: client.ghl_api_key || null,
                    location_id: client.ghl_location_id || null,
                    configured: ghlConfigured
                },
                // HubSpot - requires ONLY access_token (NO location needed!)
                hubspot: {
                    access_token: client.hubspot_api_key || null,
                    meeting_slug: client.hubspot_meeting_slug || null,
                    configured: hubspotConfigured
                },
                // Vagaro - OAuth credentials stored in settings JSONB
                vagaro: {
                    clientId: vagaroSettings.clientId || null,
                    clientSecretKey: vagaroSettings.clientSecretKey || null,
                    merchantId: vagaroSettings.merchantId || null,
                    region: vagaroSettings.region || 'us01',
                    configured: vagaroConfigured
                }
            }
        });

    } catch (error) {
        console.error('Error fetching CRM credentials:', error);

        // If columns don't exist yet (migration not run), return empty credentials
        if (error.message && error.message.includes('column') && error.message.includes('does not exist')) {
            console.log('⚠️ CRM columns not yet created - migration needed');
            return res.json({
                success: true,
                activeCRM: 'none',
                credentials: {
                    gohighlevel: { api_key: null, location_id: null, configured: false },
                    hubspot: { access_token: null, meeting_slug: null, configured: false },
                    vagaro: { merchant_id: null, configured: false }
                }
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to fetch CRM credentials',
            details: error.message
        });
    }
});

// Helper function to generate default calendar settings from legacy fields
function getDefaultCalendarSettings(client) {
    const defaultStart = client.business_hours_start || '09:00:00';
    const defaultEnd = client.business_hours_end || '17:00:00';
    const businessDays = client.business_days || 'Mon-Fri';

    // Parse business_days (e.g., "Mon-Fri", "Mon,Wed,Fri")
    const enabledDays = new Set();
    if (businessDays.includes('-')) {
        // Range format: "Mon-Fri"
        enabledDays.add('monday');
        enabledDays.add('tuesday');
        enabledDays.add('wednesday');
        enabledDays.add('thursday');
        enabledDays.add('friday');
    } else {
        // Comma-separated format: "Mon,Wed,Fri"
        const dayMap = {
            'Mon': 'monday',
            'Tue': 'tuesday',
            'Wed': 'wednesday',
            'Thu': 'thursday',
            'Fri': 'friday',
            'Sat': 'saturday',
            'Sun': 'sunday'
        };
        businessDays.split(',').forEach(day => {
            const normalized = dayMap[day.trim()];
            if (normalized) enabledDays.add(normalized);
        });
    }

    return {
        monday: enabledDays.has('monday') ? { enabled: true, start: defaultStart.substring(0, 5), end: defaultEnd.substring(0, 5) } : { enabled: false },
        tuesday: enabledDays.has('tuesday') ? { enabled: true, start: defaultStart.substring(0, 5), end: defaultEnd.substring(0, 5) } : { enabled: false },
        wednesday: enabledDays.has('wednesday') ? { enabled: true, start: defaultStart.substring(0, 5), end: defaultEnd.substring(0, 5) } : { enabled: false },
        thursday: enabledDays.has('thursday') ? { enabled: true, start: defaultStart.substring(0, 5), end: defaultEnd.substring(0, 5) } : { enabled: false },
        friday: enabledDays.has('friday') ? { enabled: true, start: defaultStart.substring(0, 5), end: defaultEnd.substring(0, 5) } : { enabled: false },
        saturday: enabledDays.has('saturday') ? { enabled: true, start: defaultStart.substring(0, 5), end: defaultEnd.substring(0, 5) } : { enabled: false },
        sunday: enabledDays.has('sunday') ? { enabled: true, start: defaultStart.substring(0, 5), end: defaultEnd.substring(0, 5) } : { enabled: false }
    };
}

// GET /api/client/my-client - Get client associated with current authenticated user
// Used when clientId is not in JWT token (legacy tokens)
router.get('/my-client', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User ID not found in token'
            });
        }

        const { sequelize } = require('../models');

        // Look up client by user_id (clients table has user_id column pointing to users.id)
        const [client] = await sequelize.query(
            'SELECT id, business_name, ringlypro_number, rachel_enabled, active FROM clients WHERE user_id = :userId',
            {
                replacements: { userId },
                type: sequelize.QueryTypes.SELECT
            }
        );

        if (!client) {
            console.log(`⚠️ No client found for user ${userId}`);
            return res.status(404).json({
                success: false,
                error: 'No client associated with this user account'
            });
        }

        console.log(`✅ Found client ${client.id} (${client.business_name}) for user ${userId}`);

        res.json({
            success: true,
            client: {
                id: client.id,
                businessName: client.business_name,
                ringlyproNumber: client.ringlypro_number,
                rachelEnabled: client.rachel_enabled,
                active: client.active
            }
        });

    } catch (error) {
        console.error('Error fetching client for user:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch client information'
        });
    }
});

// GET /api/client/ghl-credentials/:client_id - Get GHL credentials for a specific client (multi-tenant secure)
router.get('/ghl-credentials/:client_id', async (req, res) => {
    try {
        const { client_id } = req.params;
        const { sequelize } = require('../models');

        // First check ghl_integrations table (OAuth-based integration)
        const [integration] = await sequelize.query(
            `SELECT ghl_location_id, access_token as api_key
             FROM ghl_integrations
             WHERE client_id = :client_id AND is_active = true
             LIMIT 1`,
            {
                replacements: { client_id },
                type: sequelize.QueryTypes.SELECT
            }
        );

        if (integration && integration.ghl_location_id && integration.api_key) {
            return res.json({
                success: true,
                credentials: {
                    api_key: integration.api_key,
                    location_id: integration.ghl_location_id
                }
            });
        }

        // Fallback: Check clients table for legacy GHL fields
        const [client] = await sequelize.query(
            `SELECT ghl_api_key, ghl_location_id
             FROM clients
             WHERE id = :client_id`,
            {
                replacements: { client_id },
                type: sequelize.QueryTypes.SELECT
            }
        );

        if (client && client.ghl_api_key && client.ghl_location_id) {
            return res.json({
                success: true,
                credentials: {
                    api_key: client.ghl_api_key,
                    location_id: client.ghl_location_id
                }
            });
        }

        // No GHL integration configured
        return res.json({
            success: false,
            error: 'No GHL integration configured for this client',
            credentials: null
        });

    } catch (error) {
        console.error('Error fetching GHL credentials:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch GHL credentials'
        });
    }
});

module.exports = router;