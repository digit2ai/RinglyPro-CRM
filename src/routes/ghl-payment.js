// =====================================================
// GHL Access Payment Routes
// File: src/routes/ghl-payment.js
// =====================================================
//
// Handles Stripe payments for GoHighLevel access subscription
// $40/month recurring subscription
// =====================================================

const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * POST /api/payment/create-ghl-subscription
 * Create Stripe checkout session for GHL access subscription
 */
router.post('/create-ghl-subscription', async (req, res) => {
    try {
        const { clientId, plan, amount } = req.body;

        if (!clientId) {
            return res.status(400).json({
                success: false,
                error: 'Client ID is required'
            });
        }

        // Create Stripe checkout session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'subscription',
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: 'GoHighLevel CRM Integration Access',
                            description: 'Monthly subscription for AI-powered CRM features',
                            images: ['https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/68ec2cfb385c9833a43e685f.png']
                        },
                        recurring: {
                            interval: 'month'
                        },
                        unit_amount: Math.round((amount || 40.00) * 100) // Amount in cents
                    },
                    quantity: 1
                }
            ],
            success_url: `${process.env.APP_URL || 'https://aiagent.ringlypro.com'}/dashboard?client_id=${clientId}&ghl_payment=success#settings`,
            cancel_url: `${process.env.APP_URL || 'https://aiagent.ringlypro.com'}/mcp-copilot/?client_id=${clientId}&ghl_payment=cancelled`,
            client_reference_id: clientId.toString(),
            metadata: {
                clientId: clientId.toString(),
                plan: plan || 'ghl_access',
                feature: 'ghl_integration'
            }
        });

        console.log(`✅ Created GHL subscription checkout for client ${clientId}: ${session.id}`);

        res.json({
            success: true,
            checkoutUrl: session.url,
            sessionId: session.id
        });

    } catch (error) {
        console.error('Error creating GHL subscription checkout:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create payment session',
            details: error.message
        });
    }
});

/**
 * POST /api/payment/webhook/ghl-subscription
 * Stripe webhook for GHL subscription events
 */
router.post('/webhook/ghl-subscription', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error('⚠️ Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object;
            const clientId = session.client_reference_id || session.metadata.clientId;

            console.log(`✅ GHL subscription payment completed for client ${clientId}`);

            // TODO: Update client record to mark GHL subscription as active
            // This would set a flag like ghl_subscription_active = true
            // For now, customers still need to enter their GHL credentials manually

            break;

        case 'customer.subscription.deleted':
            const subscription = event.data.object;
            const deletedClientId = subscription.metadata.clientId;

            console.log(`⚠️ GHL subscription cancelled for client ${deletedClientId}`);

            // TODO: Mark subscription as inactive but don't delete GHL credentials
            // Just prevent future usage until they re-subscribe

            break;

        default:
            console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
});

/**
 * GET /api/payment/ghl-subscription-status/:clientId
 * Check if client has active GHL subscription
 */
router.get('/ghl-subscription-status/:clientId', async (req, res) => {
    try {
        const { clientId } = req.params;

        // TODO: Query database for subscription status
        // For now, return a simple response

        res.json({
            success: true,
            clientId,
            subscriptionActive: false, // Will be true after implementing subscription tracking
            message: 'Subscription status check not yet implemented'
        });

    } catch (error) {
        console.error('Error checking subscription status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check subscription status'
        });
    }
});

module.exports = router;
