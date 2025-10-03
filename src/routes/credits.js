// =====================================================
// RinglyPro Credit System API Routes
// File: src/routes/credits.js
// =====================================================

const express = require('express');
const router = express.Router();
const CreditSystem = require('../services/creditSystem');
const { authenticateAndGetClient } = require('../middleware/auth');

// Conditional Stripe initialization
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} else {
    console.log('Stripe not configured in credits routes - payment features disabled');
}

// Initialize credit system service
const creditSystem = new CreditSystem();

// =====================================================
// USER-AUTHENTICATED API ENDPOINTS
// =====================================================

// GET /api/credits/balance - Get current balance and usage for authenticated user
router.get('/balance', authenticateAndGetClient, async (req, res) => {
    try {
        const creditData = await creditSystem.getClientCreditSummary(req.clientId);
        
        if (!creditData) {
            return res.status(404).json({ error: 'Client not found' });
        }
        
        res.json({
            success: true,
            data: {
                clientId: creditData.client_id,
                businessName: creditData.business_name,
                balance: parseFloat(creditData.balance),
                freeMinutesUsed: creditData.free_minutes_used,
                freeMinutesRemaining: creditData.free_minutes_remaining,
                totalMinutesUsed: creditData.total_minutes_used,
                monthlyFreeMinutes: creditData.monthly_free_minutes,
                perMinuteRate: parseFloat(creditData.per_minute_rate),
                estimatedMinutesRemaining: creditData.estimated_minutes_remaining,
                isLowBalance: creditData.is_low_balance,
                needsMonthlyReset: creditData.needs_monthly_reset,
                lastUsageDate: creditData.last_usage_date,
                freeMinutesResetDate: creditData.free_minutes_reset_date,
                monthlySpend: await creditSystem.getMonthlySpend(req.clientId)
            }
        });
    } catch (error) {
        console.error('Error fetching credit balance:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

// GET /api/credits/usage - Get usage history with pagination for authenticated user
router.get('/usage', authenticateAndGetClient, async (req, res) => {
    try {
        const { page = 1, limit = 50, type, startDate, endDate } = req.query;
        
        const usageData = await creditSystem.getUsageHistory(req.clientId, {
            page: parseInt(page),
            limit: parseInt(limit),
            type,
            startDate,
            endDate
        });
        
        res.json({
            success: true,
            data: usageData.records,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: usageData.total,
                pages: Math.ceil(usageData.total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Error fetching usage history:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

// POST /api/credits/reload - Initiate credit reload for authenticated user
router.post('/reload', authenticateAndGetClient, async (req, res) => {
    try {
        const { amount } = req.body;
        
        // Check if Stripe is configured
        if (!stripe) {
            return res.status(503).json({ 
                error: 'Payment processing not available. Stripe not configured.' 
            });
        }
        
        // Validate amount
        if (!amount || amount < 1 || amount > 500) {
            return res.status(400).json({ 
                error: 'Amount must be between $1 and $500' 
            });
        }
        
        const result = await creditSystem.initiateReload(req.clientId, amount);
        
        res.json({
            success: true,
            clientSecret: result.clientSecret,
            transactionId: result.transactionId,
            amount: result.amount
        });
    } catch (error) {
        console.error('Error initiating reload:', error);
        res.status(500).json({ 
            error: error.message || 'Internal server error' 
        });
    }
});

// GET /api/credits/transactions - Payment history for authenticated user
router.get('/transactions', authenticateAndGetClient, async (req, res) => {
    try {
        const { page = 1, limit = 20, status } = req.query;
        
        const transactions = await creditSystem.getPaymentHistory(req.clientId, {
            page: parseInt(page),
            limit: parseInt(limit),
            status
        });
        
        res.json({
            success: true,
            data: transactions.records,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: transactions.total,
                pages: Math.ceil(transactions.total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Error fetching payment history:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

// POST /api/credits/auto-reload - Configure auto-reload for authenticated user
router.post('/auto-reload', authenticateAndGetClient, async (req, res) => {
    try {
        const { enabled, amount, threshold, paymentMethodId } = req.body;
        
        // Check if Stripe is configured for auto-reload
        if (enabled && !stripe) {
            return res.status(503).json({ 
                error: 'Auto-reload not available. Stripe not configured.' 
            });
        }
        
        const result = await creditSystem.configureAutoReload(req.clientId, {
            enabled,
            amount,
            threshold,
            paymentMethodId
        });
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error configuring auto-reload:', error);
        res.status(500).json({ 
            error: error.message || 'Internal server error' 
        });
    }
});

// GET /api/credits/notifications - Get active notifications for authenticated user
router.get('/notifications', authenticateAndGetClient, async (req, res) => {
    try {
        const { active = true } = req.query;
        
        const notifications = await creditSystem.getNotifications(req.clientId, { active });
        
        res.json({
            success: true,
            data: notifications
        });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

// GET /api/credits/analytics - Usage analytics and reporting for authenticated user
router.get('/analytics', authenticateAndGetClient, async (req, res) => {
    try {
        const { period = '30d' } = req.query;
        
        const analytics = await creditSystem.getUsageAnalytics(req.clientId, period);
        
        res.json({
            success: true,
            data: analytics
        });
    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

// =====================================================
// PUBLIC/INTERNAL ENDPOINTS (No authentication)
// =====================================================

// POST /api/credits/webhooks/stripe - Stripe payment webhooks
router.post('/webhooks/stripe', express.raw({type: 'application/json'}), async (req, res) => {
    // Check if Stripe is configured
    if (!stripe) {
        console.log('Stripe webhook received but Stripe not configured');
        return res.status(503).json({ error: 'Stripe not configured' });
    }

    const sig = req.headers['stripe-signature'];
    let event;
    
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    try {
        await creditSystem.handleStripeWebhook(event);
        res.json({ received: true });
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// POST /api/credits/track-usage - Track call/SMS usage (internal endpoint)
router.post('/track-usage', async (req, res) => {
    try {
        const { clientId, callSid, messageSid, durationSeconds, usageType } = req.body;
        
        // Validate required fields
        if (!clientId || !usageType || (usageType === 'voice_call' && !durationSeconds)) {
            return res.status(400).json({ 
                error: 'Missing required fields' 
            });
        }
        
        const usageRecord = await creditSystem.trackUsage(clientId, {
            callSid,
            messageSid,
            durationSeconds,
            usageType
        });
        
        res.json({
            success: true,
            data: {
                usageRecordId: usageRecord.id,
                cost: usageRecord.cost,
                balanceAfter: usageRecord.balance_after,
                freeMinutesAfter: usageRecord.free_minutes_after,
                chargedFrom: usageRecord.charged_from
            }
        });
    } catch (error) {
        console.error('Error tracking usage:', error);
        res.status(500).json({ 
            error: error.message || 'Internal server error' 
        });
    }
});

// =====================================================
// TESTING ENDPOINTS (Development Only)
// =====================================================

// GET /api/credits/test/client/:clientId - Test endpoint to get client info
router.get('/test/client/:clientId', async (req, res) => {
    try {
        const { clientId } = req.params;
        
        // Get client info including user_id
        const clientInfo = await creditSystem.getClientInfo(clientId);
        const creditData = await creditSystem.getClientCreditSummary(clientId);
        
        if (!clientInfo || !creditData) {
            return res.status(404).json({ 
                error: 'Client not found',
                clientId: clientId
            });
        }
        
        // Combine client info with credit data
        const responseData = {
            ...creditData,
            user_id: clientInfo.user_id
        };
        
        res.json({
            success: true,
            message: 'Credit system is working!',
            data: responseData,
            stripeConfigured: !!stripe,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in test endpoint:', error);
        res.status(500).json({ 
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// POST /api/credits/test/simulate-usage - Simulate usage for testing
router.post('/test/simulate-usage', async (req, res) => {
    try {
        const { clientId, durationSeconds = 60 } = req.body;
        
        if (!clientId) {
            return res.status(400).json({ error: 'clientId is required' });
        }
        
        // Simulate a voice call
        const usageRecord = await creditSystem.trackUsage(clientId, {
            callSid: `TEST_${Date.now()}`,
            durationSeconds: parseInt(durationSeconds),
            usageType: 'voice_call'
        });
        
        res.json({
            success: true,
            message: 'Usage simulated successfully',
            data: usageRecord
        });
    } catch (error) {
        console.error('Error simulating usage:', error);
        res.status(500).json({ 
            error: error.message 
        });
    }
});

// POST /api/credits/test/add-credits - Add test credits (for testing without Stripe)
router.post('/test/add-credits', async (req, res) => {
    try {
        const { clientId, amount = 10.00 } = req.body;
        
        if (!clientId) {
            return res.status(400).json({ error: 'clientId is required' });
        }
        
        // Add test credits
        const result = await creditSystem.addTestCredits(clientId, parseFloat(amount));
        
        res.json({
            success: true,
            message: 'Test credits added successfully',
            data: result
        });
    } catch (error) {
        console.error('Error adding test credits:', error);
        res.status(500).json({ 
            error: error.message 
        });
    }
});

// =====================================================
// TEMPORARY ADMIN ROUTES (Remove after fixing pricing)
// =====================================================

// POST /api/credits/admin/fix-pricing - Temporary admin route to fix pricing
router.post('/admin/fix-pricing', async (req, res) => {
    try {
        const result = await creditSystem.pool.query("UPDATE clients SET per_minute_rate = 0.200 WHERE per_minute_rate = 0.100;");
        const check = await creditSystem.pool.query("SELECT id, business_name, per_minute_rate FROM clients;");
        
        res.json({
            success: true,
            message: `Updated ${result.rowCount} row(s) - Pricing fixed from $0.10 to $0.20/minute`,
            current_rates: check.rows,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error fixing pricing:', error);
        res.status(500).json({ 
            error: error.message,
            message: 'Failed to update pricing in database'
        });
    }
});

module.exports = router;