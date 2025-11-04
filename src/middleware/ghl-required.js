// =====================================================
// GHL Configuration Requirement Middleware
// File: src/middleware/ghl-required.js
// =====================================================
//
// Checks if a client has GoHighLevel API credentials configured
// Required for: CRM AI Agent, Social Media, Business Collector,
// Outbound Calling, Prospect Manager
// =====================================================

const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

/**
 * Middleware to check if client has GHL configured
 * Use this for API endpoints that require GHL
 */
const requireGHLConfig = async (req, res, next) => {
    try {
        // Get clientId from request (can come from different sources)
        const clientId = req.body.clientId || req.query.client_id || req.params.client_id || req.user?.clientId;

        if (!clientId) {
            return res.status(400).json({
                success: false,
                error: 'Client ID is required',
                ghl_required: true,
                configured: false
            });
        }

        // Check if client has GHL credentials configured
        const result = await sequelize.query(
            'SELECT id, business_name, ghl_api_key, ghl_location_id FROM clients WHERE id = :clientId',
            {
                replacements: { clientId },
                type: QueryTypes.SELECT
            }
        );

        const client = result[0];

        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found',
                ghl_required: true,
                configured: false
            });
        }

        // Check if GHL is configured
        const hasGHL = !!(client.ghl_api_key && client.ghl_location_id);

        if (!hasGHL) {
            return res.status(403).json({
                success: false,
                error: 'GoHighLevel configuration required',
                message: 'You must configure GHL API and Location in Settings to use this feature.',
                ghl_required: true,
                configured: false,
                upgrade_needed: true
            });
        }

        // GHL is configured - allow request to proceed
        req.ghlConfigured = true;
        req.ghlCredentials = {
            apiKey: client.ghl_api_key,
            locationId: client.ghl_location_id
        };

        next();

    } catch (error) {
        console.error('Error checking GHL configuration:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to verify GHL configuration',
            ghl_required: true,
            configured: false
        });
    }
};

/**
 * Check GHL configuration status (doesn't block request)
 * Returns configuration status for UI to display
 */
const checkGHLConfig = async (req, res) => {
    try {
        const clientId = req.query.client_id || req.params.client_id;

        if (!clientId) {
            return res.status(400).json({
                success: false,
                error: 'Client ID is required'
            });
        }

        const result = await sequelize.query(
            'SELECT id, business_name, ghl_api_key, ghl_location_id FROM clients WHERE id = :clientId',
            {
                replacements: { clientId },
                type: QueryTypes.SELECT
            }
        );

        const client = result[0];

        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }

        const hasGHL = !!(client.ghl_api_key && client.ghl_location_id);

        res.json({
            success: true,
            clientId: client.id,
            businessName: client.business_name,
            ghl_configured: hasGHL,
            features_available: hasGHL ? [
                'crm_ai_agent',
                'social_media',
                'business_collector',
                'outbound_calling',
                'prospect_manager'
            ] : [],
            upgrade_needed: !hasGHL
        });

    } catch (error) {
        console.error('Error checking GHL status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check GHL configuration'
        });
    }
};

module.exports = {
    requireGHLConfig,
    checkGHLConfig
};
