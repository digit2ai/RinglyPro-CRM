const express = require('express');
const router = express.Router();
const { Client, sequelize } = require('../models');
const { authenticateToken } = require('../middleware/auth');

// POST /api/forwarding-status/activate
router.post('/activate', authenticateToken, async (req, res) => {
    try {
        const { carrier, forwarding_type, activation_code } = req.body;
        
        const client = await Client.findOne({
            where: { user_id: req.user.id }
        });

        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }

        // Update client forwarding status
        await client.update({
            forwarding_active: true,
            forwarding_carrier: carrier,
            forwarding_type: forwarding_type,
            forwarding_activated_at: new Date(),
            forwarding_deactivated_at: null
        });

        // Log the activation
        await sequelize.query(`
            INSERT INTO forwarding_logs (client_id, action, carrier, forwarding_type, activation_code, notes)
            VALUES (:client_id, 'activated', :carrier, :forwarding_type, :activation_code, :notes)
        `, {
            replacements: {
                client_id: client.id,
                carrier: carrier,
                forwarding_type: forwarding_type,
                activation_code: activation_code,
                notes: `Client activated ${carrier} forwarding using ${forwarding_type}`
            }
        });

        res.json({
            success: true,
            message: 'Forwarding status updated to active',
            forwarding_status: {
                active: true,
                carrier: carrier,
                type: forwarding_type,
                activated_at: client.forwarding_activated_at
            }
        });

    } catch (error) {
        console.error('Forwarding activation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update forwarding status',
            details: error.message
        });
    }
});

// POST /api/forwarding-status/deactivate
router.post('/deactivate', authenticateToken, async (req, res) => {
    try {
        const { deactivation_code } = req.body;
        
        const client = await Client.findOne({
            where: { user_id: req.user.id }
        });

        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }

        // Update client forwarding status
        await client.update({
            forwarding_active: false,
            forwarding_deactivated_at: new Date()
        });

        // Log the deactivation
        await sequelize.query(`
            INSERT INTO forwarding_logs (client_id, action, carrier, forwarding_type, activation_code, notes)
            VALUES (:client_id, 'deactivated', :carrier, :forwarding_type, :deactivation_code, :notes)
        `, {
            replacements: {
                client_id: client.id,
                carrier: client.forwarding_carrier,
                forwarding_type: client.forwarding_type,
                deactivation_code: deactivation_code,
                notes: `Client deactivated ${client.forwarding_carrier} forwarding`
            }
        });

        res.json({
            success: true,
            message: 'Forwarding status updated to inactive',
            forwarding_status: {
                active: false,
                deactivated_at: client.forwarding_deactivated_at
            }
        });

    } catch (error) {
        console.error('Forwarding deactivation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update forwarding status',
            details: error.message
        });
    }
});

// GET /api/forwarding-status
router.get('/', authenticateToken, async (req, res) => {
    try {
        const client = await Client.findOne({
            where: { user_id: req.user.id },
            attributes: [
                'id', 'business_name', 'business_phone', 'ringlypro_number',
                'rachel_enabled', 'forwarding_active', 'forwarding_carrier',
                'forwarding_type', 'forwarding_activated_at', 'forwarding_deactivated_at'
            ]
        });

        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }

        // Get recent forwarding logs
        const logs = await sequelize.query(`
            SELECT action, carrier, forwarding_type, activation_code, notes, created_at
            FROM forwarding_logs 
            WHERE client_id = :client_id 
            ORDER BY created_at DESC 
            LIMIT 10
        `, {
            replacements: { client_id: client.id },
            type: sequelize.QueryTypes.SELECT
        });

        res.json({
            success: true,
            client: {
                business_name: client.business_name,
                business_phone: client.business_phone,
                rachel_number: client.ringlypro_number,
                rachel_enabled: client.rachel_enabled
            },
            forwarding_status: {
                active: client.forwarding_active,
                carrier: client.forwarding_carrier,
                type: client.forwarding_type,
                activated_at: client.forwarding_activated_at,
                deactivated_at: client.forwarding_deactivated_at
            },
            recent_activity: logs
        });

    } catch (error) {
        console.error('Forwarding status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get forwarding status',
            details: error.message
        });
    }
});

module.exports = router;