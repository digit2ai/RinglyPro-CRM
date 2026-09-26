'use strict';

/**
 * Turn a paid signup into a working phone assistant, with no human step.
 *
 * THE FLOW THE OWNER SPECIFIED: the client signs up on RinglyPro, pays through
 * RinglyPro's Stripe, and then — behind a curtain they never see — a HighLevel
 * sub-account is claimed, a number is bought, a calendar is created, and a
 * Voice AI agent is built from the owner's template and pointed at that
 * calendar. They sign in to a RinglyPro dashboard with their number on it. The
 * word "HighLevel" appears nowhere a customer can read.
 *
 * EVERY STEP IS RESUMABLE AND NONE IS REPEATABLE BY ACCIDENT. A half-built
 * client is worse than a failed signup, so each step records that it happened
 * on the tenant row and is skipped on a retry:
 *
 *   pending → claimed → number → calendar → agent → ready
 *
 * The number purchase carries a per-tenant fingerprint so HighLevel itself
 * refuses a second buy, and a failure after the purchase KEEPS the number
 * rather than abandoning a paid-for asset. `failed` is never terminal: the
 * state says where it stopped and `provision()` picks up from there.
 */
const { sequelize, Tenant, Number } = require('../models');
const accounts = require('./ghlAccounts');
const secretbox = require('./secretbox');
const ghl = require('../telephony/ghl');
const GhlProvider = require('../telephony/ghlProvider');
const tollFraud = require('../security/tollFraud');

const STATES = ['pending', 'claimed', 'number', 'calendar', 'agent', 'ready'];
function reached(state, step) { return STATES.indexOf(state || 'pending') >= STATES.indexOf(step); }

async function mark(tenant, state, extra = {}) {
  await tenant.update({ provisioning_state: state, provisioning_error: null, ...extra });
  return tenant;
}

/**
 * The calendar the agent books into.
 *
 * ONE CALENDAR PER TENANT, NOT ONE SHARED CALENDAR. On the $97 plan pilot
 * clients could share a sub-account, and a shared calendar would let two
 * businesses book each other's slots — the one part of the shared-sub-account
 * compromise that is not survivable. Calendars are creatable by API on every
 * plan (verified: POST /calendars/ answers 422 validation, not 403), so there
 * is no reason to share one.
 */
async function ensureCalendar(tenant, creds) {
  if (tenant.ghl_calendar_id) return tenant.ghl_calendar_id;
  // NO `timezone` FIELD. HighLevel rejects the whole request with "property
  // timezone should not exist" — their schema has no such property, and a
  // calendar takes its timezone from the location. This was never caught
  // because nothing had ever run this step against the live API: every signup
  // would have failed at step 3 of provisioning. Only `locationId` and `name`
  // are required (verified against their docs and the live sub-account
  // 2026-09-25); `calendarType:'event'` is set explicitly because the types
  // that need a team member (round_robin, collective, class, service) would
  // fail for a sub-account with nobody assigned.
  const made = await ghl.call('POST', '/calendars/', {
    creds,
    body: {
      locationId: creds.locationId,
      name: `${tenant.business_name} — Appointments`,
      description: `Booked by the RinglyPro assistant for ${tenant.business_name}.`,
      calendarType: 'event',
      slotDuration: 30,
      slotDurationUnit: 'mins',
      isActive: true,
    },
  });
  const id = made && (made.id || (made.calendar && made.calendar.id));
  if (!id) { const e = new Error('HighLevel did not return a calendar id'); e.code = 'NO_CALENDAR_ID'; throw e; }
  return id;
}


/**
 * DEFAULT BUSINESS HOURS, so a brand-new tenant is bookable from the first call.
 * Mon-Fri 09:00-17:00 in the tenant's own timezone, 30-minute slots — the same
 * default the public booking page seeds, kept identical on purpose: two
 * different "default hours" in one product is a bug waiting to be reported as
 * a mystery.
 */
const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5];       // models.js: 0=Sun .. 6=Sat
const DEFAULT_OPEN = '09:00';
const DEFAULT_CLOSE = '17:00';

async function ensureAvailabilityRules(tenant) {
  const { AvailabilityRule } = require('../models');
  const have = await AvailabilityRule.count({ where: { tenant_id: tenant.id } });
  if (have > 0) return false;
  const tz = tenant.timezone || 'America/New_York';
  for (const wd of DEFAULT_WEEKDAYS) {
    await AvailabilityRule.create({ tenant_id: tenant.id, weekday: wd,
      start: DEFAULT_OPEN, end: DEFAULT_CLOSE, slot_minutes: 30, timezone: tz, active: true });
  }
  console.log(`[lite:provisioning] seeded default Mon-Fri ${DEFAULT_OPEN}-${DEFAULT_CLOSE} for tenant ${tenant.id}`);
  return true;
}

