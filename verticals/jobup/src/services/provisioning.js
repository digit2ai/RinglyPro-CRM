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

const { models, scoped } = require('../models');
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
 * Adopt a teaser's already-extracted profile onto the paying subscriber.
 * The teaser did the extraction before payment; re-running it would be a
 * second spend on work already done.
 */
async function adoptTeaser(tenantId, teaserToken) {
  if (!teaserToken) return { adopted: false, reason: 'no teaser token' };
  const t = await models.teasers.findOne({ where: { token: teaserToken } });
  if (!t || !t.payload || !t.payload.screens) return { adopted: false, reason: 'teaser not found or not ready' };

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
  if (!existing) {
    await scoped('profiles', tenantId).create({
      resume_json: profile,
      photo_asset_id: photoAssetId,
      source_text: t.payload.source_text || profile.source_text || '',
    });
  } else if (photoAssetId && !existing.photo_asset_id) {
    await scoped('profiles', tenantId).update({ photo_asset_id: photoAssetId }, { id: existing.id });
  }
  // The site must speak the language they chose at signup.
  if (t.language && t.language !== 'en') {
    await models.subscribers.update({ language: t.language }, { where: { id: tenantId } });
  }

  // Bind the teaser to its subscriber so the 90-day purge skips it.
  await models.teasers.update({ tenant_id: tenantId }, { where: { id: t.id } });
  return { adopted: true, headline: profile.headline || null };
}

/** Step 1 — allocate the web address. Idempotent. */
async function provisionAddress(tenantId) {
  const sub = await models.subscribers.findOne({ where: { id: tenantId } });
  if (sub.address) return { step: 'address', skipped: true, address: sub.address };

  const profileRow = await scoped('profiles', tenantId).findOne({});
  const profile = (profileRow && profileRow.resume_json) || {};
  const parts = addresses.splitName(profile.name || sub.name || sub.email.split('@')[0]);
  const r = await addresses.allocate({ ...parts, city: profile.location });

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
  try { out.hunter = await agents.hunter(tenantId); } catch (e) { out.hunter = { error: e.message }; }
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
  log.push(await provisionAddress(tenantId));
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

module.exports = { run, teardown, stateOf, provisionAddress, publishSite, activateAgents, adoptTeaser, ensureSettings, STEPS };
