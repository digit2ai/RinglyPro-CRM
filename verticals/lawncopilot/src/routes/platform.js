'use strict';

/**
 * The platform layer — Digit2AI, above all tenants.
 *
 * Sees usage, health, spend and billing. Does NOT see customer PII in the raw
 * unless acting under an explicit, audited impersonation session. A support
 * tool that quietly exposes every homeowner in the system is a liability.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op, fn, col } = require('sequelize');
const router = express.Router();

const {
  Tenant, User, Customer, Lead, Quote, Appointment, Invoice, Payment,
  AgentCall, PlatformUser, PlatformSubscription, ImpersonationLog, sequelize
} = require('../models');
const { PLAN_LIMITS, normalizePlan } = require('../services/provision');
const { cacheBust } = require('../tenancy');

const SECRET = () => process.env.LAWNCOPILOT_JWT_SECRET || process.env.JWT_SECRET || 'lawncopilot-dev-secret';
const COOKIE = { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 7 * 86400000, path: '/' };

// ── Auth ───────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const u = await PlatformUser.findOne({ where: { email: String(email || '').toLowerCase().trim() } });
  if (!u || !u.password_hash) return res.status(401).json({ success: false, error: 'Invalid email or password' });
  if (!await bcrypt.compare(String(password || ''), u.password_hash)) {
    return res.status(401).json({ success: false, error: 'Invalid email or password' });
  }
  u.last_login_at = new Date();
  await u.save();
  res.cookie('lawncopilot_platform', jwt.sign(
    { id: u.id, email: u.email, role: u.role, kind: 'platform' }, SECRET(), { expiresIn: '7d' }
  ), COOKIE);
  res.json({ success: true, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
});

router.post('/logout', (req, res) => {
  res.clearCookie('lawncopilot_platform', { path: '/' });
  res.json({ success: true });
});

// ── Password reset (unauthenticated — must precede the platform-only guard) ──
//
// Stateless tokens: signed with the app secret PLUS the user's current password
// hash, so a token dies the moment the password changes and there is nothing to
// store or clean up. Reset mail is sent from info@digit2ai.com via SendGrid.
const { sendEmail } = require('../services/notify');

function resetSecret(u) {
  return (process.env.LAWNCOPILOT_JWT_SECRET || process.env.JWT_SECRET || 'lawncopilot-dev-secret')
    + '|' + (u.password_hash || 'new');
}
function resetBaseUrl() {
  return (process.env.LAWNCOPILOT_BASE_DOMAIN || 'https://lawncopilot.com').replace(/\/+$/, '');
}

router.post('/forgot-password', async (req, res) => {
  const email = String((req.body || {}).email || '').toLowerCase().trim();
  const u = email ? await PlatformUser.findOne({ where: { email } }) : null;

  // Never reveal whether an email is registered.
  const generic = { success: true, message: 'If that email is on file, a reset link is on its way.' };
  if (!u) return res.json(generic);

  const token = jwt.sign({ id: u.id, email: u.email, purpose: 'platform_pw_reset' },
    resetSecret(u), { expiresIn: '1h' });
  const link = `${resetBaseUrl()}/lawncopilot/platform/reset?token=${encodeURIComponent(token)}`;
  const from = process.env.LAWNCOPILOT_RESET_FROM_EMAIL || 'info@digit2ai.com';

  const body = `Hi ${u.name || 'there'},\n\n`
    + `Reset your Lawn Co-Pilot platform password with the link below. It expires in one hour and can be used once.\n\n`
    + `${link}\n\n`
    + `If you did not request this, ignore this email — your password stays the same.\n\n— Lawn Co-Pilot / Digit2AI`;
  const html = `<p>Hi ${u.name || 'there'},</p>`
    + `<p>Reset your Lawn Co-Pilot platform password with the button below. It expires in one hour and can be used once.</p>`
    + `<p><a href="${link}" style="display:inline-block;background:#307f44;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700">Reset my password</a></p>`
    + `<p style="color:#667">Or paste this link: <br>${link}</p>`
    + `<p style="color:#667">If you did not request this, ignore this email.</p>`;

  const sent = await sendEmail(u.email, 'Reset your Lawn Co-Pilot password', body,
    { from, fromName: 'Lawn Co-Pilot', html });

  // Only when email can't be sent (SendGrid not configured) do we hand the
  // operator the link directly, so they are never locked out. Never on a
  // configured system, where that would leak the token.
  if (!sent.ok && !process.env.SENDGRID_API_KEY) {
    return res.json({ ...generic, dev_reset_link: link, note: 'SendGrid not configured; link returned for setup only.' });
  }
  return res.json(generic);
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ success: false, error: 'Token and a new password are required.' });
  if (String(password).length < 8) return res.status(400).json({ success: false, error: 'Choose a password of at least 8 characters.' });

  // Decode without verifying to find the user, then verify with their own salt.
  let claims;
  try { claims = jwt.decode(token); } catch (e) { claims = null; }
  if (!claims || claims.purpose !== 'platform_pw_reset' || !claims.id) {
    return res.status(400).json({ success: false, error: 'This reset link is invalid.' });
  }
  const u = await PlatformUser.findByPk(claims.id);
  if (!u) return res.status(400).json({ success: false, error: 'This reset link is invalid.' });
  try {
    jwt.verify(token, resetSecret(u));
  } catch (e) {
    return res.status(400).json({ success: false, error: 'This reset link has expired or was already used. Request a new one.' });
  }

  u.password_hash = await bcrypt.hash(String(password), 10);
  await u.save();
  return res.json({ success: true, message: 'Your password was reset. Sign in with your new password.' });
});

// Everything below is platform-only.
router.use((req, res, next) => {
  if (!req.platformUser) return res.status(401).json({ success: false, error: 'Not signed in' });
  next();
});

router.get('/me', (req, res) => res.json({ success: true, user: req.platformUser }));

// ── Overview ───────────────────────────────────────────────────────────────
router.get('/overview', async (req, res) => {
  const days = Number(req.query.days || 30);
  const since = new Date(Date.now() - days * 86400000);

  const tenants = await Tenant.findAll({ raw: true });
  const subs = await PlatformSubscription.findAll({ raw: true });
  const subByTenant = {}; subs.forEach(s => { subByTenant[s.tenant_id] = s; });

  const [leads] = await sequelize.query(
    `SELECT tenant_id, count(*)::int n FROM lc_leads WHERE created_at >= :since GROUP BY tenant_id`,
    { replacements: { since } });
  const [quotes] = await sequelize.query(
    `SELECT tenant_id, count(*)::int n FROM lc_quotes WHERE created_at >= :since GROUP BY tenant_id`,
    { replacements: { since } });
  const [customers] = await sequelize.query(
    `SELECT tenant_id, count(*)::int n FROM lc_customers GROUP BY tenant_id`);
  const [jobs] = await sequelize.query(
    `SELECT tenant_id, count(*)::int n FROM lc_service_records WHERE completed_at >= :since GROUP BY tenant_id`,
    { replacements: { since } });
  const [collected] = await sequelize.query(
    `SELECT tenant_id, coalesce(sum(amount_cents),0)::bigint c FROM lc_payments
     WHERE status='succeeded' AND processed_at >= :since GROUP BY tenant_id`,
    { replacements: { since } });
  const [aiCalls] = await sequelize.query(
    `SELECT tenant_id, count(*)::int n, coalesce(sum(cost_cents),0)::bigint c,
            coalesce(sum(case when success then 0 else 1 end),0)::int failures
     FROM lc_agent_calls WHERE created_at >= :since GROUP BY tenant_id`,
    { replacements: { since } });

  const idx = (rows, key = 'n') => {
    const m = {}; rows.forEach(r => { m[r.tenant_id] = Number(r[key]); }); return m;
  };
  const L = idx(leads), Q = idx(quotes), C = idx(customers), J = idx(jobs);
  const $ = idx(collected, 'c'), A = idx(aiCalls), AC = idx(aiCalls, 'c'), AF = idx(aiCalls, 'failures');

  const rows = tenants.map(t => ({
    id: t.id, name: t.name, slug: t.slug, status: t.status, plan: t.plan,
    created_at: t.created_at, trial_ends_at: t.trial_ends_at,
    subscription_status: (subByTenant[t.id] || {}).status || null,
    payments_connected: !!t.stripe_account_id,
    phone_connected: !!t.phone,
    // Counts and money only. No customer names, emails or addresses.
    leads: L[t.id] || 0, quotes: Q[t.id] || 0, customers: C[t.id] || 0,
    jobs: J[t.id] || 0, collected_cents: $[t.id] || 0,
    ai_actions: A[t.id] || 0, ai_cost_cents: AC[t.id] || 0, ai_failures: AF[t.id] || 0
  }));

  res.json({
    success: true,
    period_days: days,
    totals: {
      tenants: tenants.length,
      live: tenants.filter(t => t.status === 'active').length,
      trialing: tenants.filter(t => t.status === 'trialing').length,
      suspended: tenants.filter(t => t.status === 'suspended').length,
      new_this_period: tenants.filter(t => new Date(t.created_at) >= since).length,
      customers: rows.reduce((a, r) => a + r.customers, 0),
      jobs: rows.reduce((a, r) => a + r.jobs, 0),
      collected_cents: rows.reduce((a, r) => a + r.collected_cents, 0),
      ai_actions: rows.reduce((a, r) => a + r.ai_actions, 0),
      ai_cost_cents: rows.reduce((a, r) => a + r.ai_cost_cents, 0)
    },
    tenants: rows.sort((a, b) => b.jobs - a.jobs)
  });
});

// ── Per-tenant health (still no PII) ───────────────────────────────────────
router.get('/tenants/:id', async (req, res) => {
  const t = await Tenant.findByPk(req.params.id, { raw: true });
  if (!t) return res.status(404).json({ success: false, error: 'Tenant not found' });
  const sub = await PlatformSubscription.findOne({ where: { tenant_id: t.id }, raw: true });
  const staff = await User.count({ where: { tenant_id: t.id } });
  const recent = await AgentCall.findAll({
    where: { tenant_id: t.id }, order: [['created_at', 'DESC']], limit: 25,
    attributes: ['created_at', 'employee', 'tool', 'channel', 'success', 'error', 'latency_ms'], raw: true
  });
  res.json({
    success: true,
    tenant: {
      id: t.id, name: t.name, slug: t.slug, status: t.status, plan: t.plan,
      state: t.state, counties: t.counties, created_at: t.created_at,
      trial_ends_at: t.trial_ends_at,
      payments_connected: !!t.stripe_account_id, phone: t.phone ? 'configured' : null,
      staff_count: staff, settings: t.settings
    },
    subscription: sub,
    recent_ai_activity: recent
  });
});

router.patch('/tenants/:id', async (req, res) => {
  const t = await Tenant.findByPk(req.params.id);
  if (!t) return res.status(404).json({ success: false, error: 'Tenant not found' });
  const { status, plan, settings } = req.body || {};
  if (status && ['active', 'trialing', 'past_due', 'suspended'].includes(status)) t.status = status;
  if (plan) {
    const p = normalizePlan(plan);
    t.plan = p;
    t.settings = { ...(t.settings || {}), enabled_employees: require('../services/provision').enabledFor(p) };
    await PlatformSubscription.update(
      { plan: p, limits: PLAN_LIMITS[p], price_cents: PLAN_LIMITS[p].price_cents },
      { where: { tenant_id: t.id } }
    );
  }
  if (settings) t.settings = { ...(t.settings || {}), ...settings };
  await t.save();
  cacheBust(t.slug);
  res.json({ success: true, tenant: { id: t.id, status: t.status, plan: t.plan, settings: t.settings } });
});

/**
 * Impersonation is the ONLY path to tenant PII, and it is logged with a reason
 * before it grants anything.
 */