/**
 * MIRROR THE TENANT'S OWN HOURS ONTO THEIR HIGHLEVEL CALENDAR.
 *
 * A calendar created by POST /calendars/ comes back with `openHours: {}` —
 * EMPTY — and a calendar with no open hours has no free slots. Measured on the
 * live sub-account 2026-09-26: GET /calendars/{id}/free-slots for the next
 * seven days answered with a bare traceId and nothing else, so on the first
 * real call the agent truthfully told the caller "there aren't any available
 * appointment slots showing right now" and took a message instead. Booking is
 * the product; this is the step that makes it exist.
 *
 * Same class of bug as the `timezone` field that broke calendar creation: a
 * provisioning step that had never once run against the live API.
 *
 * `lite_availability_rules` IS THE SOURCE OF TRUTH. RinglyPro already decides
 * availability from those rows — the dashboard, the public booking page and the
 * relay agent all read them — so HighLevel is written FROM them rather than
 * configured separately. Two calendars disagreeing about when a business is
 * open is how a caller gets offered a slot the owner has already filled.
 */
function hoursPayload(rules) {
  // Group identical windows so a normal week is one entry rather than five,
  // which is the shape HighLevel's own UI produces.
  const byWindow = new Map();
  for (const r of rules) {
    if (r.active === false) continue;
    const [oh, om] = String(r.start || '').split(':').map((n) => parseInt(n, 10));
    const [ch, cm] = String(r.end || '').split(':').map((n) => parseInt(n, 10));
    // NOT `Number.isInteger`. This module destructures the Sequelize `Number`
    // MODEL off ../models, which shadows the global Number, so `Number.isInteger`
    // throws "is not a function" at runtime — the same trap that once broke
    // `Number(duration)` in the webhook. It would have been swallowed by
    // provisioning's own catch and looked like HighLevel refusing the write.
    if ([oh, om, ch, cm].some((n) => isNaN(n))) continue;
    // Real clock values only: 25:00 is not a time, and HighLevel would take it.
    if (oh < 0 || oh > 23 || ch < 0 || ch > 24 || om < 0 || om > 59 || cm < 0 || cm > 59) continue;
    if (ch * 60 + cm <= oh * 60 + om) continue;     // a window that closes before it opens is not a window
    const key = `${oh}:${om}-${ch}:${cm}`;
    if (!byWindow.has(key)) byWindow.set(key, { days: [], hours: [{ openHour: oh, openMinute: om, closeHour: ch, closeMinute: cm }] });
    const g = byWindow.get(key);
    if (!g.days.includes(r.weekday)) g.days.push(r.weekday);
  }
  return [...byWindow.values()].map((g) => ({ daysOfTheWeek: g.days.sort((a, b) => a - b), hours: g.hours }));
}

async function syncCalendarHours(tenant, creds, { force = false } = {}) {
  const cal = tenant.ghl_calendar_id;
  if (!cal) return { ok: false, reason: 'no_calendar' };
  const { AvailabilityRule } = require('../models');
  await ensureAvailabilityRules(tenant);
  const rules = await AvailabilityRule.findAll({ where: { tenant_id: tenant.id } });
  const openHours = hoursPayload(rules);
  if (!openHours.length) return { ok: false, reason: 'no_usable_rules' };

  // DO NOT OVERWRITE HOURS SOMEBODY SET BY HAND. If the calendar already has
  // open hours, the owner (or the client) has been in there; replacing them
  // from our defaults would quietly change when a real business is bookable.
  if (!force) {
    try {
      const cur = await ghl.call('GET', `/calendars/${encodeURIComponent(cal)}`, { creds, version: 'v3' });
      const c = (cur && (cur.calendar || cur)) || {};
      const existing = Array.isArray(c.openHours) ? c.openHours.length
        : (c.openHours && typeof c.openHours === 'object' ? Object.keys(c.openHours).length : 0);
      if (existing > 0) return { ok: true, skipped: 'already_has_open_hours', open_hours: existing };
    } catch (e) {
      // Unreadable is not "empty": writing on a failed read could clobber real
      // hours. Refuse and say so.
      return { ok: false, reason: 'calendar_unreadable', error: String(e.message || e).slice(0, 160) };
    }
  }

  await ghl.call('PUT', `/calendars/${encodeURIComponent(cal)}`, { creds, version: 'v3',
    body: { openHours, slotDuration: 30, slotDurationUnit: 'mins', slotInterval: 30, isActive: true } });

  // READ IT BACK. The write shape and the read shape differ on this endpoint
  // (it reads as an object, not an array), so "the PUT returned 200" is not
  // evidence that a slot now exists.
  let confirmed = null;
  try {
    const after = await ghl.call('GET', `/calendars/${encodeURIComponent(cal)}`, { creds, version: 'v3' });
    const c = (after && (after.calendar || after)) || {};
    confirmed = Array.isArray(c.openHours) ? c.openHours.length
      : (c.openHours && typeof c.openHours === 'object' ? Object.keys(c.openHours).length : 0);
  } catch (_) { /* reported as unconfirmed below */ }

  console.log(`[lite:provisioning] calendar hours set for tenant ${tenant.id}: `
    + `${openHours.map((g) => `${g.daysOfTheWeek.join(',')} ${g.hours[0].openHour}:00-${g.hours[0].closeHour}:00`).join(' | ')}`
    + ` (read back: ${confirmed === null ? 'unconfirmed' : confirmed})`);
  return { ok: true, written: openHours, read_back: confirmed };
}

