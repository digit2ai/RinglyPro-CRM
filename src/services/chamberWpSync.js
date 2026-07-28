/**
 * WordPress-as-System-of-Record sync for CamaraVirtual chambers.
 *
 * Direction: WordPress OWNS member identity + profile. CamaraVirtual is the
 * system of engagement (projects, RFQs, trust, messaging, P2B). This module
 * pulls the roster from WordPress and reconciles it into `members`.
 *
 * The inverse direction (CV publishing a read-only directory OUT to a CMS)
 * lives in unified-chamber/core.js -- GET /public/members. The two are
 * independent; a chamber can run either, both, or neither.
 *
 * FIELD OWNERSHIP is the whole design. WordPress may only write identity and
 * profile columns (WP_OWNED_FIELDS). Everything CamaraVirtual earns or grants
 * -- trust_score, verified, governance_role, access_level, region_id, Stripe
 * ids -- is never touched by a sync. In particular access_level and
 * governance_role are deliberately NOT syncable: a compromised or
 * misconfigured WordPress must not be able to mint a chamber superadmin.
 *
 * Records are never hard-deleted. Members own projects, RFQs and messages;
 * a member who disappears from WordPress is deactivated (status='inactive')
 * so those rows keep their author and the audit trail survives.
 */
'use strict';

const crypto = require('crypto');
const { sequelize, QueryTypes, bcrypt } = require('../routes/unified-chamber/lib/shared');

// ---------------------------------------------------------------------------
// At-rest encryption for the WordPress credentials (mirrors the
// emailReconcile / growth crypto pattern: AES-256-GCM, key from the app secret)
// ---------------------------------------------------------------------------
const SECRET = process.env.CHAMBER_WP_SECRET || process.env.CHAMBER_JWT_SECRET ||
               process.env.JWT_SECRET || 'chamber-wp-secret-change-me';
const KEY = crypto.createHash('sha256').update(String(SECRET)).digest();

function encrypt(plain) {
  if (plain == null || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
}
function decrypt(blob) {
  if (!blob || typeof blob !== 'string' || !blob.startsWith('v1:')) return null;
  try {
    const [, ivB, tagB, dataB] = blob.split(':');
    const d = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB, 'base64'));
    d.setAuthTag(Buffer.from(tagB, 'base64'));
    return Buffer.concat([d.update(Buffer.from(dataB, 'base64')), d.final()]).toString('utf8');
  } catch (e) { return null; }
}
function mask(blob) {
  const v = decrypt(blob);
  if (!v) return { set: false };
  return { set: true, hint: v.length > 4 ? '...' + v.slice(-4) : '...' };
}

// ---------------------------------------------------------------------------
// Provenance + audit tables. Created on demand so no migration step is needed
// before the first sync; both are additive and never touch `members` DDL.
// ---------------------------------------------------------------------------
let _tablesReady = null;
async function ensureTables() {
  if (_tablesReady) return _tablesReady;
  _tablesReady = (async () => {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS chamber_wp_links (
        id SERIAL PRIMARY KEY,
        chamber_id INTEGER NOT NULL REFERENCES chambers(id) ON DELETE CASCADE,
        member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        external_id VARCHAR(120) NOT NULL,
        source VARCHAR(40) NOT NULL DEFAULT 'wordpress',
        last_synced_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      )`);
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_chamber_wp_links_ext
       ON chamber_wp_links (chamber_id, source, external_id)`);
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_chamber_wp_links_member
       ON chamber_wp_links (chamber_id, member_id)`);
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS chamber_wp_sync_runs (
        id SERIAL PRIMARY KEY,
        chamber_id INTEGER NOT NULL REFERENCES chambers(id) ON DELETE CASCADE,
        dry_run BOOLEAN DEFAULT FALSE,
        ok BOOLEAN DEFAULT TRUE,
        fetched INTEGER DEFAULT 0,
        created INTEGER DEFAULT 0,
        updated INTEGER DEFAULT 0,
        deactivated INTEGER DEFAULT 0,
        skipped INTEGER DEFAULT 0,
        error TEXT,
        detail JSONB,
        started_at TIMESTAMP DEFAULT NOW(),
        finished_at TIMESTAMP
      )`);
  })();
  return _tablesReady;
}