router.post('/tenants/:id/impersonate', async (req, res) => {
  const t = await Tenant.findByPk(req.params.id, { raw: true });
  if (!t) return res.status(404).json({ success: false, error: 'Tenant not found' });
  const reason = String((req.body && req.body.reason) || '').trim();
  if (reason.length < 8) {
    return res.status(400).json({ success: false, error: 'A support reason is required (at least 8 characters).' });
  }

  const log = await ImpersonationLog.create({
    tenant_id: t.id, platform_user_id: req.platformUser.id, reason
  });

  const owner = await User.findOne({ where: { tenant_id: t.id, role: 'owner' }, raw: true })
    || await User.findOne({ where: { tenant_id: t.id }, raw: true });
  if (!owner) return res.status(400).json({ success: false, error: 'Tenant has no staff account' });

  res.cookie('lawncopilot_staff', jwt.sign(
    {
      id: owner.id, tenant_id: t.id, email: owner.email, role: owner.role, kind: 'staff',
      impersonated_by: req.platformUser.email, impersonation_id: log.id
    },
    SECRET(), { expiresIn: '2h' }
  ), { ...COOKIE, maxAge: 2 * 3600000 });

  res.json({
    success: true, impersonation_id: log.id,
    admin_url: `/lawncopilot/${t.slug}/admin`,
    expires_in_minutes: 120,
    notice: 'This session is logged against your account.'
  });
});

