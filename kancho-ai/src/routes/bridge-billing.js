'use strict';

// Bridge Billing - Access RinglyPro token/subscription system from KanchoAI
// Shows balance, usage, plan info, and upgrade paths

const express = require('express');
const router = express.Router();

let crmBridge;
try { crmBridge = require('../../config/crm-bridge'); } catch (e) { console.log('CRM Bridge not loaded:', e.message); }

const SUBSCRIPTION_PLANS = {
  free: { name: 'Free', price: 0, tokens: 100, minutes: 20, features: ['Basic dashboard', '20 AI voice minutes/month', 'Health score monitoring'] },
  starter: { name: 'Starter', price: 45, tokens: 500, minutes: 100, features: ['100 AI voice minutes/month', 'CRM + contacts', 'Lead management', 'Token rollover'] },
  growth: { name: 'Growth', price: 180, tokens: 2000, minutes: 400, features: ['400 AI voice minutes/month', 'AI churn detection', 'Automated retention campaigns', 'Email marketing', 'Token rollover'] },
  professional: { name: 'Professional', price: 675, tokens: 7500, minutes: 1500, features: ['1,500 AI voice minutes/month', 'Outbound AI dialer', 'Priority support', 'Custom integrations', 'Token rollover'] }
};

// GET /balance - Current token balance and usage
router.get('/balance', async (req, res) => {
  if (!crmBridge?.ready) return res.status(503).json({ success: false, error: 'CRM bridge not available' });

  try {
    const user = await crmBridge.User.findByPk(req.userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const client = req.clientId ? await crmBridge.Client.findByPk(req.clientId, {
      include: [{ model: crmBridge.CreditAccount, as: 'creditAccount' }]
    }) : null;

    const plan = SUBSCRIPTION_PLANS[user.subscription_plan] || SUBSCRIPTION_PLANS.free;

    res.json({
      success: true,
      data: {
        plan: {
          name: plan.name,
          code: user.subscription_plan || 'free',
          price: plan.price,
          billing: user.billing_frequency || 'monthly',
          status: user.subscription_status || 'active'
        },
        tokens: {
          balance: user.tokens_balance || 0,
          usedThisMonth: user.tokens_used_this_month || 0,
          monthlyAllocation: user.monthly_token_allocation || plan.tokens,
          rollover: user.tokens_rollover || 0,
          estimatedMinutesRemaining: Math.floor((user.tokens_balance || 0) / 5)
        },
        credits: client?.creditAccount ? {
          balance: parseFloat(client.creditAccount.balance || 0),
          freeMinutesUsed: client.creditAccount.free_minutes_used || 0,
          totalMinutesUsed: client.creditAccount.total_minutes_used || 0
        } : null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /plans - Available subscription plans
router.get('/plans', async (req, res) => {
  const plans = Object.entries(SUBSCRIPTION_PLANS).map(([code, plan]) => ({
    code,
    ...plan,
    annual: {
      price: Math.floor(plan.price * 12 * 0.85), // 15% annual discount
      monthlyEquivalent: Math.floor(plan.price * 0.85)
    }
  }));

  // Identify current plan if authenticated
  let currentPlan = 'free';
  if (req.userId && crmBridge?.ready) {
    try {
      const user = await crmBridge.User.findByPk(req.userId);
      currentPlan = user?.subscription_plan || 'free';
    } catch (e) {}
  }

  res.json({ success: true, data: { plans, currentPlan } });
});

// POST /upgrade - Create Stripe checkout session for upgrade
router.post('/upgrade', async (req, res) => {
  if (!crmBridge?.ready) return res.status(503).json({ success: false, error: 'CRM bridge not available' });

  try {
    const { plan, billing = 'monthly' } = req.body;

    if (!SUBSCRIPTION_PLANS[plan] || plan === 'free') {
      return res.status(400).json({ success: false, error: 'Invalid plan. Choose: starter, growth, or professional' });
    }

    const user = await crmBridge.User.findByPk(req.userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // Check if Stripe is available
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ success: false, error: 'Payment system not configured' });
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const planDetails = SUBSCRIPTION_PLANS[plan];
    const price = billing === 'annual'
      ? Math.floor(planDetails.price * 12 * 0.85) * 100 // cents
      : planDetails.price * 100;

    const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: user.email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `KanchoAI ${planDetails.name} Plan`,
            description: `${planDetails.minutes} AI voice minutes/month + School Intelligence Platform`
          },
          unit_amount: billing === 'annual' ? Math.floor(planDetails.price * 0.85 * 100) : planDetails.price * 100,
          recurring: { interval: billing === 'annual' ? 'year' : 'month' }
        },
        quantity: 1
      }],
      metadata: {
        userId: user.id.toString(),
        schoolId: req.schoolId?.toString() || '',
        plan,
        billing,
        source: 'kanchoai'
      },
      success_url: `${webhookBaseUrl}/kanchoai/?upgrade=success&plan=${plan}`,
      cancel_url: `${webhookBaseUrl}/kanchoai/?upgrade=cancelled`
    });

    res.json({
      success: true,
      data: {
        checkoutUrl: session.url,
        sessionId: session.id,
        plan: planDetails.name,
        price: billing === 'annual' ? Math.floor(planDetails.price * 12 * 0.85) : planDetails.price,
        billing
      }
    });
  } catch (error) {
    console.error('KanchoAI Bridge Upgrade error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
