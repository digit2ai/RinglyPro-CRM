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
// SUBSCRIPTION PLANS - Must match auth.js
// =====================================================
const SUBSCRIPTION_PLANS = {
    free: { tokens: 100, rollover: false },
    starter: { tokens: 500, rollover: true },      // $45/mo - 500 tokens
    growth: { tokens: 2000, rollover: true },      // $180/mo - 2,000 tokens
    professional: { tokens: 7500, rollover: true } // $675/mo - 7,500 tokens
};

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
    const webhookSecret = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;

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
 * Adds monthly tokens to user account based on plan
 * Paid plans accumulate tokens (rollover), free plan resets
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

        // Get plan details (use metadata or fallback to SUBSCRIPTION_PLANS)
        const planDetails = SUBSCRIPTION_PLANS[plan] || SUBSCRIPTION_PLANS.free;
        const monthlyTokens = parseInt(subscription.metadata.monthlyTokens) || planDetails.tokens;
        const hasRollover = subscription.metadata.rollover === 'true' || planDetails.rollover;

        // Check if this is the first payment or a renewal
        const isFirstPayment = invoice.billing_reason === 'subscription_create' ||
                               user.subscription_status === 'trialing';

        // Calculate new token balance
        const currentBalance = user.tokens_balance || 0;
        let finalBalance;

        if (hasRollover) {
            // ROLLOVER: Add new tokens to existing balance (accumulates)
            finalBalance = currentBalance + monthlyTokens;
            console.log(`🔄 Rollover: ${currentBalance} + ${monthlyTokens} = ${finalBalance} tokens`);
        } else {
            // NO ROLLOVER: Reset to monthly allocation
            finalBalance = monthlyTokens;
            console.log(`🔁 Reset: Balance set to ${finalBalance} tokens (no rollover)`);
        }

        // Update user account
        await user.update({
            subscription_status: 'active',
            subscription_plan: plan,
            tokens_balance: finalBalance,
            monthly_token_allocation: monthlyTokens,
            token_package: plan,
            last_token_reset: new Date(),
            billing_cycle_start: new Date()
        });

        console.log(`✅ Payment processed for user ${userId} (${user.email})`);
        console.log(`📊 Plan: ${plan}, Tokens added: ${monthlyTokens}, New balance: ${finalBalance}`);
        console.log(`💰 Amount paid: $${(invoice.amount_paid / 100).toFixed(2)}`);

        if (isFirstPayment || user.subscription_status === 'trialing') {
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
 * Downgrades user to free tier with 100 tokens (no rollover)
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
            const freePlan = SUBSCRIPTION_PLANS.free;

            // Downgrade to free tier
            await user.update({
                subscription_status: 'canceled',
                subscription_plan: 'free',
                billing_frequency: 'monthly',
                tokens_balance: freePlan.tokens,  // 100 tokens
                monthly_token_allocation: freePlan.tokens,
                token_package: 'free',
                stripe_subscription_id: null
            });

            console.log(`❌ Subscription canceled for user ${userId} (${user.email})`);
            console.log(`⬇️ Downgraded to free tier - ${freePlan.tokens} tokens`);

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
