'use strict';

// =============================================================
// Schema + store.
//
// JobUp owns its database, so tables carry no prefix (spec section 21).
//
// SHARED DATABASE: JobUp runs on the CRM's Postgres alongside 20 other
// products, so EVERY table carries the `ju_` prefix (repo convention: lc_, df_,
// su_, ar_, gr_ ...). Unprefixed names like `jobs`, `settings` or `invoices`
// would be a collision waiting to happen.
//
// MULTITENANCY (spec section 4): every per-subscriber table carries tenant_id,
// and every read goes through the store's tenant-scoped helpers, which take the
// tenant from the caller's session — never from a request parameter.
//
// SHARED vs ISOLATED:
//   shared   -> jobs, employers        (one fetch of a board serves every tenant)
//   isolated -> everything else
// =============================================================

const { DataTypes, Op } = require('sequelize');
const db = require('../db');

const TABLE_PREFIX = 'ju_';

const TENANT_SCOPED = new Set([
  'profiles', 'settings', 'teasers', 'job_matches', 'tailored_resumes',
  'applications', 'opportunities', 'outreach', 'sites', 'agent_runs',
  'invoices', 'notification_prefs', 'audit_log', 'page_views', 'assets',
]);

const SCHEMA = {
  subscribers: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    // 'paid' | 'free_test' — a test account must never be counted as revenue.
    activation: { type: DataTypes.STRING, defaultValue: 'paid' },
    activated_at: { type: DataTypes.DATE },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    name: { type: DataTypes.STRING },
    phone: { type: DataTypes.STRING },              // E.164
    language: { type: DataTypes.STRING, defaultValue: 'en' },
    password_hash: { type: DataTypes.STRING },
    email_verified_at: { type: DataTypes.DATE },
    address: { type: DataTypes.STRING },            // firstnamelastname.jobup.dev
    status: { type: DataTypes.STRING, defaultValue: 'pending' }, // pending|active|past_due|canceled
    stripe_customer_id: { type: DataTypes.STRING },
    stripe_subscription_id: { type: DataTypes.STRING },
    current_period_end: { type: DataTypes.DATE },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  // tenant_id === subscribers.id
  profiles: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    photo_asset_id: { type: DataTypes.INTEGER },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    resume_json: { type: DataTypes.JSONB },         // JSON Resume shape
    source_text: { type: DataTypes.TEXT },          // raw extracted resume text
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  settings: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    settings: { type: DataTypes.JSONB, defaultValue: {} },
  },
  // SHARED pool — no tenant_id, by design (spec section 4)
  employers: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    ats: { type: DataTypes.STRING },
    token: { type: DataTypes.STRING },
    status: { type: DataTypes.STRING, defaultValue: 'unverified' }, // live|unverified|closed|demo
    note: { type: DataTypes.TEXT },
    last_fetched_at: { type: DataTypes.DATE },
  },
  jobs: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    source: { type: DataTypes.STRING },
    external_id: { type: DataTypes.STRING },
    employer: { type: DataTypes.STRING },
    title: { type: DataTypes.STRING },
    location: { type: DataTypes.STRING },
    url: { type: DataTypes.TEXT },
    description: { type: DataTypes.TEXT },
    compensation: { type: DataTypes.STRING },       // only when the posting states it
    posted_at: { type: DataTypes.DATE },
    dedupe_key: { type: DataTypes.STRING },
    first_seen_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    last_seen_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  job_matches: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    job_id: { type: DataTypes.INTEGER, allowNull: false },
    score: { type: DataTypes.INTEGER },
    explanation: { type: DataTypes.TEXT },
    missing: { type: DataTypes.JSONB, defaultValue: [] },
    stage: { type: DataTypes.STRING, defaultValue: 'new' }, // new|saved|applied|screening|interviewing|offer|closed
    is_simulated: { type: DataTypes.BOOLEAN, defaultValue: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  tailored_resumes: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    job_id: { type: DataTypes.INTEGER },
    content: { type: DataTypes.TEXT },
    diff: { type: DataTypes.JSONB, defaultValue: [] },
    flagged_terms: { type: DataTypes.JSONB, defaultValue: [] }, // no-invented-facts check
    confirmed: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_simulated: { type: DataTypes.BOOLEAN, defaultValue: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  applications: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    job_id: { type: DataTypes.INTEGER },
    // ONLY set when the subscriber confirms they submitted it (spec 11.4 / 19.1)
    confirmed_by_subscriber_at: { type: DataTypes.DATE },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  teasers: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER },          // null until they pay
    token: { type: DataTypes.STRING, unique: true },
    email: { type: DataTypes.STRING },
    name: { type: DataTypes.STRING },
    language: { type: DataTypes.STRING, defaultValue: 'en' },
    address_offer: { type: DataTypes.STRING },
    payload: { type: DataTypes.JSONB, defaultValue: {} },
    narration: { type: DataTypes.JSONB, defaultValue: [] },
    status: { type: DataTypes.STRING, defaultValue: 'pending' }, // pending|ready|failed
    // Real build progress — set as each stage completes, so the waiting screen
    // reports what is actually happening instead of animating a fake bar.
    stage: { type: DataTypes.STRING },
    stage_label: { type: DataTypes.STRING },
    stage_n: { type: DataTypes.INTEGER, defaultValue: 0 },
    stages_total: { type: DataTypes.INTEGER, defaultValue: 6 },
    started_at: { type: DataTypes.DATE },
    cost_usd: { type: DataTypes.FLOAT, defaultValue: 0 },
    ip_hash: { type: DataTypes.STRING },
    resume_purge_after: { type: DataTypes.DATE },    // 90-day purge (spec 19.1)
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  outreach: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    channel: { type: DataTypes.STRING },
    subject: { type: DataTypes.STRING },
    body: { type: DataTypes.TEXT },
    // approval is forced on in code, never a prompt (spec section 10)
    approved_at: { type: DataTypes.DATE },
    sent_at: { type: DataTypes.DATE },
    consent_snapshot: { type: DataTypes.JSONB },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  // INBOUND interest — a recruiter (or their AI) reached the subscriber via
  // the public site or the agent endpoint. The subscriber's own inbox.
  opportunities: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    source: { type: DataTypes.STRING },          // site_form | agent_endpoint | manual
    company: { type: DataTypes.STRING },
    role: { type: DataTypes.STRING },
    from_name: { type: DataTypes.STRING },
    from_email: { type: DataTypes.STRING },
    note: { type: DataTypes.TEXT },
    status: { type: DataTypes.STRING, defaultValue: 'new' },   // new | read | replied | archived
    reply_draft: { type: DataTypes.TEXT },
    read_at: { type: DataTypes.DATE },
    replied_at: { type: DataTypes.DATE },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  // Traffic to the subscriber's own public site.
  // NO raw IP is ever stored — visitor_hash is a salted daily digest, so a
  // unique-visitor count is possible without retaining an identifier.
  page_views: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    path: { type: DataTypes.STRING },
    referrer: { type: DataTypes.STRING },
    visitor_hash: { type: DataTypes.STRING },
    is_agent: { type: DataTypes.BOOLEAN, defaultValue: false },  // an AI crawler, not a person
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  // Binary a subscriber uploaded — today only a profile photo. Kept out of
  // resume_json so the JSON surfaces stay small and cacheable.
  assets: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER },        // null while still a teaser
    teaser_token: { type: DataTypes.STRING },
    kind: { type: DataTypes.STRING, defaultValue: 'photo' },
    mime: { type: DataTypes.STRING },
    bytes: { type: DataTypes.INTEGER },
    data: { type: DataTypes.TEXT },                // base64
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  sites: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    address: { type: DataTypes.STRING },
    published_at: { type: DataTypes.DATE },
    health: { type: DataTypes.JSONB, defaultValue: {} },
  },
  agent_runs: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    agent: { type: DataTypes.STRING },
    status: { type: DataTypes.STRING },
    summary: { type: DataTypes.TEXT },
    cost_usd: { type: DataTypes.FLOAT, defaultValue: 0 },
    is_simulated: { type: DataTypes.BOOLEAN, defaultValue: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  invoices: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    stripe_invoice_id: { type: DataTypes.STRING },
    amount_cents: { type: DataTypes.INTEGER },
    status: { type: DataTypes.STRING },
    dunning_stage: { type: DataTypes.INTEGER, defaultValue: 0 },
    paid_at: { type: DataTypes.DATE },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  notification_prefs: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    prefs: { type: DataTypes.JSONB, defaultValue: {} },
    unsubscribed_all_at: { type: DataTypes.DATE },
  },
  audit_log: {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER },
    actor: { type: DataTypes.STRING },
    action: { type: DataTypes.STRING },
    reason: { type: DataTypes.TEXT },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
};