// ---------------------------------------------------------------------------
// Per-chamber configuration, stored in chambers.theme_config.wp_sync
// ---------------------------------------------------------------------------
const DEFAULT_CONFIG = {
  enabled: false,
  // WHO IS THE SYSTEM OF RECORD. Mutually exclusive on purpose:
  //   'pull' -- WordPress owns members, CamaraVirtual follows (pull + webhook)
  //   'push' -- CamaraVirtual owns members, WordPress follows
  // Running both at once is an echo loop (CV writes -> WP fires profile_update
  // -> webhook writes back to CV -> ...). The routes enforce the exclusivity;
  // the companion plugin additionally suppresses its outbound webhook while it
  // is applying a write that came from CamaraVirtual.
  direction: 'pull',
  mode: 'plugin',            // 'plugin' (companion WP plugin) | 'wp_users' (core REST API)
  site_url: '',
  auth_user: '',             // wp_users mode: the Application Password username
  deactivate_missing: false, // OFF by default -- a first sync must not mass-deactivate
  push_deactivate_missing: false,
  allow_sso: false,
  default_country: '',
  default_sector: ''
};

function readConfig(chamber) {
  let tc = chamber && chamber.theme_config;
  if (typeof tc === 'string') { try { tc = JSON.parse(tc); } catch (e) { tc = {}; } }
  return Object.assign({}, DEFAULT_CONFIG, (tc && tc.wp_sync) || {});
}

// Never returns secrets -- only whether they are set and a 4-char hint.
function publicConfig(chamber) {
  const c = readConfig(chamber);
  return {
    enabled: !!c.enabled, direction: c.direction, mode: c.mode, site_url: c.site_url,
    auth_user: c.auth_user, deactivate_missing: !!c.deactivate_missing,
    push_deactivate_missing: !!c.push_deactivate_missing,
    allow_sso: !!c.allow_sso, default_country: c.default_country,
    default_sector: c.default_sector,
    auth_secret: mask(c.auth_secret_enc),
    shared_secret: mask(c.shared_secret_enc),
    last_run: c.last_run || null
  };
}

const EDITABLE = ['enabled', 'direction', 'mode', 'site_url', 'auth_user', 'deactivate_missing',
                  'push_deactivate_missing', 'allow_sso', 'default_country', 'default_sector'];

async function saveConfig(chamberId, chamber, patch) {
  const next = readConfig(chamber);
  for (const k of EDITABLE) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) next[k] = patch[k];
  }
  if (next.mode !== 'wp_users' && next.mode !== 'plugin') next.mode = 'plugin';
  if (next.direction !== 'push' && next.direction !== 'pull') next.direction = 'pull';
  if (next.direction === 'push' && next.mode !== 'plugin') {
    throw new Error("direction 'push' requires mode 'plugin' -- the core wp/v2/users API cannot carry company, sector or phone");
  }
  if (next.site_url) {
    const u = normalizeSiteUrl(next.site_url);
    if (!u) throw new Error('site_url must be an http(s) URL');
    next.site_url = u;
  }
  // Empty string on a secret means "leave the stored value alone" -- the UI
  // never receives the real secret, so it cannot echo it back.
  if (patch.auth_secret) next.auth_secret_enc = encrypt(patch.auth_secret);
  if (patch.shared_secret) next.shared_secret_enc = encrypt(patch.shared_secret);
  if (patch.auth_secret === null) delete next.auth_secret_enc;
  if (patch.shared_secret === null) delete next.shared_secret_enc;

  await writeConfig(chamberId, next);
  return next;
}

async function writeConfig(chamberId, cfg) {
  await sequelize.query(
    `UPDATE chambers
     SET theme_config = COALESCE(theme_config, '{}'::jsonb) || jsonb_build_object('wp_sync', :cfg::jsonb),
         updated_at = NOW()
     WHERE id = :id`,
    { replacements: { id: chamberId, cfg: JSON.stringify(cfg) } }
  );
  try {
    require('../../chamber-template/lib/chamber-resolver').invalidateCache();
  } catch (e) { /* resolver cache is a 60s TTL anyway */ }
}

function normalizeSiteUrl(raw) {
  let s = String(raw || '').trim().replace(/\/+$/, '');
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname) return null;
    return u.origin + u.pathname.replace(/\/+$/, '');
  } catch (e) { return null; }
}

