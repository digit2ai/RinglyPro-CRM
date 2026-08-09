'use strict';

// =============================================================
// SUBSCRIBERS ADMIN — who is subscribed, what they paid, and when.
//
// A SEPARATE MODULE FROM /admin ON PURPOSE, AND IT CROSSES A LINE THAT ONE
// DELIBERATELY DOES NOT. routes/admin.js states its boundary plainly: "an
// administrator sees COUNTS AND MONEY, NOT SUBSCRIBER PII", and its own
// subscriber list is pseudonymised down to an email hash and a domain.
//
// That boundary is kept where it matters and relaxed where the business cannot
// function without it:
//
//   * BILLING IDENTITY IS VISIBLE HERE — name, email, what they paid, when they
//     subscribed. You cannot run a paid product without being able to answer
//     "who is this charge from" for a refund, a support ticket or a tax return.
//   * CAREER DATA IS STILL INVISIBLE. No resume, no matches, no outreach, no
//     settings, no pipeline. That is the part of /admin's rule worth keeping,
//     and reaching it still requires the audited impersonation flow over there.
//   * EVERY read of this list is written to ju_audit_log with the admin email.
//     A privacy boundary that is relaxed without a trail is just a hole.
//
// Auth is its own credential and its own cookie, so neither a subscriber
// session nor a /admin session grants access here, and vice versa.
// =============================================================

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const express = require('express');
const { models } = require('../models');
const billing = require('../services/billing');

const router = express.Router();

const SECRET = process.env.JOBUP_JWT_SECRET || 'dev-only-insecure-secret';
const COOKIE = 'jobup_subs_admin';
const TTL_H = 8;   // an admin session is not a 30-day one

function adminEmail() {
  return String(process.env.JOBUP_SUBS_ADMIN_EMAIL || 'admin@jobup.dev').toLowerCase().trim();
}
function adminPassword() {
  return String(process.env.JOBUP_SUBS_ADMIN_PASSWORD || 'Palindrome@7');
}
/**
 * Unlike /admin, this console ships with a working default credential because
 * the owner asked for one. That is a real exposure on a public domain: set
 * JOBUP_SUBS_ADMIN_PASSWORD on Render and the default stops being a key anyone
 * who reads this file can use. `usingDefaultPassword` is surfaced in /session
 * and rendered as a warning banner so the risk is visible, not buried.
 */
function usingDefaultPassword() {
  return !process.env.JOBUP_SUBS_ADMIN_PASSWORD;
}

function issue(email) {
  return jwt.sign({ subadm: true, email, jti: crypto.randomUUID() }, SECRET, { expiresIn: `${TTL_H}h` });
}

function requireAdmin(req, res, next) {
  const token = (req.cookies && req.cookies[COOKIE]) || '';
  if (!token) return res.status(401).json({ error: 'sign-in required' });
  try {
    const p = jwt.verify(token, SECRET);
    // Re-check the email against the CURRENT config, so changing the env var
    // revokes live sessions instead of leaving them valid for eight hours.
    if (!p.subadm || String(p.email || '').toLowerCase() !== adminEmail()) {
      return res.status(403).json({ error: 'not an admin account' });
    }
    req.admin = { email: p.email };
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'session expired' });
  }
}

async function audit(actor, action, reason) {
  try {
    await models.audit_log.create({
      tenant_id: null, actor: String(actor).slice(0, 200),
      action: String(action).slice(0, 200), reason: reason ? String(reason).slice(0, 1000) : null,
    });
  } catch (e) { console.warn('[subs-admin] audit write failed:', e.message); }
}

// ---------------------------------------------------------------
// Sign in / out
// ---------------------------------------------------------------
const attempts = new Map();

router.post('/api/login', async (req, res) => {
  const key = (req.headers['cf-connecting-ip'] || req.ip || '') + '|subs-admin';
  const now = Date.now();
  const rec = attempts.get(key) || { n: 0, until: 0 };
  if (rec.until > now) {
    return res.status(429).json({ error: 'too many attempts', retry_after_s: Math.ceil((rec.until - now) / 1000) });
  }

  const email = String((req.body || {}).email || '').toLowerCase().trim();
  const password = String((req.body || {}).password || '');

  const emailOk = email === adminEmail();
  // Constant-time, and always compared even when the email is wrong so the
  // response time cannot reveal which half failed.
  const a = Buffer.from(password.padEnd(64).slice(0, 64));
  const b = Buffer.from(adminPassword().padEnd(64).slice(0, 64));
  const passOk = crypto.timingSafeEqual(a, b);

  if (!emailOk || !passOk) {
    rec.n++;
    if (rec.n >= 5) { rec.until = now + 15 * 60 * 1000; rec.n = 0; }
    attempts.set(key, rec);
    await audit(email || 'unknown', 'subs_admin.login.failed', null);
    return res.status(401).json({ error: 'not authorised' });
  }

  attempts.delete(key);
  await audit(email, 'subs_admin.login.success', null);
  res.cookie(COOKIE, issue(email), {
    httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: TTL_H * 3600 * 1000,
  });
  res.json({ ok: true, email, expires_h: TTL_H });
});

