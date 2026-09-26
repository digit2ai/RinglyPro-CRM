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
    // The OUTBOUND half of the calendar. A push that keeps failing is silent
    // from a customer's side — they simply see "pick another time" — so the
    // counter and the last error are surfaced here, where the owner can find
    // them, rather than living only in the logs.
    ghl_calendar_push: (() => { const c = require('../services/ghlCalendar');
      return { ...c.stats, slot_validation_at_highlevel: c.validateSlot(),
        version: c.primaryVersion(), version_fallback: c.fallbackVersion() }; })(),
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

/**
 * PROVE THE TWO-WAY CALENDAR AGAINST THE REAL HIGHLEVEL API.
 *
 * WHY THIS EXISTS. The SIT runs against a fake, so the one thing it cannot
 * answer is the one thing the code comments flag as unverified: whether this
 * sub-account honours `Version: v3` on the calendar endpoints, what
 * `POST /calendars/events/appointments` actually returns, and whether the
 * ownership read and the cancel behave as documented. Buying a number to find
 * out costs money and trips the purchase cap; this costs nothing.
 *
 * WHAT IT TOUCHES: the owner's own sub-account, a calendar named "RinglyPro
 * Self Test" (created once, reused after), one contact and one appointment —
 * which it then CANCELS. It never touches a tenant row, never buys anything,
 * and never runs against a customer's calendar.
 */