// ---------------------------------------------------------------------------
// Fetch adapters
// ---------------------------------------------------------------------------
const FETCH_TIMEOUT_MS = 15000;
const MAX_PAGES = 50;
const PER_PAGE = 100;

async function httpJson(url, headers) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: Object.assign({ Accept: 'application/json' }, headers || {}), signal: ctl.signal });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (e) { /* non-JSON */ }
    if (!res.ok) {
      const msg = (body && (body.message || body.error)) || text.slice(0, 200) || ('HTTP ' + res.status);
      const err = new Error(`WordPress responded ${res.status}: ${msg}`);
      err.status = res.status;
      throw err;
    }
    return body;
  } finally { clearTimeout(timer); }
}

function signRequest(secret, timestamp) {
  return crypto.createHmac('sha256', String(secret)).update(String(timestamp)).digest('hex');
}

function toArray(v) {
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  if (typeof v === 'string' && v.trim()) return v.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

function pickName(m) {
  let first = String(m.first_name || '').trim();
  let last = String(m.last_name || '').trim();
  if (!first && !last) {
    const display = String(m.name || m.display_name || '').trim();
    if (display) {
      const parts = display.split(/\s+/);
      first = parts.shift();
      last = parts.join(' ');
    }
  }
  if (!first) first = String(m.email || '').split('@')[0] || 'Member';
  if (!last) last = '-';
  return { first_name: first.slice(0, 120), last_name: last.slice(0, 120) };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeRecord(raw) {
  const email = String(raw.email || raw.user_email || '').trim().toLowerCase();
  const name = pickName(raw);
  const active = raw.active === undefined ? true : !!raw.active;
  const yrs = parseInt(raw.years_experience, 10);
  return {
    external_id: String(raw.external_id != null ? raw.external_id : (raw.id != null ? raw.id : email)),
    email,
    first_name: name.first_name,
    last_name: name.last_name,
    company_name: str(raw.company_name || raw.company, 200),
    phone: str(raw.phone, 40),
    country: str(raw.country, 80),
    sector: str(raw.sector, 80),
    sub_specialty: str(raw.sub_specialty, 160),
    years_experience: Number.isFinite(yrs) && yrs >= 0 && yrs < 100 ? yrs : null,
    languages: toArray(raw.languages),
    bio: str(raw.bio || raw.description, 2000),
    linkedin_url: url(raw.linkedin_url),
    website_url: url(raw.website_url || raw.url),
    membership_type: ['individual', 'company'].includes(raw.membership_type) ? raw.membership_type : 'individual',
    active
  };
}
// Sequelize expands a JS array named-replacement into a comma-separated list,
// which turns one INSERT expression into several ("INSERT has more expressions
// than target columns"). Emit a postgres array literal and bind it with an
// explicit ::text[] cast -- the same pattern core.js uses for `languages`.
function pgArray(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  const items = arr.map(s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
  return '{' + items.join(',') + '}';
}

function str(v, max) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}
function url(v) {
  const s = str(v, 400);
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s)) return 'https://' + s;
  return null;
}

// Companion plugin: GET {site}/wp-json/camaravirtual/v1/members
async function fetchViaPlugin(cfg) {
  const secret = decrypt(cfg.shared_secret_enc);
  if (!secret) throw new Error('shared_secret is not configured (needed for plugin mode)');
  const out = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const ts = Math.floor(Date.now() / 1000);
    const body = await httpJson(
      `${cfg.site_url}/wp-json/camaravirtual/v1/members?page=${page}&per_page=${PER_PAGE}`,
      { 'X-CV-Timestamp': String(ts), 'X-CV-Signature': signRequest(secret, ts) }
    );
    const rows = (body && (body.members || body.data)) || [];
    out.push(...rows);
    const totalPages = body && body.total_pages;
    if (!rows.length || (totalPages && page >= totalPages) || rows.length < PER_PAGE) break;
  }
  return out;
}

