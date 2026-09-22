'use strict';

/**
 * LEVELUP MEDIA MARKETING — the AI back office for content creators.
 *
 * Served on three roots with one router and no hardcoded prefix:
 *   levelupmediamarketing.com (+ www)      base ''   (host handler in src/app.js)
 *   aiagent.ringlypro.com/levelupmediamarketing      base '/levelupmediamarketing'
 * Every page carries {{BASE}}, substituted at serve time from req.baseUrl.
 *
 * One MCP Brain (brain.js) is the only door to eleven agents (agents.js);
 * the app, the MCP endpoint and Andrea all call the same tools. Every agent
 * reads the creator's training (knowledge.js) on every model call.
 */

require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const connections = require('./connections');
const auth = require('./auth');
const brain = require('./brain');
require('./agents');
const C = require('./corpus');
const llm = require('./llm');
const { renderMarkdown } = require('./markdown');
const copilot = require('./copilot');

// The public About text, as plain sentences, handed to the voice agent so she
// can answer about the whole platform and not only the section on screen.
// JSON-escaped for a <script type="application/json"> block ('<' escaped so it
// can never close the tag).
let FACTS = null;
function platformFacts() {
  if (FACTS) return FACTS;
  const md = fs.readFileSync(path.join(__dirname, '..', 'ABOUT.md'), 'utf8');
  const plain = md
    .replace(/^\s*\|/gm, '')            // table rows become plain lines
    .replace(/\|/g, ' — ')
    .replace(/^[-\s|]+$/gm, '')
    .replace(/[#*`>]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  FACTS = JSON.stringify(plain).replace(/</g, '\\u003c');
  return FACTS;
}

const router = express.Router();
const PUB = path.join(__dirname, '..', 'public');
const VERSION = 'lu-2026-09-22-17';

router.use(express.json({ limit: '1mb' }));

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function page(req, res, file, extra = {}) {
  let html = fs.readFileSync(path.join(PUB, file), 'utf8');
  const vars = Object.assign({ BASE: req.baseUrl || '', VERSION }, extra);
  html = html.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(html);
}

// ── Session ──────────────────────────────────────────────────────────────────
router.use(async (req, res, next) => {
  const tok = auth.readCookie(req);
  const claims = tok ? auth.verify(tok) : null;
  if (claims) {
    try {
      // Re-read the account every request: a disabled or demoted account loses access now, not in 30 days.
      const u = await db.one('SELECT id, tenant_id, email, name, lang, is_platform_admin, active FROM lu_users WHERE id = :id', { id: claims.id });
      if (u && u.active) req.user = u;
    } catch (e) { /* DB down: treat as signed out */ }
  }
  next();
});
function needUser(req, res, next) {
  if (req.user) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Sign in first' });
  return res.redirect((req.baseUrl || '') + '/login');
}
// Mutations need the custom header: a cross-site form cannot set it.
function sameSite(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  if (req.get('X-LevelUp') !== '1') return res.status(403).json({ error: 'Missing request header' });
  next();
}
const ctxFor = (req) => ({ tenantId: req.user.tenant_id || req.user.id, actorId: req.user.id, channel: 'app', lang: req.user.lang, isPlatformAdmin: !!req.user.is_platform_admin });

// ── Public pages ─────────────────────────────────────────────────────────────
router.get('/', (req, res) => page(req, res, 'landing.html', { FACTS: platformFacts() }));
router.get('/login', (req, res) => (req.user ? res.redirect((req.baseUrl || '') + '/app') : page(req, res, 'login.html')));
router.get('/signup', (req, res) => res.redirect((req.baseUrl || '') + '/login?mode=signup'));
// Public "who we are / what we do" page. REQUIREMENTS.md is the internal
// build spec and is deliberately NOT served.
function aboutPage(req, res) {
  const md = fs.readFileSync(path.join(__dirname, '..', 'ABOUT.md'), 'utf8');
  page(req, res, 'doc.html', { BODY: renderMarkdown(md), TITLE: 'Who we are' });
}
router.get('/about', aboutPage);
router.get('/requirements', aboutPage);
router.get('/app', needUser, (req, res) => page(req, res, 'app.html'));

router.get('/health', async (req, res) => {
  let dbOk = false; try { await db.ensureSchema(); dbOk = true; } catch (e) { /* reported */ }
  res.json({
    ok: dbOk, service: 'LevelUp Media Marketing', version: VERSION,
    database: dbOk ? 'ok' : (db.status().error || 'unavailable'),
    model: llm.configured() ? { fast: llm.MODEL_FAST(), deep: llm.MODEL_DEEP() } : 'not configured (labelled heuristic path)',
    agents: C.AGENTS.length, tools: brain.TOOLS.size, daily_model_calls_per_creator: brain.DAILY_CAP(),
    integrations: { descript: 'not connected', tiktok: 'not connected', instagram: 'not connected', facebook: 'not connected', email_inbox: 'not connected', product_data: 'not connected' },
    rate_limits: 'in memory, per instance',
    owner_seed: global.__luOwnerSeed || 'pending'
  });
});

// ── Auth API ─────────────────────────────────────────────────────────────────
router.post('/api/v1/auth/signup', sameSite, async (req, res) => {
  const ip = String(req.headers['cf-connecting-ip'] || req.ip || '');
  if (auth.limited('su:' + ip, 5, 3600e3)) return res.status(429).json({ error: 'Too many sign-ups from here. Try again later.' });
  try {
    const u = await auth.signup(req.body || {});
    auth.setCookie(req, res, u);
    res.json({ ok: true, user: { email: u.email, name: u.name } });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});
router.post('/api/v1/auth/login', sameSite, async (req, res) => {
  const ip = String(req.headers['cf-connecting-ip'] || req.ip || '');
  const email = String((req.body || {}).email || '').toLowerCase();
  if (auth.limited('li:' + ip + ':' + email, 10, 900e3) || auth.limited('le:' + email, 25, 900e3)) return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes.' });
  try {
    const u = await auth.login(req.body || {});
    auth.setCookie(req, res, u);
    res.json({ ok: true, user: { email: u.email, name: u.name } });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});
router.post('/api/v1/auth/logout', sameSite, (req, res) => { auth.clearCookie(req, res); res.json({ ok: true }); });
router.get('/api/v1/me', needUser, (req, res) => res.json({ user: { id: req.user.id, email: req.user.email, name: req.user.name, lang: req.user.lang, platform_admin: !!req.user.is_platform_admin } }));
router.post('/api/v1/me/lang', needUser, sameSite, async (req, res) => {
  const l = req.body && req.body.lang === 'es' ? 'es' : 'en';
  await db.run('UPDATE lu_users SET lang = :l WHERE id = :id', { l, id: req.user.id });
  res.json({ ok: true, lang: l });
});

// ── Corpus (what the UI renders; never hardcoded in the page) ───────────────
router.get('/api/v1/corpus', needUser, (req, res) => res.json({
  agents: C.AGENTS, statuses: C.POST_STATUSES, pipeline: C.PIPELINE, purposes: C.PURPOSES, efforts: C.EFFORTS, formats: C.FORMATS,
  destinations: C.DESTINATIONS, edit_rules: C.EDIT_RULES, review_issues: C.REVIEW_ISSUES, red_flags: C.RED_FLAGS, issue_threshold: C.ISSUE_RULE_THRESHOLD
}));

// ── The Brain, from the app ─────────────────────────────────────────────────
router.get('/api/v1/tools', needUser, (req, res) => res.json({ tools: brain.listTools(ctxFor(req)) }));
router.post('/api/v1/tools/:name', needUser, sameSite, async (req, res) => {
  const r = await brain.callTool(req.params.name, req.body || {}, ctxFor(req));
  if (!r.ok) return res.status(r.status || 500).json({ error: r.error });
  res.json(r.result);
});
// The dashboard copilot: plain language in, real Brain tool calls out.
router.post('/api/v1/copilot', needUser, sameSite, async (req, res) => {
  if (auth.limited('cp:' + req.user.id, 30, 600e3)) return res.status(429).json({ error: 'Too many requests. Wait a moment.' });
  try {
    const out = await copilot.run({
      message: (req.body || {}).message,
      history: Array.isArray((req.body || {}).history) ? (req.body || {}).history : [],
      ctx: ctxFor(req)
    });
    res.json(out);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.get('/api/v1/audit', needUser, async (req, res) => {
  res.json({ calls: await db.q('SELECT tool, channel, outcome, reason, model_calls, composed_by, ms, created_at FROM lu_calls WHERE tenant_id = :t ORDER BY id DESC LIMIT 100', { t: req.user.tenant_id }) });
});

// ── API keys for the MCP endpoint (hash at rest, plaintext shown once) ──────
// ── Connections: the creator's own credentials for connectors being built ──
// Deliberately plain routes, NOT Brain tools: no agent, tool or copilot path
// may reach a page token. Secrets are never returned by any of them.
router.get('/api/v1/connections', needUser, async (req, res) => {
  try { res.json(await connections.list(req.user.tenant_id)); }
  catch (e) { res.status(500).json({ error: 'could not read connections' }); }
});
router.put('/api/v1/connections/:provider', needUser, sameSite, async (req, res) => {
  const r = await connections.save(req.user.tenant_id, String(req.params.provider), req.body || {});
  if (r.error) return res.status(400).json(r);
  res.json(await connections.list(req.user.tenant_id));
});
router.delete('/api/v1/connections/:provider', needUser, sameSite, async (req, res) => {
  const r = await connections.remove(req.user.tenant_id, String(req.params.provider));
  if (r.error) return res.status(400).json(r);
  res.json(await connections.list(req.user.tenant_id));
});
router.get('/api/v1/keys', needUser, async (req, res) => {
  res.json({ keys: await db.q('SELECT id, label, prefix, scopes, revoked, last_used_at, created_at FROM lu_api_keys WHERE tenant_id = :t ORDER BY id DESC', { t: req.user.tenant_id }) });
});
router.post('/api/v1/keys', needUser, sameSite, async (req, res) => {
  const scopes = (Array.isArray(req.body.scopes) ? req.body.scopes : ['agent']).filter((s) => ['agent', 'train'].includes(s));
  const k = auth.newApiKey();
  const [row] = await db.run(`INSERT INTO lu_api_keys (tenant_id, label, prefix, key_hash, scopes) VALUES (:t, :l, :p, :h, CAST(:s AS jsonb)) RETURNING id, label, prefix, scopes, created_at`,
    { t: req.user.tenant_id, l: String(req.body.label || 'MCP key').slice(0, 120), p: k.prefix, h: k.hash, s: JSON.stringify(scopes.length ? scopes : ['agent']) });
  res.json({ key: row, secret: k.raw, note: 'Shown once. Store it now.' });
});
router.delete('/api/v1/keys/:id', needUser, sameSite, async (req, res) => {
  const rows = await db.run('UPDATE lu_api_keys SET revoked = true WHERE id = :id AND tenant_id = :t RETURNING id', { id: Number(req.params.id) || 0, t: req.user.tenant_id });
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ── MCP (JSON-RPC 2.0) ───────────────────────────────────────────────────────
router.all('/mcp', async (req, res) => {
  const m = String(req.get('authorization') || '').match(/^Bearer\s+(\S+)$/i);
  const key = m ? await db.one('SELECT * FROM lu_api_keys WHERE key_hash = :h AND revoked = false', { h: auth.hashKey(m[1]) }) : null;
  const body = req.body || {};
  const reply = (result, error) => res.json(Object.assign({ jsonrpc: '2.0', id: body.id == null ? null : body.id }, error ? { error } : { result }));
  if (!key) return res.status(401).json({ jsonrpc: '2.0', id: body.id == null ? null : body.id, error: { code: -32001, message: 'Invalid or revoked API key' } });
  const owner = await db.one('SELECT lang, active FROM lu_users WHERE id = :t', { t: key.tenant_id });
  if (!owner || !owner.active) return res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Account disabled' } });
  db.run('UPDATE lu_api_keys SET last_used_at = now() WHERE id = :id', { id: key.id }).catch(() => {});
  const ctx = { tenantId: key.tenant_id, actorId: null, channel: 'mcp', scopes: key.scopes || [], lang: owner.lang };
  if (req.method === 'GET') return res.json({ name: 'levelup-media-marketing', tools: brain.listTools(ctx).length });
  switch (body.method) {
    case 'initialize': return reply({ protocolVersion: '2025-06-18', serverInfo: { name: 'levelup-media-marketing', version: VERSION }, capabilities: { tools: {} } });
    case 'tools/list': return reply({ tools: brain.listTools(ctx) });
    case 'tools/call': {
      const p = body.params || {};
      const r = await brain.callTool(String(p.name || ''), p.arguments || {}, ctx);
      if (!r.ok) return reply({ isError: true, content: [{ type: 'text', text: r.error }] });
      return reply({ content: [{ type: 'text', text: JSON.stringify(r.result) }], structuredContent: r.result });
    }
    default: return reply(null, { code: -32601, message: 'Method not found' });
  }
});

// ── Public Top Picks page + click tracking ───────────────────────────────────
router.get('/p/:token', async (req, res) => {
  const list = /^[a-f0-9]{24}$/.test(req.params.token) ? await db.one('SELECT * FROM lu_pick_lists WHERE share_token = :k AND published = true', { k: req.params.token }) : null;
  if (!list) return res.status(404).type('html').send(notFound(req));
  const items = await db.q('SELECT id, name, image_url, price, retailer, note FROM lu_pick_items WHERE list_id = :l AND tenant_id = :t ORDER BY position', { l: list.id, t: list.tenant_id });
  const base = req.baseUrl || '';
  const cards = items.map((i) => `<a class="pk" href="${base}/go/${i.id}?l=${list.share_token}" rel="nofollow sponsored noopener" target="_blank">
    ${i.image_url ? `<img src="${esc(i.image_url)}" alt="" loading="lazy">` : '<div class="ph"></div>'}
    <div><b>${esc(i.name)}</b>${i.price ? `<span class="pr">${esc(i.price)}</span>` : ''}${i.retailer ? `<small>${esc(i.retailer)}</small>` : ''}${i.note ? `<p>${esc(i.note)}</p>` : ''}</div></a>`).join('');
  page(req, res, 'picks.html', { TITLE: esc(list.title), INTRO: esc(list.intro || ''), CARDS: cards || '<p>No products yet.</p>' });
});
router.get('/go/:id', async (req, res) => {
  const row = await db.one(`SELECT i.id, i.url, i.tenant_id FROM lu_pick_items i JOIN lu_pick_lists l ON l.id = i.list_id AND l.tenant_id = i.tenant_id
    WHERE i.id = :id AND l.share_token = :k AND l.published = true`, { id: Number(req.params.id) || 0, k: String(req.query.l || '') });
  if (!row || !/^https?:\/\//i.test(row.url)) return res.status(404).type('html').send(notFound(req));
  await db.run('UPDATE lu_pick_items SET clicks = clicks + 1 WHERE id = :id AND tenant_id = :t', { id: row.id, t: row.tenant_id });
  res.redirect(302, row.url);
});

// ── PWA (generated per root; no manifest on disk) ────────────────────────────
router.get('/manifest.webmanifest', (req, res) => {
  const b = req.baseUrl || '';
  res.type('application/manifest+json').json({
    id: b + '/app', name: 'LevelUp Media Marketing', short_name: 'LevelUp', start_url: b + '/?source=pwa', scope: b + '/',
    display: 'standalone', background_color: '#FFFFFF', theme_color: '#FFFFFF', orientation: 'any',
    icons: [
      { src: b + '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: b + '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: b + '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: b + '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
    ],
    shortcuts: [{ name: 'Today', url: b + '/app#today' }, { name: 'Calendar', url: b + '/app#calendar' }, { name: 'Train the agents', url: b + '/app#train' }]
  });
});
router.get('/sw.js', (req, res) => {
  const b = req.baseUrl || '';
  res.type('application/javascript').set('Cache-Control', 'no-cache').send(`const C='${VERSION}',B='${b}';
const SHELL=[B+'/',B+'/icon-180.png',B+'/icon-192.png',B+'/app',B+'/icon.svg',B+'/app.css',B+'/app.js',B+'/base.css',B+'/flow.css',B+'/flow.js',B+'/theme.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>Promise.all(SHELL.map(u=>c.add(u).catch(()=>{})))));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim();});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin||!u.pathname.startsWith(B+'/')||u.pathname.includes('/api/')||u.pathname.endsWith('/mcp'))return;
e.respondWith(fetch(e.request).then(r=>{if(r.ok&&SHELL.includes(u.pathname)){const cl=r.clone();caches.open(C).then(c=>c.put(e.request,cl));}return r;}).catch(()=>caches.match(e.request).then(m=>m||new Response('<h1>You are offline</h1><p>Your work is saved on the server. Reconnect and try again.</p>',{headers:{'Content-Type':'text/html'}}))));});`);
});

router.use(express.static(PUB, { index: false, maxAge: '1h' }));

// ── Branded 404: an unowned path never falls through to the CRM ─────────────
function notFound(req) {
  const b = req.baseUrl || '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not found — LevelUp</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#FFFFFF;color:#26213F;font-family:system-ui,sans-serif;text-align:center;padding:24px}a{color:#C93D00}</style></head>
<body><div><h1>Page not found</h1><p>This page does not exist on LevelUp Media Marketing.</p><p><a href="${b}/">Go home</a></p></div></body></html>`;
}
router.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.status(404).type('html').send(notFound(req));
});

// ── Boot ─────────────────────────────────────────────────────────────────────
if (!process.env.LEVELUP_SKIP_BOOT) {
  db.ensureSchema()
    .then(() => auth.seedOwner())
    .then((r) => { global.__luOwnerSeed = r; console.log('  LevelUp schema ready (lu_*); owner seed:', JSON.stringify(r)); })
    .catch((e) => { global.__luOwnerSeed = { seeded: false, reason: e.message }; console.error('  LevelUp boot error:', e.message); });
}

module.exports = router;
