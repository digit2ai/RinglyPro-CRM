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
  const ghlOn = !!(process.env.LITE_GHL_TOKEN && process.env.LITE_GHL_LOCATION_ID);
  res.json({ outbound_guard: tollFraud.status(), fraud_watch: fraudWatch.status(), webhook_signature: twilioSig.status(),
    phones_now_refused: stale,
    // SAID PLAINLY RATHER THAN IMPLIED. outbound_guard's velocity limits cover
    // what OUR provider dials. A HighLevel transfer is placed by HighLevel, so
    // the per-hour breaker never sees it — the country allow-list still applies
    // at agent-build time, so a forbidden destination is never configured, but
    // an attacker calling the line in a loop is cost amplification we cannot cap
    // from here. Fix belongs in the HighLevel workflow, not in this service.
    ghl_transfers_uncapped: ghlOn ? true : false,
    ghl_post_call_webhook: (() => { const w = require('./webhooks-ghl');
      return { mode: w.mode(), secret_configured: w.secretConfigured(), ...w.stats }; })(),
  });
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

/**
 * GET /internal/security/ghl-probe — READ-ONLY structural probe of the
 * HighLevel Voice AI surface, so a plan decision is made against what the API
 * actually exposes rather than what the docs are remembered to say.
 *
 * It answers one question: can a HighLevel agent call OUR API during a call
 * (a custom/webhook action), which is what would let bookings land in the
 * client's own RinglyPro calendar instead of a HighLevel one.
 *
 * It returns SHAPE ONLY — ids, names, action types and the field names each
 * object carries. Never a prompt, never a phone number, never the token.
 */
router.get('/ghl-probe', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const ghl = require('../telephony/ghl');
  if (!ghl.configured()) return res.json({ configured: false });
  const out = { configured: true, location_id: ghl.locationId(), steps: {} };
  const step = async (name, fn) => {
    try { out.steps[name] = { ok: true, data: await fn() }; }
    catch (e) { out.steps[name] = { ok: false, status: e.status || null, error: e.message }; }
  };
  const arr = (d) => (Array.isArray(d) ? d : (d && typeof d === 'object'
    ? (Object.values(d).find((v) => Array.isArray(v)) || []) : []));

  let agents = [];
  await step('agents', async () => {
    agents = arr(await ghl.listVoiceAgents());
    return agents.map((a) => ({
      id: a.id || a._id || null,
      name: a.agentName || a.name || null,
      on_number: !!a.inboundNumber,
      action_count: arr(a.actions).length,
      fields: Object.keys(a).sort(),
    }));
  });

  // Every action on every agent, by type. This is the list that decides it.
  // The agent object carries them inline; there is no /voice-ai/actions GET.
  await step('actions', async () => {
    const seen = [];
    for (const a of agents.slice(0, 5)) {
      for (const x of arr(a.actions)) seen.push({ agent: a.id || a._id || null,
        type: x.actionType || x.type || null, name: x.name || null,
        fields: Object.keys(x).sort(),
        param_fields: x.actionParameters && typeof x.actionParameters === 'object'
          ? Object.keys(x.actionParameters).sort() : null });
    }
    return seen;
  });

  // Does this token reach calendars at all (the HighLevel-side booking path)?
  await step('calendars', async () => {
    const d = await ghl.call('GET', '/calendars/', { query: { locationId: ghl.locationId() } });
    return arr(d).map((c) => ({ id: c.id || null, name: c.name || null }));
  });

  // Can we CREATE a calendar per tenant (unattended signup) on this plan?
  await step('calendars_writable_check', async () => {
    // Deliberately a malformed create: a 4xx validation error proves the route
    // is reachable and permitted; a 401/403 proves it is not. Nothing is made.
    try { await ghl.call('POST', '/calendars/', { body: { locationId: ghl.locationId() } }); return 'created_unexpectedly'; }
    catch (e) { return { status: e.status, meaning: e.status === 401 || e.status === 403 ? 'NOT PERMITTED' : 'reachable (validation error)', error: e.message }; }
  });

  return res.json(out);
});

/**
 * The HighLevel sub-account pool, behind the SAME owner key as everything else
 * here. Do not give it a second credential — one key, one gate.
 *
 *   GET  /internal/security/ghl-pool        what is stocked and what is claimed
 *   POST /internal/security/ghl-pool        add one the owner made by hand
 *                                           { location_id, token, label?, shared? }
 *                                           or { from_env: true, shared: true } to
 *                                           copy LITE_GHL_TOKEN in without it
 *                                           travelling anywhere.
 *                                           shared:true = ONE sub-account for every
 *                                           client (each still gets their own
 *                                           number, agent and calendar).
 *
 * The token is verified against HighLevel before it is stored and is never
 * returned afterwards, encrypted or otherwise — only whether it is set.
 */
router.get('/ghl-pool', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try { res.json(await require('../services/ghlAccounts').status()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/ghl-pool', express.json({ limit: '16kb' }), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    let { location_id, token, label, shared, from_env } = req.body || {};
    // STOCK FROM ENV, SO A LIVE TOKEN NEVER HAS TO TRAVEL THROUGH A CHAT WINDOW
    // OR A SHELL HISTORY. LITE_GHL_TOKEN / LITE_GHL_LOCATION_ID are already set
    // on the service and already proven against HighLevel; this copies them
    // into the pool (encrypted) without anyone re-typing them.
    if (from_env) {
      const env = require('../telephony/ghl').resolve(null);
      location_id = location_id || env.locationId;
      token = env.token;
      if (!token || !location_id) {
        return res.status(400).json({ ok: false, error: 'env_not_set',
          message: 'LITE_GHL_TOKEN and LITE_GHL_LOCATION_ID must both be set to stock the pool from env.' });
      }
      label = label || 'from LITE_GHL_TOKEN';
    }
    const out = await require('../services/ghlAccounts').addToPool({ location_id, token, label, shared: !!shared });
    res.status(201).json({ ok: true, ...out });
  } catch (e) {
    res.status(e.code === 'BAD_INPUT' || e.code === 'TOKEN_LOCATION_MISMATCH' ? 400 : 500)
       .json({ ok: false, error: e.code || 'failed', message: e.message });
  }
});

module.exports = router;
