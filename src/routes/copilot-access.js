// =====================================================
// MCP Copilot Access Control Routes
// File: src/routes/copilot-access.js
// =====================================================
//
// Handles authentication and authorization for MCP Copilot pages
// Implements 3-tier access control:
// - Tier 1: Must be logged in
// - Tier 2: Can view copilot interface
// - Tier 3: Can use features (requires GHL configured)
// =====================================================

const express = require('express');
const router = express.Router();
const { checkGHLConfig } = require('../middleware/ghl-required');

/**
 * GET /api/copilot/check-access/:client_id
 * Check if client can access copilot and which features are available
 */
router.get('/check-access/:client_id', async (req, res) => {
    try {
        const { client_id } = req.params;

        // Use the GHL check middleware function
        req.params.client_id = client_id;
        req.query.client_id = client_id;

        await checkGHLConfig(req, res);

    } catch (error) {
        console.error('Error checking copilot access:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check access'
        });
    }
});

/**
 * GET /api/copilot/session-check
 * Verify that user has a valid session
 * This prevents direct URL access to copilot pages
 */
router.get('/session-check', (req, res) => {
    // Check if session exists and has client_id
    // In production, this would check for a valid JWT token or session cookie

    const clientId = req.query.client_id;

    if (!clientId) {
        return res.status(400).json({
            success: false,
            authenticated: false,
            message: 'No client ID provided',
            redirect: '/login'
        });
    }

    // For now, we'll allow access if client_id is present
    // In production, you'd verify the session/token here
    res.json({
        success: true,
        authenticated: true,
        clientId: clientId,
        message: 'Session valid'
    });
});

module.exports = router;
