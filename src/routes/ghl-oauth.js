const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const { GHLIntegration, Client, User } = require('../models');

/**
 * GoHighLevel OAuth Integration Routes
 * Handles multi-tenant OAuth flow for GHL integration
 */

// OAuth Configuration
const GHL_OAUTH_CONFIG = {
    clientId: process.env.GHL_CLIENT_ID,
    clientSecret: process.env.GHL_CLIENT_SECRET,
    redirectUri: process.env.GHL_REDIRECT_URI || `${process.env.APP_URL}/api/ghl-oauth/callback`,
    authorizationUrl: 'https://marketplace.gohighlevel.com/oauth/chooselocation',
    tokenUrl: 'https://services.leadconnectorhq.com/oauth/token',
    scopes: [
        'conversations/message.write',
        'conversations/message.readonly',
        'contacts.write',
        'contacts.readonly',
        'opportunities.write',
        'opportunities.readonly',
        'calendars.write',
        'calendars.readonly',
        'businesses.write',
        'businesses.readonly',
        'conversations.write',
        'conversations.readonly'
    ].join(' ')
};

// In-memory store for OAuth states (use Redis in production)
const oauthStates = new Map();

/**
 * Step 1: Initiate OAuth Flow
 * GET /api/ghl-oauth/authorize?clientId=123
 */
router.get('/authorize', async (req, res) => {
    try {
        const { clientId } = req.query;

        if (!clientId) {
            return res.status(400).json({
                success: false,
                error: 'Client ID is required'
            });
        }

        // Verify client exists
        const client = await Client.findByPk(clientId);
        if (!client) {
            return res.status(404).json({
                success: false,
                error: 'Client not found'
            });
        }

        // Generate secure state token
        const state = crypto.randomBytes(32).toString('hex');

        // Store state with client info (expires in 10 minutes)
        oauthStates.set(state, {
            clientId: clientId,
            timestamp: Date.now(),
            expiresAt: Date.now() + 10 * 60 * 1000
        });

        // Build authorization URL
        const authUrl = new URL(GHL_OAUTH_CONFIG.authorizationUrl);
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('client_id', GHL_OAUTH_CONFIG.clientId);
        authUrl.searchParams.append('redirect_uri', GHL_OAUTH_CONFIG.redirectUri);
        authUrl.searchParams.append('scope', GHL_OAUTH_CONFIG.scopes);
        authUrl.searchParams.append('state', state);

        console.log('🔐 OAuth authorize initiated for client:', clientId);
        console.log('🔗 Redirect URL:', authUrl.toString());

        // Redirect user to GHL OAuth page
        res.redirect(authUrl.toString());

    } catch (error) {
        console.error('❌ OAuth authorize error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to initiate OAuth flow',
            message: error.message
        });
    }
});

/**
 * Step 2: OAuth Callback
 * GET /api/ghl-oauth/callback?code=XXX&state=YYY
 */
