'use strict';

/**
 * Tenants = suppliers. This file is the one service allowed to use the
 * unscoped db helpers, because a tenant row IS the scope (SIT enforces that
 * every other service goes through tq/tone/trun).
 */

const crypto = require('crypto');
const db = require('../db');
const { encrypt, audit, httpError } = require('../util');
const C = require('../corpus');

const DEFAULT_SETTINGS = {
  calling_days: [1, 2, 3, 4, 5],
  calling_start: '09:00',
  calling_end: '18:00',
  recording_disclosure: 'This call may be recorded for quality and training.',
  require_consent_status: false,
  default_commission_pct: 3,
  price_fresh_days: 30,
  min_verified_confidence: 0.8
};

function slugify(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'supplier'; }

async function create({ name, timezone, isDemo = false }, actorId) {
  name = String(name || '').trim().slice(0, 200);
  if (!name) throw httpError(400, 'Company name is required');
  let slug = slugify(name);
  if (await db.one('SELECT id FROM sup_tenants WHERE slug = :s', { s: slug })) slug = slug + '-' + crypto.randomBytes(3).toString('hex');
  const [t] = await db.run(`INSERT INTO sup_tenants (name, slug, timezone, is_demo, settings, webhook_token)
    VALUES (:n, :s, :tz, :d, :set::jsonb, :wt) RETURNING *`,
  { n: name, s: slug, tz: timezone || 'America/New_York', d: !!isDemo, set: JSON.stringify(DEFAULT_SETTINGS), wt: crypto.randomBytes(24).toString('hex') });
  for (const [cat, kw] of C.DEFAULT_CATEGORIES) {
    await db.trun(t.id, `INSERT INTO sup_categories (tenant_id, name, keywords) VALUES (:tenant, :n, :k) ON CONFLICT DO NOTHING`, { n: cat, k: kw });
  }
  for (const comp of C.DEFAULT_COMPETITORS) {
    await db.trun(t.id, `INSERT INTO sup_competitors (tenant_id, name) VALUES (:tenant, :n) ON CONFLICT DO NOTHING`, { n: comp });
  }
  await audit(t.id, actorId, 'tenant.created', 'tenant', t.id, { name });
  return t;
}

async function get(tenantId) {
  const t = await db.one('SELECT * FROM sup_tenants WHERE id = :id', { id: Number(tenantId) });
  if (!t) throw httpError(404, 'Tenant not found');
  return t;
}

/** Public projection: never the encrypted token, only whether one is stored. */
function view(t) {
  const { ghl_secret_enc, ...rest } = t;
  return Object.assign(rest, { ghl_token_set: !!ghl_secret_enc });
}