router.post('/ghl-calendar-selftest', express.json({ limit: '4kb' }), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!(req.body && req.body.confirm === true)) {
    return res.status(400).json({ ok: false, error: 'confirm_required',
      message: 'POST {"confirm":true}. This writes a test appointment into the owner\'s own HighLevel sub-account and then cancels it.' });
  }
  const ghl = require('../telephony/ghl');
  const cal = require('../services/ghlCalendar');
  const steps = [];
  const step = async (name, fn) => {
    const t0 = Date.now();
    try { const out = await fn(); steps.push({ step: name, ok: true, ms: Date.now() - t0, detail: out || null }); return out; }
    catch (e) { steps.push({ step: name, ok: false, ms: Date.now() - t0, status: e.status || null, error: String(e.message || e).slice(0, 300) }); throw e; }
  };

  try {
    const creds = ghl.resolve(null);
    if (!creds.token || !creds.locationId) {
      return res.status(503).json({ ok: false, error: 'not_configured',
        message: 'LITE_GHL_TOKEN and LITE_GHL_LOCATION_ID must be set on the service.' });
    }

    // 1. Which Version header do the calendar endpoints actually accept here?
    const versions = {};
    for (const v of [cal.primaryVersion(), cal.fallbackVersion()]) {
      try { await ghl.call('GET', '/calendars/', { query: { locationId: creds.locationId }, creds, version: v, timeoutMs: 12000 });
            versions[v] = 'accepted'; }
      catch (e) { versions[v] = `refused ${e.status || ''} ${String(e.message || e).slice(0, 120)}`.trim(); }
    }
    steps.push({ step: 'version probe (GET /calendars/)', ok: true, detail: versions });

    // 2. A calendar of our own. It is DELETED again at the end, so a run leaves
    //    the sub-account exactly as it found it — and every run exercises
    //    provisioning.ensureCalendar for real rather than reusing yesterday's.
    const NAME = 'RinglyPro Self Test';
    // ensureCalendar appends " — Appointments" to the business name, so a
    // find-by-exact-name never matched and every run quietly created another.
    const listCals = async () => {
      const list = await ghl.call('GET', '/calendars/', { query: { locationId: creds.locationId }, creds, timeoutMs: 12000 });
      const arr = Array.isArray(list) ? list : (list && (list.calendars || list.data)) || [];
      return arr.filter((c) => c && String(c.name || '').startsWith(NAME));
    };
    const calendarId = await step('create a calendar through provisioning.ensureCalendar', async () => {
      // Exercise THE PRODUCT'S OWN creation path, so this proves provisioning
      // rather than a body written for the test.
      const provisioning = require('../services/provisioning');
      try {
        const id = await provisioning.ensureCalendar(
          { business_name: NAME, timezone: 'America/New_York', ghl_calendar_id: null }, creds);
        return { id, reused: false, via: 'provisioning.ensureCalendar' };
      } catch (e) {
        // If it still fails, say exactly which reduced body HighLevel accepts,
        // so the fix is a fact rather than another guess.
        const tries = [
          { label: 'minimum (locationId+name)', body: { locationId: creds.locationId, name: NAME } },
          { label: 'no calendarType', body: { locationId: creds.locationId, name: NAME, slotDuration: 30, slotDurationUnit: 'mins', isActive: true } },
          { label: 'calendarType personal', body: { locationId: creds.locationId, name: NAME, calendarType: 'personal', slotDuration: 30, slotDurationUnit: 'mins' } },
        ];
        const probed = [];
        for (const t of tries) {
          try {
            const made = await ghl.call('POST', '/calendars/', { creds, timeoutMs: 15000, body: t.body });
            const id = made && (made.id || (made.calendar && made.calendar.id));
            probed.push({ ...t, ok: true, id });
            return { id, reused: false, via: t.label, ensureCalendar_error: String(e.message || e).slice(0, 200), probed };
          } catch (e2) { probed.push({ label: t.label, ok: false, status: e2.status || null, error: String(e2.message || e2).slice(0, 200) }); }
        }
        throw Object.assign(new Error(`every calendar body was refused: ${JSON.stringify(probed).slice(0, 400)}`), { status: 0 });
      }
    });
    const calId = calendarId && calendarId.id;
    if (!calId) throw Object.assign(new Error('no calendar id'), { status: 0 });

    // 3. The real push, through the real code path.
    const tenant = { id: 0, business_name: 'RinglyPro Self Test', timezone: 'America/New_York',
                     ghl_location_id: creds.locationId, ghl_calendar_id: calId };
    const start = new Date(Date.now() + 40 * 86400000); start.setUTCHours(16, 0, 0, 0);
    const appt = { id: 0, origin: 'ringlypro', caller_name: 'RinglyPro SelfTest',
                   callback_number: '+18886103810', starts_at: start,
                   ends_at: new Date(start.getTime() + 30 * 60000), ghl_event_id: null };

    const pushed = await step('push an appointment (contacts/upsert + calendars/events/appointments)',
      () => cal.pushAppointment({ tenant, creds, appt }));
    appt.ghl_event_id = pushed && pushed.eventId;

    // 4. The ownership read the cancel depends on.
    await step('read it back and confirm it is on OUR calendar', async () => {
      const got = await ghl.call('GET', `/calendars/events/appointments/${encodeURIComponent(appt.ghl_event_id)}`,
        { creds, timeoutMs: 12000 });
      const ev = (got && (got.appointment || got.event || got.data || got)) || {};
      return { returned_calendarId: ev.calendarId || ev.calendar_id || null, matches: String(ev.calendarId || ev.calendar_id || '') === String(calId) };
    });

    // 5. A foreign event must be refused.
    await step('REFUSE to cancel an event on a calendar that is not ours', async () => {
      const out = await cal.cancelAppointment({ tenant: { ...tenant, ghl_calendar_id: 'CAL-NOT-OURS' }, creds, appt });
      return { cancelled: out.cancelled, reason: out.error || null,
               correct: out.cancelled === false };
    });

    // 6. Clean up: cancel it for real.
    const cancelled = await step('cancel it (and leave nothing behind)',
      () => cal.cancelAppointment({ tenant, creds, appt }));

    // 7. Leave nothing behind — including anything an earlier run stranded.
    await step('delete every self-test calendar (this run and any left by an earlier one)', async () => {
      const leftovers = await listCals();
      const removed = [];
      for (const c of leftovers) {
        try { await ghl.call('DELETE', `/calendars/${encodeURIComponent(c.id)}`, { creds, timeoutMs: 12000 }); removed.push(c.id); }
        catch (e) { removed.push(`${c.id}:FAILED ${String(e.message || e).slice(0, 80)}`); }
      }
      const still = await listCals();
      return { removed, remaining: still.map((c) => c.id) };
    });

    return res.json({
      ok: steps.every((s) => s.ok) && !!pushed.eventId && !!(cancelled && cancelled.cancelled),
      location_id: creds.locationId, calendar_id: calId, event_id: appt.ghl_event_id,
      versions, steps, stats: cal.stats,
    });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e.code || 'selftest_failed',
      message: String(e.message || e).slice(0, 300), steps, stats: require('../services/ghlCalendar').stats });
  }
});

