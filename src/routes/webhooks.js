// =====================================================
// Stripe Webhooks for Subscription Management
// File: src/routes/webhooks.js
// Purpose: Handle Stripe subscription lifecycle events
// =====================================================

const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { User } = require('../models');

// =====================================================
// STRIPE WEBHOOK ENDPOINT
// =====================================================

/**
 * POST /webhooks/stripe
 * Handle Stripe webhook events for subscription lifecycle
 * IMPORTANT: This endpoint must use express.raw() middleware
 */
router.post('/stripe', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        // Verify webhook signature
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        console.log(`✅ Stripe webhook verified: ${event.type}`);
    } catch (err) {
        console.error('❌ Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    try {
        switch (event.type) {
            case 'customer.subscription.created':
                await handleSubscriptionCreated(event.data.object);
                break;

            case 'customer.subscription.trial_will_end':
                await handleTrialWillEnd(event.data.object);
                break;

            case 'invoice.paid':
                await handleInvoicePaid(event.data.object);
                break;

            case 'invoice.payment_failed':
                await handlePaymentFailed(event.data.object);
                break;

            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(event.data.object);
                break;

            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(event.data.object);
                break;

            default:
                console.log(`ℹ️ Unhandled event type: ${event.type}`);
        }

        res.json({ received: true });

    } catch (error) {
        console.error('❌ Error processing webhook:', error);
        res.status(500).json({
            error: 'Webhook processing failed',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// =====================================================
// WEBHOOK HANDLER FUNCTIONS
// =====================================================

/**
 * Handle subscription creation (after checkout)
 */
async function handleSubscriptionCreated(subscription) {
    const userId = subscription.metadata.userId;

    if (!userId) {
        console.error('❌ No userId in subscription metadata');
        return;
    }

    try {
        await User.update({
            stripe_subscription_id: subscription.id,
            stripe_customer_id: subscription.customer,
            subscription_status: subscription.status  // 'trialing' or 'active'
        }, { where: { id: userId } });

        console.log(`✅ Subscription created for user ${userId} - Status: ${subscription.status}`);

        if (subscription.status === 'trialing') {
            const trialEnd = new Date(subscription.trial_end * 1000);
            console.log(`🎁 Trial period active until: ${trialEnd.toISOString()}`);
        }

    } catch (error) {
        console.error(`❌ Error updating user ${userId} after subscription creation:`, error);
    }
}

/**
 * Handle trial ending soon (3 days before)
 */
async function handleTrialWillEnd(subscription) {
    const userId = subscription.metadata.userId;

    if (!userId) {
        console.error('❌ No userId in subscription metadata');
        return;
    }

    try {
        const user = await User.findByPk(userId);

        if (user) {
            const trialEnd = new Date(subscription.trial_end * 1000);
            console.log(`⏰ Trial ending soon for ${user.email} - Ends: ${trialEnd.toISOString()}`);

            // TODO: Send email notification to user about trial ending
            // const emailService = require('../services/emailService');
            // await emailService.sendTrialEndingEmail(user.email, trialEnd);
        }

    } catch (error) {
        console.error(`❌ Error processing trial_will_end for user ${userId}:`, error);
    }
}

/**
 * Handle successful payment (including renewals)
 */
async function handleInvoicePaid(invoice) {
    // Get subscription details
    if (!invoice.subscription) {
        console.log('ℹ️ Invoice paid but not related to subscription');
        return;
    }

    try {
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const userId = subscription.metadata.userId;
        const monthlyTokens = parseInt(subscription.metadata.monthlyTokens);
        const plan = subscription.metadata.plan;

        if (!userId) {
            console.error('❌ No userId in subscription metadata');
            return;
        }

        const user = await User.findByPk(userId);

        if (!user) {
            console.error(`❌ User ${userId} not found`);
            return;
        }

        // Check if this is the first payment or a renewal
        const isFirstPayment = invoice.billing_reason === 'subscription_create' ||
                               user.subscription_status === 'trialing';

        // Add tokens to user account
        const currentBalance = user.tokens_balance || 0;
        const newBalance = currentBalance + monthlyTokens;

        // Apply rollover limits based on plan
        let finalBalance = newBalance;
        const rolloverLimits = {
            starter: 1000,
            growth: 5000,
            professional: Infinity,
            enterprise: Infinity
        };

        const maxRollover = rolloverLimits[plan] || Infinity;
        if (finalBalance > maxRollover && maxRollover !== Infinity) {
            finalBalance = maxRollover;
            console.log(`⚠️ Token balance capped at ${maxRollover} (rollover limit for ${plan})`);
        }

        // Update user account
        await user.update({
            subscription_status: 'active',
            tokens_balance: finalBalance,
            last_token_reset: new Date(),
            billing_cycle_start: new Date()
        });

        console.log(`✅ Payment processed for user ${userId} (${user.email})`);
        console.log(`📊 Plan: ${plan}, Added: ${monthlyTokens} tokens, New balance: ${finalBalance}`);
        console.log(`💰 Amount paid: $${(invoice.amount_paid / 100).toFixed(2)}`);

        if (isFirstPayment) {
            console.log('🎉 First payment - trial completed successfully');
        } else {
            console.log('🔄 Renewal payment - subscription renewed');
        }

    } catch (error) {
        console.error('❌ Error processing invoice payment:', error);
    }
}

/**
 * Handle payment failure
 */
async function handlePaymentFailed(invoice) {
    if (!invoice.subscription) {
        console.log('ℹ️ Payment failed but not related to subscription');
        return;
    }

    try {
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const userId = subscription.metadata.userId;

        if (!userId) {
            console.error('❌ No userId in subscription metadata');
            return;
        }

        const user = await User.findByPk(userId);

        if (user) {
            await user.update({
                subscription_status: 'past_due'
            });

            console.log(`❌ Payment failed for user ${userId} (${user.email})`);
            console.log(`💳 Amount due: $${(invoice.amount_due / 100).toFixed(2)}`);
            console.log(`⚠️ Subscription status: past_due`);

            // TODO: Send email notification about payment failure
            // const emailService = require('../services/emailService');
            // await emailService.sendPaymentFailedEmail(user.email, invoice);
        }

    } catch (error) {
        console.error('❌ Error processing payment failure:', error);
    }
}

/**
 * Handle subscription cancellation
 */
async function handleSubscriptionDeleted(subscription) {
    const userId = subscription.metadata.userId;

    if (!userId) {
        console.error('❌ No userId in subscription metadata');
        return;
    }

    try {
        const user = await User.findByPk(userId);

        if (user) {
            // Downgrade to free tier
            await user.update({
                subscription_status: 'canceled',
                subscription_plan: 'free',
                billing_frequency: 'monthly',
                tokens_balance: 100,  // Free tier tokens
                monthly_token_allocation: 100,
                stripe_subscription_id: null
            });

            console.log(`❌ Subscription canceled for user ${userId} (${user.email})`);
            console.log(`⬇️ Downgraded to free tier - 100 tokens`);

            // TODO: Send email notification about cancellation
            // const emailService = require('../services/emailService');
            // await emailService.sendSubscriptionCanceledEmail(user.email);
        }

    } catch (error) {
        console.error(`❌ Error processing subscription cancellation for user ${userId}:`, error);
    }
}

/**
 * Handle subscription updates (plan changes, etc.)
 */
async function handleSubscriptionUpdated(subscription) {
    const userId = subscription.metadata.userId;

    if (!userId) {
        console.error('❌ No userId in subscription metadata');
        return;
    }

    try {
        await User.update({
            subscription_status: subscription.status
        }, { where: { id: userId } });

        console.log(`ℹ️ Subscription updated for user ${userId} - New status: ${subscription.status}`);

    } catch (error) {
        console.error(`❌ Error processing subscription update for user ${userId}:`, error);
    }
}

module.exports = router;