async function updateSettings(tenantId, patch, actorId) {
  const t = await get(tenantId);
  const s = Object.assign({}, DEFAULT_SETTINGS, t.settings);
  const allowed = Object.keys(DEFAULT_SETTINGS);
  for (const k of allowed) if (patch[k] !== undefined) s[k] = patch[k];
  if (!/^\d{2}:\d{2}$/.test(s.calling_start) || !/^\d{2}:\d{2}$/.test(s.calling_end) || s.calling_start >= s.calling_end) throw httpError(400, 'Calling hours must be HH:MM with start before end');
  if (!Array.isArray(s.calling_days) || s.calling_days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw httpError(400, 'Calling days must be 0-6');
  const name = patch.name ? String(patch.name).trim().slice(0, 200) : t.name;
  const tz = patch.timezone || t.timezone;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch (e) { throw httpError(400, 'Unknown timezone'); }
  const [u] = await db.run('UPDATE sup_tenants SET settings = :s::jsonb, name = :n, timezone = :tz WHERE id = :id RETURNING *', { s: JSON.stringify(s), n: name, tz, id: t.id });
  await audit(t.id, actorId, 'tenant.settings_updated', 'tenant', t.id, { keys: Object.keys(patch) });
  return u;
}

/**
 * GoHighLevel connection. A tenant admin may store its OWN private-integration
 * token + location. Pointing a tenant at a CRM client's existing connection
 * ('crm_client') is super-admin only: that is someone's live sub-account.
 */
async function updateGhl(tenantId, patch, { actorId, isSuperAdmin }) {
  const t = await get(tenantId);
  const g = Object.assign({}, t.ghl);
  const plain = ['location_id', 'pipeline_id', 'inbound_agent_id', 'outbound_agent_id', 'default_workflow_id'];
  for (const k of plain) if (patch[k] !== undefined) g[k] = patch[k] ? String(patch[k]).trim().slice(0, 120) : null;
  if (patch.stage_map && typeof patch.stage_map === 'object') {
    g.stage_map = {};
    for (const st of C.PIPELINE) if (patch.stage_map[st]) g.stage_map[st] = String(patch.stage_map[st]).slice(0, 120);
  }
  let secret = t.ghl_secret_enc;
  if (patch.source !== undefined) {
    if (patch.source === 'crm_client') {
      if (!isSuperAdmin) throw httpError(403, 'Only a platform super admin can link a tenant to an existing CRM GoHighLevel connection');
      g.source = 'crm_client'; g.crm_client_id = Number(patch.crm_client_id) || null;
    } else if (patch.source === 'private_token') {
      g.source = 'private_token'; delete g.crm_client_id;
    } else if (patch.source === null || patch.source === 'none') {
      g.source = null; delete g.crm_client_id;
    } else throw httpError(400, 'Unknown connection source');
  }
  if (patch.token) secret = encrypt(String(patch.token).trim()); // blank keeps the stored token
  const [u] = await db.run('UPDATE sup_tenants SET ghl = :g::jsonb, ghl_secret_enc = :sec WHERE id = :id RETURNING *', { g: JSON.stringify(g), sec: secret, id: t.id });
  await audit(t.id, actorId, 'tenant.ghl_updated', 'tenant', t.id, { source: g.source || null, token_changed: !!patch.token });
  return u;
}

async function setStatus(tenantId, status, actorId) {
  if (!['trial', 'active', 'suspended', 'cancelled'].includes(status)) throw httpError(400, 'Unknown status');
  const [u] = await db.run('UPDATE sup_tenants SET status = :s WHERE id = :id RETURNING *', { s: status, id: Number(tenantId) });
  await audit(Number(tenantId), actorId, 'tenant.status', 'tenant', Number(tenantId), { status });
  return u;
}

async function markOnboarding(tenantId, step) {
  await db.run(`UPDATE sup_tenants SET onboarding = onboarding || jsonb_build_object(:k::text, now()::text) WHERE id = :id`, { k: step, id: Number(tenantId) });
}

/** Onboarding is DERIVED from real rows, not ticked boxes — except the two live tests, which are stamped when a real call event arrives. */
async function onboarding(tenantId) {
  const t = await get(tenantId);
  const c = await db.tone(t.id, `SELECT
    (SELECT count(*) FROM sup_products WHERE tenant_id = :tenant)::int AS products,
    (SELECT count(*) FROM sup_sales_reps WHERE tenant_id = :tenant AND active)::int AS reps,
    (SELECT count(*) FROM sup_categories WHERE tenant_id = :tenant AND active)::int AS cats,
    (SELECT count(*) FROM sup_campaigns WHERE tenant_id = :tenant)::int AS campaigns,
    (SELECT count(*) FROM sup_contractors WHERE tenant_id = :tenant)::int AS contractors`);
  const g = t.ghl || {};
  const ob = t.onboarding || {};
  const s = t.settings || {};
  const steps = [
    ['company', 'Company setup', !!t.name && !!t.timezone],
    ['ghl', 'Connect GoHighLevel', !!(g.source && (g.location_id || g.crm_client_id))],
    ['agent', 'Configure AI agent', !!(g.inbound_agent_id || g.outbound_agent_id)],
    ['reps', 'Configure sales representatives', c.reps > 0],
    ['catalog', 'Upload product catalog', c.products > 0],
    ['categories', 'Configure contractor categories', c.cats > 0],
    ['market', 'Configure market / geography', c.contractors > 0 || !!(s.market && (s.market.states || s.market.zips))],
    ['campaign', 'Create first campaign', c.campaigns > 0],
    ['test_inbound', 'Test inbound', !!ob.test_inbound],
    ['test_outbound', 'Test outbound', !!ob.test_outbound],
    ['activate', 'Activate tenant', t.status === 'active']
  ].map(([key, label, done], i) => ({ step: i + 1, key, label, done }));
  return { steps, done: steps.filter((x) => x.done).length, total: steps.length };
}

module.exports = { create, get, view, updateSettings, updateGhl, setStatus, markOnboarding, onboarding, DEFAULT_SETTINGS };