/**
 * ONE PROVISIONING RUN PER TENANT AT A TIME.
 *
 * Every "has this already happened?" check here is a read followed by a write,
 * so two concurrent requests for the SAME tenant both saw "no sub-account yet"
 * and "no number yet" and did it twice: two pool slots burned and two numbers
 * bought, in two different locations, with the dashboard reporting whichever
 * one finished last. The per-tenant fingerprint does not help, because the two
 * purchases are in different HighLevel locations.
 *
 * A Postgres advisory lock serialises them. It is released when the transaction
 * or session ends, and a second caller that cannot take it is told to wait
 * rather than being allowed to race.
 */
const LOCK_NS = 0x4c495445; // 'LITE'
async function withTenantLock(tenantId, fn) {
  if (!sequelize || typeof sequelize.query !== 'function') return fn();   // test store
  const [rows] = await sequelize.query('SELECT pg_try_advisory_lock(:ns, :id) AS ok',
    { replacements: { ns: LOCK_NS, id: tenantId } });
  const got = Array.isArray(rows) ? rows[0] && (rows[0].ok === true || rows[0].ok === 't') : false;
  if (!got) { const e = new Error('setup is already running for this account'); e.code = 'ALREADY_RUNNING'; throw e; }
  try { return await fn(); }
  finally {
    try { await sequelize.query('SELECT pg_advisory_unlock(:ns, :id)', { replacements: { ns: LOCK_NS, id: tenantId } }); }
    catch (_) { /* the session ending releases it anyway */ }
  }
}

/**
 * Run (or resume) provisioning for one tenant.
 * @param {number|object} tenantOrId
 * @param {{areaCode?:string}} opts
 */
async function provision(tenantOrId, opts = {}) {
  const tenant = (tenantOrId && tenantOrId.id) ? tenantOrId : await Tenant.findByPk(tenantOrId);
  if (!tenant) { const e = new Error('tenant_not_found'); e.code = 'NO_TENANT'; throw e; }
  if (tenant.provisioning_state === 'ready') return summary(tenant, { already: true });
  return withTenantLock(tenant.id, () => runProvision(tenant, opts));
}

