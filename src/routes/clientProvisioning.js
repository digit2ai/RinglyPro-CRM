// routes/clientProvisioning.js
const express = require('express');
const { Pool } = require('pg');
const TwilioNumberProvisioning = require('../services/twilioNumberProvisioning');

const router = express.Router();

// Initialize Twilio provisioning service
const twilioProvisioning = new TwilioNumberProvisioning(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN,
    process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com'
);

// Initialize database pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

/**
 * POST /api/clients/provision
 * Create a new client with automatic Twilio number provisioning
 */
router.post('/provision', async (req, res) => {
    try {
        const {
            business_name,
            email,
            user_id,
            areaCode = null,
            tollFree = false,
            custom_greeting = null
        } = req.body;

        // Validation
        if (!business_name) {
            return res.status(400).json({
                error: 'Business name is required'
            });
        }

        if (!email) {
            return res.status(400).json({
                error: 'Email is required'
            });
        }

        console.log(`🚀 Provisioning new client: ${business_name}`);
        console.log(`   Email: ${email}`);
        console.log(`   Area code: ${areaCode || 'any'}`);
        console.log(`   Toll-free: ${tollFree}`);

        // Step 1: Provision Twilio number
        console.log(`\n📞 Step 1: Provisioning Twilio number...`);
        const numberDetails = await twilioProvisioning.provisionNumberForClient({
            businessName: business_name,
            areaCode,
            tollFree
        });

        console.log(`✅ Number provisioned: ${numberDetails.phoneNumber}`);

        // Step 2: Create client in database
        console.log(`\n💾 Step 2: Creating client in database...`);
        const insertQuery = `
            INSERT INTO clients (
                business_name,
                email,
                user_id,
                ringlypro_number,
                twilio_number_sid,
                custom_greeting,
                rachel_enabled,
                active,
                created_at,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, true, true, NOW(), NOW())
            RETURNING *
        `;

        const result = await pool.query(insertQuery, [
            business_name,
            email,
            user_id || null,
            numberDetails.phoneNumber,
            numberDetails.sid,
            custom_greeting
        ]);

        const client = result.rows[0];

        console.log(`✅ Client created in database`);
        console.log(`   Client ID: ${client.id}`);
        console.log(`   Business: ${client.business_name}`);
        console.log(`   Number: ${client.ringlypro_number}`);
        console.log(`   Rachel enabled: ${client.rachel_enabled}`);

        // Step 3: Return success response
        res.status(201).json({
            success: true,
            message: 'Client provisioned successfully',
            client: {
                id: client.id,
                business_name: client.business_name,
                email: client.email,
                ringlypro_number: client.ringlypro_number,
                twilio_number_sid: client.twilio_number_sid,
                rachel_enabled: client.rachel_enabled,
                active: client.active,
                voice_webhook: numberDetails.voiceUrl,
                sms_webhook: numberDetails.smsUrl
            },
            number_details: {
                phoneNumber: numberDetails.phoneNumber,
                friendlyName: numberDetails.friendlyName,
                locality: numberDetails.locality,
                region: numberDetails.region,
                capabilities: numberDetails.capabilities
            }
        });

    } catch (error) {
        console.error('❌ Error provisioning client:', error);

        // If we created a number but DB insert failed, we should release it
        // (implement cleanup logic if needed)

        res.status(500).json({
            error: 'Failed to provision client',
            message: error.message
        });
    }
});

/**
 * GET /api/clients/:clientId/number
 * Get Twilio number details for a client
 */
router.get('/:clientId/number', async (req, res) => {
    try {
        const { clientId } = req.params;

        // Get client from database
        const clientResult = await pool.query(
            'SELECT * FROM clients WHERE id = $1',
            [clientId]
        );

        if (clientResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Client not found'
            });
        }

        const client = clientResult.rows[0];

        if (!client.twilio_number_sid) {
            return res.status(404).json({
                error: 'No Twilio number associated with this client'
            });
        }

        // Get number details from Twilio
        const numberDetails = await twilioProvisioning.getNumberDetails(
            client.twilio_number_sid
        );

        res.json({
            client: {
                id: client.id,
                business_name: client.business_name,
                ringlypro_number: client.ringlypro_number
            },
            number: numberDetails
        });

    } catch (error) {
        console.error('❌ Error fetching number details:', error);
        res.status(500).json({
            error: 'Failed to fetch number details',
            message: error.message
        });
    }
});

/**
 * PUT /api/clients/:clientId/number/webhooks
 * Update webhooks for a client's number
 */
router.put('/:clientId/number/webhooks', async (req, res) => {
    try {
        const { clientId } = req.params;

        // Get client from database
        const clientResult = await pool.query(
            'SELECT * FROM clients WHERE id = $1',
            [clientId]
        );

        if (clientResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Client not found'
            });
        }

        const client = clientResult.rows[0];

        if (!client.twilio_number_sid) {
            return res.status(404).json({
                error: 'No Twilio number associated with this client'
            });
        }

        // Update webhooks
        const updatedNumber = await twilioProvisioning.updateWebhooks(
            client.twilio_number_sid
        );

        res.json({
            success: true,
            message: 'Webhooks updated successfully',
            number: updatedNumber
        });

    } catch (error) {
        console.error('❌ Error updating webhooks:', error);
        res.status(500).json({
            error: 'Failed to update webhooks',
            message: error.message
        });
    }
});

/**
 * POST /api/clients/search-numbers
 * Search for available Twilio numbers
 */
router.post('/search-numbers', async (req, res) => {
    try {
        const {
            areaCode = null,
            country = 'US',
            tollFree = false,
            limit = 10
        } = req.body;

        const numbers = await twilioProvisioning.searchAvailableNumbers({
            areaCode,
            country,
            tollFree,
            limit
        });

        res.json({
            success: true,
            count: numbers.length,
            numbers
        });

    } catch (error) {
        console.error('❌ Error searching numbers:', error);
        res.status(500).json({
            error: 'Failed to search for numbers',
            message: error.message
        });
    }
});

/**
 * GET /api/clients/numbers/all
 * List all Twilio numbers in the account
 */
router.get('/numbers/all', async (req, res) => {
    try {
        const numbers = await twilioProvisioning.listAllNumbers();

        res.json({
            success: true,
            count: numbers.length,
            numbers
        });

    } catch (error) {
        console.error('❌ Error listing numbers:', error);
        res.status(500).json({
            error: 'Failed to list numbers',
            message: error.message
        });
    }
});

module.exports = router;
