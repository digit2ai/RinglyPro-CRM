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

    // 2. Their number. The fingerprint inside buyNumber makes a retry idempotent
    //    at HighLevel's end as well as ours.
    let num = await Number.findOne({ where: { tenant_id: tenant.id, status: 'active' } });
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
      if (act.id) await ghl.call('DELETE', `/voice-ai/actions/${encodeURIComponent(act.id)}`, { creds })
        .catch((e) => console.warn('[lite:ghl] old transfer action not removed:', e.message));
    }
  } catch (e) { console.warn('[lite:ghl] could not read the agent to sync its transfer:', e.message); }

  if (!chk || !chk.ok) return { changed: true, transfer: null, refused: !!dest };
  await ghl.call('POST', '/voice-ai/actions', { creds, body: {
    agentId: tenant.ghl_agent_id, locationId: creds.locationId,
    actionType: 'CALL_TRANSFER', name: 'Transfer to owner',
    actionParameters: { triggerPrompt: 'When the caller asks to speak to a person or the owner',
      transferToType: 'number', transferToValue: chk.e164 },
  } });
  return { changed: true, transfer: chk.e164 };
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

module.exports = { provision, summary, clientView, ensureCalendar, syncTransfer, withTenantLock, STATES, reached };
