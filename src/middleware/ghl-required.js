// =====================================================
// CRM Configuration Requirement Middleware
// File: src/middleware/ghl-required.js
// =====================================================
//
// Checks if a client has ANY CRM integration configured:
// - GoHighLevel (GHL)
// - HubSpot
// - Vagaro
//
// Required for: CRM AI Agent, Social Media, Business Collector,
// Outbound Calling, Prospect Manager
// =====================================================

const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

/**
 * Middleware to check if client has ANY CRM configured
 * Use this for API endpoints that require CRM integration
 */
const requireGHLConfig = async (req, res, next) => {
    try {
        // Get clientId from request (can come from different sources)
        const clientId = req.body.clientId || req.query.client_id || req.params.client_id || req.user?.clientId;

        if (!clientId) {
            return res.status(400).json({
                success: false,
                error: 'Client ID is required',
                crm_required: true,
                configured: false
            });
        }

        // Check if client has ANY CRM credentials configured
        const result = await sequelize.query(
            `SELECT id, business_name,
                    ghl_api_key, ghl_location_id,
                    hubspot_api_key, hubspot_meeting_slug,
                    booking_system, settings
             FROM clients WHERE id = :clientId`,
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
                crm_required: true,
                configured: false
            });
        }

        // Check for ANY CRM configuration
        const hasGHL = !!(client.ghl_api_key && client.ghl_location_id);
        const hasHubSpot = !!(client.hubspot_api_key);
        const hasVagaro = !!(client.settings?.integration?.vagaro?.enabled &&
                           client.settings?.integration?.vagaro?.merchantId);

        const hasCRM = hasGHL || hasHubSpot || hasVagaro;

        if (!hasCRM) {
            return res.status(403).json({
                success: false,
                error: 'CRM configuration required',
                message: 'You must configure at least one CRM integration (GoHighLevel, HubSpot, or Vagaro) in Settings to use this feature.',
                crm_required: true,
                configured: false,
                upgrade_needed: true
            });
        }

        // CRM is configured - allow request to proceed
        req.crmConfigured = true;
        req.ghlConfigured = hasGHL; // Keep for backwards compatibility
        req.crmType = hasGHL ? 'ghl' : (hasHubSpot ? 'hubspot' : 'vagaro');

        if (hasGHL) {
            req.ghlCredentials = {
                apiKey: client.ghl_api_key,
                locationId: client.ghl_location_id
            };
        }

        next();

    } catch (error) {
        console.error('Error checking CRM configuration:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to verify CRM configuration',
            crm_required: true,
            configured: false
        });
    }
};

/**
 * Check CRM configuration status (doesn't block request)
 * Returns configuration status for UI to display
 * Checks GHL, HubSpot, and Vagaro
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
            `SELECT id, business_name,
                    ghl_api_key, ghl_location_id,
                    hubspot_api_key, hubspot_meeting_slug,
                    booking_system, settings
             FROM clients WHERE id = :clientId`,
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

        // Check each CRM integration
        const hasGHL = !!(client.ghl_api_key && client.ghl_location_id);
        const hasHubSpot = !!(client.hubspot_api_key);
        const hasVagaro = !!(client.settings?.integration?.vagaro?.enabled &&
                           client.settings?.integration?.vagaro?.merchantId);

        const hasCRM = hasGHL || hasHubSpot || hasVagaro;

        // Determine active CRM type
        let activeCRM = 'none';
        if (hasGHL) activeCRM = 'ghl';
        else if (hasHubSpot) activeCRM = 'hubspot';
        else if (hasVagaro) activeCRM = 'vagaro';

        // Build list of configured integrations
        const configuredIntegrations = [];
        if (hasGHL) configuredIntegrations.push('ghl');
        if (hasHubSpot) configuredIntegrations.push('hubspot');
        if (hasVagaro) configuredIntegrations.push('vagaro');

        // Build response object
        const response = {
            success: true,
            clientId: client.id,
            businessName: client.business_name,
            // Keep ghl_configured for backwards compatibility
            ghl_configured: hasCRM,
            // New fields for multi-CRM support
            crm_configured: hasCRM,
            active_crm: activeCRM,
            integrations: {
                ghl: hasGHL,
                hubspot: hasHubSpot,
                vagaro: hasVagaro
            },
            configured_integrations: configuredIntegrations,
            features_available: hasCRM ? [
                'crm_ai_agent',
                'social_media',
                'business_collector',
                'outbound_calling',
                'prospect_manager'
            ] : [],
            upgrade_needed: !hasCRM
        };

        // Include CRM credentials for MCP connection
        // Note: These credentials are needed by the MCP proxy to connect

        // GoHighLevel credentials
        if (hasGHL) {
            response.ghl_credentials = {
                apiKey: client.ghl_api_key,
                locationId: client.ghl_location_id
            };
        }

        // HubSpot credentials
        if (hasHubSpot) {
            response.hubspot_credentials = {
                accessToken: client.hubspot_api_key
            };
        }

        // Vagaro credentials
        if (hasVagaro && client.settings?.integration?.vagaro) {
            const vagaroSettings = client.settings.integration.vagaro;
            response.vagaro_credentials = {
                clientId: vagaroSettings.clientId,
                clientSecretKey: vagaroSettings.clientSecretKey,
                merchantId: vagaroSettings.merchantId,
                region: vagaroSettings.region || 'us01'
            };
        }

        res.json(response);

    } catch (error) {
        console.error('Error checking CRM status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check CRM configuration'
        });
    }
};

module.exports = {
    requireGHLConfig,
    checkGHLConfig
};
