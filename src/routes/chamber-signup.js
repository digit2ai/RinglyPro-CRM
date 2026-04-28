/**
 * Chamber Signup + Stripe Billing
 *
 * POST /api/chambers/signup
 *   Stripe charges $150 setup + $99/mo, creates chamber row, creates owner
 *   member as superadmin, returns JWT + dashboard URL.
 *
 * POST /api/stripe/webhook
 *   Listens for invoice.payment_succeeded / payment_failed /
 *   customer.subscription.deleted -- updates chambers.subscription_status
 *   and chambers.status.
 */
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Sequelize, QueryTypes } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

const JWT_SECRET = process.env.CHAMBER_JWT_SECRET || 'chamber-multitenant-secret-change-me';
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY; // $99/mo recurring price ID

let stripe = null;
if (STRIPE_KEY) {
  try {
    stripe = require('stripe')(STRIPE_KEY);
    console.log('💳 Stripe configured for chamber signup');
  } catch (e) {
    console.warn('Stripe init failed:', e.message);
  }
} else {
  console.warn('⚠️ STRIPE_SECRET_KEY not set -- chamber signup will run in TEST MODE (no real charges)');
}

const ALLOWED_DOMAINS = ['camaravirtual.app', 'virtualchamber.app', 'www.camaravirtual.app', 'www.virtualchamber.app'];

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

function pickBrandDomain(input) {
  if (!input) return 'camaravirtual.app';
  const lower = input.toLowerCase();
  if (lower.includes('virtualchamber')) return 'virtualchamber.app';
  return 'camaravirtual.app';
}

