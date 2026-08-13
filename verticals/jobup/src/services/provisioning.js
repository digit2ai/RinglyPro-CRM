'use strict';

// =============================================================
// The paid-signal chain (spec section 22, phase 6).
//
// Payment fires this. It provisions the address, renders the site, publishes
// the structured data and activates the agents — the step that turns a Stripe
// event into a live product.
//
// Cloudflare's ~100s ceiling means this runs as a BACKGROUND JOB with a poll,
// never inside the webhook response (spec section 21). Every step is
// idempotent, because Stripe retries webhooks.
// =============================================================

const { models, scoped, TENANT_SCOPED } = require('../models');
const addresses = require('./addresses');
const settingsSvc = require('./settings');
const identity = require('./identity');
const agents = require('./agents');

const STEPS = ['address', 'profile', 'site', 'structured_data', 'agents'];

async function stateOf(tenantId) {
  const sub = await models.subscribers.findOne({ where: { id: tenantId } });
  if (!sub) return { ok: false, reason: 'no such subscriber' };
  const site = await scoped('sites', tenantId).findOne({});
  const profile = await scoped('profiles', tenantId).findOne({});
  const runs = await scoped('agent_runs', tenantId).findAll({});
  return {
    ok: true,
    address: Boolean(sub.address),
    profile: Boolean(profile),
    site: Boolean(site),
    published: Boolean(site && site.published_at),
    agents_started: runs.length > 0,
    url: sub.address ? `https://${sub.address}` : null,
    status: sub.status,
  };
}

/**
 * Find the preview this subscriber is paying for.
 *
 * The token is the reliable route and comes from the Stripe metadata. The
 * EMAIL FALLBACK exists because that metadata was missing for a while, and
 * without it provisioning silently built an empty site: no profile, no résumé,
 * an address that did not match the preview. A signup must not depend on one
 * string surviving a round trip through a payment processor — if we know who
 * paid, we know which preview was theirs.
 *
 * Newest ready preview wins: someone who previewed twice bought the second one.
 */
async function findTeaser(tenantId, teaserToken) {
  if (teaserToken) {
    const byToken = await models.teasers.findOne({ where: { token: teaserToken } });
    if (byToken) return { row: byToken, via: 'token' };
  }
  const sub = await models.subscribers.findOne({ where: { id: tenantId } });
  const email = sub && sub.email ? String(sub.email).toLowerCase() : null;
  if (!email) return { row: null, via: 'none' };

  const rows = await models.teasers.findAll({ where: { email } });
  const ready = (rows || [])
    .filter((r) => r && r.status === 'ready' && r.payload && r.payload.screens)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return ready.length ? { row: ready[0], via: 'email_fallback' } : { row: null, via: 'none' };
}

/**
 * Adopt a teaser's already-extracted profile onto the paying subscriber.
 * The teaser did the extraction before payment; re-running it would be a
 * second spend on work already done.
 */
async function adoptTeaser(tenantId, teaserToken) {
  const found = await findTeaser(tenantId, teaserToken);
  const t = found.row;
  if (!t) return { adopted: false, reason: 'no preview found for this account' };
  if (!t.payload || !t.payload.screens) return { adopted: false, reason: 'teaser not found or not ready' };
  teaserToken = t.token;   // the fallback resolved it; downstream uses the real one

  const site = t.payload.screens.site || {};
  const profile = site.profile || {};

  // Carry over a photo uploaded with the teaser, if there was one.
  let photoAssetId = null;
  try {
    const asset = await models.assets.findOne({ where: { teaser_token: teaserToken, kind: 'photo' } });
    if (asset) {
      await models.assets.update({ tenant_id: tenantId }, { where: { id: asset.id } });
      photoAssetId = asset.id;
    }
  } catch (e) { /* a missing photo must never block provisioning */ }

  const existing = await scoped('profiles', tenantId).findOne({});
  const sourceText = t.resume_text || t.payload.source_text || profile.source_text || '';

  // A PAYING ACCOUNT MUST NEVER BE BORN FROM A DEGRADED PARSE.
  //
  // The teaser's profile is whatever the structurer managed at preview time,
  // and this used to be copied in verbatim. When the model was unreachable —
  // an empty Anthropic balance did exactly this — the heuristic path produced
  // a name, a guessed headline and NOTHING else, and the first real subscriber
  // paid $59 for a profile with zero experience and zero skills. The preview
  // being degraded is a bad demo; the paid account inheriting it is a refund.
  //
  // So at the moment money is involved, if the stored parse is simulated and
  // the model is reachable NOW, structure it again from the source text.
  let finalProfile = profile;
  let restructured = null;
  if (profile.is_simulated && sourceText.length > 60) {
    try {
      const resumeSvc = require('./resume');
      const again = await resumeSvc.structure(sourceText);
      if (again && again.profile && !again.profile.is_simulated) {
        finalProfile = { ...again.profile, name: again.profile.name || profile.name };
        restructured = { cost_usd: again.cost_usd };
        console.log(`[jobup provisioning] tenant ${tenantId}: re-structured a simulated profile`);
      }
    } catch (e) {
      // Never block provisioning on this — a thin profile beats no account.
      console.warn('[jobup provisioning] re-structure failed:', e.message);
    }
  }

  if (!existing) {
    await scoped('profiles', tenantId).create({
      resume_json: finalProfile,
      photo_asset_id: photoAssetId,
      source_text: sourceText,
    });
  } else if (existing.resume_json && existing.resume_json.is_simulated && restructured) {
    // Re-running provisioning must be able to REPAIR a profile that was
    // written while the model was down, not skip it because a row exists.
    await scoped('profiles', tenantId).update(
      { resume_json: finalProfile, source_text: sourceText || existing.source_text },
      { id: existing.id });
  } else if (photoAssetId && !existing.photo_asset_id) {
    await scoped('profiles', tenantId).update({ photo_asset_id: photoAssetId }, { id: existing.id });
  }
  // The site must speak the language they chose at signup.
  if (t.language && t.language !== 'en') {
    await models.subscribers.update({ language: t.language }, { where: { id: tenantId } });
  }

  // Bind the teaser to its subscriber so the 90-day purge skips it.
  await models.teasers.update({ tenant_id: tenantId }, { where: { id: t.id } });
  return { adopted: true, headline: profile.headline || null, via: found.via, token: t.token };
}

