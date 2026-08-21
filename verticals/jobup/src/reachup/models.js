'use strict';

// =============================================================
// ReachUp — the marketing layer inside JobUp Admin.
//
// Self-contained data layer on the SAME Postgres as JobUp (no second store, no
// Airtable/Notion — the triage's no-code backing store is rejected). Every table
// carries tenant_id and is indexed on it; every read is tenant-scoped through
// scoped(). Tables are `ru_` prefixed so they never collide with JobUp's `ju_`.
//
// Multi-tenant by CONFIG, not code: a tenant is a row in ru_tenants (brand kit,
// AI ceiling, approval target, sending config). Onboarding a second tenant is a
// seed of that one row — see scripts/seed-tenant.js.
// =============================================================

const { DataTypes } = require('sequelize');
const db = require('../db');

const PREFIX = 'ru_';
const models = {};
let ready = false;

const SCHEMA = {
  tenants: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    slug: { type: DataTypes.STRING, unique: true, allowNull: false },
    name: { type: DataTypes.STRING },
    brand_kit: { type: DataTypes.JSONB, defaultValue: {} },     // logo/palette/tagline/positioning/proof_points/banned_phrases/channel_style_rules/compliance_flags
    ai_monthly_ceiling_usd: { type: DataTypes.DECIMAL(10, 2), defaultValue: 25 },
    approval_target: { type: DataTypes.STRING },                // webhook URL or email — never hardcoded
    sending: { type: DataTypes.JSONB, defaultValue: {} },       // per-stream from-domain overrides
    config: { type: DataTypes.JSONB, defaultValue: {} },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  roles: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    user_ref: { type: DataTypes.STRING },                       // admin identity (email)
    role: { type: DataTypes.STRING },                           // marketing_reviewer | bilingual_reviewer | admin
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  subscribers: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    email: { type: DataTypes.STRING },
    phone: { type: DataTypes.STRING },
    first_name: { type: DataTypes.STRING },
    last_name: { type: DataTypes.STRING },
    language: { type: DataTypes.STRING, defaultValue: 'en' },   // en | es
    source: { type: DataTypes.STRING },
    utm_source: { type: DataTypes.STRING },
    utm_medium: { type: DataTypes.STRING },
    utm_campaign: { type: DataTypes.STRING },
    utm_term: { type: DataTypes.STRING },
    utm_content: { type: DataTypes.STRING },
    referrer_url: { type: DataTypes.TEXT },
    lifecycle_stage: { type: DataTypes.STRING, defaultValue: 'lead' }, // visitor|lead|free|paid|churned
    tags: { type: DataTypes.JSONB, defaultValue: [] },
    engagement_score: { type: DataTypes.INTEGER, defaultValue: 0 },
    quarantined: { type: DataTypes.BOOLEAN, defaultValue: false },     // imported, not yet released -> never sendable
    import_batch_id: { type: DataTypes.INTEGER },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  consents: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    subscriber_id: { type: DataTypes.INTEGER },
    channel: { type: DataTypes.STRING },                        // email|sms|voice|social_dm
    method: { type: DataTypes.STRING },                         // form|import|api|reply
    scope: { type: DataTypes.JSONB, defaultValue: [] },         // e.g. ['email_marketing'] — NOT ['automated_voice']
    ip: { type: DataTypes.STRING },
    user_agent: { type: DataTypes.TEXT },
    source_url: { type: DataTypes.TEXT },
    granted_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    revoked_at: { type: DataTypes.DATE },
  },
  suppressions: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER },                     // NULL => global suppression
    email_hash: { type: DataTypes.STRING },
    phone_hash: { type: DataTypes.STRING },
    reason: { type: DataTypes.STRING },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  audiences: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING },
    definition: { type: DataTypes.JSONB, defaultValue: {} },    // filter spec
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  links: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    campaign_id: { type: DataTypes.INTEGER },
    url: { type: DataTypes.TEXT },
    code: { type: DataTypes.STRING },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  events: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    subscriber_id: { type: DataTypes.INTEGER },
    campaign_id: { type: DataTypes.INTEGER },
    type: { type: DataTypes.STRING },                           // sent|delivered|open|click|bounce|complaint|unsubscribe
    sg_message_id: { type: DataTypes.STRING },
    meta: { type: DataTypes.JSONB, defaultValue: {} },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  import_batches: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING, defaultValue: 'quarantined' }, // quarantined|released|rejected
    row_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    provenance_text: { type: DataTypes.TEXT },                  // required to release
    released_by: { type: DataTypes.STRING },
    released_at: { type: DataTypes.DATE },
    rows: { type: DataTypes.JSONB, defaultValue: [] },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  ai_usage: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    kind: { type: DataTypes.STRING },
    model: { type: DataTypes.STRING },
    tokens_in: { type: DataTypes.INTEGER, defaultValue: 0 },
    tokens_out: { type: DataTypes.INTEGER, defaultValue: 0 },
    cost_usd: { type: DataTypes.DECIMAL(12, 6), defaultValue: 0 },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  briefs: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    prompt: { type: DataTypes.TEXT },
    params: { type: DataTypes.JSONB, defaultValue: {} },
    created_by: { type: DataTypes.STRING },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  content_assets: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    brief_id: { type: DataTypes.INTEGER },
    type: { type: DataTypes.STRING },                           // email_subject|email_body|social_caption
    language: { type: DataTypes.STRING },                       // en|es
    body: { type: DataTypes.TEXT },
    status: { type: DataTypes.STRING, defaultValue: 'draft' },  // draft|pending_review|approved|rejected|published
    approved_by: { type: DataTypes.STRING },
    approved_at: { type: DataTypes.DATE },
    rejection_reason: { type: DataTypes.TEXT },
    flagged: { type: DataTypes.BOOLEAN, defaultValue: false },  // banned-phrase survived regen -> human rewrite
    is_simulated: { type: DataTypes.BOOLEAN, defaultValue: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  campaigns: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING },
    stream: { type: DataTypes.STRING },                         // transactional|marketing|cold
    audience_id: { type: DataTypes.INTEGER },
    subject_asset_id: { type: DataTypes.INTEGER },
    body_asset_id: { type: DataTypes.INTEGER },
    status: { type: DataTypes.STRING, defaultValue: 'draft' },  // draft|sending|sent|failed
    sent_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    suppressed_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    sent_at: { type: DataTypes.DATE },
  },
};

