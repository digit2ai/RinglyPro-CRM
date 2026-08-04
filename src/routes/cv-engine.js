// CV Talent Engine — multi-tenant career console behind the public CV pages
// (manuelstagg.com / anastagg.com / julianagramowski.com). Each profile logs in to
// a private dashboard with: (1) analytics (reuses cv_page_hits), (2) on-demand AI
// broadcast/outreach drafting (review-and-send — honors the repo's no-auto-send rule),
// (3) an opportunities inbox fed by a public "submit an opportunity" form + manual adds.
// Self-contained: own Sequelize, scrypt password hashing, HMAC session cookie.
const express = require('express');
const crypto = require('crypto');
const { Sequelize, QueryTypes } = require('sequelize');
const jobsource = require('../services/cv-jobsource');
const settingsSvc = require('../services/cv-settings');
const employersSvc = require('../services/cv-employers');
const targeting = require('../services/cv-targeting');
const geo = require('../services/cv-geo');

const router = express.Router();
router.use(express.json({ limit: '256kb' }));

// Auto-wrap every route handler so an async rejection returns 500 (with the message)
// instead of hanging the request → 502. Applies to all router.get/post/patch/... below.
['get', 'post', 'patch', 'put', 'delete'].forEach((m) => {
  const orig = router[m].bind(router);
  router[m] = (path, ...handlers) => orig(path, ...handlers.map((fn) =>
    (typeof fn === 'function' && fn.length <= 3)
      ? (req, res, next) => Promise.resolve(fn(req, res, next)).catch((err) => {
          console.error('cv-engine', req.method, req.path, err && err.message);
          if (!res.headersSent) res.status(500).json({ error: (err && err.message) || 'server error' });
        })
      : fn));
});

const DB_URL = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;
const sequelize = DB_URL ? new Sequelize(DB_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
}) : null;

const SECRET = process.env.CV_ADMIN_SECRET || process.env.JWT_SECRET || 'cv-engine-secret';
const MODEL = process.env.CV_ENGINE_MODEL || 'claude-haiku-4-5-20251001';
const COOKIE = 'cv_admin_token';

// ---- seed profiles (created once; passwords never clobbered on boot so changes stick) ----
const SEED = [
  { slug: 'manuelstagg', name: 'Manuel Stagg', headline: 'Senior SME · Full-Stack AI Solutions Architect',
    email: 'manuelstagg@gmail.com', phone: '+16566001400', location: 'Wesley Chapel, FL',
    site: 'https://manuelstagg.com', linkedin: 'https://www.linkedin.com/in/manuel-stagg-7a11a9a0',
    target_roles: 'Full-Stack AI Solutions Architect; AI in Banking, Risk & Compliance (KYC/AML/Sanctions); MCP / Multi-Agent Systems & LLMOps; Fractional CTO / AI Advisory',
    summary: 'Senior SME and Full-Stack AI Solutions Architect. 24 years in the Banking Industry (Citigroup FCRM/CTI — KYC/AML, OFAC sanctions, CEAM) plus architect of MCP Neural Intelligence, an AI reasoning layer wired into production. Bilingual EN/ES.',
    pw: process.env.CV_ADMIN_PW_MANUELSTAGG || 'Palindrome@7' },
  { slug: 'anastagg', name: 'Ana I. Stagg', headline: 'Securities & Derivatives Analyst — Custody Billing & Financial Operations',
    email: 'ana.staggp@gmail.com', phone: '+18134389000', location: 'Tampa, FL',
    site: 'https://anastagg.com', linkedin: 'https://www.linkedin.com/in/ana-stagg6774',
    target_roles: 'Securities & Derivatives / Custody Billing Analyst; Financial Operations & Reconciliation; Billing QA, Controls & Compliance; Bilingual Institutional Client Servicing',
    summary: 'Bilingual Securities & Derivatives Analyst at Citi supporting global custody & safekeeping billing for institutional clients: fee calculation, contractual pricing validation, invoice reconciliation, billing QA and compliance. B.S. Business Administration (HRM) & Psychology.',
    pw: process.env.CV_ADMIN_PW_ANASTAGG || 'AnaStagg@2026' },
  { slug: 'juliana_gramowski', name: 'Juliana Gramowski', headline: 'Sales Executive · Business Development · Marketing Strategist',
    email: 'jgramowski7@gmail.com', phone: '+18133342244', location: 'Tampa, FL',
    site: 'https://julianagramowski.com', linkedin: 'https://www.linkedin.com/in/juliana-gramowski-6270201a4',
    target_roles: 'Sales Executive / Account Executive; Advertising & Media Sales (OOH, digital); Business Development & Marketing Strategy; Client Relationship & Account Management',
    summary: 'Results-oriented Sales Executive with 10+ years in business development, advertising sales (Out-of-Home) and strategic marketing across the US and Latin America. Clear Channel Outdoor, IndoorMedia, JCDecaux, Televisa. Bilingual EN/ES.',
    pw: process.env.CV_ADMIN_PW_JULIANA || 'Juliana@2026' },
  { slug: 'andreastagg', name: 'Andrea Stagg', headline: 'Securities & Derivatives Associate Analyst — JD · International Custody & Compliance',
    email: 'andreastaggp@gmail.com', phone: '+18135029433', location: 'Tampa, FL',
    site: 'https://andreastagg.com', linkedin: 'https://www.linkedin.com/in/andrea-stagg-1020718b',
    target_roles: 'Securities & Derivatives / Custody Operations Analyst; AML / Sanctions / Compliance Analyst; International Business & Trade / Legal Operations; Bilingual / Quadrilingual Institutional Client Servicing',
    summary: 'Securities & Derivatives Associate Analyst at Citi and Juris Doctor — international securities settlement and global custody (INDEVAL, DTC, EUROCLEAR, CREST, IBERCLEAR), AML/BSA/OFAC compliance and international business law. Roles at Citi and J.P. Morgan. Quadrilingual (EN/ES/FR/IT).',
    pw: process.env.CV_ADMIN_PW_ANDREA || 'AndreaStagg@2026' }
];

function hashPw(pw){ const s = crypto.randomBytes(16).toString('hex'); const dk = crypto.scryptSync(String(pw), s, 32).toString('hex'); return s + ':' + dk; }
function checkPw(pw, stored){ try { const [s, dk] = String(stored).split(':'); const t = crypto.scryptSync(String(pw), s, 32).toString('hex'); return crypto.timingSafeEqual(Buffer.from(dk, 'hex'), Buffer.from(t, 'hex')); } catch(e){ return false; } }

function sign(payload){ const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 30*24*3600*1000 })).toString('base64url'); const mac = crypto.createHmac('sha256', SECRET).update(body).digest('base64url'); return body + '.' + mac; }
function verify(tok){ try { const [body, mac] = String(tok).split('.'); const exp = crypto.createHmac('sha256', SECRET).update(body).digest('base64url'); if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(exp))) return null; const p = JSON.parse(Buffer.from(body, 'base64url').toString()); if (p.exp < Date.now()) return null; return p; } catch(e){ return null; } }
function getCookie(req, name){ const c = req.headers.cookie || ''; const m = c.match(new RegExp('(?:^|; )' + name + '=([^;]+)')); return m ? decodeURIComponent(m[1]) : null; }