router.post('/impersonation/:id/end', async (req, res) => {
  await ImpersonationLog.update({ ended_at: new Date() }, { where: { id: req.params.id } });
  res.clearCookie('lawncopilot_staff', { path: '/' });
  res.json({ success: true });
});

router.get('/impersonation', async (req, res) => {
  const rows = await ImpersonationLog.findAll({ order: [['started_at', 'DESC']], limit: 100, raw: true });
  res.json({ success: true, sessions: rows });
});

// ── AI spend across the platform ───────────────────────────────────────────
router.get('/ai-spend', async (req, res) => {
  const days = Number(req.query.days || 30);
  const since = new Date(Date.now() - days * 86400000);
  const rows = await AgentCall.findAll({
    where: { created_at: { [Op.gte]: since } },
    attributes: [
      'employee',
      [fn('count', col('id')), 'calls'],
      [fn('sum', col('cost_cents')), 'cost_cents']
    ],
    group: ['employee'], raw: true
  });
  res.json({
    success: true, period_days: days,
    by_employee: rows.map(r => ({
      employee: r.employee, calls: Number(r.calls), cost_cents: Number(r.cost_cents || 0)
    }))
  });
});

/**
 * Unit economics: what each plan costs us to run and the margin behind its
 * price. This is where the operator sees WHY Solo is $35 and Multi Trucks is
 * $259 — the itemized cost, the markup, and the honest note about infra
 * amortization at current scale.
 */
