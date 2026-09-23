'use strict';

/**
 * Security report + outbound lock control. Owner only (LITE_ADMIN_KEY in the
 * x-admin-key header). A missing or wrong key answers 404, not 401: this route
 * confirms nothing to someone who should not know it exists.
 *
 *   GET  /internal/security          guard, watch and webhook-signature state
 *   POST /internal/security/run      run one fraud-watch pass now
 *   POST /internal/security/unlock   lift an auto-lock after a person has looked
 */
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const tollFraud = require('../security/tollFraud');
const fraudWatch = require('../security/fraudWatch');
const twilioSig = require('../security/twilioSignature');

function keyOk(req) {
  const key = process.env.LITE_ADMIN_KEY || '';
  const got = String(req.headers['x-admin-key'] || '');
  if (key.length < 16 || !got) return false;
  // Constant-time over digests, so the key's length does not leak.
  const a = crypto.createHash('sha256').update(key).digest();
  const b = crypto.createHash('sha256').update(got).digest();
  return crypto.timingSafeEqual(a, b);
}
router.use((req, res, next) => (keyOk(req) ? next() : res.status(404).json({ error: 'not_found' })));

router.get('/', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  // Phones saved before the allow-list existed that it would now refuse: those
  // owners silently stop getting texts or transfers, so they are listed here
  // (tenant id and field only, never the number) for someone to fix.
  let stale = null;
  try {
    const { Tenant } = require('../models');
    const rows = await Tenant.findAll({ attributes: ['id', 'country', 'owner_phone', 'transfer_number'] });
    stale = [];
    for (const r of rows) for (const f of ['owner_phone', 'transfer_number']) {
      if (r[f] && !tollFraud.checkDestination(r[f], { defaultCountry: r.country }).ok) stale.push({ tenant_id: r.id, field: f });
    }
  } catch (e) { stale = { error: e.message }; }
  res.json({ outbound_guard: tollFraud.status(), fraud_watch: fraudWatch.status(), webhook_signature: twilioSig.status(),
    phones_now_refused: stale });
});

router.post('/run', async (req, res) => {
  try {
    const raised = await fraudWatch.runOnce(req.app.get('fraudWatchDeps')());
    res.json({ raised, fraud_watch: fraudWatch.status() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/unlock', (req, res) => {
  tollFraud.unlock();
  console.warn('[lite:security] outbound lock lifted by admin');
  res.json({ ok: true, outbound_guard: tollFraud.status() });
});

/**
 * GET /internal/security/users — who has signed up.
 *
 * The owner question "list the current users" had no answer: Lite is
 * self-serve with no admin console, and its database is a SEPARATE Render
 * instance whose URL is never in the repo. This answers it behind the SAME
 * admin key and the same fail-shut 404, so no second credential exists.
 *
 * password_hash is never selected. Phone numbers are masked, exactly as the
 * fraud watch masks them, because this report may be pasted somewhere.
 */
router.get('/users', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const { Tenant, User, Number } = require('../models');
    const [tenants, users, numbers] = await Promise.all([
      Tenant.findAll({ attributes: ['id', 'business_name', 'owner_name', 'owner_email', 'owner_phone',
        'country', 'locale', 'timezone', 'subscription_status', 'trial_ends_at', 'suspended_at',
        'active', 'created_at'], order: [['id', 'ASC']] }),
      User.findAll({ attributes: ['id', 'tenant_id', 'email', 'name', 'created_at'], order: [['id', 'ASC']] }),
      Number.findAll({ attributes: ['tenant_id', 'did', 'status'] })
    ]);
    const byTenant = new Map();
    for (const t of tenants) byTenant.set(t.id, { tenant_id: t.id, business_name: t.business_name,
      owner_name: t.owner_name || null, owner_email: t.owner_email || null,
      owner_phone: t.owner_phone ? tollFraud.mask(t.owner_phone) : null,
      country: t.country, locale: t.locale, timezone: t.timezone,
      subscription_status: t.subscription_status, trial_ends_at: t.trial_ends_at,
      suspended_at: t.suspended_at, active: t.active, created_at: t.created_at,
      numbers: [], logins: [] });
    for (const n of numbers) {
      const row = byTenant.get(n.tenant_id);
      if (row) row.numbers.push({ did: n.did ? tollFraud.mask(n.did) : null, status: n.status });
    }
    const orphans = [];
    for (const u of users) {
      const one = { user_id: u.id, email: u.email, name: u.name || null, created_at: u.created_at };
      const row = byTenant.get(u.tenant_id);
      if (row) row.logins.push(one); else orphans.push({ ...one, tenant_id: u.tenant_id });
    }
    const list = [...byTenant.values()];
    res.json({
      counts: { tenants: list.length, logins: users.length,
        active_tenants: list.filter((t) => t.active).length,
        trialing: list.filter((t) => t.subscription_status === 'trialing').length,
        subscribed: list.filter((t) => t.subscription_status === 'active').length,
        suspended: list.filter((t) => !!t.suspended_at).length },
      tenants: list,
      logins_without_a_tenant: orphans
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