let ready = false;
async function ensure(){
  if (ready || !sequelize) return;
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS cv_profiles (
      id BIGSERIAL PRIMARY KEY, slug VARCHAR(64) UNIQUE NOT NULL, name TEXT, headline TEXT,
      email TEXT, phone TEXT, location TEXT, site TEXT, linkedin TEXT,
      target_roles TEXT, summary TEXT, availability VARCHAR(24) DEFAULT 'open',
      password_hash TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS cv_opportunities (
      id BIGSERIAL PRIMARY KEY, profile_id BIGINT NOT NULL, source VARCHAR(24) DEFAULT 'inbound',
      company TEXT, contact_name TEXT, contact_email TEXT, role_title TEXT, message TEXT,
      status VARCHAR(24) DEFAULT 'new', notes TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_cv_opp_profile ON cv_opportunities(profile_id, created_at);
    CREATE TABLE IF NOT EXISTS cv_outreach (
      id BIGSERIAL PRIMARY KEY, profile_id BIGINT NOT NULL, channel VARCHAR(24) DEFAULT 'email',
      target_type VARCHAR(48), target_name TEXT, subject TEXT, body TEXT,
      status VARCHAR(24) DEFAULT 'draft', is_simulated BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_cv_out_profile ON cv_outreach(profile_id, created_at);
    CREATE TABLE IF NOT EXISTS cv_jobs (
      id BIGSERIAL PRIMARY KEY, source VARCHAR(24), source_id TEXT UNIQUE,
      company TEXT, title TEXT, location TEXT, remote BOOLEAN DEFAULT false,
      url TEXT, description TEXT, posted_at TIMESTAMPTZ,
      fetched_at TIMESTAMPTZ DEFAULT now(), created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_cv_jobs_fetched ON cv_jobs(fetched_at);
    CREATE TABLE IF NOT EXISTS cv_job_matches (
      id BIGSERIAL PRIMARY KEY, profile_id BIGINT NOT NULL, job_id BIGINT NOT NULL,
      score INT, verdict VARCHAR(16), why TEXT, gaps TEXT, is_simulated BOOLEAN DEFAULT false,
      status VARCHAR(16) DEFAULT 'new', created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(profile_id, job_id)
    );
    CREATE INDEX IF NOT EXISTS idx_cv_jm_profile ON cv_job_matches(profile_id, score DESC);
    ALTER TABLE cv_outreach ADD COLUMN IF NOT EXISTS job_id BIGINT;
    ALTER TABLE cv_outreach ADD COLUMN IF NOT EXISTS to_email TEXT;
    ALTER TABLE cv_outreach ADD COLUMN IF NOT EXISTS to_name TEXT;
    ALTER TABLE cv_outreach ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
    ALTER TABLE cv_outreach ADD COLUMN IF NOT EXISTS followup_due DATE;
    ALTER TABLE cv_outreach ADD COLUMN IF NOT EXISTS followup_count INT DEFAULT 0;
    -- Phase 4/5/6 columns (sync({alter:false}) equivalents — additive and idempotent)
    ALTER TABLE cv_jobs ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
    ALTER TABLE cv_jobs ADD COLUMN IF NOT EXISTS employer_id BIGINT;
    ALTER TABLE cv_jobs ADD COLUMN IF NOT EXISTS comp_min INT;
    ALTER TABLE cv_jobs ADD COLUMN IF NOT EXISTS comp_max INT;
    ALTER TABLE cv_jobs ADD COLUMN IF NOT EXISTS comp_period VARCHAR(8);
    CREATE INDEX IF NOT EXISTS idx_cv_jobs_dedupe ON cv_jobs(dedupe_key);
    ALTER TABLE cv_job_matches ADD COLUMN IF NOT EXISTS stage VARCHAR(24) DEFAULT 'new';
    ALTER TABLE cv_job_matches ADD COLUMN IF NOT EXISTS stage_at TIMESTAMPTZ;
    ALTER TABLE cv_job_matches ADD COLUMN IF NOT EXISTS next_action TEXT;
    ALTER TABLE cv_job_matches ADD COLUMN IF NOT EXISTS next_action_at DATE;
    ALTER TABLE cv_job_matches ADD COLUMN IF NOT EXISTS target_employer BOOLEAN DEFAULT false;
    ALTER TABLE cv_job_matches ADD COLUMN IF NOT EXISTS flags JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE cv_profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
    ALTER TABLE cv_profiles ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true;
    ALTER TABLE cv_profiles ADD COLUMN IF NOT EXISTS credential_source VARCHAR(24) DEFAULT 'db';
    ALTER TABLE cv_profiles ADD COLUMN IF NOT EXISTS invite_hash TEXT;
    ALTER TABLE cv_profiles ADD COLUMN IF NOT EXISTS invite_expires TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS cv_saved_searches (
      id BIGSERIAL PRIMARY KEY, profile_id BIGINT NOT NULL, name TEXT NOT NULL,
      query JSONB NOT NULL DEFAULT '{}'::jsonb, last_run_at TIMESTAMPTZ, last_new_count INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_cv_ss_profile ON cv_saved_searches(profile_id);
    CREATE TABLE IF NOT EXISTS cv_contacts (
      id BIGSERIAL PRIMARY KEY, profile_id BIGINT NOT NULL, name TEXT, email TEXT, company TEXT,
      role_title TEXT, relationship VARCHAR(48), notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_cv_contacts_profile ON cv_contacts(profile_id);
  `);
  await settingsSvc.ensureTable(sequelize).catch((e) => console.error('cv-settings ensure:', e.message));
  await employersSvc.ensureTables(sequelize).catch((e) => console.error('cv-employers ensure:', e.message));
  await employersSvc.seed(sequelize).catch((e) => console.error('cv-employers seed:', e.message));
  for (const p of SEED) {
    await sequelize.query(
      `INSERT INTO cv_profiles (slug,name,headline,email,phone,location,site,linkedin,target_roles,summary,password_hash)
       VALUES (:slug,:name,:headline,:email,:phone,:location,:site,:linkedin,:target_roles,:summary,:ph)
       ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, headline=EXCLUDED.headline, email=EXCLUDED.email,
         phone=EXCLUDED.phone, location=EXCLUDED.location, site=EXCLUDED.site, linkedin=EXCLUDED.linkedin,
         target_roles=COALESCE(cv_profiles.target_roles, EXCLUDED.target_roles),
         summary=COALESCE(cv_profiles.summary, EXCLUDED.summary), updated_at=now()`,
      { replacements: { ...p, ph: hashPw(p.pw) }, type: QueryTypes.INSERT }
    ).catch(()=>{});
    // Credential migration (Phase 4): passwords are OWNED BY THE PROFILE ROW, not by an
    // environment variable per person. The CV_ADMIN_PW_<SLUG> vars remain a one-time bootstrap
    // for the four accounts that predate this change — they seed a hash only when the row has
    // none, and are never read again — so no existing owner is locked out and no NEW profile
    // needs an env var. New profiles are provisioned by invite (POST /admin/profiles).
    await sequelize.query(
      `UPDATE cv_profiles SET password_hash=:ph, credential_source='bootstrap'
         WHERE slug=:slug AND (password_hash IS NULL OR password_hash='')`,
      { replacements: { slug: p.slug, ph: hashPw(p.pw) }, type: QueryTypes.UPDATE }).catch(()=>{});
  }
  // Exactly one admin, chosen by a RULE (the earliest profile) rather than by naming a person.
  await sequelize.query(
    `UPDATE cv_profiles SET is_admin=true WHERE id = (SELECT id FROM cv_profiles ORDER BY id ASC LIMIT 1)
       AND NOT EXISTS (SELECT 1 FROM cv_profiles WHERE is_admin=true)`).catch(()=>{});
  ready = true;
}
if (sequelize) ensure().catch(e => console.error('cv-engine ensure:', e.message));
else console.warn('cv-engine: no DB URL — talent engine disabled');

async function profileBySlug(slug){ const r = await sequelize.query('SELECT * FROM cv_profiles WHERE slug=:slug', { replacements:{slug}, type:QueryTypes.SELECT }); return r[0] || null; }
async function auth(req, res){
  if (!sequelize) { res.status(503).json({ error: 'engine not configured' }); return null; }
  await ensure();
  const p = verify(getCookie(req, COOKIE));
  if (!p) { res.status(401).json({ error: 'not authenticated' }); return null; }
  const prof = await sequelize.query('SELECT * FROM cv_profiles WHERE id=:id', { replacements:{id:p.pid}, type:QueryTypes.SELECT });
  if (!prof[0]) { res.status(401).json({ error: 'not authenticated' }); return null; }
  return prof[0];
}
function setCookie(res, tok){ res.setHeader('Set-Cookie', `${COOKIE}=${tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30*24*3600}`); }
function pub(p){ return { slug:p.slug, name:p.name, headline:p.headline, email:p.email, phone:p.phone, location:p.location, site:p.site, linkedin:p.linkedin, target_roles:p.target_roles, summary:p.summary, availability:p.availability }; }

// ---- Claude helper (zero-key heuristic fallback) ----
async function claude(system, user, maxTokens=800){
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || typeof fetch !== 'function') return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 22000); // never hang the request
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method:'POST', signal: ctl.signal,
      headers:{ 'x-api-key':key, 'anthropic-version':'2023-06-01', 'content-type':'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages:[{ role:'user', content:user }] }) });
    if (!r.ok) return null;
    const j = await r.json();
    return (j.content && j.content[0] && j.content[0].text) || null;
  } catch(e){ return null; }
  finally { clearTimeout(timer); }
}

// ================= AUTH =================
router.post('/login', async (req, res) => {
  if (!sequelize) return res.status(503).json({ error: 'engine not configured' });
  await ensure();
  const id = String(req.body.id || req.body.email || req.body.slug || '').trim().toLowerCase();
  const pw = String(req.body.password || '');
  const rows = await sequelize.query('SELECT * FROM cv_profiles WHERE lower(slug)=:id OR lower(email)=:id',
    { replacements:{id}, type:QueryTypes.SELECT });
  const prof = rows[0];
  if (!prof || !prof.password_hash || !checkPw(pw, prof.password_hash)) return res.status(401).json({ error: 'Invalid login' });
  setCookie(res, sign({ pid: prof.id, slug: prof.slug }));
  res.json({ ok: true, profile: pub(prof) });
});
router.post('/logout', (req, res) => { res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`); res.json({ ok: true }); });
router.get('/me', async (req, res) => { const p = await auth(req, res); if (!p) return; res.json({ profile: pub(p) }); });
router.post('/change-password', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const cur = String(req.body.current || ''), nw = String(req.body.next || '');
  if (!checkPw(cur, p.password_hash)) return res.status(400).json({ error: 'Current password is incorrect' });
  if (nw.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  await sequelize.query('UPDATE cv_profiles SET password_hash=:ph, updated_at=now() WHERE id=:id', { replacements:{ ph: hashPw(nw), id: p.id }, type:QueryTypes.UPDATE });
  res.json({ ok: true });
});
router.post('/profile', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const f = req.body || {};
  await sequelize.query(`UPDATE cv_profiles SET target_roles=:tr, summary=:su, availability=:av, updated_at=now() WHERE id=:id`,
    { replacements:{ tr:(f.target_roles||p.target_roles||'').slice(0,2000), su:(f.summary||p.summary||'').slice(0,2000), av:(f.availability==='closed'?'closed':'open'), id:p.id }, type:QueryTypes.UPDATE });
  res.json({ ok: true });
});

// ================= DASHBOARD (analytics + counts) =================
router.get('/dashboard', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
  const num = (v) => Number(v) || 0;
  // Proven pattern (mirrors cv-analytics): multi-char named replacements + (:days || ' days')::interval.
  // Each query is fault-tolerant so a quirk in one never errors the whole dashboard.
  const safe = async (sql, rep, dflt) => {
    try { return await sequelize.query(sql, { replacements: rep, type: QueryTypes.SELECT }); }
    catch (e) { console.error('cv-engine dashboard q:', e.message); return dflt; }
  };
  const win = (await safe(`SELECT COUNT(*)::int views, COUNT(DISTINCT ip_hash)::int visitors FROM cv_page_hits WHERE page=:page AND created_at > now() - (:days || ' days')::interval`, { page:p.slug, days }, [{ views:0, visitors:0 }]))[0] || { views:0, visitors:0 };
  const all = (await safe(`SELECT COUNT(*)::int views, COUNT(DISTINCT ip_hash)::int visitors FROM cv_page_hits WHERE page=:page`, { page:p.slug }, [{ views:0, visitors:0 }]))[0] || { views:0, visitors:0 };
  const byDay = await safe(`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*)::int AS views FROM cv_page_hits WHERE page=:page AND created_at > now() - (:days || ' days')::interval GROUP BY 1 ORDER BY 1`, { page:p.slug, days }, []);
  const refs = await safe(`SELECT COALESCE(NULLIF(referrer,''),'(direct)') AS referrer, COUNT(*)::int AS views FROM cv_page_hits WHERE page=:page AND created_at > now() - (:days || ' days')::interval GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, { page:p.slug, days }, []);
  const opp = await safe(`SELECT status, COUNT(*)::int AS n FROM cv_opportunities WHERE profile_id=:pid GROUP BY 1`, { pid:p.id }, []);
  const oppCounts = { new:0, contacted:0, interviewing:0, offer:0, closed:0, declined:0 };
  opp.forEach(r => { oppCounts[r.status] = num(r.n); });
  res.json({ profile: pub(p), days,
    window: { views:num(win.views), visitors:num(win.visitors) },
    all_time: { views:num(all.views), visitors:num(all.visitors) },
    by_day: (byDay||[]).map(x => ({ day:x.day, views:num(x.views) })),
    top_referrers: (refs||[]).map(x => ({ referrer:x.referrer, views:num(x.views) })),
    opp_counts: oppCounts });
});

// Drill-down behind a KPI card: who/when/where.
router.get('/dashboard/detail', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const metric = String(req.query.metric || 'views');
  const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
  const all = req.query.scope === 'all';
  const win = all ? '' : ` AND created_at > now() - (:days || ' days')::interval`;
  const rep = all ? { page: p.slug } : { page: p.slug, days };
  const q = (sql, r) => sequelize.query(sql, { replacements: r, type: QueryTypes.SELECT });

  if (metric === 'opps') {
    const rows = await q(`SELECT id, source, company, contact_name, contact_email, role_title, message, created_at
      FROM cv_opportunities WHERE profile_id=:pid AND status='new' ORDER BY created_at DESC LIMIT 100`, { pid: p.id });
    return res.json({ metric, rows });
  }
  if (metric === 'visitors') {
    const rows = await q(`SELECT substr(ip_hash,1,8) AS visitor, COUNT(*)::int AS visits,
        to_char(min(created_at),'YYYY-MM-DD HH24:MI') AS first_seen,
        to_char(max(created_at),'YYYY-MM-DD HH24:MI') AS last_seen,
        max(country) AS country, max(city) AS city, max(region) AS region, max(lang) AS lang,
        (array_remove(array_agg(NULLIF(referrer,'') ORDER BY created_at), NULL))[1] AS first_ref,
        (array_agg(ua ORDER BY created_at DESC))[1] AS ua
      FROM cv_page_hits WHERE page=:page${win} GROUP BY 1 ORDER BY max(created_at) DESC LIMIT 300`, rep);
    return res.json({ metric, rows });
  }
  // views — raw hit log + summaries
  const rows = await q(`SELECT to_char(created_at,'YYYY-MM-DD HH24:MI') AS when, substr(ip_hash,1,8) AS visitor,
      COALESCE(NULLIF(referrer,''),'(direct)') AS referrer, country, city, region, lang, path, ua
    FROM cv_page_hits WHERE page=:page${win} ORDER BY created_at DESC LIMIT 400`, rep);
  const byCity = await q(`SELECT COALESCE(NULLIF(city,'') || ', ' || NULLIF(region,''), NULLIF(city,''), NULLIF(country,''),'Unknown') AS place, COUNT(*)::int AS views
    FROM cv_page_hits WHERE page=:page${win} GROUP BY 1 ORDER BY 2 DESC LIMIT 15`, rep);
  const byRef = await q(`SELECT COALESCE(NULLIF(referrer,''),'(direct)') AS referrer, COUNT(*)::int AS views
    FROM cv_page_hits WHERE page=:page${win} GROUP BY 1 ORDER BY 2 DESC LIMIT 25`, rep);
  const byDay = await q(`SELECT to_char(date_trunc('day',created_at),'YYYY-MM-DD') AS day, COUNT(*)::int AS views
    FROM cv_page_hits WHERE page=:page${win} GROUP BY 1 ORDER BY 1 DESC LIMIT 90`, rep);
  res.json({ metric, rows, by_ref: byRef, by_day: byDay, by_city: byCity });
});

// ================= OPPORTUNITIES =================
router.get('/opportunities', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const rows = await sequelize.query('SELECT * FROM cv_opportunities WHERE profile_id=:id ORDER BY created_at DESC LIMIT 200', { replacements:{id:p.id}, type:QueryTypes.SELECT });
  res.json({ opportunities: rows });
});
router.post('/opportunities', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const f = req.body || {};
  await sequelize.query(`INSERT INTO cv_opportunities (profile_id,source,company,contact_name,contact_email,role_title,message,status,notes)
     VALUES (:id,'manual',:co,:cn,:ce,:rt,:msg,'new',:notes)`,
    { replacements:{ id:p.id, co:(f.company||'').slice(0,200), cn:(f.contact_name||'').slice(0,200), ce:(f.contact_email||'').slice(0,200), rt:(f.role_title||'').slice(0,200), msg:(f.message||'').slice(0,4000), notes:(f.notes||'').slice(0,4000) }, type:QueryTypes.INSERT });
  res.json({ ok: true });
});
router.patch('/opportunities/:id', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const f = req.body || {};
  const allowed = ['new','contacted','interviewing','offer','closed','declined'];
  const status = allowed.includes(f.status) ? f.status : null;
  await sequelize.query(`UPDATE cv_opportunities SET status=COALESCE(:st,status), notes=COALESCE(:notes,notes), updated_at=now() WHERE id=:oid AND profile_id=:pid`,
    { replacements:{ st:status, notes:(f.notes!==undefined?String(f.notes).slice(0,4000):null), oid:parseInt(req.params.id,10)||0, pid:p.id }, type:QueryTypes.UPDATE });
  res.json({ ok: true });
});
// PUBLIC: recruiter submits an opportunity to a candidate
const recentInbound = new Map();
router.post('/opportunities/inbound', async (req, res) => {
  if (!sequelize) return res.status(503).json({ error: 'engine not configured' });
  await ensure();
  const f = req.body || {};
  const prof = await profileBySlug(String(f.to || '').toLowerCase().replace(/[^a-z0-9_]/g,''));
  if (!prof) return res.status(400).json({ error: 'unknown candidate' });
  const ipKey = (req.headers['x-forwarded-for']||'').split(',')[0] + '|' + prof.slug;
  const now = Date.now(); if ((recentInbound.get(ipKey)||0) > now - 8000) return res.json({ ok:true }); recentInbound.set(ipKey, now);
  if (!f.contact_email || !/.+@.+\..+/.test(f.contact_email)) return res.status(400).json({ error: 'valid email required' });
  await sequelize.query(`INSERT INTO cv_opportunities (profile_id,source,company,contact_name,contact_email,role_title,message,status)
     VALUES (:id,'inbound',:co,:cn,:ce,:rt,:msg,'new')`,
    { replacements:{ id:prof.id, co:(f.company||'').slice(0,200), cn:(f.contact_name||'').slice(0,200), ce:String(f.contact_email).slice(0,200), rt:(f.role_title||'').slice(0,200), msg:(f.message||'').slice(0,4000) }, type:QueryTypes.INSERT });
  res.json({ ok: true });
});
router.get('/candidate/:slug', async (req, res) => {
  if (!sequelize) return res.status(503).json({ error: 'engine not configured' });
  await ensure();
  const prof = await profileBySlug(String(req.params.slug||'').toLowerCase().replace(/[^a-z0-9_]/g,''));
  if (!prof) return res.status(404).json({ error: 'not found' });
  res.json({ name: prof.name, headline: prof.headline, slug: prof.slug, availability: prof.availability });
});

// ================= AI BROADCAST / OUTREACH =================
router.post('/outreach/draft', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const f = req.body || {};
  const targetType = String(f.target_type || 'Staffing agency').slice(0,60);
  const targetName = String(f.target_name || '').slice(0,120);
  const notes = String(f.notes || '').slice(0,1000);
  const system = 'You are an expert career agent writing concise, professional outreach on behalf of a job candidate to recruiters and staffing firms. Output STRICT JSON only: {"subject":"...","body":"..."}. The body is a short email (120-170 words), warm and specific, first person as the candidate, no fluff, no emojis, ends with name and a clear call to connect. Never invent employers, titles, or metrics not provided.';
  const user = `Candidate: ${p.name}\nHeadline: ${p.headline}\nLocation: ${p.location}\nEmail: ${p.email}${p.linkedin?`\nLinkedIn: ${p.linkedin}`:''}\nProfile: ${p.site}\nTarget roles: ${p.target_roles}\nSummary: ${p.summary}\n\nWrite outreach to: ${targetType}${targetName?` — "${targetName}"`:''}.${notes?`\nExtra context: ${notes}`:''}`;
  let subject, body, simulated = false;
  const raw = await claude(system, user, 700);
  if (raw) { try { const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}')+1)); subject = j.subject; body = j.body; } catch(e){} }
  if (!subject || !body) {
    simulated = true;
    subject = `${p.name} — ${p.headline} (open to ${targetType.toLowerCase()} roles)`;
    body = `Hello${targetName?` ${targetName} team`:''},\n\nI'm ${p.name}, ${p.headline}, based in ${p.location}. I'm exploring new opportunities and wanted to introduce myself.\n\nIn short: ${p.summary}\n\nTarget roles: ${p.target_roles}.\n\nMy full profile (with a live CV, QR and one-tap contact) is at ${p.site}. I'd welcome a conversation about roles you're staffing that fit this background.\n\nBest regards,\n${p.name}\n${p.email}${p.linkedin?`\n${p.linkedin}`:''}`;
  }
  const r = await sequelize.query(`INSERT INTO cv_outreach (profile_id,channel,target_type,target_name,subject,body,status,is_simulated)
     VALUES (:id,'email',:tt,:tn,:su,:bo,'draft',:sim) RETURNING id`,
    { replacements:{ id:p.id, tt:targetType, tn:targetName, su:subject.slice(0,300), bo:body.slice(0,6000), sim:simulated }, type:QueryTypes.INSERT });
  res.json({ ok:true, id:(r[0][0]&&r[0][0].id), subject, body, is_simulated: simulated });
});
router.get('/outreach', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const rows = await sequelize.query('SELECT * FROM cv_outreach WHERE profile_id=:id ORDER BY created_at DESC LIMIT 100', { replacements:{id:p.id}, type:QueryTypes.SELECT });
  res.json({ outreach: rows });
});
router.patch('/outreach/:id', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const b = req.body || {};
  const st = ['draft','sent','replied','archived'].includes(b.status) ? b.status : null;
  await sequelize.query(
    `UPDATE cv_outreach SET status=COALESCE(:st,status),
       subject=COALESCE(:su,subject), body=COALESCE(:bo,body),
       to_email=COALESCE(:te,to_email), to_name=COALESCE(:tn,to_name), updated_at=now()
     WHERE id=:oid AND profile_id=:pid`,
    { replacements:{ st,
        su: b.subject!==undefined ? String(b.subject).slice(0,300) : null,
        bo: b.body!==undefined ? String(b.body).slice(0,6000) : null,
        te: b.to_email!==undefined ? String(b.to_email).slice(0,200) : null,
        tn: b.to_name!==undefined ? String(b.to_name).slice(0,200) : null,
        oid:parseInt(req.params.id,10)||0, pid:p.id }, type:QueryTypes.UPDATE });
  res.json({ ok:true });
});

// ---- Phase 3: outreach FROM a job match (human-in-the-loop, review-and-send) ----
// Drafts a tailored, first-person application/intro note for ONE specific job. Never sends
// (respects EMAIL_AUTOSEND_DISABLED) — the candidate reviews, edits, and sends from their own
// email or copies it. Honest: reuses the match's own why/gaps, never invents experience.
router.post('/jobs/matches/:id/outreach', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const row = await sequelize.query(
    `SELECT m.id, m.why, m.gaps, m.score, j.id AS job_id, j.company, j.title, j.location, j.url, j.description
       FROM cv_job_matches m JOIN cv_jobs j ON j.id=m.job_id
       WHERE m.id=:mid AND m.profile_id=:pid`,
    { replacements:{ mid:parseInt(req.params.id,10)||0, pid:p.id }, type:QueryTypes.SELECT });
  const j = row[0];
  if (!j) return res.status(404).json({ error: 'match not found' });
  // Excluded employers and confidential mode are absolute — they never receive outreach.
  const st = await settingsSvc.get(sequelize, p);
  const blocked = settingsSvc.employerBlocked(st, j.company);
  if (blocked) return res.status(403).json({ error: `${j.company} is on your ${blocked.reason} list — no draft was created.` });
  const facts = settingsSvc.outreachFacts(st);
  const variant = settingsSvc.resumeVariantFor(st, j.title);
  const system = `You write a concise, professional, first-person application/intro email from a job candidate for ONE specific role. Output STRICT JSON only: {"subject":"...","body":"..."}. Body 120-170 words, ${facts.tone || 'professional'} in tone, specific to THIS role, references 1-2 genuinely relevant strengths, no fluff, no emojis, ends with the candidate name + email + profile link and a clear ask for a short conversation. Never invent employers, titles, metrics, or experience the candidate does not have. Do not overclaim on a stated gap. Any statement about work authorization, compensation or availability must be quoted VERBATIM from the OWNER-STATED FACTS block — never paraphrased, never guessed, and omitted entirely if absent.`;
  const user = `CANDIDATE\nName: ${p.name}\nHeadline: ${st.identity.headline || p.headline}\nLocation: ${p.location}\nEmail: ${facts.from_email || p.email}${p.linkedin?`\nLinkedIn: ${p.linkedin}`:''}\nProfile: ${p.site}\nTarget roles: ${((st.targeting.roles||[]).map(r=>r.title).join('; ')) || p.target_roles}\nSummary: ${p.summary}`
    + (facts.lines.length ? `\n\nOWNER-STATED FACTS (quote verbatim if relevant, never invent)\n${facts.lines.join('\n')}` : '')
    + (facts.booking_url ? `\nBooking link: ${facts.booking_url}` : '')
    + `\n\nROLE\nTitle: ${j.title}\nCompany: ${j.company}\nLocation: ${j.location}\nWhy it fits (from prior analysis): ${j.why||''}\nKnown gap (be honest, do not overclaim): ${j.gaps||'none noted'}\nJob description: ${String(j.description||'').slice(0,1400)}`;
  let subject, body, simulated = false;
  const raw = await claude(system, user, 700);
  if (raw) { try { const o = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}')+1)); subject = o.subject; body = o.body; } catch(e){} }
  if (!subject || !body) {
    simulated = true;
    subject = `${p.name} — application for ${j.title} at ${j.company}`;
    body = `Hello ${j.company} team,\n\nI'm ${p.name}, ${p.headline}, based in ${p.location}. I'm writing about your ${j.title} role.\n\n${p.summary}\n\n`
      + (facts.lines.length ? facts.lines.join('\n') + '\n\n' : '')
      + `My full profile and CV are at ${p.site}. I'd welcome a short conversation about how this background fits the position.\n\nBest regards,\n${p.name}\n${facts.from_email || p.email}${p.linkedin?`\n${p.linkedin}`:''}`;
  }
  if (facts.signature && body.indexOf(facts.signature) === -1) body += '\n\n' + facts.signature;
  const r = await sequelize.query(
    `INSERT INTO cv_outreach (profile_id,channel,target_type,target_name,subject,body,status,is_simulated,job_id,followup_due,created_at,updated_at)
     VALUES (:id,'email','job-application',:tn,:su,:bo,'draft',:sim,:jid, CURRENT_DATE + :fd, now(), now()) RETURNING id`,
    { replacements:{ id:p.id, tn:`${j.company} — ${j.title}`.slice(0,200), su:subject.slice(0,300), bo:body.slice(0,6000), sim:simulated, jid:j.job_id,
        fd: (st.outreach.cadence || {}).first_followup_days || 5 }, type:QueryTypes.INSERT });
  res.json({ ok:true, id:(r[0][0]&&r[0][0].id), subject, body, company:j.company, title:j.title, url:j.url, is_simulated:simulated,
    resume_variant: variant ? { label: variant.label, url: variant.url } : null, facts_used: facts.lines });
});

// Draft a short follow-up nudge for an existing outreach that got no reply.
router.post('/outreach/:id/followup', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const rows = await sequelize.query('SELECT * FROM cv_outreach WHERE id=:oid AND profile_id=:pid', { replacements:{ oid:parseInt(req.params.id,10)||0, pid:p.id }, type:QueryTypes.SELECT });
  const o = rows[0]; if (!o) return res.status(404).json({ error: 'outreach not found' });
  // Cadence stop rules are enforced here, not left to the owner's memory.
  const stf = await settingsSvc.get(sequelize, p);
  const cad = stf.outreach.cadence || {};
  const dncF = settingsSvc.contactBlocked(stf, o.to_email, o.to_name);
  if (dncF) return res.status(403).json({ error: dncF.reason + ' — no follow-up was drafted.' });
  if (cad.stop_on_reply && o.status === 'replied') return res.status(400).json({ error: 'they already replied — cadence stops on reply.' });
  if ((o.followup_count || 0) >= (cad.max_followups || 2)) return res.status(400).json({ error: `follow-up limit reached (${cad.max_followups || 2} per your cadence settings).` });
  const system = 'You write a brief, polite follow-up email (60-90 words) from a job candidate who has not heard back. Output STRICT JSON only: {"subject":"...","body":"..."}. Reference the prior note lightly, restate interest in one line, no guilt-tripping, no emojis, end with name. Never invent facts.';
  const user = `Candidate: ${p.name} (${p.headline})\nProfile: ${p.site}\nOriginal subject: ${o.subject}\nOriginal note:\n${String(o.body||'').slice(0,1200)}`;
  let subject, body, simulated = false;
  const raw = await claude(system, user, 400);
  if (raw) { try { const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}')+1)); subject = j.subject; body = j.body; } catch(e){} }
  if (!subject || !body) { simulated = true; subject = `Following up — ${o.subject}`; body = `Hello,\n\nJust following up on my note below — I remain very interested and would welcome a short conversation. My profile is at ${p.site}.\n\nThank you for your time,\n${p.name}`; }
  const r = await sequelize.query(
    `INSERT INTO cv_outreach (profile_id,channel,target_type,target_name,subject,body,status,is_simulated,job_id,to_email,to_name,created_at,updated_at)
     VALUES (:id,'email','follow-up',:tn,:su,:bo,'draft',:sim,:jid,:te,:tnm, now(), now()) RETURNING id`,
    { replacements:{ id:p.id, tn:(o.target_name||'Follow-up'), su:subject.slice(0,300), bo:body.slice(0,6000), sim:simulated, jid:o.job_id||null, te:o.to_email||null, tnm:o.to_name||null }, type:QueryTypes.INSERT });
  await sequelize.query('UPDATE cv_outreach SET followup_count=COALESCE(followup_count,0)+1 WHERE id=:id AND profile_id=:pid',
    { replacements: { id: o.id, pid: p.id }, type: QueryTypes.UPDATE }).catch(()=>{});
  res.json({ ok:true, id:(r[0][0]&&r[0][0].id), subject, body, is_simulated:simulated,
    followups_used: (o.followup_count || 0) + 1, followups_allowed: cad.max_followups || 2 });
});

// Draft a reply to an inbound opportunity (completes the Phase 2 agent loop).
router.post('/opportunities/:id/reply', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const rows = await sequelize.query('SELECT * FROM cv_opportunities WHERE id=:oid AND profile_id=:pid', { replacements:{ oid:parseInt(req.params.id,10)||0, pid:p.id }, type:QueryTypes.SELECT });
  const o = rows[0]; if (!o) return res.status(404).json({ error: 'opportunity not found' });
  const stR = await settingsSvc.get(sequelize, p);
  const dncR = settingsSvc.contactBlocked(stR, o.contact_email, o.contact_name);
  if (dncR) return res.status(403).json({ error: dncR.reason + ' — no reply was drafted.' });
  const blockedR = settingsSvc.employerBlocked(stR, o.company);
  if (blockedR) return res.status(403).json({ error: `${o.company} is on your ${blockedR.reason} list — no reply was drafted.` });
  const system = 'You write a warm, professional reply (90-130 words) from a job candidate to a recruiter/company who reached out. Output STRICT JSON only: {"subject":"...","body":"..."}. Thank them, express genuine interest, offer specific availability for a short call, no emojis, end with name + profile link. Never invent facts or over-commit.';
  const user = `Candidate: ${p.name} (${p.headline})\nProfile: ${p.site}\nEmail: ${p.email}\nInbound from: ${o.contact_name||''} at ${o.company||''}\nRole: ${o.role_title||''}\nTheir message: ${String(o.message||'').slice(0,1000)}`;
  let subject, body, simulated = false;
  const raw = await claude(system, user, 450);
  if (raw) { try { const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}')+1)); subject = j.subject; body = j.body; } catch(e){} }
  if (!subject || !body) { simulated = true; subject = `Re: ${o.role_title||'your message'}`; body = `Hi ${o.contact_name||'there'},\n\nThank you for reaching out about ${o.role_title||'the opportunity'}${o.company?` at ${o.company}`:''} — I'm very interested. I'd be glad to find 20 minutes this week for a call. My full profile is at ${p.site}.\n\nBest regards,\n${p.name}\n${p.email}`; }
  const r = await sequelize.query(
    `INSERT INTO cv_outreach (profile_id,channel,target_type,target_name,subject,body,status,is_simulated,to_email,to_name,created_at,updated_at)
     VALUES (:id,'email','reply',:tn,:su,:bo,'draft',:sim,:te,:tnm, now(), now()) RETURNING id`,
    { replacements:{ id:p.id, tn:(o.company||o.contact_name||'Reply').slice(0,200), su:subject.slice(0,300), bo:body.slice(0,6000), sim:simulated, te:o.contact_email||null, tnm:o.contact_name||null }, type:QueryTypes.INSERT });
  res.json({ ok:true, id:(r[0][0]&&r[0][0].id), subject, body, to_email:o.contact_email||'', is_simulated:simulated });
});

// Share kit: AI-generated post-ready snippets + the public assets
router.post('/broadcast/kit', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const system = 'You write short, high-signal social posts for a job candidate announcing availability. Output STRICT JSON only: {"linkedin":"...","x":"..."}. LinkedIn 60-90 words professional first person; X under 240 chars. No emojis, no hashtags spam (max 2 relevant hashtags on X). Never invent facts.';
  const user = `Name: ${p.name}\nHeadline: ${p.headline}\nLocation: ${p.location}\nTarget roles: ${p.target_roles}\nProfile URL: ${p.site}\nSummary: ${p.summary}`;
  let linkedin, x, simulated = false;
  const raw = await claude(system, user, 500);
  if (raw) { try { const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}')+1)); linkedin = j.linkedin; x = j.x; } catch(e){} }
  if (!linkedin || !x) {
    simulated = true;
    linkedin = `I'm ${p.name}, ${p.headline} based in ${p.location}, and I'm open to new opportunities. I'm focused on: ${p.target_roles}. If you're hiring or know a team that is, my full profile with a live CV is here: ${p.site}. Referrals and introductions welcome.`;
    x = `${p.name} — ${p.headline}, open to new roles. Profile + CV: ${p.site}`.slice(0,240);
  }
  res.json({ ok:true, linkedin, x, profile_url: p.site, is_simulated: simulated });
});
// Match a pasted job description to the profile
router.post('/match', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const jd = String(req.body.job_description || '').slice(0, 6000);
  if (jd.length < 40) return res.status(400).json({ error: 'paste a longer job description' });
  const system = 'You are a candidate-fit analyst. Given a candidate profile and a job description, output STRICT JSON only: {"fit_score":1-10,"verdict":"strong|possible|weak","why":"2-3 sentences","tailored_pitch":"a 60-90 word first-person pitch the candidate can send for THIS role"}. Be honest; do not inflate. Never invent candidate experience.';
  const user = `CANDIDATE\nName: ${p.name}\nHeadline: ${p.headline}\nTarget roles: ${p.target_roles}\nSummary: ${p.summary}\n\nJOB DESCRIPTION\n${jd}`;
  const raw = await claude(system, user, 600);
  let out = null; if (raw) { try { out = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}')+1)); } catch(e){} }
  if (!out) out = { fit_score: null, verdict: 'unavailable', why: 'AI analysis is not available right now (no API key configured). The profile targets: ' + p.target_roles + '.', tailored_pitch: `I'm ${p.name}, ${p.headline}. Based on this role, ${p.summary}`, is_simulated: true };
  res.json(out);
});

// ================= JOB DISCOVERY + MATCHING (Phase 1) =================
// Sources real live jobs from public ATS boards, matches them to the profile with a
// lexical-recall -> Haiku fit-score pipeline. Runs in the BACKGROUND (never blocks the
// request past Cloudflare's ~100s ceiling): /jobs/refresh kicks off a job and returns
// immediately; the UI polls /jobs/status and reads /jobs/matches as they land.
const JOB_RUN = {};                 // in-memory per-profile run status
let POOL_LAST = 0;                  // last pool-refresh timestamp (ms) — shared across profiles
const POOL_TTL_MS = 6 * 3600 * 1000;

async function runMatch(prof, force) {
  const pid = prof.id;
  JOB_RUN[pid] = { running: true, step: 'fetching', started: Date.now(), error: null };
  try {
    const settings = await settingsSvc.get(sequelize, prof);
    const ttl = Math.max(1, Number((settings.engine || {}).pool_ttl_hours) || 6) * 3600 * 1000;
    if (force || Date.now() - POOL_LAST > ttl) {
      const pool = await jobsource.refreshJobPool(sequelize, QueryTypes, {});
      POOL_LAST = Date.now();
      JOB_RUN[pid].pool = pool.pool_size; JOB_RUN[pid].sources = pool.sources;
    }
    JOB_RUN[pid].step = 'matching';
    const watchByCompany = await employersSvc.watchIndex(sequelize, pid).catch(() => ({}));
    const r = await jobsource.scoreProfile(sequelize, QueryTypes, claude, prof, { settings, watchByCompany });
    JOB_RUN[pid] = { running: false, step: 'done', finished: Date.now(), started: JOB_RUN[pid].started,
      pool: JOB_RUN[pid].pool, sources: JOB_RUN[pid].sources, result: r, error: null };
  } catch (e) {
    JOB_RUN[pid] = { running: false, step: 'error', error: (e && e.message) || 'run failed', finished: Date.now() };
  }
}

// Kick off a background fetch+match for the logged-in profile.
router.post('/jobs/refresh', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  if (JOB_RUN[p.id] && JOB_RUN[p.id].running) return res.json({ ok: true, running: true, already: true });
  const force = !!req.body.force;
  runMatch(p, force);                       // fire-and-forget (background)
  res.json({ ok: true, running: true, adzuna: jobsource.adzunaActive() });
});

// Poll run status.
router.get('/jobs/status', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const st = JOB_RUN[p.id] || { running: false, step: 'idle' };
  const cnt = await sequelize.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status='new')::int AS unseen,
            max(updated_at) AS last
       FROM cv_job_matches WHERE profile_id=:pid`, { replacements: { pid: p.id }, type: QueryTypes.SELECT });
  res.json({ ...st, counts: cnt[0] || { total: 0, unseen: 0 }, sources_count: jobsource.SOURCES.length, adzuna: jobsource.adzunaActive() });
});

// List scored matches for the logged-in profile (joined with the job).
router.get('/jobs/matches', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const status = String(req.query.status || '').toLowerCase();
  const where = ['m.profile_id=:pid'];
  const repl = { pid: p.id };
  if (status && ['new', 'saved', 'dismissed', 'applied'].includes(status)) { where.push('m.status=:st'); repl.st = status; }
  else where.push("m.status<>'dismissed'");
  if (req.query.target === '1') where.push('m.target_employer=true');
  if (req.query.stage) { where.push('m.stage=:stg'); repl.stg = String(req.query.stage).toLowerCase(); }
  const rows = await sequelize.query(
    `SELECT m.id, m.score, m.verdict, m.why, m.gaps, m.is_simulated, m.status, m.stage, m.updated_at,
            m.target_employer, m.flags, m.next_action, m.next_action_at,
            j.company, j.title, j.location, j.remote, j.url, j.source, j.posted_at,
            j.comp_min, j.comp_max, j.comp_period
       FROM cv_job_matches m JOIN cv_jobs j ON j.id=m.job_id
       WHERE ${where.join(' AND ')}
       ORDER BY m.target_employer DESC, m.score DESC NULLS LAST, m.updated_at DESC
       LIMIT 200`, { replacements: repl, type: QueryTypes.SELECT });
  const st = await settingsSvc.get(sequelize, p);
  rows.forEach((r) => {
    if (r.comp_min && r.comp_max) {
      r.compensation = { min: r.comp_min, max: r.comp_max, period: r.comp_period, stated: true };
      r.compensation.verdict = targeting.compVerdict(r.compensation, st);
    }
  });
  res.json({ matches: rows });
});

// Save / dismiss / mark-applied a match, and move it through the pipeline.
const STAGES = ['new', 'saved', 'applied', 'screening', 'interviewing', 'offer', 'closed'];
router.patch('/jobs/matches/:id', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const b = req.body || {};
  const st = b.status !== undefined ? String(b.status).toLowerCase() : null;
  const stage = b.stage !== undefined ? String(b.stage).toLowerCase() : null;
  if (st && !['new', 'saved', 'dismissed', 'applied'].includes(st)) return res.status(400).json({ error: 'bad status' });
  if (stage && !STAGES.includes(stage)) return res.status(400).json({ error: 'bad stage' });
  if (!st && !stage && b.next_action === undefined && b.next_action_at === undefined) return res.status(400).json({ error: 'nothing to update' });
  await sequelize.query(
    `UPDATE cv_job_matches SET status=COALESCE(:st,status),
       stage=COALESCE(:stg,stage), stage_at=CASE WHEN :stg IS NULL THEN stage_at ELSE now() END,
       next_action=COALESCE(:na,next_action), next_action_at=COALESCE(CAST(:naa AS DATE),next_action_at),
       updated_at=now()
     WHERE id=:id AND profile_id=:pid`,
    { replacements: { st, stg: stage, id: parseInt(req.params.id, 10) || 0, pid: p.id,
        na: b.next_action !== undefined ? String(b.next_action).slice(0, 400) : null,
        naa: b.next_action_at ? String(b.next_action_at).slice(0, 10) : null }, type: QueryTypes.UPDATE });
  res.json({ ok: true });
});

// Daily auto-run ("works while you sleep") — fans out across every ENABLED profile that has
// auto_run on in its own settings, each inside its own cost ceiling. Off unless CV_JOBS_GO=1.
// State is exposed at /jobs/auto so it is visible in the UI instead of hidden in env.
const AUTO = { enabled: process.env.CV_JOBS_GO === '1', last_run: null, last_result: null, running: false };
if (AUTO.enabled && sequelize) {
  const dailyRun = async () => {
    if (AUTO.running) return;
    AUTO.running = true;
    const summary = { started: new Date().toISOString(), profiles: [], pool: null, error: null };
    try {
      await ensure();
      const pool = await jobsource.refreshJobPool(sequelize, QueryTypes, {});
      POOL_LAST = Date.now(); summary.pool = pool.pool_size;
      const profs = await sequelize.query('SELECT * FROM cv_profiles WHERE COALESCE(enabled,true)=true', { type: QueryTypes.SELECT });
      for (const pr of profs) {
        try {
          const s = await settingsSvc.get(sequelize, pr);
          if ((s.engine || {}).auto_run === false) { summary.profiles.push({ slug: pr.slug, skipped: 'auto_run off' }); continue; }
          const w = await employersSvc.watchIndex(sequelize, pr.id).catch(() => ({}));
          const r = await jobsource.scoreProfile(sequelize, QueryTypes, claude, pr, { settings: s, watchByCompany: w });
          summary.profiles.push({ slug: pr.slug, scored: r.scored, total: r.matches_total, spend: r.budget.spend_estimate_usd });
        } catch (e) { summary.profiles.push({ slug: pr.slug, error: e.message }); }
      }
      console.log('cv-engine: daily job match complete for', summary.profiles.length, 'profiles');
    } catch (e) { summary.error = e.message; console.error('cv-engine daily run:', e.message); }
    finally { summary.finished = new Date().toISOString(); AUTO.last_run = summary.finished; AUTO.last_result = summary; AUTO.running = false; }
  };
  setTimeout(dailyRun, 90 * 1000);            // once shortly after boot
  setInterval(dailyRun, 24 * 3600 * 1000);    // then daily
}
router.get('/jobs/auto', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const s = await settingsSvc.get(sequelize, p);
  res.json({ scheduler_enabled: AUTO.enabled, env_var: 'CV_JOBS_GO', profile_auto_run: (s.engine || {}).auto_run !== false,
    running: AUTO.running, last_run: AUTO.last_run,
    last_result: AUTO.last_result ? { pool: AUTO.last_result.pool, profiles: (AUTO.last_result.profiles || []).length, error: AUTO.last_result.error } : null });
});

// ================= PHASE 4 — SETTINGS =================
// The single source of truth for a profile. Everything downstream reads it; nothing
// re-implements it. Adding a person is a row here, not a code change.
router.get('/settings', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  res.json({ settings: await settingsSvc.get(sequelize, p) });
});
router.put('/settings', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const body = req.body || {};
  const saved = body.replace ? await settingsSvc.save(sequelize, p.id, body.settings || {})
                             : await settingsSvc.patch(sequelize, p, body.settings || body);
  // Mirror the few fields the legacy profile row still serves (public page, agent card).
  await sequelize.query(
    `UPDATE cv_profiles SET name=COALESCE(NULLIF(:nm,''),name), headline=COALESCE(NULLIF(:hl,''),headline),
        location=COALESCE(NULLIF(:lo,''),location), availability=:av, updated_at=now() WHERE id=:id`,
    { replacements: { nm: saved.identity.name, hl: saved.identity.headline, lo: saved.identity.location,
        av: saved.targeting.availability.status === 'closed' ? 'closed' : 'open', id: p.id }, type: QueryTypes.UPDATE }).catch(()=>{});
  res.json({ ok: true, settings: saved });
});
// Vocabularies the settings UI renders from — data, so adding an option is not a deploy.
router.get('/settings/meta', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  res.json({ industries: settingsSvc.INDUSTRY_TAXONOMY, employment_types: settingsSvc.EMPLOYMENT_TYPES,
    work_auth_statuses: settingsSvc.WORK_AUTH_STATUSES, countries: geo.countryList(),
    location_rules: geo.DEFAULT_RULES, stages: STAGES });
});
// Explain the country policy against a sample location string (makes the messy cases testable).
router.post('/settings/test-location', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const s = await settingsSvc.get(sequelize, p);
  const out = geo.evaluate(settingsSvc.countryPolicy(s), String((req.body || {}).location || ''), !!(req.body || {}).remote);
  res.json(out);
});

// ================= PHASE 5 — EMPLOYERS + WATCHLIST =================
router.get('/employers', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const rows = await employersSvc.list(sequelize, { status: req.query.status, industry: req.query.industry, q: req.query.q });
  const counts = await sequelize.query(
    `SELECT status, count(*)::int AS n FROM cv_employers GROUP BY 1`, { type: QueryTypes.SELECT }).catch(() => []);
  res.json({ employers: rows, counts, probe: PROBE_RUN });
});
router.post('/employers', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const f = req.body || {};
  const name = String(f.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  const slug = employersSvc.slugify(name);
  const r = await sequelize.query(
    `INSERT INTO cv_employers (slug,name,ats,cfg,industries,status)
     VALUES (:slug,:name,:ats,CAST(:cfg AS JSONB),string_to_array(:inds, ','),'unprobed')
     ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, updated_at=now() RETURNING id`,
    { replacements: { slug, name, ats: f.ats || null, cfg: JSON.stringify(f.cfg || {}),
        inds: (Array.isArray(f.industries) ? f.industries.slice(0, 20) : []).join(',') }, type: QueryTypes.INSERT });
  res.json({ ok: true, id: r[0][0] && r[0][0].id, slug });
});
// Confirm or reject a board found by token GUESSING. Until an owner confirms it, an
// 'unverified' employer contributes nothing to the pool — a guessed token can land on an
// abandoned trial board that squats a real company's name.
router.patch('/employers/:id/verify', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const yes = (req.body || {}).verified !== false;
  const id = parseInt(req.params.id, 10) || 0;
  const rows = await sequelize.query('SELECT name,status FROM cv_employers WHERE id=:id', { replacements: { id }, type: QueryTypes.SELECT });
  if (!rows[0]) return res.status(404).json({ error: 'employer not found' });
  await sequelize.query(
    `UPDATE cv_employers SET status=:st, status_reason=:rs, updated_at=now() WHERE id=:id`,
    { replacements: { id, st: yes ? 'live' : 'no_public_endpoint',
        rs: yes ? `Board confirmed by ${p.slug} on ${new Date().toISOString().slice(0, 10)}.`
                : `Board rejected by ${p.slug} as not belonging to this employer.` }, type: QueryTypes.UPDATE });
  res.json({ ok: true, employer: rows[0].name, status: yes ? 'live' : 'no_public_endpoint' });
});
router.patch('/employers/:id', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const f = req.body || {};
  await sequelize.query(
    `UPDATE cv_employers SET ats=COALESCE(:ats,ats), cfg=COALESCE(CAST(:cfg AS JSONB),cfg),
       industries=COALESCE(string_to_array(:inds, ','),industries), enabled=COALESCE(:en,enabled), updated_at=now() WHERE id=:id`,
    { replacements: { id: parseInt(req.params.id, 10) || 0, ats: f.ats || null,
        cfg: f.cfg ? JSON.stringify(f.cfg) : null, inds: Array.isArray(f.industries) ? f.industries.join(',') : null,
        en: typeof f.enabled === 'boolean' ? f.enabled : null }, type: QueryTypes.UPDATE });
  res.json({ ok: true });
});
// Probing dozens of boards always exceeds Cloudflare's ~100s ceiling — background + poll.
const PROBE_RUN = { running: false, started: null, finished: null, result: null, error: null };
router.post('/employers/probe', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  if (PROBE_RUN.running) return res.json({ ok: true, running: true, already: true });
  const only = !!(req.body || {}).only_unprobed;
  const id = (req.body || {}).employer_id;
  PROBE_RUN.running = true; PROBE_RUN.started = Date.now(); PROBE_RUN.finished = null; PROBE_RUN.error = null;
  (async () => {
    try {
      if (id) {
        const rows = await sequelize.query('SELECT id,name,ats,cfg,status FROM cv_employers WHERE id=:id', { replacements: { id }, type: QueryTypes.SELECT });
        if (rows[0]) { const r = await employersSvc.probeEmployer(rows[0]); await employersSvc.recordProbe(sequelize, rows[0].id, r);
          PROBE_RUN.result = { probed: 1, live: r.status === 'live' ? 1 : 0, unreachable: r.status === 'live' ? 0 : 1, details: [{ name: rows[0].name, status: r.status, ats: r.ats, count: r.count, reason: r.reason }] }; }
      } else {
        PROBE_RUN.result = await employersSvc.probeAll(sequelize, { only_unprobed: only });
      }
    } catch (e) { PROBE_RUN.error = e.message; }
    finally { PROBE_RUN.running = false; PROBE_RUN.finished = Date.now(); }
  })();
  res.json({ ok: true, running: true });
});
router.get('/employers/probe/status', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  res.json(PROBE_RUN);
});
router.get('/watchlist', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  res.json({ watchlist: await employersSvc.watchlist(sequelize, p.id) });
});
router.post('/watchlist', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const f = req.body || {};
  let eid = parseInt(f.employer_id, 10) || 0;
  if (!eid && f.industry) {          // add an entire sector in one action
    const rows = await sequelize.query('SELECT id FROM cv_employers WHERE :ind = ANY(industries)', { replacements: { ind: String(f.industry) }, type: QueryTypes.SELECT });
    for (const r of rows) await employersSvc.watchAdd(sequelize, p.id, r.id, f).catch(() => {});
    return res.json({ ok: true, added: rows.length });
  }
  if (!eid) return res.status(400).json({ error: 'employer_id or industry required' });
  await employersSvc.watchAdd(sequelize, p.id, eid, f);
  res.json({ ok: true });
});
router.delete('/watchlist/:employerId', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  await employersSvc.watchRemove(sequelize, p.id, parseInt(req.params.employerId, 10) || 0);
  res.json({ ok: true });
});

// ================= PHASE 6 — SAVED SEARCHES, PIPELINE, DIGEST, CONTACTS =================
function searchWhere(q, repl) {
  const w = ['m.profile_id=:pid'];
  if (q.score_floor) { w.push('m.score >= :sf'); repl.sf = parseInt(q.score_floor, 10) || 0; }
  if (q.target_only) w.push('m.target_employer=true');
  if (q.stage) { w.push('m.stage=:stg'); repl.stg = String(q.stage); }
  if (q.status) { w.push('m.status=:st'); repl.st = String(q.status); } else w.push("m.status<>'dismissed'");
  if (q.company) { w.push('lower(j.company) LIKE :co'); repl.co = '%' + String(q.company).toLowerCase() + '%'; }
  if (q.title) { w.push('lower(j.title) LIKE :ti'); repl.ti = '%' + String(q.title).toLowerCase() + '%'; }
  if (q.remote === true) w.push('j.remote=true');
  return w;
}
router.get('/saved-searches', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const rows = await sequelize.query('SELECT * FROM cv_saved_searches WHERE profile_id=:pid ORDER BY created_at DESC LIMIT 50',
    { replacements: { pid: p.id }, type: QueryTypes.SELECT });
  res.json({ saved_searches: rows });
});
router.post('/saved-searches', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const f = req.body || {};
  if (!f.name) return res.status(400).json({ error: 'name required' });
  const r = await sequelize.query(
    `INSERT INTO cv_saved_searches (profile_id,name,query) VALUES (:pid,:nm,CAST(:q AS JSONB)) RETURNING id`,
    { replacements: { pid: p.id, nm: String(f.name).slice(0, 120), q: JSON.stringify(f.query || {}) }, type: QueryTypes.INSERT });
  res.json({ ok: true, id: r[0][0] && r[0][0].id });
});
router.delete('/saved-searches/:id', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  await sequelize.query('DELETE FROM cv_saved_searches WHERE id=:id AND profile_id=:pid',
    { replacements: { id: parseInt(req.params.id, 10) || 0, pid: p.id }, type: QueryTypes.DELETE });
  res.json({ ok: true });
});
router.post('/saved-searches/:id/run', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const rows = await sequelize.query('SELECT * FROM cv_saved_searches WHERE id=:id AND profile_id=:pid',
    { replacements: { id: parseInt(req.params.id, 10) || 0, pid: p.id }, type: QueryTypes.SELECT });
  const ss = rows[0]; if (!ss) return res.status(404).json({ error: 'not found' });
  const repl = { pid: p.id };
  const w = searchWhere(ss.query || {}, repl);
  const matches = await sequelize.query(
    `SELECT m.id,m.score,m.verdict,m.why,m.gaps,m.status,m.stage,m.target_employer,m.updated_at,
            j.company,j.title,j.location,j.remote,j.url,j.comp_min,j.comp_max,j.comp_period
       FROM cv_job_matches m JOIN cv_jobs j ON j.id=m.job_id
      WHERE ${w.join(' AND ')} ORDER BY m.target_employer DESC, m.score DESC NULLS LAST LIMIT 100`,
    { replacements: repl, type: QueryTypes.SELECT });
  const fresh = matches.filter((m) => m.status === 'new').length;
  await sequelize.query('UPDATE cv_saved_searches SET last_run_at=now(), last_new_count=:n WHERE id=:id',
    { replacements: { id: ss.id, n: fresh }, type: QueryTypes.UPDATE }).catch(()=>{});
  res.json({ name: ss.name, count: matches.length, new_count: fresh, matches });
});

router.get('/pipeline', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const rows = await sequelize.query(
    `SELECT m.id,m.score,m.stage,m.stage_at,m.status,m.next_action,m.next_action_at,m.target_employer,
            j.company,j.title,j.location,j.url,
            (SELECT count(*)::int FROM cv_outreach o WHERE o.profile_id=m.profile_id AND o.job_id=j.id) AS outreach_count,
            (SELECT max(o.status) FROM cv_outreach o WHERE o.profile_id=m.profile_id AND o.job_id=j.id) AS outreach_status
       FROM cv_job_matches m JOIN cv_jobs j ON j.id=m.job_id
      WHERE m.profile_id=:pid AND m.status<>'dismissed' AND m.stage IS NOT NULL AND m.stage<>'new'
      ORDER BY m.stage_at DESC NULLS LAST LIMIT 300`,
    { replacements: { pid: p.id }, type: QueryTypes.SELECT });
  const byStage = {}; STAGES.forEach((s) => { byStage[s] = []; });
  rows.forEach((r) => { (byStage[r.stage] || (byStage[r.stage] = [])).push(r); });
  res.json({ stages: STAGES, by_stage: byStage, total: rows.length });
});

// The morning read: what is new, what is due, what needs a decision. Drafted and shown here —
// never auto-sent (EMAIL_AUTOSEND_DISABLED). Everything honors do-not-contact + exclusions.
router.get('/digest', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const s = await settingsSvc.get(sequelize, p);
  const floor = Number((s.targeting || {}).score_floor) || 0;
  const since = `now() - interval '${Math.min(30, parseInt(req.query.days, 10) || 1)} days'`;
  const q = (sql, rep) => sequelize.query(sql, { replacements: Object.assign({ pid: p.id }, rep || {}), type: QueryTypes.SELECT }).catch(() => []);
  const newMatches = await q(
    `SELECT m.id,m.score,m.verdict,m.why,m.target_employer,j.company,j.title,j.location,j.url
       FROM cv_job_matches m JOIN cv_jobs j ON j.id=m.job_id
      WHERE m.profile_id=:pid AND m.status='new' AND m.created_at > ${since} AND m.score >= :fl
      ORDER BY m.target_employer DESC, m.score DESC LIMIT 25`, { fl: floor });
  const targetPosts = await q(
    `SELECT m.id,m.score,j.company,j.title,j.url FROM cv_job_matches m JOIN cv_jobs j ON j.id=m.job_id
      WHERE m.profile_id=:pid AND m.target_employer=true AND m.created_at > ${since} ORDER BY m.score DESC LIMIT 25`);
  const inbound = await q(
    `SELECT id,company,contact_name,contact_email,role_title,message,created_at FROM cv_opportunities
      WHERE profile_id=:pid AND status='new' ORDER BY created_at DESC LIMIT 25`);
  const dueFollowups = await q(
    `SELECT o.id,o.subject,o.target_name,o.to_email,o.created_at,o.followup_count
       FROM cv_outreach o WHERE o.profile_id=:pid AND o.status='sent'
        AND o.created_at < now() - (:d || ' days')::interval
        AND COALESCE(o.followup_count,0) < :mx
      ORDER BY o.created_at ASC LIMIT 25`,
    { d: (s.outreach.cadence || {}).first_followup_days || 5, mx: (s.outreach.cadence || {}).max_followups || 2 });
  const actions = await q(
    `SELECT m.id,m.next_action,m.next_action_at,j.company,j.title FROM cv_job_matches m JOIN cv_jobs j ON j.id=m.job_id
      WHERE m.profile_id=:pid AND m.next_action_at IS NOT NULL AND m.next_action_at <= CURRENT_DATE + 3
      ORDER BY m.next_action_at ASC LIMIT 25`);
  // Do-not-contact is absolute: a blocked address never appears in a digest that invites contact.
  const dnc = (list, emailKey, nameKey) => list.filter((r) => !settingsSvc.contactBlocked(s, r[emailKey], r[nameKey]));
  res.json({
    generated_at: new Date().toISOString(),
    digest: s.notifications.digest, digest_time: s.notifications.digest_time,
    score_floor: floor,
    new_matches: newMatches, target_employer_posts: targetPosts,
    inbound_opportunities: dnc(inbound, 'contact_email', 'contact_name'),
    followups_due: dnc(dueFollowups, 'to_email', 'target_name'),
    next_actions: actions,
    note: 'Nothing here is sent automatically. Review, edit, and send from your own inbox.'
  });
});

router.get('/contacts', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const rows = await sequelize.query('SELECT * FROM cv_contacts WHERE profile_id=:pid ORDER BY created_at DESC LIMIT 500',
    { replacements: { pid: p.id }, type: QueryTypes.SELECT });
  const s = await settingsSvc.get(sequelize, p);
  const watch = await employersSvc.watchlist(sequelize, p.id).catch(() => []);
  const watchNames = new Set(watch.map((w) => String(w.name).toLowerCase()));
  rows.forEach((r) => {
    r.at_target_employer = !!(r.company && watchNames.has(String(r.company).toLowerCase()));
    const b = settingsSvc.contactBlocked(s, r.email, r.name);
    r.do_not_contact = !!b; if (b) r.do_not_contact_reason = b.reason;
  });
  // People who already appeared in this profile's own inbox/outreach — the only referral graph
  // we can build honestly. Connection graphs cannot be scraped, and are not invented here.
  const known = await sequelize.query(
    `SELECT DISTINCT contact_name AS name, contact_email AS email, company FROM cv_opportunities
      WHERE profile_id=:pid AND contact_email IS NOT NULL AND contact_email<>'' LIMIT 100`,
    { replacements: { pid: p.id }, type: QueryTypes.SELECT }).catch(() => []);
  res.json({ contacts: rows, from_inbox: known,
    note: 'Referral suggestions come only from people already in your own inbox and outreach history. No third-party connection graph is scraped.' });
});
router.post('/contacts', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const f = req.body || {};
  await sequelize.query(
    `INSERT INTO cv_contacts (profile_id,name,email,company,role_title,relationship,notes)
     VALUES (:pid,:nm,:em,:co,:rt,:rel,:no)`,
    { replacements: { pid: p.id, nm: String(f.name || '').slice(0, 200), em: String(f.email || '').slice(0, 200),
        co: String(f.company || '').slice(0, 200), rt: String(f.role_title || '').slice(0, 200),
        rel: String(f.relationship || '').slice(0, 48), no: String(f.notes || '').slice(0, 2000) }, type: QueryTypes.INSERT });
  res.json({ ok: true });
});
router.delete('/contacts/:id', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  await sequelize.query('DELETE FROM cv_contacts WHERE id=:id AND profile_id=:pid',
    { replacements: { id: parseInt(req.params.id, 10) || 0, pid: p.id }, type: QueryTypes.DELETE });
  res.json({ ok: true });
});

// ================= PROFILE PROVISIONING (no env var per person) =================
router.get('/admin/profiles', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  if (!p.is_admin) return res.status(403).json({ error: 'admin only' });
  const rows = await sequelize.query(
    `SELECT id,slug,name,email,enabled,is_admin,credential_source,
            (invite_hash IS NOT NULL AND invite_expires > now()) AS invite_pending, created_at
       FROM cv_profiles ORDER BY id ASC`, { type: QueryTypes.SELECT });
  res.json({ profiles: rows });
});
// Create a profile + a single-use invite. The new owner sets their own password; no env var,
// no shared default, no redeploy.
router.post('/admin/profiles', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  if (!p.is_admin) return res.status(403).json({ error: 'admin only' });
  const f = req.body || {};
  const slug = String(f.slug || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!slug || !f.name) return res.status(400).json({ error: 'slug and name required' });
  const exists = await profileBySlug(slug);
  if (exists) return res.status(409).json({ error: 'slug already exists' });
  const invite = crypto.randomBytes(24).toString('base64url');
  const r = await sequelize.query(
    `INSERT INTO cv_profiles (slug,name,headline,email,location,site,target_roles,summary,password_hash,
                              enabled,credential_source,invite_hash,invite_expires)
     VALUES (:slug,:name,:hl,:em,:lo,:site,:tr,:su,'', true,'invite',:ih, now() + interval '14 days') RETURNING id`,
    { replacements: { slug, name: String(f.name).slice(0, 200), hl: String(f.headline || '').slice(0, 400),
        em: String(f.email || '').slice(0, 200), lo: String(f.location || '').slice(0, 200),
        site: String(f.site || '').slice(0, 300), tr: String(f.target_roles || '').slice(0, 2000),
        su: String(f.summary || '').slice(0, 4000),
        ih: crypto.createHash('sha256').update(invite).digest('hex') }, type: QueryTypes.INSERT });
  const id = r[0][0] && r[0][0].id;
  await settingsSvc.get(sequelize, { id, name: f.name, headline: f.headline, email: f.email, location: f.location, site: f.site, target_roles: f.target_roles });
  res.json({ ok: true, id, slug, invite_token: invite,
    accept_url: '/cv-admin?p=' + slug + '&invite=' + invite,
    note: 'Single-use, expires in 14 days. The new owner sets their own password — no environment variable is involved.' });
});
router.post('/accept-invite', async (req, res) => {
  if (!sequelize) return res.status(503).json({ error: 'engine not configured' });
  await ensure();
  const f = req.body || {};
  const slug = String(f.slug || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  const tok = String(f.invite || '');
  const pw = String(f.password || '');
  if (pw.length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });
  const rows = await sequelize.query('SELECT * FROM cv_profiles WHERE slug=:slug', { replacements: { slug }, type: QueryTypes.SELECT });
  const prof = rows[0];
  if (!prof || !prof.invite_hash || !prof.invite_expires || new Date(prof.invite_expires) < new Date())
    return res.status(400).json({ error: 'invite is invalid or expired' });
  const h = crypto.createHash('sha256').update(tok).digest('hex');
  if (h.length !== String(prof.invite_hash).length || !crypto.timingSafeEqual(Buffer.from(h), Buffer.from(prof.invite_hash)))
    return res.status(400).json({ error: 'invite is invalid or expired' });
  await sequelize.query(
    `UPDATE cv_profiles SET password_hash=:ph, credential_source='owner', invite_hash=NULL, invite_expires=NULL, updated_at=now() WHERE id=:id`,
    { replacements: { ph: hashPw(pw), id: prof.id }, type: QueryTypes.UPDATE });
  setCookie(res, sign({ pid: prof.id, slug: prof.slug }));
  res.json({ ok: true, profile: pub(prof) });
});

// ================= PHASE 8 — ENTITY DOSSIER =================
// Generated from the profile record, not hand-authored per person. Notability is assessed
// honestly: where the bar is not met, this says so instead of proposing an item that would
// be deleted.
router.get('/entity/dossier', async (req, res) => {
  const p = await auth(req, res); if (!p) return;
  const s = await settingsSvc.get(sequelize, p);
  const links = (s.identity.links || []).map((l) => l.url);
  const independent = links.filter((u) => !/manuelstagg|anastagg|andreastagg|julianagramowski/i.test(u));
  // Wikidata notability = (1) a serious, publicly available reference work already describes
  // them, (2) they are clearly identifiable and can be described by referenced statements, or
  // (3) they meet a structural need. A personal site plus a LinkedIn profile satisfies none.
  const secondary = independent.filter((u) => !/linkedin\.com|github\.com|x\.com|twitter\.com/i.test(u));
  const meets = secondary.length >= 2;
  const statements = [
    { property: 'P31 (instance of)', value: 'Q5 (human)', reference: 'structural' },
    { property: 'P106 (occupation)', value: s.identity.headline || '(set a headline in Settings)', reference: links[0] || '(needs an independent source)' },
    { property: 'P27 / P937 (country of citizenship / work location)', value: s.identity.location || '(set a location)', reference: links[0] || '(needs a source)' },
    { property: 'P856 (official website)', value: (s.identity.links.find((l) => /profile|site/i.test(l.label)) || {}).url || '', reference: 'self' }
  ];
  res.json({
    profile: p.slug,
    wikidata: {
      qid: s.entity.wikidata_qid || null,
      notability: {
        meets_bar: meets,
        assessment: meets
          ? 'There are at least two independent, non-self-published sources on file. A Wikidata item is defensible — submit the statements below, each with its reference.'
          : 'Wikidata notability is NOT met with the sources currently on file. Wikidata requires description by independent, serious sources; a personal site plus social profiles does not qualify. Creating an item now would likely be deleted, which is worse than having none. Add independent coverage (press, conference programs, published work, an employer bio) to Settings > Links first.',
        independent_sources_on_file: secondary
      },
      labels: { en: s.identity.name, es: s.identity.name },
      descriptions: {
        en: [s.identity.headline, s.identity.location].filter(Boolean).join(', '),
        es: [s.identity.headline, s.identity.location].filter(Boolean).join(', ')
      },
      statements,
      same_as: links
    },
    // Ships regardless of the Wikidata verdict — this is the part that actually moves
    // AI answer engines today.
    structured_data_shipped: {
      person_jsonld: '/cv/' + p.slug + '/roles (each role page) and the public CV page',
      resume_json: '/api/agent/' + p.slug + '/resume',
      agent_card: '/api/agent/' + p.slug + '/card',
      qid_insertion_point: 'Settings > entity.wikidata_qid — adding it is data entry, not a code change'
    },
    owner_actions_required: [
      'Wikidata items must be created by a human account; this endpoint prepares the submission, it cannot file it.',
      'Independent sources must exist before submitting — do not create an item to see if it survives.'
    ]
  });
});

router.get('/health', (req, res) => res.json({ ok: true, ready, job_sources: jobsource.SOURCES.length, adzuna: jobsource.adzunaActive() }));
module.exports = router;