/**
 * PROVE THE MESSAGE PATH END TO END, ON THE LIVE SERVICE.
 *
 * "The tests pass" and "it works" are different claims. The SIT drives a fake
 * HighLevel against in-memory models; this drives the REAL webhook route over
 * the network, against the REAL Postgres, and reads the result back through
 * the SAME query the dashboard uses. It answers: does a delivery authenticate,
 * does it write a message, does the owner's Messages tab return it, and does
 * the alert text actually leave the building.
 *
 * It uses a THROWAWAY tenant (990001) and a throwaway number, and deletes
 * every row it made — it never writes into a real client's dashboard.
 *
 * `text_me` is optional and is the only part that spends money: give it a
 * mobile and that phone receives the real alert, which is the only way to
 * prove the alert rather than assert it.
 */
router.post('/ghl-message-selftest', express.json({ limit: '4kb' }), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!(req.body && req.body.confirm === true)) {
    return res.status(400).json({ ok: false, error: 'confirm_required',
      message: 'POST {"confirm":true[,"text_me":"+1..."]}. Uses a throwaway tenant and deletes its own rows. With text_me, that phone receives one real SMS.' });
  }
  const { Tenant, Number: NumberModel, Call, Message } = require('../models');
  const crypto = require('crypto');
  const TID = 990001;
  const DID = '+15005550001';            // a reserved test number, never dialable
  const steps = [];
  const step = async (name, fn) => {
    const t0 = Date.now();
    try { const out = await fn(); steps.push({ step: name, ok: true, ms: Date.now() - t0, detail: out ?? null }); return out; }
    catch (e) { steps.push({ step: name, ok: false, ms: Date.now() - t0, error: String(e.message || e).slice(0, 300) }); throw e; }
  };
  const cleanup = async () => {
    await Message.destroy({ where: { tenant_id: TID } }).catch(() => {});
    await Call.destroy({ where: { tenant_id: TID } }).catch(() => {});
    await NumberModel.destroy({ where: { tenant_id: TID } }).catch(() => {});
    await Tenant.destroy({ where: { id: TID } }).catch(() => {});
  };

  const secret = String(process.env.LITE_GHL_WEBHOOK_SECRET || '').trim();
  if (!secret) return res.status(503).json({ ok: false, error: 'no_webhook_secret',
    message: 'LITE_GHL_WEBHOOK_SECRET is not set, so the webhook refuses everything by design.' });

  const textTo = req.body.text_me ? String(req.body.text_me).trim() : null;
  const callId = `selftest-${Date.now()}`;
  try {
    await cleanup();

    await step('create a throwaway tenant and number (never a real client)', async () => {
      await Tenant.create({ id: TID, business_name: 'RinglyPro Self Test', owner_phone: textTo,
        country: 'US', locale: 'en', timezone: 'America/New_York' });
      await NumberModel.create({ tenant_id: TID, did: DID, country: 'US', provider: 'ghl', status: 'active' });
      return { tenant_id: TID, did: DID, will_text: textTo || '(none — pass text_me to prove the alert)' };
    });

    // The REAL route, over the network, signed the way HighLevel would be.
    const port = process.env.PORT || process.env.LITE_PORT || 10001;
    const payload = { call_id: callId, to: DID, from: '+14085559999', duration: 42,
      contact_name: 'Self Test Caller', outcome: 'message taken',
      summary: 'Wants a quote for a new roof. Best time to call back is after 4pm.' };

    const delivered = await step('POST a signed delivery to the real /webhooks/ghl/call', async () => {
      const r = await fetch(`http://127.0.0.1:${port}/webhooks/ghl/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ringlypro-signature': secret },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      });
      return { status: r.status, body: await r.json().catch(() => null) };
    });
    if (delivered.status !== 200) throw new Error(`the webhook refused a correctly signed delivery: ${delivered.status}`);

    await step('an UNSIGNED delivery is still refused', async () => {
      const r = await fetch(`http://127.0.0.1:${port}/webhooks/ghl/call`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, call_id: callId + '-unsigned' }),
        signal: AbortSignal.timeout(20000) });
      if (r.status !== 403) throw new Error(`expected 403, got ${r.status}`);
      return { status: r.status };
    });

    // Read it back exactly as GET /api/messages does.
    const seen = await step('the Messages tab query returns it', async () => {
      const rows = await Message.findAll({ where: { tenant_id: TID }, order: [['created_at', 'DESC']], limit: 200 });
      const unread = rows.filter((m) => !m.read_at).length;
      const m = rows[0];
      return { count: rows.length, unread,
        caller_name: m && m.caller_name, callback_number: m && m.callback_number,
        body: m && String(m.body).slice(0, 120) };
    });
    if (!seen.count) throw new Error('the delivery was accepted but no message reached the dashboard query');

    // THE MIRROR'S ALERT IS FIRE-AND-FORGET, so its result is invisible to
    // this run — "attempted" is not proof a phone rang. Send one more through
    // the SAME transport and report what it actually returned, so a silent
    // failure (bad credentials, an unregistered sender, the toll-fraud guard)
    // is named instead of assumed.
    if (textTo) {
      await step('send a test alert and report the real result', async () => {
        const smsSvc = require('../services/sms');
        const ghlMod = require('../telephony/ghl');
        const creds = ghlMod.resolve(null);
        // Send from a number the sub-account actually owns. The throwaway DID
        // is a reserved test number, and a real carrier refuses a From it does
        // not hold — which would report a transport failure that is really a
        // fixture problem.
        // ONLY a number this sub-account owns. It used to fall back to
        // LITE_SMS_FROM — the Twilio toll-free — and HighLevel returned 201
        // for a sender it has never held, so the run reported "sent" and no
        // phone ever rang. No number, no send, and say so.
        const GhlProvider = require('../telephony/ghlProvider');
        const owned = await new GhlProvider({ creds }).ownedNumbers();
        if (!owned.length) {
          return { skipped: 'this sub-account owns no phone number yet, so it cannot send a text. Provision one first.' };
        }
        const from = owned[0];

        const t = await Tenant.findByPk(TID);
        const r = await smsSvc.send({ tenant: t, from, to: textTo,
          body: 'RinglyPro Lite test: this is the alert you get when the AI takes a message. Nothing to do.' });
        if (!r.sent) throw new Error(`${r.via || 'carrier'} did not accept it: ${r.reason || 'unknown'}`);
        // ACCEPTED, not delivered — the carrier hop is not something this run
        // can see, and calling it "sent" is exactly how a silent failure
        // passed for a success.
        return { accepted_by: r.via, from, segments: r.segments, to: tollFraud.mask(textTo),
                 note: 'accepted for delivery — confirm on the handset' };
      });
    }

    const alerts = require('./webhooks-ghl').stats;
    const out = {
      ok: steps.every((s) => s.ok),
      texted: textTo ? `accepted for delivery to ${tollFraud.mask(textTo)} — confirm on the handset` : 'not requested',
      steps,
      webhook_counters: { received: alerts.received, accepted: alerts.accepted, unauthenticated: alerts.unauthenticated },
      still_unproven: 'Whether HighLevel\'s own workflow calls this URL on a real call. Only a real call proves that; watch ghl_post_call_webhook.received rise above 0.',
    };
    await cleanup();
    return res.json(out);
  } catch (e) {
    await cleanup();
    return res.status(502).json({ ok: false, error: 'selftest_failed', message: String(e.message || e).slice(0, 300), steps });
  }
});