/** Step 1 — allocate the web address. Idempotent. */
async function provisionAddress(tenantId, teaserToken) {
  const sub = await models.subscribers.findOne({ where: { id: tenantId } });
  if (sub.address) return { step: 'address', skipped: true, address: sub.address };

  // HONOUR THE ADDRESS THE TEASER PROMISED.
  //
  // The address was being derived twice — once for the preview, once here —
  // from different inputs, so the teaser could show carlosgomez.jobup.dev and
  // provisioning then hand out carlosmejia.jobup.dev. A preview that does not
  // bind is worse than no preview: the person chose to pay having seen it.
  // Same fallback as adoptTeaser: the promise was made by the preview, and the
  // preview is findable by email even when the token did not survive checkout.
  {
    const found = await findTeaser(tenantId, teaserToken);
    const t = found.row;
    const offered = t && t.address_offer;
    if (offered) {
      const label = String(offered).split('.')[0];
      if (!(await addresses.isTaken(label))) {
        await models.subscribers.update({ address: offered }, { where: { id: tenantId } });
        return { step: 'address', ok: true, address: offered,
                 url: `https://${offered}`, from_teaser: true };
      }
      // Taken between preview and payment — fall through and allocate honestly.
    }
  }

  const profileRow = await scoped('profiles', tenantId).findOne({});
  const profile = (profileRow && profileRow.resume_json) || {};
  const parts = addresses.splitName(sub.name || profile.name || sub.email.split('@')[0]);
  const r = await addresses.allocate(parts);

  if (!r.ok) return { step: 'address', ok: false, reason: r.reason };

  await models.subscribers.update({ address: r.host }, { where: { id: tenantId } });
  return { step: 'address', ok: true, address: r.host, url: r.url, rung: r.rung };
}

/** Step 2 — ensure a settings record exists, sanitized. Idempotent. */
async function ensureSettings(tenantId) {
  const row = await scoped('settings', tenantId).findOne({});
  if (row) return { step: 'settings', skipped: true };
  await scoped('settings', tenantId).create({ settings: settingsSvc.sanitize({}) });
  return { step: 'settings', ok: true };
}

/** Steps 3+4 — render the site and publish the structured surfaces. Idempotent. */
async function publishSite(tenantId) {
  const sub = await models.subscribers.findOne({ where: { id: tenantId } });
  if (!sub || !sub.address) return { step: 'site', ok: false, reason: 'address not provisioned' };

  const pRow = await scoped('profiles', tenantId).findOne({});
  const sRow = await scoped('settings', tenantId).findOne({});
  const profile = (pRow && pRow.resume_json) || {};
  const settings = settingsSvc.sanitize((sRow && sRow.settings) || {});
  const url = `https://${sub.address}`;
  const ctx = { name: profile.name || sub.name, url, slug: sub.address.split('.')[0] };

  // Generated from ONE source of truth — they cannot disagree.
  const surfaces = {
    resume_json: identity.resumeJson(profile, settings, ctx),
    json_ld: identity.personJsonLd(profile, settings, ctx),
    agent_card: identity.agentCard(profile, settings, ctx),
    llms_txt: identity.llmsTxt(profile, settings, ctx),
    sitemap: identity.sitemapXml({ url, roles: settingsSvc.pageRoles(settings) }),
    robots: identity.robotsTxt({ url }),
  };

  const existing = await scoped('sites', tenantId).findOne({});
  if (existing) {
    await scoped('sites', tenantId).update(
      { address: sub.address, published_at: existing.published_at || new Date(),
        health: { published: true, surfaces: Object.keys(surfaces), checked_at: new Date() } },
      { id: existing.id });
  } else {
    await scoped('sites', tenantId).create({
      address: sub.address, published_at: new Date(),
      health: { published: true, surfaces: Object.keys(surfaces), checked_at: new Date() },
    });
  }
  return { step: 'site', ok: true, url, surfaces: Object.keys(surfaces) };
}

