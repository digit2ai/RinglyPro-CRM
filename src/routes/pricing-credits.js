// =====================================================
// Digit2AI Pricing + Credit System
// File: src/routes/pricing-credits.js
// Purpose: Lovable-style credit pricing for digit2ai.com.
//   - Public plan matrix (single source of truth for the page)
//   - Stripe subscription checkout with dynamic per-credit pricing
//   - Stripe webhook -> grants monthly build credits into d2_credit_accounts
//   - Credit balance lookup by email
//
// Tables auto-create on load (CREATE TABLE IF NOT EXISTS) on the CRM DB.
// Mounted at /api/pricing ; webhook handler exported for raw-body mount.
// =====================================================

const express = require('express');
const router = express.Router();
const sequelize = require('../config/database');

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const stripe = STRIPE_KEY ? require('stripe')(STRIPE_KEY) : null;
const BASE_URL = process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';

// -----------------------------------------------------
// PRICING MATRIX  (mirrors lovable.dev/pricing exactly)
//   Pro      = $0.25 / credit   (100 credits = $25 base)
//   Business = $0.50 / credit   (100 credits = $50 base)
//   Volume discount kicks in at 1,200+ credits.
// -----------------------------------------------------
const CREDIT_TIERS = [
  { credits: 100,  discount: 0 },
  { credits: 200,  discount: 0 },
  { credits: 400,  discount: 0 },
  { credits: 800,  discount: 0 },
  { credits: 1200, discount: 0.02 },
  { credits: 2000, discount: 0.04 },
  { credits: 3000, discount: 0.06 },
  { credits: 4000, discount: 0.08 },
  { credits: 5000, discount: 0.10 },
];

const PLANS = {
  pro:      { name: 'Pro',      rate: 0.25 },
  business: { name: 'Business', rate: 0.50 },
};

function priceFor(planKey, credits) {
  const plan = PLANS[planKey];
  const tier = CREDIT_TIERS.find(t => t.credits === Number(credits));
  if (!plan || !tier) return null;
  // Whole-dollar amount, matching lovable's published numbers.
  return Math.round(credits * plan.rate * (1 - tier.discount));
}

function planMatrix() {
  const out = {};
  for (const key of Object.keys(PLANS)) {
    out[key] = CREDIT_TIERS.map(t => ({
      credits: t.credits,
      price: priceFor(key, t.credits),
      discount: t.discount,
    }));
  }
  return out;
}

// -----------------------------------------------------
// SCHEMA
// -----------------------------------------------------
let schemaReady = false;
async function ensureSchema() {
  if (schemaReady) return;
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS d2_credit_accounts (
      id                      SERIAL PRIMARY KEY,
      email                   VARCHAR(255) UNIQUE NOT NULL,
      plan                    VARCHAR(32)  NOT NULL DEFAULT 'free',
      monthly_credits         INTEGER      NOT NULL DEFAULT 0,
      credit_balance          INTEGER      NOT NULL DEFAULT 0,
      stripe_customer_id      VARCHAR(255),
      stripe_subscription_id  VARCHAR(255),
      subscription_status     VARCHAR(32)  DEFAULT 'inactive',
      current_period_end      TIMESTAMPTZ,
      created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
  `);
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS d2_credit_ledger (
      id          SERIAL PRIMARY KEY,
      email       VARCHAR(255) NOT NULL,
      delta       INTEGER      NOT NULL,
      reason      VARCHAR(64)  NOT NULL,
      stripe_ref  VARCHAR(255),
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
  `);
  await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_d2_credit_ledger_email ON d2_credit_ledger(email);`);
  schemaReady = true;
}

async function grantCredits(email, credits, plan, reason, ref, subMeta = {}) {
  await ensureSchema();
  const lower = String(email).toLowerCase();
  // Upsert account: on a fresh subscription/renewal we SET the monthly allotment
  // and top the balance up to (at least) that allotment.
  await sequelize.query(`
    INSERT INTO d2_credit_accounts
      (email, plan, monthly_credits, credit_balance, stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end, updated_at)
    VALUES (:email, :plan, :credits, :credits, :cust, :sub, 'active', :periodEnd, NOW())
    ON CONFLICT (email) DO UPDATE SET
      plan                   = EXCLUDED.plan,
      monthly_credits        = EXCLUDED.monthly_credits,
      credit_balance         = d2_credit_accounts.credit_balance + EXCLUDED.monthly_credits,
      stripe_customer_id     = COALESCE(EXCLUDED.stripe_customer_id, d2_credit_accounts.stripe_customer_id),
      stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, d2_credit_accounts.stripe_subscription_id),
      subscription_status    = 'active',
      current_period_end     = COALESCE(EXCLUDED.current_period_end, d2_credit_accounts.current_period_end),
      updated_at             = NOW();
  `, {
    replacements: {
      email: lower, plan, credits,
      cust: subMeta.customer || null,
      sub: subMeta.subscription || null,
      periodEnd: subMeta.periodEnd || null,
    }
  });
  await sequelize.query(
    `INSERT INTO d2_credit_ledger (email, delta, reason, stripe_ref) VALUES (:email, :delta, :reason, :ref)`,
    { replacements: { email: lower, delta: credits, reason, ref: ref || null } }
  );
}

// =====================================================
// PUBLIC API
// =====================================================

// GET /api/pricing/plans -> full matrix the page renders from
router.get('/plans', (req, res) => {
  res.json({ success: true, plans: planMatrix(), meta: PLANS });
});

// GET /api/pricing/health
router.get('/health', async (req, res) => {
  res.json({
    status: 'ok',
    service: 'Digit2AI Pricing + Credits',
    stripe: stripe ? 'configured' : 'not configured',
    timestamp: new Date().toISOString(),
  });
});

// POST /api/pricing/checkout  { plan, credits, email? }
// Creates a Stripe subscription checkout for the chosen plan + credit tier.
router.post('/checkout', async (req, res) => {
  try {
    const { plan, credits, email } = req.body || {};
    const planKey = String(plan || '').toLowerCase();
    const price = priceFor(planKey, credits);
    if (!PLANS[planKey] || price == null) {
      return res.status(400).json({ success: false, error: 'Invalid plan or credit amount.' });
    }
    if (!stripe) {
      return res.status(503).json({ success: false, error: 'Payments are not configured yet. Please contact info@digit2ai.com.' });
    }

    const nCredits = Number(credits);
    const planName = PLANS[planKey].name;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email || undefined,
      allow_promotion_codes: true,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Digit2AI ${planName} — ${nCredits.toLocaleString()} credits/mo`,
            description: `${nCredits.toLocaleString()} AI build credits every month on the Digit2AI ${planName} plan.`,
          },
          unit_amount: price * 100,
          recurring: { interval: 'month', interval_count: 1 },
        },
        quantity: 1,
      }],
      subscription_data: {
        metadata: { plan: planKey, credits: String(nCredits), source: 'digit2ai_pricing' },
      },
      metadata: { plan: planKey, credits: String(nCredits), source: 'digit2ai_pricing' },
      success_url: `${BASE_URL}/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/pricing?checkout=canceled`,
    });

    res.json({ success: true, url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[PRICING] checkout error:', err.message);
    res.status(500).json({ success: false, error: err.message || 'Failed to start checkout.' });
  }
});