/**
 * SIGNUP PREFLIGHT — everything the first real signup depends on, checked
 * BEFORE any money is spent. Read-only: it buys nothing, creates nothing and
 * writes no row.
 *
 * It exists because two steps of provisioning had never once executed against
 * the live API, and the first one we ran turned out to be broken (the calendar
 * sent a field HighLevel has no property for). The remaining unexecuted steps
 * are the number purchase and the agent build; this checks every precondition
 * either of them has.
 */
router.get('/signup-preflight', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const ghl = require('../telephony/ghl');
  const GhlProvider = require('../telephony/ghlProvider');
  const { Tenant, Number: NumberModel } = require('../models');
  const { getNumberProvider } = require('../telephony');
  const ent = require('../services/entitlement');
  const out = { blocking: [], warnings: [], checks: {} };
  const add = (k, v) => { out.checks[k] = v; };

  try {
    // ---- configuration, before anything reaches HighLevel ----
    const creds = ghl.resolve(null);
    add('number_provider', getNumberProvider().name);
    if (getNumberProvider().name !== 'ghl') out.blocking.push('LITE_GHL_TOKEN / LITE_GHL_LOCATION_ID are not both set, so signup would fall back to Twilio — whose voice is disabled account-wide.');
    add('billing_enabled', ent.entitlement({}).billing_enabled !== undefined ? ent.entitlement({}).billing_enabled : null);
    add('webhook_secret_set', !!String(process.env.LITE_GHL_WEBHOOK_SECRET || '').trim());
    if (!out.checks.webhook_secret_set) out.blocking.push('LITE_GHL_WEBHOOK_SECRET is unset, so every post-call delivery is refused (503) and no message or booking would ever reach the dashboard.');

    const capPerDay = Math.max(0, parseInt(process.env.LITE_MAX_NUMBERS_PER_DAY || '5', 10) || 0);
    const boughtToday = await NumberModel.count({ where: { created_at: { [require('sequelize').Op.gte]: new Date(Date.now() - 24 * 3600 * 1000) } } });
    add('purchase_cap', { per_day: capPerDay, bought_last_24h: boughtToday, remaining: Math.max(0, capPerDay - boughtToday) });
    if (boughtToday >= capPerDay) out.blocking.push(`The 24h number purchase cap is reached (${boughtToday}/${capPerDay}).`);

    const tf = tollFraud.status();
    add('outbound_locked', !!(tf && tf.locked));
    if (tf && tf.locked) out.blocking.push('The toll-fraud guard is locked, so provisioning refuses to run.');

    // ---- the sub-account ----
    const pool = await require('../services/ghlAccounts').status();
    add('sub_account', { mode: pool.mode, shared: pool.shared, free: pool.free, claimed: pool.claimed });
    if (!pool.shared && !pool.free) out.blocking.push('No shared or free sub-account in the pool — signup would fail at the claim step with POOL_EMPTY.');

    // ---- are there numbers to buy at all? (a READ; buys nothing) ----
    try {
      const avail = await ghl.searchAvailable({}, creds);
      const arr = Array.isArray(avail) ? avail : (avail && (avail.numbers || avail.data)) || [];
      add('us_numbers_available', { count: arr.length, sample: arr.slice(0, 3).map((n) => n.phoneNumber || n.number) });
      if (!arr.length) out.blocking.push('HighLevel returned no purchasable US local numbers, so the buy step would fail.');
    } catch (e) { add('us_numbers_available', { error: String(e.message || e).slice(0, 200) }); out.blocking.push(`Could not list purchasable numbers: ${String(e.message || e).slice(0, 120)}`); }

    // ---- the template the client's agent is copied from ----
    try {
      const tpl = await new GhlProvider({ creds }).templateAgent();
      add('template_agent', tpl ? { id: tpl.id || null, name: tpl.agentName || tpl.name || null,
        has_prompt: !!tpl.agentPrompt, voiceId: tpl.voiceId || null, language: tpl.language || null,
        end_call_workflows: (tpl.callEndWorkflowIds || []).length } : null);
      if (!tpl) out.warnings.push('No template agent exists in the sub-account. Signup still works, but the client gets a generic prompt and voice instead of the one you wrote — and no end-of-call workflow, which is what fires the post-call webhook.');
      else if (!(tpl.callEndWorkflowIds || []).length) out.warnings.push('The template agent has NO end-of-call workflow. That workflow is what calls our webhook, so messages and bookings would never reach the dashboard.');
    } catch (e) { add('template_agent', { error: String(e.message || e).slice(0, 200) }); out.warnings.push(`Could not read the template agent: ${String(e.message || e).slice(0, 120)}`); }

    // ---- has the webhook EVER been reached? ----
    const w = require('./webhooks-ghl').stats;
    add('post_call_webhook', { mode: require('./webhooks-ghl').mode(), received: w.received, accepted: w.accepted });
    if (!w.received) out.warnings.push('The post-call webhook has never been reached from HighLevel (received 0). Only a real call proves that leg.');

    // ---- anyone already part-provisioned? ----
    const stuck = await Tenant.findAll({ where: { provisioning_state: ['claimed', 'number', 'calendar', 'agent'] } });
    add('part_provisioned_tenants', stuck.map((t) => ({ id: t.id, state: t.provisioning_state, error: t.provisioning_error })));

    add('cost_of_one_signup_usd', { number_monthly: GhlProvider.MONTHLY_COST_USD, note: 'plus per-minute Voice AI at the pay-per-use rate' });
    out.ready = out.blocking.length === 0;
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e).slice(0, 300), checks: out.checks });
  }
});

