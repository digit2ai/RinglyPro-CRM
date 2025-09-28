const express = require('express');
const router = express.Router();

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

module.exports = router;