// GET /api/pricing/credits?email=...  -> current balance
router.get('/credits', async (req, res) => {
  try {
    await ensureSchema();
    const email = String(req.query.email || '').toLowerCase();
    if (!email) return res.status(400).json({ success: false, error: 'email required' });
    const [rows] = await sequelize.query(
      `SELECT email, plan, monthly_credits, credit_balance, subscription_status, current_period_end
       FROM d2_credit_accounts WHERE email = :email LIMIT 1`,
      { replacements: { email } }
    );
    res.json({ success: true, account: rows[0] || { email, plan: 'free', credit_balance: 0, subscription_status: 'inactive' } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// STRIPE WEBHOOK  (raw-body; mounted before body parser in app.js)
// =====================================================
async function stripeWebhookHandler(req, res) {
  if (!stripe) return res.status(503).send('stripe not configured');
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_PRICING_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  let event;
  try {
    event = secret
      ? stripe.webhooks.constructEvent(req.body, sig, secret)
      : JSON.parse(req.body.toString());
  } catch (err) {
    console.error('[PRICING] webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object;
        if (s.metadata && s.metadata.source === 'digit2ai_pricing') {
          const email = s.customer_details?.email || s.customer_email;
          const credits = parseInt(s.metadata.credits, 10) || 0;
          const plan = s.metadata.plan || 'pro';
          if (email && credits) {
            await grantCredits(email, credits, plan, 'subscription_start', s.id, {
              customer: s.customer, subscription: s.subscription,
            });
            console.log(`[PRICING] granted ${credits} credits to ${email} (${plan})`);
          }
        }
        break;
      }
      case 'invoice.paid': {
        // Monthly renewal — top up the allotment again.
        const inv = event.data.object;
        if (inv.billing_reason === 'subscription_cycle' && inv.subscription) {
          const sub = await stripe.subscriptions.retrieve(inv.subscription);
          if (sub.metadata && sub.metadata.source === 'digit2ai_pricing') {
            const email = inv.customer_email;
            const credits = parseInt(sub.metadata.credits, 10) || 0;
            const plan = sub.metadata.plan || 'pro';
            if (email && credits) {
              await grantCredits(email, credits, plan, 'subscription_renewal', inv.id, {
                customer: sub.customer, subscription: sub.id,
                periodEnd: new Date(sub.current_period_end * 1000).toISOString(),
              });
              console.log(`[PRICING] renewed ${credits} credits for ${email}`);
            }
          }
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        if (sub.metadata && sub.metadata.source === 'digit2ai_pricing') {
          await ensureSchema();
          await sequelize.query(
            `UPDATE d2_credit_accounts SET subscription_status='canceled', updated_at=NOW() WHERE stripe_subscription_id=:sub`,
            { replacements: { sub: sub.id } }
          );
        }
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error('[PRICING] webhook handler error:', err.message);
    res.status(500).send('handler error');
  }
}

module.exports = router;
module.exports.stripeWebhookHandler = stripeWebhookHandler;
module.exports.ensureSchema = ensureSchema;