/**
 * Re-point every provisioned agent at the template's end-of-call workflows.
 * Run this after adding the workflow in HighLevel — agents built before it
 * existed will never call our webhook otherwise.
 */
router.post('/sync-agent-workflows', express.json({ limit: '4kb' }), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { Tenant } = require('../models');
  const provisioning = require('../services/provisioning');
  try {
    const tenants = await Tenant.findAll({ where: { provisioning_state: 'ready' } });
    const results = [];
    for (const t of tenants) {
      try { results.push({ tenant_id: t.id, ...(await provisioning.syncWorkflows(t)) }); }
      catch (e) { results.push({ tenant_id: t.id, changed: false, error: String(e.message || e).slice(0, 160) }); }
    }
    res.json({ ok: true, tenants: tenants.length, results });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e).slice(0, 200) }); }
});

/**
 * Attempt ONE real purchase and report HighLevel's full response.
 *
 * Two signups failed with their message "request took longer than expected",
 * which says nothing about why. This runs the same call the product runs and
 * returns the status code and the whole body. It CAN succeed — that is fine
 * and desirable: a bought number with no tenant row is adopted by the next
 * resume rather than bought again.
 */
router.post('/buy-number-probe', express.json({ limit: '2kb' }), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!(req.body && req.body.confirm === true)) {
    return res.status(400).json({ ok: false, error: 'confirm_required',
      message: 'POST {"confirm":true[,"area":"727"]}. This attempts a REAL purchase (~$1.15/mo if it succeeds).' });
  }
  const ghl = require('../telephony/ghl');
  const area = /^\d{3}$/.test(String(req.body.area || '')) ? String(req.body.area) : null;
  const t0 = Date.now();
  try {
    const creds = ghl.resolve(null);
    const avail = await ghl.searchAvailable(area ? { firstPart: area } : {}, creds);
    const arr = Array.isArray(avail) ? avail : (avail && (avail.numbers || avail.data)) || [];
    const phoneNumber = (arr[0] && (arr[0].phoneNumber || arr[0].number)) || null;
    if (!phoneNumber) return res.json({ ok: false, step: 'search', message: 'no number offered for that area' });

    const out = await ghl.call('POST', `/phone-system/numbers/location/${creds.locationId}/purchase`, {
      creds, timeoutMs: 60000,
      body: { phoneNumber, countryCode: 'US', numberType: 'local', fingerprintId: 'ringlypro-lite-probe' },
    });
    return res.json({ ok: true, bought: phoneNumber, ms: Date.now() - t0, response: out,
      next: 'Resume the signup — provisioning adopts an unclaimed number instead of buying again.' });
  } catch (e) {
    return res.status(502).json({ ok: false, ms: Date.now() - t0,
      status: e.status || null, message: String(e.message || e).slice(0, 300), raw: e.body || null });
  }
});

