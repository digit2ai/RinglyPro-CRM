// CV Talent Engine — multi-tenant career console behind the public CV pages
// (manuelstagg.com / anastagg.com / julianagramowski.com). Each profile logs in to
// a private dashboard with: (1) analytics (reuses cv_page_hits), (2) on-demand AI
// broadcast/outreach drafting (review-and-send — honors the repo's no-auto-send rule),
// (3) an opportunities inbox fed by a public "submit an opportunity" form + manual adds.
// Self-contained: own Sequelize, scrypt password hashing, HMAC session cookie.
const express = require('express');
const crypto = require('crypto');
const { Sequelize, QueryTypes } = require('sequelize');

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
    site: 'https://anastagg.com', linkedin: 'https://www.linkedin.com/in/anastagg',
    target_roles: 'Securities & Derivatives / Custody Billing Analyst; Financial Operations & Reconciliation; Billing QA, Controls & Compliance; Bilingual Institutional Client Servicing',
    summary: 'Bilingual Securities & Derivatives Analyst at Citi supporting global custody & safekeeping billing for institutional clients: fee calculation, contractual pricing validation, invoice reconciliation, billing QA and compliance. B.S. Business Administration (HRM) & Psychology.',
    pw: process.env.CV_ADMIN_PW_ANASTAGG || 'AnaStagg@2026' },
  { slug: 'juliana_gramowski', name: 'Juliana Gramowski', headline: 'Sales Executive · Business Development · Marketing Strategist',
    email: 'jgramowski7@gmail.com', phone: '+18133342244', location: 'Tampa, FL',
    site: 'https://julianagramowski.com', linkedin: 'https://www.linkedin.com/in/juliana-gramowski-6270201a4',
    target_roles: 'Sales Executive / Account Executive; Advertising & Media Sales (OOH, digital); Business Development & Marketing Strategy; Client Relationship & Account Management',
    summary: 'Results-oriented Sales Executive with 10+ years in business development, advertising sales (Out-of-Home) and strategic marketing across the US and Latin America. Clear Channel Outdoor, IndoorMedia, JCDecaux, Televisa. Bilingual EN/ES.',
    pw: process.env.CV_ADMIN_PW_JULIANA || 'Juliana@2026' }
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
  `);
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
    // set password only if missing (never clobber a changed one)
    await sequelize.query(`UPDATE cv_profiles SET password_hash=:ph WHERE slug=:slug AND (password_hash IS NULL OR password_hash='')`,
      { replacements: { slug: p.slug, ph: hashPw(p.pw) }, type: QueryTypes.UPDATE }).catch(()=>{});
  }
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
  const q = (sql, rep) => sequelize.query(sql, { replacements: rep, type: QueryTypes.SELECT });
  const [win] = await q(`SELECT COUNT(*)::int views, COUNT(DISTINCT ip_hash)::int visitors FROM cv_page_hits WHERE page=:s AND created_at > now()-(:d||' days')::interval`, { s:p.slug, d:days });
  const [all] = await q(`SELECT COUNT(*)::int views, COUNT(DISTINCT ip_hash)::int visitors FROM cv_page_hits WHERE page=:s`, { s:p.slug });
  const byDay = await q(`SELECT to_char(date_trunc('day',created_at),'YYYY-MM-DD') day, COUNT(*)::int views FROM cv_page_hits WHERE page=:s AND created_at>now()-(:d||' days')::interval GROUP BY 1 ORDER BY 1`, { s:p.slug, d:days });
  const refs = await q(`SELECT COALESCE(NULLIF(referrer,''),'(direct)') referrer, COUNT(*)::int views FROM cv_page_hits WHERE page=:s AND created_at>now()-(:d||' days')::interval GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, { s:p.slug, d:days });
  const opp = await q(`SELECT status, COUNT(*)::int n FROM cv_opportunities WHERE profile_id=:id GROUP BY 1`, { id:p.id });
  const oppCounts = { new:0, contacted:0, interviewing:0, offer:0, closed:0, declined:0 };
  opp.forEach(r => { oppCounts[r.status] = r.n; });
  res.json({ profile: pub(p), days, window: win, all_time: all, by_day: byDay, top_referrers: refs, opp_counts: oppCounts });
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
  const st = ['draft','sent','archived'].includes(req.body.status) ? req.body.status : null;
  await sequelize.query('UPDATE cv_outreach SET status=COALESCE(:st,status) WHERE id=:oid AND profile_id=:pid',
    { replacements:{ st, oid:parseInt(req.params.id,10)||0, pid:p.id }, type:QueryTypes.UPDATE });
  res.json({ ok:true });
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

router.get('/health', (req, res) => res.json({ ok: true, ready }));
module.exports = router;