// ---------------------------------------------------------------
// In-memory fallback with the same surface as the Sequelize models.
// ---------------------------------------------------------------
function memoryTable(name) {
  const rows = [];
  let seq = 1;
  const clone = (r) => (r == null ? null : JSON.parse(JSON.stringify(r)));
  const matches = (row, where) =>
    Object.entries(where || {}).every(([k, v]) => {
      if (v && typeof v === 'object' && v[Op.in]) return v[Op.in].includes(row[k]);
      if (v && typeof v === 'object' && v[Op.ne] !== undefined) return row[k] !== v[Op.ne];
      return row[k] === v;
    });
  return {
    _name: name,
    async create(values) {
      // Apply schema defaults so the memory backend behaves like Postgres.
      const defaults = {};
      for (const [col, def] of Object.entries(SCHEMA[name] || {})) {
        if (def && def.defaultValue !== undefined && def.defaultValue !== DataTypes.NOW) {
          defaults[col] = typeof def.defaultValue === 'object'
            ? JSON.parse(JSON.stringify(def.defaultValue)) : def.defaultValue;
        }
      }
      const row = { id: seq++, created_at: new Date(), ...defaults, ...values };
      rows.push(row);
      return clone(row);
    },
    async findOne({ where } = {}) {
      return clone(rows.find((r) => matches(r, where)) || null);
    },
    async findAll({ where, limit, order } = {}) {
      let out = rows.filter((r) => matches(r, where));
      if (order && order[0]) {
        const [col, dir] = order[0];
        out = out.slice().sort((a, b) =>
          dir === 'DESC' ? (b[col] > a[col] ? 1 : -1) : (a[col] > b[col] ? 1 : -1));
      }
      if (limit) out = out.slice(0, limit);
      return out.map(clone);
    },
    async count({ where } = {}) {
      return rows.filter((r) => matches(r, where)).length;
    },
    async update(values, { where } = {}) {
      let n = 0;
      rows.forEach((r) => { if (matches(r, where)) { Object.assign(r, values); n++; } });
      return [n];
    },
    async destroy({ where } = {}) {
      let n = 0;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (matches(rows[i], where)) { rows.splice(i, 1); n++; }
      }
      return n;
    },
  };
}