/** Read-only: which numbers does the sub-account actually OWN? */
router.get('/owned-numbers', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const ghl = require('../telephony/ghl');
  try {
    const creds = ghl.resolve(null);
    const out = {};
    for (const version of ['v3', '2021-07-28']) {
      try {
        const r = await ghl.call('GET', `/phone-system/numbers/location/${creds.locationId}`,
          { creds, version, timeoutMs: 15000 });
        // Report the RAW shape when it is not what we expected. Guessing a
        // wrapper is how "0 numbers" gets reported for an account that has some.
        let arr = Array.isArray(r) ? r : null;
        if (!arr && r && typeof r === 'object') {
          for (const v of Object.values(r)) if (Array.isArray(v)) { arr = v; break; }
        }
        out[version] = arr
          ? { count: arr.length, numbers: arr.map((n) => n.phoneNumber || n.number || n.number_e164).filter(Boolean).slice(0, 20) }
          : { count: null, raw_keys: r && typeof r === 'object' ? Object.keys(r) : typeof r, raw: JSON.stringify(r).slice(0, 400) };
      } catch (e) { out[version] = { error: String(e.message || e).slice(0, 160) }; }
    }
    res.json({ location_id: creds.locationId, by_version: out,
      lite_sms_from: process.env.LITE_SMS_FROM || '(unset — falls back to the Twilio toll-free)' });
  } catch (e) { res.status(502).json({ error: String(e.message || e).slice(0, 200) }); }
});