const unitEcon = require('../services/unit-economics');

router.get('/economics', async (req, res) => {
  try {
    const plans = unitEcon.allPlans().map(p => ({
      plan: p.plan, label: p.usage ? undefined : undefined,
      price_usd: p.price_usd, cost_usd: p.cost_usd,
      floor_usd: p.floor_usd, markup_target: p.markup, markup_realized: p.markup_realized,
      gross_margin_usd: p.gross_margin_usd, gross_margin_pct: p.gross_margin_pct,
      lines: p.lines
    }));
    const book = await unitEcon.platformEconomics();
    res.json({ success: true, markup_target: unitEcon.MARKUP(), plans, book });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * Attribution: which page and which channel produced each trial. First-touch,
 * captured at signup. This is the landscaper's own acquisition source, not
 * customer PII, so the operator sees it in full.
 */
router.get('/attribution', async (req, res) => {
  try {
    const days = Number(req.query.days || 90);
    const since = new Date(Date.now() - days * 86400000);
    const rows = await Tenant.findAll({
      where: { created_at: { [Op.gte]: since } },
      attributes: ['id', 'name', 'slug', 'plan', 'status', 'created_at',
        'utm_source', 'utm_medium', 'utm_campaign', 'first_touch_landing', 'first_touch_referrer'],
      order: [['created_at', 'DESC']], raw: true
    });

    // Direct = no utm_source and no external referrer. A bare referrer host is
    // a channel too, so surface it when there is no campaign tagging.
    const channelOf = t => {
      if (t.utm_source) return `${t.utm_source}${t.utm_medium ? ' / ' + t.utm_medium : ''}`;
      if (t.first_touch_referrer) {
        try { return 'ref: ' + new URL(t.first_touch_referrer).hostname.replace(/^www\./, ''); } catch (e) { return 'referral'; }
      }
      return 'direct';
    };
    const tally = (keyFn) => {
      const m = {};
      rows.forEach(t => { const k = keyFn(t) || '(none)'; m[k] = (m[k] || 0) + 1; });
      return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([key, trials]) => ({ key, trials }));
    };

    res.json({
      success: true,
      period_days: days,
      total_trials: rows.length,
      by_channel: tally(channelOf),
      by_campaign: tally(t => t.utm_campaign),
      by_landing: tally(t => t.first_touch_landing),
      recent: rows.slice(0, 100).map(t => ({
        company: t.name, slug: t.slug, plan: t.plan, status: t.status,
        channel: channelOf(t), campaign: t.utm_campaign || null,
        landing: t.first_touch_landing || null, at: t.created_at
      }))
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
