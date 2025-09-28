const express = require('express');
const router = express.Router();
const { Client } = require('../models');
const { authenticateToken } = require('../middleware/auth');

// PUT /api/client/rachel-toggle
router.put('/rachel-toggle', authenticateToken, async (req, res) => {
    try {
        const { rachel_enabled } = req.body;
        
        // Validate input
        if (typeof rachel_enabled !== 'boolean') {
            return res.status(400).json({
                success: false,
                error: 'rachel_enabled must be a boolean value'
            });
        }

        // Find client associated with authenticated user
        const client = await Client.findOne({
            where: { user_id: req.user.id }
        });

        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found for this user'
            });
        }

        // Update rachel_enabled status
        await client.update({
            rachel_enabled: rachel_enabled,
            updated_at: new Date()
        });

        // Log the change for audit purposes
        console.log(`Rachel toggle: User ${req.user.id} (Client ${client.id}) set rachel_enabled to ${rachel_enabled}`);

        res.json({
            success: true,
            rachel_enabled: rachel_enabled,
            message: rachel_enabled ? 'Rachel voice assistant enabled' : 'Rachel voice assistant disabled',
            client_id: client.id,
            business_name: client.business_name
        });

    } catch (error) {
        console.error('Rachel toggle error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update Rachel settings',
            details: error.message
        });
    }
});

// GET /api/client/rachel-status
router.get('/rachel-status', authenticateToken, async (req, res) => {
    try {
        const client = await Client.findOne({
            where: { user_id: req.user.id },
            attributes: ['id', 'business_name', 'rachel_enabled', 'business_phone', 'ringlypro_number']
        });

        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found for this user'
            });
        }

        res.json({
            success: true,
            client: {
                id: client.id,
                business_name: client.business_name,
                rachel_enabled: client.rachel_enabled,
                business_phone: client.business_phone,
                ringlypro_number: client.ringlypro_number
            }
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

module.exports = router;