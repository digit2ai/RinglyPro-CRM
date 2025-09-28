const express = require('express');
const router = express.Router();
const { Client } = require('../models');
const { authenticateToken } = require('../middleware/auth');

// Carrier forwarding code templates
const CARRIER_CODES = {
    'att': {
        name: 'AT&T',
        activate: '*004*{rachel_number}*11#',
        deactivate: '#004#',
        description: 'Forwards calls when busy, no answer, or unreachable'
    },
    'tmobile': {
        name: 'T-Mobile', 
        activate: '**004*{rachel_number}*11#',
        deactivate: '##004#',
        description: 'All conditional forwarding (no answer, busy, unreachable)'
    },
    'verizon': {
        name: 'Verizon',
        activate: '*71{rachel_number}',
        deactivate: '*73',
        description: 'No answer/busy conditional forwarding'
    },
    'sprint': {
        name: 'Sprint/T-Mobile',
        activate: '*004*{rachel_number}*11#', 
        deactivate: '#004#',
        description: 'Conditional forwarding for all scenarios'
    }
};

// GET /api/call-forwarding/setup
router.get('/setup', authenticateToken, async (req, res) => {
    try {
        const client = await Client.findOne({
            where: { user_id: req.user.id },
            attributes: ['id', 'business_name', 'business_phone', 'ringlypro_number', 'rachel_enabled']
        });

        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }

        // Generate forwarding codes for all carriers
        const forwardingInstructions = Object.keys(CARRIER_CODES).map(carrier => {
            const config = CARRIER_CODES[carrier];
            return {
                carrier: carrier,
                name: config.name,
                description: config.description,
                activate_code: config.activate.replace('{rachel_number}', client.ringlypro_number),
                deactivate_code: config.deactivate,
                instructions: {
                    activate: `Dial ${config.activate.replace('{rachel_number}', client.ringlypro_number)} then press call`,
                    deactivate: `Dial ${config.deactivate} then press call`
                }
            };
        });

        res.json({
            success: true,
            client: {
                business_name: client.business_name,
                business_phone: client.business_phone,
                rachel_number: client.ringlypro_number,
                rachel_enabled: client.rachel_enabled
            },
            forwarding_setup: forwardingInstructions,
            setup_notes: [
                "These codes work when dialed from your business phone",
                "Forwarding activates after 3-4 rings (carrier dependent)", 
                "Test by calling your business number and not answering",
                "Deactivate anytime using the deactivate code"
            ]
        });

    } catch (error) {
        console.error('Call forwarding setup error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate forwarding setup',
            details: error.message
        });
    }
});

// POST /api/call-forwarding/test
router.post('/test', authenticateToken, async (req, res) => {
    try {
        const { test_number } = req.body;
        
        const client = await Client.findOne({
            where: { user_id: req.user.id }
        });

        if (!client) {
            return res.status(404).json({
                success: false, 
                error: 'Client not found'
            });
        }

        // Log test attempt
        console.log(`Forwarding test: ${test_number} → ${client.ringlypro_number} for client ${client.id}`);

        res.json({
            success: true,
            message: `Test call instructions sent`,
            test_steps: [
                `Call ${client.business_phone} from ${test_number}`,
                "Let it ring 4+ times without answering",
                `Call should forward to Rachel at ${client.ringlypro_number}`,
                "Rachel will identify your business and offer appointments"
            ]
        });

    } catch (error) {
        console.error('Call forwarding test error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to initiate test'
        });
    }
});

module.exports = router;