// =====================================================================
// POST /api/chambers/signup
// =====================================================================
router.post('/signup', async (req, res) => {
  const trans = await sequelize.transaction();
  try {
    const {
      chamber_name, contact_email, owner_first_name, owner_last_name,
      owner_password, country, brand_domain, stripe_payment_method_id, logo_url, description
    } = req.body;

    // ---- Validation ----
    if (!chamber_name || !contact_email || !owner_first_name || !owner_last_name || !owner_password) {
      await trans.rollback();
      return res.status(400).json({ success: false, error: 'chamber_name, contact_email, owner_first_name, owner_last_name, owner_password required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_email)) {
      await trans.rollback();
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }
    if (owner_password.length < 8) {
      await trans.rollback();
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }
    const finalDomain = pickBrandDomain(brand_domain || req.headers['x-source-domain'] || req.hostname);
    const primaryLanguage = finalDomain === 'virtualchamber.app' ? 'en' : 'es';
    const slugPrefix = finalDomain === 'virtualchamber.app' ? 'vc' : 'cv';

    // ---- Stripe charge ----
    let stripeCustomer = null;
    let stripeSubscription = null;
    let setupChargeId = null;

    if (stripe && stripe_payment_method_id) {
      try {
        // 1. Create customer
        stripeCustomer = await stripe.customers.create({
          email: contact_email,
          name: chamber_name,
          payment_method: stripe_payment_method_id,
          invoice_settings: { default_payment_method: stripe_payment_method_id },
          metadata: { chamber_name, brand_domain: finalDomain, signup_source: 'chamber_self_signup' }
        });

        // 2. One-time setup fee $150
        const setupCharge = await stripe.paymentIntents.create({
          amount: 15000,
          currency: 'usd',
          customer: stripeCustomer.id,
          payment_method: stripe_payment_method_id,
          confirm: true,
          off_session: true,
          description: `Chamber setup fee -- ${chamber_name}`,
          metadata: { type: 'setup_fee', chamber_name }
        });
        setupChargeId = setupCharge.id;
        if (setupCharge.status !== 'succeeded') {
          throw new Error(`Setup payment status: ${setupCharge.status}`);
        }

        // 3. Monthly subscription $99
        if (STRIPE_PRICE_MONTHLY) {
          stripeSubscription = await stripe.subscriptions.create({
            customer: stripeCustomer.id,
            items: [{ price: STRIPE_PRICE_MONTHLY }],
            default_payment_method: stripe_payment_method_id,
            metadata: { chamber_name }
          });
        } else {
          console.warn('STRIPE_PRICE_MONTHLY not set -- skipping recurring subscription');
        }
      } catch (stripeErr) {
        await trans.rollback();
        console.error('[signup] Stripe error:', stripeErr.message);
        return res.status(402).json({
          success: false,
          error: `Payment failed: ${stripeErr.message}`,
          stripe_error_code: stripeErr.code
        });
      }
    }

    // ---- Generate slug from sequence ----
    const [{ next_seq }] = await sequelize.query(
      `SELECT nextval('chamber_slug_seq') AS next_seq`,
      { type: QueryTypes.SELECT, transaction: trans }
    );
    const slug = `${slugPrefix}-${next_seq}`;

    // ---- Insert chamber ----
    const [chamber] = await sequelize.query(
      `INSERT INTO chambers (slug, name, brand_domain, primary_language, country, description, logo_url,
                             contact_email, status, stripe_customer_id, stripe_subscription_id,
                             setup_fee_paid_at, subscription_status, monthly_amount_cents, setup_fee_cents,
                             created_at, updated_at)
       VALUES (:slug, :name, :domain, :lang, :country, :desc, :logo, :email, 'active',
               :sc, :ss, :paid_at, :sub_status, 9900, 15000, NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          slug, name: chamber_name, domain: finalDomain, lang: primaryLanguage,
          country: country || null, desc: description || null, logo: logo_url || null,
          email: contact_email,
          sc: stripeCustomer?.id || null,
          ss: stripeSubscription?.id || null,
          paid_at: setupChargeId ? new Date() : null,
          sub_status: stripeSubscription?.status || (stripe ? 'active' : 'test_mode')
        },
        type: QueryTypes.SELECT,
        transaction: trans
      }
    );

    // ---- Insert owner member ----
    const passwordHash = await bcrypt.hash(owner_password, 10);
    const [owner] = await sequelize.query(
      `INSERT INTO members (chamber_id, email, password_hash, first_name, last_name, country,
                            membership_type, governance_role, access_level, verification_level,
                            status, trust_score, created_at, updated_at)
       VALUES (:c, :email, :hash, :fn, :ln, :country, 'fundador', 'president',
               'superadmin', 'email', 'active', 0.85, NOW(), NOW())
       RETURNING id, email, first_name, last_name, access_level`,
      {
        replacements: {
          c: chamber.id, email: contact_email.toLowerCase(), hash: passwordHash,
          fn: owner_first_name, ln: owner_last_name, country: country || null
        },
        type: QueryTypes.SELECT,
        transaction: trans
      }
    );

    // ---- Link owner to chamber ----
    await sequelize.query(
      `UPDATE chambers SET owner_member_id = :m WHERE id = :c`,
      { replacements: { m: owner.id, c: chamber.id }, transaction: trans }
    );

    await trans.commit();

    // ---- JWT + response ----
    const token = signToken({
      member_id: owner.id, chamber_id: chamber.id, chamber_slug: slug,
      email: owner.email, access_level: 'superadmin', governance_role: 'president'
    });

    return res.status(201).json({
      success: true,
      data: {
        chamber: {
          id: chamber.id, slug, name: chamber_name, brand_domain: finalDomain,
          primary_language: primaryLanguage, status: 'active',
          dashboard_url: `https://${finalDomain}/${slug}/dashboard/`,
          landing_url: `https://${finalDomain}/${slug}/`
        },
        owner: { id: owner.id, email: owner.email, name: `${owner.first_name} ${owner.last_name}` },
        billing: {
          setup_fee_paid: setupChargeId ? '$150.00' : 'TEST MODE -- no charge',
          monthly_subscription: stripeSubscription ? '$99.00/mo active' : 'TEST MODE -- no subscription',
          stripe_customer_id: stripeCustomer?.id || null
        },
        token
      }
    });
  } catch (err) {
    try { await trans.rollback(); } catch (e) {}
    console.error('[chamber signup]', err.message);
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Slug or email collision -- retry' });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// POST /api/stripe/webhook
// =====================================================================
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.status(503).send('Stripe not configured');
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    if (STRIPE_WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('[stripe webhook] signature failed:', err.message);
    return res.status(400).send(`Webhook signature error: ${err.message}`);
  }

  try {
    const customerId = event.data?.object?.customer;
    if (!customerId) return res.json({ received: true, skipped: 'no customer' });

    if (event.type === 'invoice.payment_succeeded') {
      await sequelize.query(
        `UPDATE chambers SET subscription_status = 'active', status = 'active',
                next_billing_at = to_timestamp(:next), updated_at = NOW()
         WHERE stripe_customer_id = :cust`,
        { replacements: { cust: customerId, next: event.data.object.next_payment_attempt || (Math.floor(Date.now()/1000) + 30*86400) } }
      );
    } else if (event.type === 'invoice.payment_failed') {
      await sequelize.query(
        `UPDATE chambers SET subscription_status = 'past_due', status = 'suspended', updated_at = NOW()
         WHERE stripe_customer_id = :cust`,
        { replacements: { cust: customerId } }
      );
    } else if (event.type === 'customer.subscription.deleted') {
      await sequelize.query(
        `UPDATE chambers SET subscription_status = 'canceled', status = 'archived', updated_at = NOW()
         WHERE stripe_customer_id = :cust`,
        { replacements: { cust: customerId } }
      );
    }
    return res.json({ received: true });
  } catch (err) {
    console.error('[stripe webhook]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// =====================================================================
// Health check for the signup module
// =====================================================================
router.get('/signup/health', async (req, res) => {
  res.json({
    success: true,
    stripe_configured: !!stripe,
    stripe_recurring_price: !!STRIPE_PRICE_MONTHLY,
    webhook_secret_set: !!STRIPE_WEBHOOK_SECRET,
    pricing: { setup_fee_cents: 15000, monthly_amount_cents: 9900 },
    allowed_domains: ALLOWED_DOMAINS
  });
});

module.exports = router;