/** Step 5 — first agent run, so the dashboard is populated on arrival. */
async function activateAgents(tenantId) {
  const out = {};
  try { out.presence = await agents.presence(tenantId); } catch (e) { out.presence = { error: e.message }; }
  try { out.hunter = await agents.hunter(tenantId, { trigger: 'signup' }); } catch (e) { out.hunter = { error: e.message }; }
  return { step: 'agents', ok: true, ...out };
}

/**
 * The whole chain. Safe to call repeatedly — Stripe retries webhooks, and every
 * step above is idempotent.
 */
async function run(tenantId, { teaserToken } = {}) {
  const started = Date.now();
  const log = [];

  const sub = await models.subscribers.findOne({ where: { id: tenantId } });
  if (!sub) return { ok: false, reason: 'no such subscriber' };
  if (sub.status !== 'active') {
    return { ok: false, reason: `subscriber is ${sub.status}, not active — nothing provisioned` };
  }

  log.push(await adoptTeaser(tenantId, teaserToken));
  log.push(await ensureSettings(tenantId));
  log.push(await provisionAddress(tenantId, teaserToken));
  log.push(await publishSite(tenantId));
  log.push(await activateAgents(tenantId));

  const state = await stateOf(tenantId);
  return {
    ok: state.address && state.site && state.published,
    tenant_id: tenantId,
    url: state.url,
    ms: Date.now() - started,
    steps: log,
    state,
  };
}

/** Teardown on cancellation (spec 8.7): site offline, address released. */
async function teardown(tenantId) {
  const sub = await models.subscribers.findOne({ where: { id: tenantId } });
  if (!sub) return { ok: false, reason: 'no such subscriber' };
  await scoped('sites', tenantId).update({ published_at: null, health: { published: false, reason: 'subscription ended' } }, {});
  await models.subscribers.update({ address: null, status: 'canceled' }, { where: { id: tenantId } });
  return {
    ok: true,
    note: 'Site offline, address released, agents stopped. Data export remains available to the subscriber.',
  };
}

/**
 * PURGE — erase an account and everything belonging to it.
 *
 * Not the same thing as teardown(), and the difference matters. teardown() is
 * cancellation: the site goes dark and the address is released, but the
 * subscriber's data is deliberately KEPT so they can still export it. purge()
 * is the deletion an owner means when they say remove this account, and it is
 * irreversible.
 *
 * THE TABLE LIST IS DERIVED, NOT TYPED. It walks models.TENANT_SCOPED, so a
 * table added later is purged automatically instead of quietly surviving as an
 * orphan that still answers to a tenant_id nobody owns any more.
 *
 * WHAT IT MUST NOT TOUCH: ju_jobs and ju_employers are the SHARED pool. They
 * carry no tenant_id precisely because every subscriber scores against the same
 * postings; deleting from them would take work away from everyone else.
 *
 * The audit row is written with tenant_id NULL on purpose — a trail stored
 * under the tenant being erased would be erased along with it.
 */
async function purge(tenantId, { actor, reason } = {}) {
  const id = parseInt(tenantId, 10);
  if (!Number.isInteger(id)) return { ok: false, reason: 'bad tenant id' };

  const sub = await models.subscribers.findOne({ where: { id } });
  if (!sub) return { ok: false, reason: 'no such subscriber' };

  // Recorded BEFORE the delete, so the trail survives a failure midway.
  const snapshot = { id: sub.id, email: sub.email, name: sub.name || null,
                     address: sub.address || null, status: sub.status,
                     activation: sub.activation || null };
  try {
    await models.audit_log.create({
      tenant_id: null,
      actor: String(actor || 'system').slice(0, 200),
      action: 'account.purged',
      reason: `${reason ? String(reason).slice(0, 700) : 'no reason given'} | ${JSON.stringify(snapshot)}`,
    });
  } catch (e) { console.warn('[purge] audit write failed:', e.message); }

  const deleted = {};
  for (const table of TENANT_SCOPED) {
    const m = models[table];
    if (!m) continue;
    try {
      deleted[table] = await m.destroy({ where: { tenant_id: id } });
    } catch (e) {
      // One table failing must not leave the rest behind; report it instead.
      deleted[table] = `error: ${e.message}`;
    }
  }
  deleted.subscribers = await models.subscribers.destroy({ where: { id } });

  return { ok: true, purged: snapshot, deleted };
}

module.exports = { run, teardown, purge, stateOf, provisionAddress, publishSite, activateAgents, adoptTeaser, ensureSettings, STEPS };