const models = {};
let ready = false;
let activeBackend = 'memory';

async function init() {
  const conn = await db.connect();
  const seq = db.sequelize();
  activeBackend = conn.ok ? 'postgres' : 'memory';

  if (conn.ok && seq) {
    for (const [name, attrs] of Object.entries(SCHEMA)) {
      models[name] = seq.define('ju_' + name, attrs, {
        tableName: TABLE_PREFIX + name,
        timestamps: false,
        indexes: TENANT_SCOPED.has(name) ? [{ fields: ['tenant_id'] }] : [],
      });
    }
    // alter:false — sync() creates missing TABLES but never missing COLUMNS.
    // Scoped to OUR models only; never touches another product's tables.
    for (const m of Object.values(models)) await m.sync({ alter: false });

    // ...so columns added to an existing table are applied explicitly here,
    // idempotently (repo convention). Without this a new column exists in the
    // model and in the SIT's memory backend but NOT in production Postgres,
    // and every read of it silently returns undefined.
    await ensureColumns(seq);
  } else {
    for (const name of Object.keys(SCHEMA)) models[name] = memoryTable(name);
  }
  ready = true;
  return { backend: activeBackend, tables: Object.keys(models).length };
}

// Columns added after a table first shipped. Safe to re-run forever.
const ADDED_COLUMNS = [
  ['ju_subscribers',   'activation',   "VARCHAR(32) DEFAULT 'paid'"],
  ['ju_subscribers',   'activated_at', 'TIMESTAMPTZ'],
  ['ju_opportunities', 'from_name',    'VARCHAR(255)'],
  ['ju_opportunities', 'from_email',   'VARCHAR(255)'],
  ['ju_opportunities', 'status',       "VARCHAR(32) DEFAULT 'new'"],
  ['ju_opportunities', 'reply_draft',  'TEXT'],
  ['ju_opportunities', 'read_at',      'TIMESTAMPTZ'],
  ['ju_opportunities', 'replied_at',   'TIMESTAMPTZ'],
  ['ju_teasers',       'stage',        'VARCHAR(64)'],
  ['ju_teasers',       'stage_label',  'VARCHAR(128)'],
  ['ju_teasers',       'stage_n',      'INTEGER DEFAULT 0'],
  ['ju_teasers',       'stages_total', 'INTEGER DEFAULT 6'],
  ['ju_teasers',       'started_at',   'TIMESTAMPTZ'],
  ['ju_profiles',      'photo_asset_id', 'INTEGER'],
];

