const express = require('express');
const router = express.Router();

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
        const { Client } = require('../models');

        const client = await Client.findByPk(client_id, {
            attributes: ['id', 'business_name', 'ghl_api_key', 'ghl_location_id']
        });

        if (!client) {
            return res.status(404).json({
                success: false,
                error: `Client with ID ${client_id} not found`
            });
        }

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
                ghl_location_id: client.ghl_location_id
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
        const { ghl_api_key, ghl_location_id } = req.body;
        const { Client } = require('../models');

        const client = await Client.findByPk(client_id);

        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }

        // Update fields only if provided (allow partial updates)
        if (ghl_api_key !== undefined) {
            client.ghl_api_key = ghl_api_key || null;
        }
        if (ghl_location_id !== undefined) {
            client.ghl_location_id = ghl_location_id || null;
        }

        await client.save();

        console.log(`✅ GoHighLevel integration settings updated for client ${client_id} (${client.business_name})`);
        console.log(`   GHL API Key: ${client.ghl_api_key ? 'Set' : 'Not set'}`);
        console.log(`   GHL Location ID: ${client.ghl_location_id || 'Not set'}`);

        res.json({
            success: true,
            message: 'GoHighLevel integration settings updated successfully',
            settings: {
                ghl_api_key_set: !!client.ghl_api_key,
                ghl_location_id: client.ghl_location_id
            }
        });

    } catch (error) {
        console.error('Error updating CRM settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update CRM settings',
            details: error.message
        });
    }
});

// GET /api/client/crm-credentials/:client_id - Get full CRM credentials (for MCP Copilot auto-load)
router.get('/crm-credentials/:client_id', async (req, res) => {
    try {
        const { client_id } = req.params;
        const { Client } = require('../models');

        const client = await Client.findByPk(client_id, {
            attributes: ['id', 'business_name', 'ghl_api_key', 'ghl_location_id']
        });

        if (!client) {
            return res.status(404).json({
                success: false,
                error: `Client with ID ${client_id} not found`
            });
        }

        // Return full credentials (not masked) for MCP Copilot auto-load
        res.json({
            success: true,
            credentials: {
                gohighlevel: {
                    api_key: client.ghl_api_key || null,
                    location_id: client.ghl_location_id || null,
                    configured: !!(client.ghl_api_key && client.ghl_location_id)
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
                credentials: {
                    gohighlevel: {
                        api_key: null,
                        location_id: null,
                        configured: false
                    }
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

module.exports = router;