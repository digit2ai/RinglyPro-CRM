'use strict';

/**
 * The GoHighLevel sub-account pool.
 *
 * THE CONSTRAINT THIS ANSWERS. Creating a sub-account by API needs HighLevel's
 * $497 Agency Pro plan — verified 2026-09-24; $297 Unlimited gives unlimited
 * sub-accounts but still cannot create one programmatically. Everything INSIDE
 * a sub-account (buy a number, create a Voice AI agent, create a calendar) is
 * API-creatable from that sub-account's own Private Integration token on the
 * $97 plan, which was proven against the live account.
 *
 * So signup CLAIMS a pre-made sub-account instead of creating one. The owner
 * stocks the pool by hand when they are not busy; the customer's signup is
 * instant either way and never mentions HighLevel. On $497 `agencyCreate()`
 * fills the pool automatically and NOTHING ELSE CHANGES — provisioning calls
 * `claim()` in both cases, which is what stops the upgrade being a rewrite.
 *
 * TWO MODES, AND THE OWNER PICKS ONE PER ROW.
 *
 *  - `free`   → an EXCLUSIVE sub-account, claimed by one tenant and no other.
 *               Full isolation: contacts, calendar, conversations.
 *  - `shared` → ONE sub-account that every tenant uses (owner decision
 *               2026-09-24). Within a single location HighLevel allows
 *               unlimited calendars, unlimited Voice AI agents and unlimited
 *               numbers, so each client still gets their OWN agent, their OWN
 *               calendar and their OWN number. The single thing they share is
 *               the CONTACT list — and RinglyPro Lite does not offer a contact
 *               list as a feature, so no subscriber surface is affected.
 *
 * Shared is not a compromise forced by the plan, it is the cheaper answer:
 * AI Employee Unlimited is billed PER LOCATION, so one location means one $97
 * covers every client's agent minutes. Break-even falls from 27 clients on the
 * $497 exclusive path to 10 on this one.
 *
 * WHAT SHARING ACTUALLY COSTS, stated so it is a decision and not a surprise:
 * callers to two different clients become ONE HighLevel contact with both
 * conversations merged (our own mirror keys on the dialled number, so
 * RinglyPro's data stays separate); anyone with access to that sub-account sees
 * every client's callers; and removing one client's data means picking it out
 * of a shared list. None of that reaches a subscriber screen — it is a privacy
 * statement the owner makes, not a feature gap.
 *
 * An exclusive claim is atomic. Two signups landing together must never be
 * handed the same EXCLUSIVE location.
 */
const { Op } = require('sequelize');
const { sequelize, GhlAccount, Tenant } = require('../models');
const secretbox = require('./secretbox');
const ghl = require('../telephony/ghl');

function agencyToken() { return String(process.env.LITE_GHL_AGENCY_TOKEN || '').trim(); }
function agencyCompanyId() { return String(process.env.LITE_GHL_AGENCY_COMPANY_ID || '').trim(); }
/** $497-only. Unset = the pool is stocked by hand, which is the $97/$297 reality. */
function canAutoCreate() { return !!(agencyToken() && agencyCompanyId()); }

/**
 * Add a sub-account the owner made by hand. The token is verified against
 * HighLevel BEFORE it is stored — a pool row holding a token that does not work
 * is worse than an empty pool, because it fails at the moment a customer is
 * waiting rather than at the moment the owner is pasting.
 */
async function addToPool({ location_id, token, label, source = 'manual', verify = true, shared = false }) {
  const loc = String(location_id || '').trim();
  const tok = String(token || '').trim();
  if (!loc || !tok) { const e = new Error('location_id and token are both required'); e.code = 'BAD_INPUT'; throw e; }
  if (verify) {
    // Read-only. Proves the token belongs to THIS location before we trust it.
    const got = await ghl.getLocation({ token: tok, locationId: loc });
    const id = got && (got.id || (got.location && got.location.id));
    // An id is REQUIRED. Treating "no id in the body" as a pass meant an
    // unrecognised 200 stored a token against a location it may not own.
    if (!id || String(id) !== loc) {
      const e = new Error('that token does not belong to that sub-account'); e.code = 'TOKEN_LOCATION_MISMATCH'; throw e;
    }
  }
  const [row, made] = await GhlAccount.findOrCreate({
    where: { location_id: loc },
    defaults: { location_id: loc, token_enc: secretbox.seal(tok), label: label || null,
                status: shared ? 'shared' : 'free', source },
  });
  if (!made) {
    // Re-adding an existing location updates its token (a rotated PIT) but never
    // silently frees one that is already carrying a client.
    // A row already carrying a client is never quietly re-scoped: switching a
    // claimed exclusive row to shared would put strangers into it.
    const patch = { token_enc: secretbox.seal(tok), label: label || row.label };
    if (shared && row.status === 'free') patch.status = 'shared';
    await row.update(patch);
    // AND it reaches the tenant holding it. credsFor() prefers the tenant's own
    // copy, taken at claim time, so without this the client 401s against
    // HighLevel for ever while the pool reports the account healthy — which is
    // exactly the "looks like a HighLevel outage" failure secretbox warns about.
    if (row.claimed_by_tenant) {
      const t = await Tenant.findByPk(row.claimed_by_tenant);
      if (t) await t.update({ ghl_token_enc: secretbox.seal(tok) });
    }
    // A SHARED ROW IS CLAIMED BY NOBODY AND USED BY EVERYONE. Provisioning
    // copies the token onto each tenant at claim time and `credsFor` prefers
    // that copy, so refreshing only `claimed_by_tenant` (always null on a
    // shared row) would leave EVERY tenant holding the old token after a
    // rotation — every call, text and booking failing 401 while the pool
    // reported the account healthy.
    if (row.status === 'shared') {
      const [n] = await Tenant.update({ ghl_token_enc: secretbox.seal(tok) },
        { where: { ghl_location_id: loc } });
      if (n) console.log(`[lite:ghl] refreshed the stored token for ${n} tenant(s) on shared ${loc}`);
    }
  }
  return { id: row.id, location_id: row.location_id, status: row.status, created: made };
}