async function runProvision(tenant, opts = {}) {
  try {
    // 1. A sub-account of their own. Claimed, or created on $497.
    let creds = await accounts.credsFor(tenant);
    if (!creds || !reached(tenant.provisioning_state, 'claimed')) {
      const got = await accounts.claim(tenant.id);
      creds = { locationId: got.location_id, token: got.token };
      await mark(tenant, 'claimed', {
        ghl_location_id: got.location_id,
        ghl_token_enc: secretbox.seal(got.token),
      });
    }

    // 2. Their number.
    //
    // ADOPT BEFORE BUYING. A purchase that times out is AMBIGUOUS — HighLevel
    // may have bought the number and simply not answered in time — so a retry
    // that goes straight to "buy" can spend a second $1.15/month on a number
    // nothing points at. The `fingerprintId` is supposed to make HighLevel
    // refuse the duplicate, but that is their behaviour to change, not ours,
    // and this is money. So: look at what the sub-account actually holds, and
    // if there is a number no tenant of ours has claimed, take that one.
    //
    // The unclaimed filter is what makes this safe in the shared sub-account,
    // where every tenant's numbers live in one location — without it, a retry
    // would hand this tenant another client's line.
    let num = await Number.findOne({ where: { tenant_id: tenant.id, status: 'active' } });
    if (!num) {
      try {
        const owned = await new GhlProvider({ creds }).ownedNumbers();
        if (owned.length) {
          const taken = new Set((await Number.findAll({ attributes: ['did'] })).map((r) => r.did));
          const spare = owned.find((d) => !taken.has(d));
          if (spare) {
            console.warn(`[lite:provision] adopting ${spare}, already bought and unclaimed — not buying again`);
            num = await Number.create({
              tenant_id: tenant.id, did: spare, country: tenant.country || 'US',
              provider: 'ghl', provider_sid: 'ghl-number', status: 'active',
              monthly_cost_usd: GhlProvider.MONTHLY_COST_USD,
            });
            await mark(tenant, 'number');
          }
        }
      } catch (e) { console.warn('[lite:provision] could not check for an already-bought number:', e.message); }
    }
    if (!num) {
      const bought = await new GhlProvider({ creds }).buyNumber({
        country: tenant.country || 'US', areaCode: opts.areaCode, allowAnyArea: !!opts.allowAnyArea,
        tenantId: tenant.id, tenant,
      });
      num = await Number.create({
        tenant_id: tenant.id, did: bought.did, country: tenant.country || 'US',
        provider: 'ghl', provider_sid: bought.providerSid, status: 'active',
        monthly_cost_usd: bought.monthlyCostUsd,
      });
      await mark(tenant, 'number');
    } else if (!reached(tenant.provisioning_state, 'number')) {
      await mark(tenant, 'number');
    }

    // 3. Their calendar.
    if (!tenant.ghl_calendar_id) {
      const cal = await ensureCalendar(tenant, creds);
      await mark(tenant, 'calendar', { ghl_calendar_id: cal });
    }
    // A CALENDAR WITH NO OPEN HOURS HAS NO SLOTS, and the agent then tells
    // every caller there is nothing available. Best-effort on purpose: a
    // failure here must not lose a number that has already been bought, and it
    // is repairable afterwards (POST /internal/security/repair-calendar-hours).
    try {
      const r = await syncCalendarHours(tenant, creds);
      if (!r.ok) console.warn(`[lite:provisioning] calendar hours not set for tenant ${tenant.id}: ${r.reason}`);
    } catch (e) { console.warn(`[lite:provisioning] calendar hours failed for tenant ${tenant.id}: ${e.message}`); }

    // 4. Their agent, on their number, booking into their calendar.
    if (!tenant.ghl_agent_id) {
      const agent = await new GhlProvider({ creds }).createAgent({
        tenant, phoneNumber: num.did, calendarId: tenant.ghl_calendar_id,
      });
      await mark(tenant, 'agent', { ghl_agent_id: agent.id });
    }

    await mark(tenant, 'ready');
    return summary(tenant, { already: false });
  } catch (e) {
    // The step reached is preserved; only the error is written. A retry resumes.
    await tenant.update({ provisioning_error: String(e.message || e).slice(0, 500) });
    const err = new Error(e.message || 'provisioning failed');
    err.code = e.code || 'PROVISION_FAILED';
    err.state = tenant.provisioning_state;
    throw err;
  }
}


/**
 * Move an existing agent's transfer action when the owner changes the number.
 *
 * Without this, `PATCH /api/settings` accepted a new transfer number, stored it,
 * and the deployed agent went on dialling the old one — a departed employee's
 * line, or a recycled number now belonging to a stranger. The allow-list is
 * re-checked here too: a destination that is no longer acceptable REMOVES the
 * action rather than leaving the old one live.
 */