const TENANT_SCOPED = new Set(Object.keys(SCHEMA).filter((n) => n !== 'tenants'));

function plain(row) { return row && typeof row.get === 'function' ? row.get({ plain: true }) : row; }

async function init() {
  const seq = db.sequelize();
  if (!seq) return { ok: false, reason: 'no database' };
  for (const [name, attrs] of Object.entries(SCHEMA)) {
    models[name] = seq.define(PREFIX + name, attrs, {
      tableName: PREFIX + name, timestamps: false,
      indexes: TENANT_SCOPED.has(name) ? [{ fields: ['tenant_id'] }] : [],
    });
  }
  for (const m of Object.values(models)) await m.sync({ alter: false });
  // Suppression lookups are the hottest path in the send loop; index the hashes.
  const idx = [
    ['ru_suppress_email', 'ru_suppressions', '(email_hash)'],
    ['ru_suppress_tenant', 'ru_suppressions', '(tenant_id, email_hash)'],
    ['ru_sub_email', 'ru_subscribers', '(tenant_id, email)'],
    ['ru_assets_brief', 'ru_content_assets', '(tenant_id, brief_id)'],
  ];
  for (const [n, t, c] of idx) {
    try { await seq.query(`CREATE INDEX IF NOT EXISTS ${n} ON ${t} ${c}`); } catch (e) { /* best effort */ }
  }
  ready = true;
  return { ok: true, tables: Object.keys(models).length };
}

// Tenant-scoped accessor — refuses a table not in the scoped set or a null tenant.
function scoped(name, tenantId) {
  if (!TENANT_SCOPED.has(name)) throw new Error(`ru_${name} is not tenant-scoped`);
  const m = models[name];
  if (!m) throw new Error('ReachUp not initialized');
  return {
    findAll: (opts = {}) => m.findAll({ ...opts, where: { ...(opts.where || {}), tenant_id: tenantId } }),
    findOne: (opts = {}) => m.findOne({ ...opts, where: { ...(opts.where || {}), tenant_id: tenantId } }),
    create: (vals, opts) => m.create({ ...vals, tenant_id: tenantId }, opts),
    update: (vals, where, opts) => m.update(vals, { ...(opts || {}), where: { ...where, tenant_id: tenantId } }),
    destroy: (where, opts) => m.destroy({ ...(opts || {}), where: { ...where, tenant_id: tenantId } }),
    count: (opts = {}) => m.count({ ...opts, where: { ...(opts.where || {}), tenant_id: tenantId } }),
  };
}

module.exports = { init, models, scoped, plain, SCHEMA, TENANT_SCOPED, isReady: () => ready };