/**
 * Hand one free sub-account to a tenant, atomically.
 *
 * The UPDATE ... WHERE status='free' is what makes it safe under concurrency:
 * the database picks the winner, not a read-then-write in Node. A tenant that
 * already holds one gets the same one back, so a retried signup never consumes
 * a second slot.
 */
async function claim(tenantId) {
  const existing = await GhlAccount.findOne({ where: { claimed_by_tenant: tenantId } });
  if (existing) return shape(existing, false);

  // SHARED FIRST. A row marked `shared` serves every tenant, so nothing is
  // consumed and there is nothing to run out of — which is why it is checked
  // before the pool and before any agency create.
  const sharedRow = await GhlAccount.findOne({ where: { status: 'shared' } });
  if (sharedRow) return { ...shape(sharedRow, true), shared: true };

  if (canAutoCreate()) {
    const free = await GhlAccount.count({ where: { status: 'free' } });
    if (free === 0) { try { await agencyCreate({ name: `RinglyPro tenant ${tenantId}` }); } catch (e) {
      console.error('[lite:ghl] agency sub-account create failed, falling back to the pool:', e.message); } }
  }

  const [count, rows] = await sequelize.query(
    `UPDATE lite_ghl_accounts
        SET status = 'claimed', claimed_by_tenant = :t, claimed_at = NOW()
      WHERE id = (SELECT id FROM lite_ghl_accounts
                   WHERE status = 'free' AND claimed_by_tenant IS NULL
                   ORDER BY id ASC LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING id, location_id, token_enc`,
    { replacements: { t: tenantId } }
  );
  const row = (rows && rows.rows ? rows.rows[0] : (Array.isArray(count) ? count[0] : null));
  if (!row) {
    const e = new Error('no free HighLevel sub-account in the pool');
    e.code = 'POOL_EMPTY';
    throw e;
  }
  return { id: row.id, location_id: row.location_id, token: secretbox.open(row.token_enc), fresh: true };
}

function shape(row, fresh) {
  return { id: row.id, location_id: row.location_id, token: secretbox.open(row.token_enc), fresh: !!fresh };
}

/**
 * $497 Agency Pro only. Creates a sub-account and stocks it.
 *
 * It does NOT mint the sub-account's own Private Integration token — HighLevel
 * has no API for that — so a newly created location is stored with the AGENCY
 * token, which can act on it. Recorded plainly rather than implied, because it
 * is a wider credential than a per-sub-account one and someone will want to
 * narrow it later.
 */
async function agencyCreate({ name, timezone = 'America/New_York', country = 'US' }) {
  if (!canAutoCreate()) {
    const e = new Error('automated sub-account creation needs HighLevel Agency Pro ($497) plus LITE_GHL_AGENCY_TOKEN and LITE_GHL_AGENCY_COMPANY_ID');
    e.code = 'NO_AGENCY_API';
    throw e;
  }
  const made = await ghl.call('POST', '/locations/', {
    creds: { token: agencyToken(), locationId: '' },
    body: { name, companyId: agencyCompanyId(), timezone, country },
  });
  const loc = made && (made.id || (made.location && made.location.id));
  if (!loc) { const e = new Error('HighLevel did not return a sub-account id'); e.code = 'NO_LOCATION_ID'; throw e; }
  return addToPool({ location_id: loc, token: agencyToken(), label: name, source: 'agency_api', verify: false });
}

/** Owner-facing pool state. Never returns a token, encrypted or otherwise. */
async function status() {
  const rows = await GhlAccount.findAll({ order: [['id', 'ASC']] });
  const shared = rows.filter((r) => r.status === 'shared');
  return {
    auto_create: canAutoCreate(),
    mode: shared.length ? 'shared' : 'exclusive',
    plan_note: shared.length
      ? 'One shared sub-account serves every client. Each still gets their own number, agent and calendar; the CONTACT list is shared, and Lite does not expose one to subscribers.'
      : (canAutoCreate()
        ? 'Agency API configured: an empty pool refills itself.'
        : 'No agency API (HighLevel $97/$297). Stock the pool by hand before a signup needs one.'),
    shared: shared.length,
    free: rows.filter((r) => r.status === 'free').length,
    claimed: rows.filter((r) => r.status === 'claimed').length,
    accounts: rows.map((r) => ({
      id: r.id, location_id: r.location_id, label: r.label, status: r.status,
      claimed_by_tenant: r.claimed_by_tenant, claimed_at: r.claimed_at, source: r.source,
      token: secretbox.describe(r.token_enc),
    })),
  };
}

/** Credentials for a tenant: its own first, the pool row next, env last. */
async function credsFor(tenant) {
  const t = (tenant && tenant.id) ? tenant : await Tenant.findByPk(tenant);
  if (!t) return null;
  if (t.ghl_location_id && t.ghl_token_enc) {
    return { locationId: t.ghl_location_id, token: secretbox.open(t.ghl_token_enc) };
  }
  const row = await GhlAccount.findOne({ where: { claimed_by_tenant: t.id } });
  if (row) return { locationId: row.location_id, token: secretbox.open(row.token_enc) };
  const env = ghl.resolve(null);
  return env.token && env.locationId ? env : null;
}

module.exports = {
  addToPool, claim, agencyCreate, status, credsFor, canAutoCreate,
  _free: () => GhlAccount.count({ where: { status: 'free', claimed_by_tenant: { [Op.is]: null } } }),
};