router.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

router.get('/api/session', requireAdmin, (req, res) => {
  res.json({
    ok: true, email: req.admin.email,
    scope: 'billing identity only — no resumes, matches or outreach',
    using_default_password: usingDefaultPassword(),
  });
});

// ---------------------------------------------------------------
// The list
// ---------------------------------------------------------------

/** Money a subscriber has actually been invoiced and paid, from the invoice rows. */
function moneyFor(invoices) {
  const paid = invoices.filter((i) => i.status === 'paid');
  const cents = paid.reduce((a, i) => a + (i.amount_cents || 0), 0);
  const last = paid
    .slice()
    .sort((x, y) => new Date(y.paid_at || 0) - new Date(x.paid_at || 0))[0];
  return {
    amount_paid_usd: Number((cents / 100).toFixed(2)),
    payments: paid.length,
    last_payment_at: last ? last.paid_at : null,
    open_invoices: invoices.filter((i) => i.status !== 'paid').length,
  };
}

async function buildRows() {
  const subs = await models.subscribers.findAll({});
  const invoices = await models.invoices.findAll({});
  const byTenant = new Map();
  for (const inv of invoices) {
    if (!byTenant.has(inv.tenant_id)) byTenant.set(inv.tenant_id, []);
    byTenant.get(inv.tenant_id).push(inv);
  }
  return subs.map((s) => {
    const money = moneyFor(byTenant.get(s.id) || []);
    return {
      id: s.id,
      name: s.name || null,
      email: s.email,
      status: s.status,
      // 'free_test' accounts were activated without payment. Surfaced on every
      // row so a test account is never read as a paying customer.
      activation: s.activation || 'paid',
      // The date they became a subscriber. activated_at is the real event;
      // created_at is when the row appeared. Which one is reported is stated,
      // never silently swapped.
      subscribed_at: s.activated_at || s.created_at || null,
      subscribed_at_source: s.activated_at ? 'activated_at' : 'created_at',
      current_period_end: s.current_period_end || null,
      address: s.address || null,
      ...money,
    };
  }).sort((a, b) => new Date(b.subscribed_at || 0) - new Date(a.subscribed_at || 0));
}

router.get('/api/subscribers', requireAdmin, async (req, res) => {
  try {
    const rows = await buildRows();
    await audit(req.admin.email, 'subs_admin.list.viewed', `${rows.length} rows`);

    const paying = rows.filter((r) => r.activation !== 'free_test');
    const byStatus = {};
    rows.forEach((r) => { byStatus[r.status] = (byStatus[r.status] || 0) + 1; });

    res.json({
      subscribers: rows,
      totals: {
        subscribers: rows.length,
        active: rows.filter((r) => r.status === 'active').length,
        free_test: rows.length - paying.length,
        by_status: byStatus,
        // Straight from paid invoice rows. Never estimated from the list price,
        // which would invent revenue for anyone who has not been charged yet.
        collected_usd: Number(rows.reduce((a, r) => a + r.amount_paid_usd, 0).toFixed(2)),
        list_price_usd: billing.PRICE_USD,
      },
      note: 'Amounts come from paid invoice rows, not from the list price. '
          + 'A subscriber with no invoice on file shows 0.00, which means not yet charged.',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** One subscriber's invoice history — the audit trail behind their total. */
router.get('/api/subscribers/:id/invoices', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
    const sub = await models.subscribers.findOne({ where: { id } });
    if (!sub) return res.status(404).json({ error: 'no such subscriber' });
    const invoices = await models.invoices.findAll({ where: { tenant_id: id } });
    await audit(req.admin.email, 'subs_admin.invoices.viewed', `subscriber ${id}`);
    res.json({
      subscriber: { id: sub.id, name: sub.name || null, email: sub.email },
      invoices: invoices
        .slice()
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
        .map((i) => ({
          stripe_invoice_id: i.stripe_invoice_id || null,
          amount_usd: Number(((i.amount_cents || 0) / 100).toFixed(2)),
          status: i.status,
          dunning_stage: i.dunning_stage || 0,
          paid_at: i.paid_at || null,
          created_at: i.created_at || null,
        })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/export.csv', requireAdmin, async (req, res) => {
  try {
    const rows = await buildRows();
    await audit(req.admin.email, 'subs_admin.export.csv', `${rows.length} rows`);
    const cols = ['id', 'name', 'email', 'status', 'activation', 'subscribed_at',
      'current_period_end', 'amount_paid_usd', 'payments', 'last_payment_at',
      'open_invoices', 'address'];
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="jobup-subscribers.csv"');
    res.send(csv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/health', (req, res) => {
  res.json({
    ok: true, module: 'subscribers-admin',
    admin_email: adminEmail(),
    using_default_password: usingDefaultPassword(),
  });
});

module.exports = router;
module.exports.requireAdmin = requireAdmin;
module.exports.usingDefaultPassword = usingDefaultPassword;