router.get('/callback', async (req, res) => {
    try {
        const { code, state } = req.query;

        console.log('📥 OAuth callback received');
        console.log('  Code:', code ? code.substring(0, 20) + '...' : 'missing');
        console.log('  State:', state ? state.substring(0, 20) + '...' : 'missing');

        // Validate code and state
        if (!code || !state) {
            throw new Error('Missing authorization code or state');
        }

        // Verify state (CSRF protection)
        const stateData = oauthStates.get(state);
        if (!stateData) {
            throw new Error('Invalid or expired state token');
        }

        // Check if state expired
        if (Date.now() > stateData.expiresAt) {
            oauthStates.delete(state);
            throw new Error('OAuth state expired');
        }

        const { clientId } = stateData;

        // Clean up state
        oauthStates.delete(state);

        console.log('✅ State validated for client:', clientId);

        // Exchange code for access token
        console.log('🔄 Exchanging code for access token...');
        const tokenResponse = await axios.post(GHL_OAUTH_CONFIG.tokenUrl, {
            client_id: GHL_OAUTH_CONFIG.clientId,
            client_secret: GHL_OAUTH_CONFIG.clientSecret,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: GHL_OAUTH_CONFIG.redirectUri
        }, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const {
            access_token,
            refresh_token,
            token_type,
            expires_in,
            scope,
            locationId,
            companyId,
            userType
        } = tokenResponse.data;

        console.log('✅ Access token received');
        console.log('  Location ID:', locationId);
        console.log('  Company ID:', companyId);
        console.log('  User Type:', userType);
        console.log('  Expires in:', expires_in, 'seconds');
        console.log('  Scopes:', scope);

        // Calculate expiration time
        const expiresAt = expires_in ? new Date(Date.now() + expires_in * 1000) : null;

        // Get location name (optional - fetch from GHL API)
        let locationName = null;
        try {
            const locationInfo = await axios.get(`https://services.leadconnectorhq.com/locations/${locationId}`, {
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                    'Version': '2021-07-28'
                }
            });
            locationName = locationInfo.data.location?.name || locationInfo.data.name;
        } catch (e) {
            console.warn('⚠️ Could not fetch location name:', e.message);
        }

        // Deactivate any existing integrations for this client
        await GHLIntegration.update(
            { is_active: false },
            { where: { client_id: clientId } }
        );

        // Create new integration record
        const integration = await GHLIntegration.create({
            client_id: clientId,
            ghl_location_id: locationId,
            ghl_company_id: companyId,
            access_token: access_token,
            refresh_token: refresh_token,
            token_type: token_type || 'Bearer',
            scope: scope,
            expires_at: expiresAt,
            user_type: userType,
            location_name: locationName,
            is_active: true,
            last_synced_at: new Date()
        });

        console.log('✅ Integration saved to database:', integration.id);

        // Success page (you can customize this)
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>GoHighLevel Connected!</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        margin: 0;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    }
                    .container {
                        background: white;
                        padding: 3rem;
                        border-radius: 1rem;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                        text-align: center;
                        max-width: 500px;
                    }
                    h1 {
                        color: #667eea;
                        margin-bottom: 1rem;
                    }
                    .success-icon {
                        font-size: 4rem;
                        margin-bottom: 1rem;
                    }
                    .info {
                        background: #f7fafc;
                        padding: 1rem;
                        border-radius: 0.5rem;
                        margin: 1rem 0;
                        text-align: left;
                    }
                    .info p {
                        margin: 0.5rem 0;
                        color: #4a5568;
                    }
                    .info strong {
                        color: #2d3748;
                    }
                    button {
                        background: #667eea;
                        color: white;
                        border: none;
                        padding: 0.75rem 2rem;
                        border-radius: 0.5rem;
                        font-size: 1rem;
                        cursor: pointer;
                        margin-top: 1rem;
                    }
                    button:hover {
                        background: #5568d3;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="success-icon">✅</div>
                    <h1>GoHighLevel Connected!</h1>
                    <p>Your GoHighLevel account has been successfully connected to RinglyPro CRM.</p>
                    <div class="info">
                        <p><strong>Location:</strong> ${locationName || locationId}</p>
                        <p><strong>Access:</strong> ${scope ? scope.split(' ').length : 0} permissions granted</p>
                        <p><strong>Status:</strong> Active</p>
                    </div>
                    <p>You can now use all GHL features through RinglyPro:</p>
                    <ul style="text-align: left; color: #4a5568;">
                        <li>Send SMS & Emails</li>
                        <li>Manage Contacts</li>
                        <li>Create Opportunities</li>
                        <li>Schedule Appointments</li>
                    </ul>
                    <button onclick="window.close()">Close Window</button>
                </div>
            </body>
            </html>
        `);

    } catch (error) {
        console.error('❌ OAuth callback error:', error);
        console.error('Error details:', error.response?.data || error.message);

        // Error page
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Connection Failed</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        margin: 0;
                        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                    }
                    .container {
                        background: white;
                        padding: 3rem;
                        border-radius: 1rem;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                        text-align: center;
                        max-width: 500px;
                    }
                    h1 {
                        color: #f5576c;
                        margin-bottom: 1rem;
                    }
                    .error-icon {
                        font-size: 4rem;
                        margin-bottom: 1rem;
                    }
                    .error-message {
                        background: #fff5f5;
                        border-left: 4px solid #f5576c;
                        padding: 1rem;
                        margin: 1rem 0;
                        text-align: left;
                        color: #c53030;
                    }
                    button {
                        background: #f5576c;
                        color: white;
                        border: none;
                        padding: 0.75rem 2rem;
                        border-radius: 0.5rem;
                        font-size: 1rem;
                        cursor: pointer;
                        margin-top: 1rem;
                    }
                    button:hover {
                        background: #e04758;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="error-icon">❌</div>
                    <h1>Connection Failed</h1>
                    <p>We couldn't connect your GoHighLevel account.</p>
                    <div class="error-message">
                        ${error.message}
                    </div>
                    <p>Please try again or contact support if the problem persists.</p>
                    <button onclick="window.close()">Close Window</button>
                </div>
            </body>
            </html>
        `);
    }
});