/** Read-only: is a given area code actually purchasable right now? Buys nothing. */
router.get('/available-numbers', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const ghl = require('../telephony/ghl');
  const area = String(req.query.area || '').trim();
  try {
    const creds = ghl.resolve(null);
    // `?matrix=1` tries every (Version x firstPart) combination and reports
    // which one actually filters. The docs say this endpoint requires
    // Version v3 while the rest of this service sends 2021-07-28, and
    // "the beginning of the phone number" does not say whether that includes
    // the country code — so it is measured, not guessed.
    if (req.query.matrix && /^\d{3}$/.test(area)) {
      const rows = [];
      for (const version of ['v3', '2021-07-28']) {
        for (const fp of [area, `1${area}`, `+1${area}`]) {
          try {
            const r = await ghl.call('GET', `/phone-system/numbers/location/${creds.locationId}/available`,
              { query: { countryCode: 'US', numberTypes: 'local', voiceEnabled: true, smsEnabled: true, firstPart: fp },
                creds, version, timeoutMs: 15000 });
            const a = Array.isArray(r) ? r : (r && (r.numbers || r.data)) || [];
            const n = a.map((x) => x.phoneNumber || x.number).filter(Boolean);
            rows.push({ version, firstPart: fp, returned: n.length,
              in_area: n.filter((x) => String(x).startsWith(`+1${area}`)).length, sample: n.slice(0, 3) });
          } catch (e) { rows.push({ version, firstPart: fp, error: String(e.message || e).slice(0, 120) }); }
        }
      }
      return res.json({ area_code: area, matrix: rows });
    }

    // The BARE area code — see ghlProvider.buyNumber. This probe shipped with
    // the very bug it was written to find, and reported "0 available in 813"
    // for an area that has 9.
    const q = /^\d{3}$/.test(area) ? { firstPart: area } : {};
    const raw = await ghl.searchAvailable(q, creds);
    const arr = Array.isArray(raw) ? raw : (raw && (raw.numbers || raw.data)) || [];
    const nums = arr.map((n) => n.phoneNumber || n.number).filter(Boolean);
    // HighLevel's filter is a PREFIX hint, not a guarantee — count what really
    // matches, so "30 results" can never be mistaken for "30 in your city".
    const inArea = area ? nums.filter((n) => String(n).startsWith(`+1${area}`)) : nums;
    res.json({ area_code: area || null, returned: nums.length, in_that_area: inArea.length,
      sample_in_area: inArea.slice(0, 5), sample_returned: nums.slice(0, 5) });
  } catch (e) { res.status(502).json({ error: String(e.message || e).slice(0, 200) }); }
});