async function syncTransfer(tenantOrId) {
  const tenant = (tenantOrId && tenantOrId.id) ? tenantOrId : await Tenant.findByPk(tenantOrId);
  if (!tenant || !tenant.ghl_agent_id) return { changed: false, reason: 'no agent' };
  const creds = await accounts.credsFor(tenant);
  if (!creds) return { changed: false, reason: 'no credentials' };

  const dest = tenant.transfer_number || tenant.owner_phone;
  const chk = dest ? tollFraud.checkDestination(dest, { defaultCountry: tenant.country }) : null;

  // Remove whatever transfer action is on the agent, then add the new one if
  // the destination is allowed. Removing first is what makes a now-refused
  // number stop being dialled.
  try {
    const agent = await ghl.call('GET', `/voice-ai/agents/${encodeURIComponent(tenant.ghl_agent_id)}`,
      { query: { locationId: creds.locationId }, creds });
    const a = (agent && (agent.agent || agent)) || {};
    const actions = Array.isArray(a.actions) ? a.actions : [];
    for (const act of actions.filter((x) => (x.actionType || x.type) === 'CALL_TRANSFER')) {
      // agentId AND locationId are REQUIRED on a delete — without them
      // HighLevel answers "AgentId is required" and the old action stays.
      // That is the whole point of this function: a transfer number the owner
      // has changed must stop being dialled, and a silently failed delete
      // leaves the departed employee's line live.
      if (act.id) await ghl.call('DELETE', `/voice-ai/actions/${encodeURIComponent(act.id)}`, {
        creds, version: process.env.LITE_GHL_ACTION_VERSION || 'v3',
        // BOTH query and body: HighLevel answers "AgentId is required" without
        // it and does not say where it wants it, so it is sent in both places
        // rather than deleting nothing and logging a warning nobody reads.
        query: { agentId: tenant.ghl_agent_id, locationId: creds.locationId },
        body: { agentId: tenant.ghl_agent_id, locationId: creds.locationId },
      }).catch((e) => console.warn('[lite:ghl] old transfer action not removed:', e.message));
    }
  } catch (e) { console.warn('[lite:ghl] could not read the agent to sync its transfer:', e.message); }

  if (!chk || !chk.ok) return { changed: true, transfer: null, refused: !!dest };
  await ghl.call('POST', '/voice-ai/actions', {
    creds, version: process.env.LITE_GHL_ACTION_VERSION || 'v3',
    body: {
      agentId: tenant.ghl_agent_id, locationId: creds.locationId,
      actionType: 'CALL_TRANSFER', name: 'Transfer to owner',
      actionParameters: { triggerPrompt: 'When the caller asks to speak to a person or the owner',
        transferToType: 'number', transferToValue: chk.e164,
        triggerMessage: 'Let me connect you now, one moment.', hearWhisperMessage: false },
    } });
  return { changed: true, transfer: chk.e164 };
}

/**
 * Re-point an EXISTING agent at the template's end-of-call workflows.
 *
 * WHY THIS HAS TO EXIST. `callEndWorkflowIds` is copied from the template at
 * the moment the agent is built and never looked at again — unlike the
 * transfer action, which `syncTransfer` keeps current. So an agent created
 * while the template had no end-of-call workflow is born with none, and
 * adding one to the template afterwards does NOT reach it: that client's
 * messages and bookings never call our webhook and never appear anywhere,
 * with nothing on any screen to say why. Without this the only repair is by
 * hand in HighLevel, per client.
 */
async function syncWorkflows(tenantOrId) {
  const tenant = (tenantOrId && tenantOrId.id) ? tenantOrId : await Tenant.findByPk(tenantOrId);
  if (!tenant || !tenant.ghl_agent_id) return { changed: false, reason: 'no agent' };
  const creds = await accounts.credsFor(tenant);
  if (!creds) return { changed: false, reason: 'no credentials' };

  const tpl = await new GhlProvider({ creds }).templateAgent();
  const ids = (tpl && tpl.callEndWorkflowIds) || [];
  if (!ids.length) {
    // Do NOT wipe an agent's workflows because the template has none. That
    // would turn a missing template setting into a working client breaking.
    return { changed: false, reason: 'the template has no end-of-call workflow to copy' };
  }
  await ghl.call('PATCH', `/voice-ai/agents/${encodeURIComponent(tenant.ghl_agent_id)}`, {
    creds, body: { locationId: creds.locationId, callEndWorkflowIds: ids },
  });
  return { changed: true, callEndWorkflowIds: ids };
}

async function summary(tenant, extra = {}) {
  const num = await Number.findOne({ where: { tenant_id: tenant.id, status: 'active' } });
  return {
    ...extra,
    state: tenant.provisioning_state,
    number: num ? num.did : null,
    agent_ready: !!tenant.ghl_agent_id,
    calendar_ready: !!tenant.ghl_calendar_id,
    // Deliberately absent: the location id and the token. A customer-facing
    // response never names the platform underneath.
  };
}

/**
 * What the client is told, in their own words. Forwarding is a code THEY dial
 * on their handset — we cannot switch their carrier on from here, and the UI
 * must not pretend we can.
 */
async function clientView(tenantOrId) {
  const tenant = (tenantOrId && tenantOrId.id) ? tenantOrId : await Tenant.findByPk(tenantOrId);
  const s = await summary(tenant, {});
  return {
    number: s.number,
    assistant_ready: s.state === 'ready',
    setup_step: s.state,
    forwarding_confirmed: !!tenant.forwarding_confirmed_at,
  };
}

module.exports = { provision, summary, clientView, ensureCalendar, syncTransfer, syncWorkflows, withTenantLock, STATES, reached, syncCalendarHours, hoursPayload, ensureAvailabilityRules};