async function ensureColumns(sequelize) {
  // The instance is passed in — it is local to init(), and reaching for a
  // module-scope `seq` here silently no-ops instead of migrating.
  if (!sequelize) return { applied: 0, skipped: 'no connection' };
  let applied = 0;
  for (const [table, col, type] of ADDED_COLUMNS) {
    try {
      await sequelize.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${type}`);
      applied++;
    } catch (e) {
      console.warn(`[jobup] could not ensure ${table}.${col}:`, e.message);
    }
  }
  console.log(`[jobup] ensured ${applied}/${ADDED_COLUMNS.length} post-launch columns`);
  return { applied };
}

// ---------------------------------------------------------------
// Tenant-scoped accessors. The ONLY sanctioned way to read per-subscriber
// data. tenant_id comes from the caller (session), never from user input.
// A cross-tenant read returns null/[] — asserted by the SIT.
// ---------------------------------------------------------------
function scoped(table, tenantId) {
  if (!TENANT_SCOPED.has(table)) {
    throw new Error(`scoped() is for tenant tables only; ${table} is shared`);
  }
  if (!Number.isInteger(tenantId)) throw new Error('tenant_id must be an integer');
  const m = models[table];
  return {
    create: (v) => m.create({ ...v, tenant_id: tenantId }),
    findOne: (where = {}) => m.findOne({ where: { ...where, tenant_id: tenantId } }),
    findAll: (opts = {}) =>
      m.findAll({ ...opts, where: { ...(opts.where || {}), tenant_id: tenantId } }),
    count: (where = {}) => m.count({ where: { ...where, tenant_id: tenantId } }),
    update: (values, where = {}) =>
      m.update(values, { where: { ...where, tenant_id: tenantId } }),
    destroy: (where = {}) => m.destroy({ where: { ...where, tenant_id: tenantId } }),
  };
}

module.exports = {
  init,
  TABLE_PREFIX,
  models,
  scoped,
  SCHEMA,
  TENANT_SCOPED,
  isReady: () => ready,
  backend: () => activeBackend,
  ensureColumns,
  ADDED_COLUMNS,
  Op,
};