// Core WordPress REST API + Application Password. Zero plugins to install, but
// only carries what wp/v2/users exposes (no company, sector, phone).
async function fetchViaWpUsers(cfg) {
  const pass = decrypt(cfg.auth_secret_enc);
  if (!cfg.auth_user || !pass) throw new Error('auth_user + auth_secret (Application Password) required for wp_users mode');
  const basic = Buffer.from(`${cfg.auth_user}:${pass}`).toString('base64');
  const out = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    let rows;
    try {
      rows = await httpJson(
        `${cfg.site_url}/wp-json/wp/v2/users?context=edit&per_page=${PER_PAGE}&page=${page}`,
        { Authorization: 'Basic ' + basic }
      );
    } catch (e) {
      // WordPress returns 400 rest_post_invalid_page_number past the last page.
      if (e.status === 400 && page > 1) break;
      throw e;
    }
    if (!Array.isArray(rows) || !rows.length) break;
    out.push(...rows.map(u => ({
      id: u.id, email: u.email, first_name: u.first_name, last_name: u.last_name,
      name: u.name, url: u.url, bio: u.description,
      // A user with no role at all is treated as deactivated upstream.
      active: !Array.isArray(u.roles) || u.roles.length > 0
    })));
    if (rows.length < PER_PAGE) break;
  }
  return out;
}