/**
 * WIPE EVERY LITE ACCOUNT AND START CLEAN.
 *
 * The Lite database is a separate Render instance and is deliberately not
 * reachable from the repo, so "just delete the rows" has nowhere to run. This
 * is that operation, behind the same admin key, with the two guards that
 * matter.
 *
 * IT REFUSES WHILE ANY TENANT STILL HOLDS A PHONE NUMBER. HighLevel has NO
 * release API — a number is given up by hand in their UI — so deleting the row
 * does not stop the ~$1.15/month; it just removes the only record of which
 * number was ours and who had it. The refusal lists them so they can be
 * released first. `i_have_released_the_numbers: true` proceeds anyway.
 *
 * A sub-account a tenant had CLAIMED goes back to `free` so the pool is usable
 * again. A `shared` row is never touched, and no credential is deleted.
 */
router.post('/reset-accounts', express.json({ limit: '4kb' }), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { sequelize, Tenant, User, Number: NumberModel, Call, Message,
          AvailabilityRule, Appointment, Transcript, Recharge, GhlAccount } = require('../models');

  if (!req.body || req.body.confirm !== 'delete-all-accounts') {
    return res.status(400).json({ ok: false, error: 'confirm_required',
      message: 'POST {"confirm":"delete-all-accounts"}. This permanently deletes every Lite tenant, login, call, message and appointment.' });
  }

  try {
    const tenants = await Tenant.findAll();
    const ids = tenants.map((t) => t.id);
    const held = await NumberModel.findAll({ where: { status: 'active' } });

    if (held.length && req.body.i_have_released_the_numbers !== true) {
      return res.status(409).json({
        ok: false, error: 'numbers_still_held',
        message: 'These numbers are still on the account. HighLevel has no release API, so deleting these rows would keep the monthly charge and lose the record of which number was whose. Release them in HighLevel first, then re-send with "i_have_released_the_numbers": true.',
        numbers: held.map((n) => ({ tenant_id: n.tenant_id, did: n.did, provider: n.provider })),
      });
    }

    const before = { tenants: ids.length, logins: await User.count(), numbers: await NumberModel.count(),
      calls: await Call.count(), messages: await Message.count(), appointments: await Appointment.count() };

    const deleted = {};
    await sequelize.transaction(async (tx) => {
      const opt = { transaction: tx, where: {} };
      // Children first. `where: {}` is every row on purpose: this wipes the
      // whole service, and a per-tenant filter would strand rows whose tenant
      // was already gone.
      deleted.appointments = await Appointment.destroy(opt);
      deleted.messages = await Message.destroy(opt);
      deleted.transcripts = await Transcript.destroy(opt);
      deleted.calls = await Call.destroy(opt);
      deleted.availability_rules = await AvailabilityRule.destroy(opt);
      deleted.recharges = await Recharge.destroy(opt);
      deleted.numbers = await NumberModel.destroy(opt);
      deleted.logins = await User.destroy(opt);
      deleted.tenants = await Tenant.destroy(opt);

      // Hand any exclusively-claimed sub-account back to the pool. A shared
      // row serves everyone and is never claimed, so it is left alone.
      const [, freed] = await GhlAccount.update(
        { status: 'free', claimed_by_tenant: null, claimed_at: null },
        { where: { status: 'claimed' }, transaction: tx });
      deleted.sub_accounts_freed = Array.isArray(freed) ? freed.length : (freed || 0);
    });

    const pool = await require('../services/ghlAccounts').status();
    return res.json({
      ok: true, before, deleted,
      pool_after: { mode: pool.mode, shared: pool.shared, free: pool.free, claimed: pool.claimed },
      kept: 'HighLevel sub-accounts and their stored tokens, and the platform security-alert log. No credential was deleted.',
      next: 'Sign up fresh at /signup. The next tenant gets id 1 only if the sequence was reset; ids simply continue otherwise, which is harmless.',
    });
  } catch (e) {
    console.error('[lite:security] reset-accounts failed:', e.message);
    return res.status(500).json({ ok: false, error: 'reset_failed', message: String(e.message || e).slice(0, 300) });
  }
});

module.exports = router;