/**
 * Step 3: Refresh Access Token
 * POST /api/ghl-oauth/refresh/:clientId
 */
router.post('/refresh/:clientId', async (req, res) => {
    try {
        const { clientId } = req.params;

        const integration = await GHLIntegration.findByClient(clientId);
        if (!integration) {
            return res.status(404).json({
                success: false,
                error: 'No active GHL integration found for this client'
            });
        }

        if (!integration.refresh_token) {
            return res.status(400).json({
                success: false,
                error: 'No refresh token available'
            });
        }

        console.log('🔄 Refreshing access token for client:', clientId);

        // Exchange refresh token for new access token
        const tokenResponse = await axios.post(GHL_OAUTH_CONFIG.tokenUrl, {
            client_id: GHL_OAUTH_CONFIG.clientId,
            client_secret: GHL_OAUTH_CONFIG.clientSecret,
            grant_type: 'refresh_token',
            refresh_token: integration.refresh_token
        }, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const {
            access_token,
            refresh_token,
            expires_in
        } = tokenResponse.data;

        // Update integration with new tokens
        const expiresAt = expires_in ? new Date(Date.now() + expires_in * 1000) : null;

        await integration.update({
            access_token: access_token,
            refresh_token: refresh_token || integration.refresh_token, // Keep old if not provided
            expires_at: expiresAt,
            last_synced_at: new Date()
        });

        console.log('✅ Access token refreshed successfully');

        res.json({
            success: true,
            message: 'Token refreshed successfully',
            expiresAt: expiresAt
        });

    } catch (error) {
        console.error('❌ Token refresh error:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to refresh token',
            message: error.response?.data?.message || error.message
        });
    }
});

/**
 * Get Integration Status
 * GET /api/ghl-oauth/status/:clientId
 */
router.get('/status/:clientId', async (req, res) => {
    try {
        const { clientId } = req.params;

        const integration = await GHLIntegration.findByClient(clientId);

        if (!integration) {
            return res.json({
                success: true,
                connected: false,
                message: 'No GHL integration found'
            });
        }

        res.json({
            success: true,
            connected: true,
            integration: {
                locationId: integration.ghl_location_id,
                locationName: integration.location_name,
                companyId: integration.ghl_company_id,
                isExpired: integration.isExpired(),
                needsRefresh: integration.needsRefresh(),
                expiresAt: integration.expires_at,
                lastSynced: integration.last_synced_at,
                scopes: integration.scope ? integration.scope.split(' ') : []
            }
        });

    } catch (error) {
        console.error('❌ Status check error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check integration status',
            message: error.message
        });
    }
});

/**
 * Disconnect Integration
 * DELETE /api/ghl-oauth/disconnect/:clientId
 */
router.delete('/disconnect/:clientId', async (req, res) => {
    try {
        const { clientId } = req.params;

        const integration = await GHLIntegration.findByClient(clientId);
        if (!integration) {
            return res.status(404).json({
                success: false,
                error: 'No active integration found'
            });
        }

        // Deactivate instead of delete (keep history)
        await integration.update({ is_active: false });

        console.log('🔌 GHL integration disconnected for client:', clientId);

        res.json({
            success: true,
            message: 'GHL integration disconnected successfully'
        });

    } catch (error) {
        console.error('❌ Disconnect error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to disconnect integration',
            message: error.message
        });
    }
});

// Cleanup expired states every 15 minutes
setInterval(() => {
    const now = Date.now();
    for (const [state, data] of oauthStates.entries()) {
        if (now > data.expiresAt) {
            oauthStates.delete(state);
        }
    }
}, 15 * 60 * 1000);

module.exports = router;