async function fetchRoster(cfg) {
  if (!cfg.site_url) throw new Error('site_url is not configured');
  return cfg.mode === 'wp_users' ? fetchViaWpUsers(cfg) : fetchViaPlugin(cfg);
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

// The ONLY columns a WordPress sync may write. Adding a privilege column here
// (access_level, governance_role, verified, trust_score) would let the upstream
// site grant itself power inside the chamber -- do not.
const WP_OWNED_FIELDS = [
  'first_name', 'last_name', 'company_name', 'phone', 'country', 'sector',
  'sub_specialty', 'years_experience', 'languages', 'bio', 'linkedin_url',
  'website_url', 'membership_type'
];
const ADMIN_LEVELS = ['superadmin', 'admin_global', 'admin_regional'];

function sameValue(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    const x = Array.isArray(a) ? a : [], y = Array.isArray(b) ? b : [];
    return x.length === y.length && x.every((v, i) => String(v) === String(y[i]));
  }
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

/**
 * Pull the WordPress roster and reconcile it into `members`.
 * @param {object} chamber  row from chambers (needs id, slug, theme_config, owner_member_id)
 * @param {object} opts     { dryRun:boolean }
 * @returns {object} summary + per-record plan
 */
async function syncChamber(chamber, opts) {
  const dryRun = !!(opts && opts.dryRun);
  const cfg = readConfig(chamber);
  if (!cfg.enabled) throw new Error('WordPress sync is not enabled for this chamber');
  if (cfg.direction === 'push') {
    throw new Error("This chamber is configured with direction 'push' (CamaraVirtual is the system " +
      "of record). Pulling as well would fight the push. Set direction to 'pull' first.");
  }
  await ensureTables();

  const started = Date.now();
  const raw = await fetchRoster(cfg);

  // Normalize, drop unusable rows, and collapse duplicate emails (WordPress
  // cannot have two users with one email, but a custom endpoint can).
  const seen = new Map();
  const invalid = [];
  const duplicates = [];
  for (const r of raw) {
    const rec = normalizeRecord(r);
    if (!EMAIL_RE.test(rec.email)) { invalid.push({ external_id: rec.external_id, email: rec.email, reason: 'invalid email' }); continue; }
    if (seen.has(rec.email)) { duplicates.push(rec.email); continue; }
    if (cfg.default_country && !rec.country) rec.country = cfg.default_country;
    if (cfg.default_sector && !rec.sector) rec.sector = cfg.default_sector;
    seen.set(rec.email, rec);
  }

  const existing = await sequelize.query(
    `SELECT m.id, m.email, m.status, m.access_level, ${WP_OWNED_FIELDS.map(f => 'm.' + f).join(', ')},
            l.external_id AS wp_external_id
     FROM members m
     LEFT JOIN chamber_wp_links l ON l.member_id = m.id AND l.chamber_id = m.chamber_id
     WHERE m.chamber_id = :c`,
    { replacements: { c: chamber.id }, type: QueryTypes.SELECT }
  );
  const byEmail = new Map(existing.map(m => [String(m.email).toLowerCase(), m]));
  const byExternal = new Map(existing.filter(m => m.wp_external_id).map(m => [String(m.wp_external_id), m]));

  const plan = { create: [], update: [], reactivate: [], deactivate: [], unchanged: 0 };
  const matchedIds = new Set();

  for (const rec of seen.values()) {
    // Match on the WordPress id first so an email change upstream renames the
    // member instead of creating a second row.
    const current = byExternal.get(rec.external_id) || byEmail.get(rec.email);

    if (!current) {
      plan.create.push(rec);
      continue;
    }
    matchedIds.add(current.id);

    const changes = {};
    for (const f of WP_OWNED_FIELDS) {
      if (!sameValue(current[f], rec[f])) changes[f] = rec[f];
    }
    if (current.email !== rec.email) changes.email = rec.email;

    if (!rec.active && current.status === 'active') {
      plan.deactivate.push({ id: current.id, email: current.email, reason: 'inactive in WordPress' });
    } else if (rec.active && current.status === 'inactive') {
      plan.reactivate.push({ id: current.id, email: rec.email, changes });
    } else if (Object.keys(changes).length) {
      plan.update.push({ id: current.id, email: current.email, changes });
    } else {
      plan.unchanged++;
    }
  }

  // Members CamaraVirtual has that WordPress does not. Protected: chamber
  // admins and the chamber owner, so a bad sync can never lock out the people
  // who would have to fix it.
  if (cfg.deactivate_missing) {
    for (const m of existing) {
      if (matchedIds.has(m.id) || m.status !== 'active') continue;
      if (ADMIN_LEVELS.includes(m.access_level)) continue;
      if (chamber.owner_member_id && m.id === chamber.owner_member_id) continue;
      plan.deactivate.push({ id: m.id, email: m.email, reason: 'absent from WordPress' });
    }
  }

  const summary = {
    dry_run: dryRun, mode: cfg.mode, site_url: cfg.site_url,
    fetched: raw.length, usable: seen.size,
    created: plan.create.length,
    updated: plan.update.length + plan.reactivate.length,
    deactivated: plan.deactivate.length,
    unchanged: plan.unchanged,
    invalid, duplicates,
    deactivate_missing: !!cfg.deactivate_missing
  };

  if (dryRun) {
    summary.plan = {
      create: plan.create.map(r => ({ email: r.email, name: r.first_name + ' ' + r.last_name, company: r.company_name })),
      update: plan.update.map(u => ({ email: u.email, fields: Object.keys(u.changes) })),
      reactivate: plan.reactivate.map(u => ({ email: u.email })),
      deactivate: plan.deactivate
    };
    summary.duration_ms = Date.now() - started;
    await recordRun(chamber.id, summary, true, null);
    return summary;
  }

  // ---- apply ----
  try {
    for (const rec of plan.create) {
      // NOT NULL column with no upstream source. A random unusable hash means
      // the member cannot log in with a password until they either use SSO or
      // run the existing /auth/forgot-password flow.
      const unusable = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      const [row] = await sequelize.query(
        `INSERT INTO members
          (chamber_id, email, password_hash, first_name, last_name, company_name, phone,
           country, sector, sub_specialty, years_experience, languages, bio,
           linkedin_url, website_url, membership_type, status, created_at, updated_at)
         VALUES (:c, :email, :ph, :first_name, :last_name, :company_name, :phone,
           :country, :sector, :sub_specialty, :years_experience, :languages::text[], :bio,
           :linkedin_url, :website_url, :membership_type, 'active', NOW(), NOW())
         ON CONFLICT (chamber_id, email) DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        {
          replacements: Object.assign({ c: chamber.id, ph: unusable }, rec, {
            languages: pgArray(rec.languages)
          }),
          type: QueryTypes.SELECT
        }
      );
      if (row && row.id) await linkExternal(chamber.id, row.id, rec.external_id);
    }

    for (const u of plan.update.concat(plan.reactivate)) {
      const fields = Object.assign({}, u.changes);
      const isReactivate = plan.reactivate.includes(u);
      const sets = Object.keys(fields).map(f => f === 'languages' ? `${f} = :${f}::text[]` : `${f} = :${f}`);
      if (isReactivate) sets.push(`status = 'active'`);
      if (!sets.length) continue;
      if ('languages' in fields) fields.languages = pgArray(fields.languages);
      await sequelize.query(
        `UPDATE members SET ${sets.join(', ')}, updated_at = NOW()
         WHERE chamber_id = :c AND id = :id`,
        { replacements: Object.assign({ c: chamber.id, id: u.id }, fields) }
      );
    }

    for (const d of plan.deactivate) {
      await sequelize.query(
        `UPDATE members SET status = 'inactive', updated_at = NOW()
         WHERE chamber_id = :c AND id = :id`,
        { replacements: { c: chamber.id, id: d.id } }
      );
    }

    // Backfill provenance for rows matched by email that had no link yet.
    for (const rec of seen.values()) {
      const cur = byEmail.get(rec.email) || byExternal.get(rec.external_id);
      if (cur && !cur.wp_external_id) await linkExternal(chamber.id, cur.id, rec.external_id);
    }
  } catch (err) {
    summary.error = err.message;
    await recordRun(chamber.id, summary, false, err.message);
    throw err;
  }

  summary.duration_ms = Date.now() - started;
  await recordRun(chamber.id, summary, true, null);

  const cfgNext = readConfig(chamber);
  cfgNext.last_run = {
    at: new Date().toISOString(), ok: true,
    created: summary.created, updated: summary.updated,
    deactivated: summary.deactivated, fetched: summary.fetched
  };
  await writeConfig(chamber.id, cfgNext);

  return summary;
}

// ---------------------------------------------------------------------------
// PUSH -- CamaraVirtual is the system of record, WordPress follows
// ---------------------------------------------------------------------------
async function httpPostJson(url, headers, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: Object.assign({ Accept: 'application/json', 'Content-Type': 'application/json' }, headers || {}),
      body: JSON.stringify(body),
      signal: ctl.signal
    });
    const text = await res.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch (e) { /* non-JSON */ }
    if (!res.ok) {
      const msg = (parsed && (parsed.message || parsed.error)) || text.slice(0, 200) || ('HTTP ' + res.status);
      const err = new Error(`WordPress responded ${res.status}: ${msg}`);
      err.status = res.status;
      throw err;
    }
    return parsed;
  } finally { clearTimeout(timer); }
}

/**
 * Push the chamber's members INTO WordPress.
 *
 * The mirror image of syncChamber. Here CamaraVirtual owns the record and
 * WordPress is the follower, so the ownership rule inverts for profile fields
 * -- but only for profile fields. This never sends access_level, trust_score,
 * governance_role or any WordPress capability: the payload cannot grant a
 * WordPress role, and the companion plugin assigns its own default role on
 * create. A chamber cannot escalate privilege on the WordPress site any more
 * than WordPress can escalate inside the chamber.
 *
 * Requires mode 'plugin' -- the companion plugin's write endpoint is what
 * carries company/sector/phone into user meta.
 */
async function pushChamber(chamber, opts) {
  const dryRun = !!(opts && opts.dryRun);
  const cfg = readConfig(chamber);
  if (!cfg.enabled) throw new Error('WordPress sync is not enabled for this chamber');
  if (cfg.direction !== 'push') {
    throw new Error("This chamber is configured with direction '" + cfg.direction +
      "'. Set direction to 'push' before pushing, so pull and push can never run at once.");
  }
  if (cfg.mode !== 'plugin') throw new Error("push requires mode 'plugin'");
  const secret = decrypt(cfg.shared_secret_enc);
  if (!secret) throw new Error('shared_secret is not configured');
  await ensureTables();

  const started = Date.now();

  const members = await sequelize.query(
    `SELECT m.id, m.email, m.status, ${WP_OWNED_FIELDS.map(f => 'm.' + f).join(', ')},
            l.external_id AS wp_external_id
     FROM members m
     LEFT JOIN chamber_wp_links l ON l.member_id = m.id AND l.chamber_id = m.chamber_id
     WHERE m.chamber_id = :c AND m.status = 'active'
     ORDER BY m.id`,
    { replacements: { c: chamber.id }, type: QueryTypes.SELECT }
  );

  // Read WordPress once so the push is a diff, not a blind overwrite of every
  // row on every run.
  let remote = [];
  try { remote = await fetchRoster(cfg); } catch (e) {
    throw new Error('Could not read the current WordPress roster before pushing: ' + e.message);
  }
  const remoteByEmail = new Map();
  const remoteById = new Map();
  for (const r of remote) {
    const rec = normalizeRecord(r);
    if (rec.email) remoteByEmail.set(rec.email, rec);
    if (rec.external_id) remoteById.set(String(rec.external_id), rec);
  }

  const plan = { create: [], update: [], unchanged: 0, deactivate: [] };
  const pushedEmails = new Set();

  for (const m of members) {
    const email = String(m.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) continue;
    pushedEmails.add(email);

    const payload = { external_id: String(m.id), email };
    for (const f of WP_OWNED_FIELDS) payload[f] = m[f];

    const current = (m.wp_external_id && remoteById.get(String(m.wp_external_id))) || remoteByEmail.get(email);
    if (!current) { plan.create.push(payload); continue; }

    const diff = [];
    for (const f of WP_OWNED_FIELDS) {
      if (!sameValue(current[f], m[f])) diff.push(f);
    }
    if (current.email !== email) diff.push('email');
    if (diff.length) plan.update.push(Object.assign({ _fields: diff }, payload));
    else plan.unchanged++;
  }

  if (cfg.push_deactivate_missing) {
    for (const rec of remoteByEmail.values()) {
      if (!pushedEmails.has(rec.email)) plan.deactivate.push({ email: rec.email, external_id: rec.external_id });
    }
  }

  const summary = {
    dry_run: dryRun, direction: 'push', site_url: cfg.site_url,
    members: members.length, remote: remote.length,
    created: plan.create.length, updated: plan.update.length,
    deactivated: plan.deactivate.length, unchanged: plan.unchanged,
    push_deactivate_missing: !!cfg.push_deactivate_missing,
    errors: []
  };

  if (dryRun) {
    summary.plan = {
      create: plan.create.map(p => ({ email: p.email, name: p.first_name + ' ' + p.last_name, company: p.company_name })),
      update: plan.update.map(p => ({ email: p.email, fields: p._fields })),
      deactivate: plan.deactivate
    };
    summary.duration_ms = Date.now() - started;
    await recordRun(chamber.id, summary, true, null);
    return summary;
  }

  const send = async (event, payload) => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac('sha256', secret)
      .update(`${ts}.${event}.${payload.email}`).digest('hex');
    return httpPostJson(
      `${cfg.site_url}/wp-json/camaravirtual/v1/members`,
      { 'X-CV-Timestamp': String(ts), 'X-CV-Signature': sig },
      { event, member: payload }
    );
  };

  // One member failing (a WordPress validation error, say) must not abandon
  // the rest of the roster -- collect and report instead of throwing.
  for (const p of plan.create.concat(plan.update)) {
    const payload = Object.assign({}, p); delete payload._fields;
    try {
      const out = await send('member.upsert', payload);
      if (out && out.id) await linkExternalByEmail(chamber.id, payload.email, out.id);
    } catch (e) {
      summary.errors.push({ email: payload.email, error: e.message });
    }
  }
  for (const d of plan.deactivate) {
    try { await send('member.deactivated', { email: d.email, external_id: d.external_id }); }
    catch (e) { summary.errors.push({ email: d.email, error: e.message }); }
  }

  summary.created -= summary.errors.length ? 0 : 0; // counts stay as planned; failures listed separately
  summary.failed = summary.errors.length;
  summary.duration_ms = Date.now() - started;
  await recordRun(chamber.id, summary, summary.errors.length === 0, summary.errors.length ? 'partial failure' : null);

  const cfgNext = readConfig(chamber);
  cfgNext.last_run = {
    at: new Date().toISOString(), ok: summary.errors.length === 0, direction: 'push',
    created: summary.created, updated: summary.updated,
    deactivated: summary.deactivated, failed: summary.failed
  };
  await writeConfig(chamber.id, cfgNext);

  return summary;
}

async function linkExternalByEmail(chamberId, email, externalId) {
  const [row] = await sequelize.query(
    `SELECT id FROM members WHERE chamber_id = :c AND LOWER(email) = :e`,
    { replacements: { c: chamberId, e: String(email).toLowerCase() }, type: QueryTypes.SELECT }
  );
  if (row) await linkExternal(chamberId, row.id, externalId);
}

async function linkExternal(chamberId, memberId, externalId) {
  await sequelize.query(
    `INSERT INTO chamber_wp_links (chamber_id, member_id, external_id, source, last_synced_at)
     VALUES (:c, :m, :e, 'wordpress', NOW())
     ON CONFLICT (chamber_id, member_id)
     DO UPDATE SET external_id = EXCLUDED.external_id, last_synced_at = NOW()`,
    { replacements: { c: chamberId, m: memberId, e: String(externalId).slice(0, 120) } }
  );
}

async function recordRun(chamberId, s, ok, error) {
  try {
    await sequelize.query(
      `INSERT INTO chamber_wp_sync_runs
        (chamber_id, dry_run, ok, fetched, created, updated, deactivated, skipped, error, detail, finished_at)
       VALUES (:c, :dry, :ok, :f, :cr, :up, :de, :sk, :err, :detail::jsonb, NOW())`,
      { replacements: {
          c: chamberId, dry: !!s.dry_run, ok: !!ok, f: s.fetched || 0, cr: s.created || 0,
          up: s.updated || 0, de: s.deactivated || 0,
          sk: (s.invalid ? s.invalid.length : 0) + (s.duplicates ? s.duplicates.length : 0),
          err: error, detail: JSON.stringify(s).slice(0, 100000)
      } }
    );
  } catch (e) { console.error('[wp-sync] run log failed:', e.message); }
}

// ---------------------------------------------------------------------------
// Webhook + SSO verification
// ---------------------------------------------------------------------------
function timingSafeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

/**
 * Verify an inbound webhook: HMAC-SHA256 over `timestamp + "." + payload`,
 * inside a +/- 5 minute window.
 *
 * `payload` is a CANONICAL STRING both sides build from the event fields
 * (`event + "." + email`), not the raw request body. Express has already
 * parsed and discarded the raw stream by the time a router sees the request,
 * and re-serializing JSON is key-order dependent -- signing agreed fields is
 * both simpler and stable.
 */
function verifyWebhook(cfg, rawBody, signature, timestamp) {
  const secret = decrypt(cfg.shared_secret_enc);
  if (!secret) return { ok: false, error: 'shared_secret not configured' };
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) {
    return { ok: false, error: 'timestamp outside the 5 minute window' };
  }
  const expect = crypto.createHmac('sha256', secret).update(String(ts) + '.' + String(rawBody || '')).digest('hex');
  if (!signature || !timingSafeEq(expect, signature)) return { ok: false, error: 'bad signature' };
  return { ok: true };
}

// Replayed SSO handoffs are rejected: each nonce is single-use for its lifetime.
const usedNonces = new Map();
function rememberNonce(n) {
  const now = Date.now();
  for (const [k, exp] of usedNonces) if (exp < now) usedNonces.delete(k);
  if (usedNonces.has(n)) return false;
  usedNonces.set(n, now + 600000);
  return true;
}

/**
 * Verify an SSO handoff token minted by WordPress.
 * Format: base64url(JSON payload) + '.' + hex HMAC-SHA256(payload, shared_secret)
 * Payload: { email, exp (unix seconds), nonce }
 */
function verifySsoToken(cfg, token) {
  if (!cfg.allow_sso) return { ok: false, error: 'SSO is not enabled for this chamber' };
  const secret = decrypt(cfg.shared_secret_enc);
  if (!secret) return { ok: false, error: 'shared_secret not configured' };
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return { ok: false, error: 'malformed token' };
  const [payloadB64, sig] = parts;
  const expect = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
  if (!timingSafeEq(expect, sig)) return { ok: false, error: 'bad signature' };
  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch (e) { return { ok: false, error: 'malformed payload' }; }
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) return { ok: false, error: 'token expired' };
  if (payload.exp > now + 900) return { ok: false, error: 'token expiry too far in the future' };
  const email = String(payload.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'token has no valid email' };
  if (!payload.nonce || !rememberNonce(String(payload.nonce))) return { ok: false, error: 'token already used' };
  return { ok: true, email };
}

module.exports = {
  readConfig, publicConfig, saveConfig, syncChamber, pushChamber, fetchRoster,
  verifyWebhook, verifySsoToken, normalizeRecord, ensureTables,
  encrypt, decrypt, mask, normalizeSiteUrl, pgArray,
  WP_OWNED_FIELDS
};
