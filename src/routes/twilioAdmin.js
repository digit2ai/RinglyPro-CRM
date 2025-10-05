// =====================================================
// Twilio Number Administration Routes
// File: src/routes/twilioAdmin.js
// =====================================================

const express = require('express');
const router = express.Router();
const TwilioNumberService = require('../services/twilioNumberService');

const twilioService = new TwilioNumberService();

// =====================================================
// CRITICAL ENDPOINTS FOR NUMBER MANAGEMENT
// =====================================================

/**
 * POST /api/twilio/purchase-number
 * Purchase and auto-configure a new phone number for a client
 * ⚠️ CRITICAL: Automatically sets up statusCallback for credit tracking
 */
router.post('/purchase-number', async (req, res) => {
    try {
        const { areaCode, clientId } = req.body;

        if (!clientId) {
            return res.status(400).json({
                success: false,
                error: 'Client ID is required'
            });
        }

        console.log(`📞 Purchasing new number for client ${clientId}...`);

        const result = await twilioService.purchaseAndConfigureNumber({
            areaCode,
            clientId
        });

        res.json({
            success: true,
            message: 'Phone number purchased and configured successfully',
            data: result
        });

    } catch (error) {
        console.error('Error purchasing number:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/twilio/configure-existing
 * Fix an existing number that's missing statusCallback configuration
 * ⚠️ Use this to repair numbers that are losing money
 */
router.post('/configure-existing', async (req, res) => {
    try {
        const { phoneNumberSid, clientId } = req.body;

        if (!phoneNumberSid) {
            return res.status(400).json({
                success: false,
                error: 'Phone number SID is required'
            });
        }

        console.log(`🔧 Configuring existing number: ${phoneNumberSid}`);

        const result = await twilioService.configureExistingNumber(
            phoneNumberSid,
            clientId || 1
        );

        res.json({
            success: true,
            message: 'Phone number configured successfully - credits will now be tracked!',
            data: result
        });

    } catch (error) {
        console.error('Error configuring number:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/twilio/verify/:sid
 * Verify if a phone number has proper configuration
 */
router.get('/verify/:sid', async (req, res) => {
    try {
        const { sid } = req.params;

        const verification = await twilioService.verifyNumberConfiguration(sid);

        res.json({
            success: true,
            data: verification
        });

    } catch (error) {
        console.error('Error verifying number:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/twilio/audit
 * Audit ALL phone numbers - find misconfigured numbers losing money
 * ⚠️ CRITICAL: Run this regularly to catch configuration issues
 */
router.get('/audit', async (req, res) => {
    try {
        console.log('🔍 Starting phone number audit...');

        const audit = await twilioService.auditAllNumbers();

        // Log critical issues
        if (audit.misconfigured > 0) {
            console.log(`⚠️  CRITICAL: ${audit.misconfigured} numbers are misconfigured!`);
            console.log('💰 You are losing money on these calls!');
        }

        res.json({
            success: true,
            message: audit.misconfigured > 0
                ? `⚠️ WARNING: ${audit.misconfigured} numbers need configuration`
                : `✅ All ${audit.total} numbers are properly configured`,
            data: audit
        });

    } catch (error) {
        console.error('Error auditing numbers:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/twilio/fix-current-number
 * Quick fix for the current RinglyPro number (+18886103810)
 */
router.post('/fix-current-number', async (req, res) => {
    try {
        // This is your current number - we need to fix it ASAP
        // You'll need to get the SID from Twilio console first

        console.log('🔧 Fixing current RinglyPro number configuration...');

        // First, get all numbers to find the current one
        const audit = await twilioService.auditAllNumbers();

        const currentNumber = audit.numbers.find(
            n => n.phoneNumber === '+18886103810'
        );

        if (!currentNumber) {
            return res.status(404).json({
                success: false,
                error: 'Current number not found in Twilio account'
            });
        }

        if (currentNumber.isConfiguredCorrectly) {
            return res.json({
                success: true,
                message: 'Number is already configured correctly ✅',
                data: currentNumber
            });
        }

        // Fix the configuration
        const result = await twilioService.configureExistingNumber(
            currentNumber.sid,
            1
        );

        res.json({
            success: true,
            message: '✅ Current number fixed! Credits will now be deducted properly.',
            data: result
        });

    } catch (error) {
        console.error('Error fixing current number:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
