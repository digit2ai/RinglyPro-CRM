'use strict';

/**
 * SME knowledge capture routes, mounted at /architecture/sme.
 * Page: GET /           Magic link: GET /magic/:token (button) -> POST /magic/:token (uses the link)
 * API:  POST /api/login · POST /api/logout · POST /api/magic-link · GET|PATCH /api/me
 *       GET /api/questions/:id · PUT /api/answers/:questionId
 *       admin: GET|POST /api/admin/users · PATCH /api/admin/users/:id · POST /api/admin/users/:id/magic-link
 * Every response is noindex and no-store. Not linked from the public site.
 * A person already signed in to the site gate (owner or approved preview login) is signed in here automatically.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const auth = require('./auth');
const store = require('./store');
const notify = require('../services/notify');
const { rateLimit, ipHash, audit } = require('../services/util');

module.exports = function smeRouter(tenantId) {
  const r = express.Router();
  const view = path.join(__dirname, '..', 'views', 'sme.html');
  // Schema + seed once; the bootstrap admin is re-synced whenever its env values change (a Render edit).
  let ready = null, adminKey = null;
  const ensureReady = () => {
    if (!ready) ready = db.ensureSchema().then(() => store.seed(tenantId)).catch((e) => { ready = null; throw e; });
    return ready.then(() => {
      const key = auth.clean(process.env.INCENTIVA_SME_ADMIN_EMAIL).toLowerCase() + '|' + auth.sha256(auth.clean(process.env.INCENTIVA_SME_ADMIN_PASSWORD));
      if (key === adminKey) return;
      return auth.ensureAdmin(tenantId).then(() => { adminKey = key; });
    });
  };

  r.use((req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  r.use(async (req, res, next) => { try { await ensureReady(); next(); } catch (e) { console.error('[incentiva] sme boot', e.message); res.status(503).json({ error: 'Unavailable. Try again shortly.' }); } });
  r.use(express.json({ limit: '120kb' }));

  // Already signed in to the site: open the questionnaire with no second password.
  const archgate = require('../services/archgate');
  r.use(async (req, res, next) => {
    try {
      if (/^\/magic\//.test(req.path) || await auth.sessionFrom(tenantId, req)) return next();
      const who = await archgate.identify(req, tenantId);
      if (!who) return next();
      const u = await auth.ensureGateUser(tenantId, who);
      if (!u) return next();
      const tok = await auth.createSession(tenantId, u, { ipHash: ipHash(req), userAgent: req.headers['user-agent'] });
      auth.setCookie(req, res, tok, 30 * 86400);
      req.headers.cookie = (req.headers.cookie ? req.headers.cookie + '; ' : '') + auth.COOKIE + '=' + encodeURIComponent(tok);
      await audit(tenantId, { type: 'sme', id: u.id }, 'sme.login_site_gate', 'sme_user', u.id, { via: who.kind });
    } catch (e) { console.error('[incentiva] sme gate sign-in', e.message); }
    next();
  });

  function sameOrigin(req) {
    const o = req.headers.origin || req.headers.referer;
    if (!o) return true; // non-browser clients; browsers always send Origin on POST with JSON
    try { return new URL(o).host === req.headers.host; } catch (e) { return false; }
  }

  r.get('/', async (req, res) => {
    try {
      if (!(await auth.isOpen(tenantId))) return res.status(503).type('html').send('<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Closed</title><body style="font-family:system-ui;background:#0E0C1F;color:#ECEAF6;padding:40px">This tool is not open yet.');
      res.type('html').send(fs.readFileSync(view, 'utf8').split('{{BASE}}').join(req.baseUrl));
    } catch (e) { res.status(500).send('Page unavailable'); }
  });

  // Opening the emailed link shows one button; only that POST uses the link. Mail scanners that pre-fetch
  // links (Outlook Safe Links and similar) therefore cannot burn a single-use link before the SME clicks it.
  r.get('/magic/:token', (req, res) => {
    const tok = String(req.params.token || '');
    if (!/^[A-Za-z0-9_-]{30,80}$/.test(tok)) return res.redirect(303, req.baseUrl + '/?link=expired');
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>BuyersLine</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0E0C1F;color:#ECEAF6;font:400 17px/1.5 Mulish,system-ui,sans-serif;padding:16px}form{max-width:380px;width:100%;text-align:center;border:1px solid rgba(252,76,2,.45);border-radius:18px;padding:28px;background:#1A1636}button{width:100%;min-height:52px;border:0;border-radius:999px;background:#FC4C02;color:#fff;font:800 18px/1 Mulish,system-ui,sans-serif;cursor:pointer;margin-top:14px}</style></head>
<body><form method="post" action="${req.baseUrl}/magic/${tok}"><p style="margin:0 0 4px;font-weight:800">BuyersLine</p><p style="margin:0;color:#A6A3BD">Tap to open your questionnaire.<br>Toque para abrir su cuestionario.</p><button type="submit">Continue · Continuar</button></form></body></html>`);
  });
  r.post('/magic/:token', express.urlencoded({ extended: false, limit: '1kb' }), async (req, res) => {
    if (!sameOrigin(req)) return res.status(403).send('Not allowed.');
    if (!rateLimit('smemagic:' + ipHash(req), 30, 15 * 60e3)) return res.status(429).send('Too many attempts. Wait 15 minutes.');
    const u = await auth.consumeMagicLink(tenantId, req.params.token).catch(() => null);
    if (!u) return res.redirect(303, req.baseUrl + '/?link=expired');
    const tok = await auth.createSession(tenantId, u, { ipHash: ipHash(req), userAgent: req.headers['user-agent'] });
    auth.setCookie(req, res, tok, 30 * 86400);
    await audit(tenantId, { type: 'sme', id: u.id }, 'sme.login_magic_link', 'sme_user', u.id, {});
    res.redirect(303, req.baseUrl + '/');
  });

  r.post('/api/login', async (req, res) => {
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Not allowed.' });
    const b = req.body || {};
    const email = auth.clean(b.email).toLowerCase();
    if (!rateLimit('smelogin:' + ipHash(req), 10, 15 * 60e3) || !rateLimit('smelogin-e:' + email, 10, 60 * 60e3)) return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes.' });
    try {
      const u = await auth.login(tenantId, email, b.password);
      if (!u) { await audit(tenantId, { type: 'anonymous' }, 'sme.login_failed', null, null, {}); return res.status(401).json({ error: 'Email or password is incorrect.' }); }
      const tok = await auth.createSession(tenantId, u, { ipHash: ipHash(req), userAgent: req.headers['user-agent'] });
      auth.setCookie(req, res, tok, 30 * 86400);
      await audit(tenantId, { type: 'sme', id: u.id }, 'sme.login', 'sme_user', u.id, {});
      res.json({ ok: true });
    } catch (e) { console.error('[incentiva] sme login', e); res.status(500).json({ error: 'Sign-in failed. Try again.' }); }
  });

  r.post('/api/magic-link', async (req, res) => {
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Not allowed.' });
    const email = auth.clean((req.body || {}).email).toLowerCase();
    if (!rateLimit('smeml:' + ipHash(req), 5, 15 * 60e3) || !rateLimit('smeml-e:' + email, 3, 60 * 60e3)) return res.status(429).json({ error: 'Too many requests. Wait 15 minutes.' });
    try {
      const link = await auth.createMagicLink(tenantId, email);
      if (link) notify.later(notify.smeMagicLink, tenantId, link.user.id, link.linkId, `${notify.publicUrl()}/architecture/sme/magic/${link.token}`, link.user.language);
      res.json({ ok: true }); // same answer whether or not the email has an account
    } catch (e) { console.error('[incentiva] sme magic link', e); res.json({ ok: true }); }
  });

  const user = auth.requireUser(tenantId);
  const admin = auth.requireUser(tenantId, { role: 'admin' });

  r.post('/api/logout', user, async (req, res) => { await auth.logout(tenantId, req); auth.setCookie(req, res, '', 0); res.json({ ok: true }); });

  r.get('/api/me', user, async (req, res) => {
    const o = await store.overview(tenantId, req.sme.user.id);
    res.json({ user: auth.publicUser(req.sme.user), csrf: req.sme.csrf, progress: { answered: o.answered, total: o.total }, resume_question_id: o.resume_question_id, sections: o.sections });
  });
  r.patch('/api/me', user, async (req, res) => {
    const lang = (req.body || {}).language === 'es' ? 'es' : 'en';
    await db.exec('UPDATE nca_sme_users SET language = :l WHERE id = :id AND tenant_id = :t', { l: lang, id: req.sme.user.id, t: tenantId });
    res.json({ ok: true, language: lang });
  });

  r.get('/api/questions/:id', user, async (req, res) => {
    const q = await store.question(tenantId, req.sme.user.id, req.params.id);
    if (!q) return res.status(404).json({ error: 'Question not found.' });
    const o = await store.overview(tenantId, req.sme.user.id);
    res.json(Object.assign(q, { progress: { answered: o.answered, total: o.total } }));
  });

  r.put('/api/answers/:questionId', user, async (req, res) => {
    const out = await store.saveAnswer(tenantId, req.sme.user.id, req.params.questionId, req.body || {}, req.sme.sessionId);
    if (out.error) return res.status(out.error).json({ error: 'Question not found.' });
    res.json(out);
  });

  // ── Admin: SME accounts (answers review, export and question editor come next) ──
  r.get('/api/admin/users', admin, async (req, res) => {
    const rows = await db.q(`SELECT u.*, (SELECT COUNT(*)::int FROM nca_sme_answers a WHERE a.user_id = u.id AND a.status = 'submitted') AS answered
      FROM nca_sme_users u WHERE u.tenant_id = :t ORDER BY u.role, u.name`, { t: tenantId });
    res.json({ users: rows.map((u) => Object.assign(auth.publicUser(u), { answered: u.answered })) });
  });
  r.post('/api/admin/users', admin, async (req, res) => {
    const b = req.body || {};
    const out = await auth.createUser(tenantId, { name: b.name, email: b.email, phone: b.phone, language: b.language, role: b.role, password: b.password });
    if (out.error) return res.status(400).json({ error: out.error });
    await audit(tenantId, { type: 'sme', id: req.sme.user.id }, 'sme.user_created', 'sme_user', out.user.id, { role: out.user.role });
    res.json({ user: auth.publicUser(out.user), temporary_password: out.temporary_password });
  });
  r.patch('/api/admin/users/:id', admin, async (req, res) => {
    const id = Number(req.params.id) || 0;
    const b = req.body || {};
    const u = await db.one('SELECT * FROM nca_sme_users WHERE id = :id AND tenant_id = :t', { id, t: tenantId });
    if (!u) return res.status(404).json({ error: 'Account not found.' });
    if (id === req.sme.user.id && b.status === 'disabled') return res.status(400).json({ error: 'You cannot disable your own account.' });
    if (b.status !== undefined) {
      if (!['active', 'disabled'].includes(b.status)) return res.status(400).json({ error: 'Unknown status.' });
      await db.exec('UPDATE nca_sme_users SET status = :s WHERE id = :id', { s: b.status, id });
      if (b.status === 'disabled') await db.exec('UPDATE nca_sme_auth_sessions SET revoked_at = now() WHERE user_id = :id AND revoked_at IS NULL', { id });
    }
    if (b.password !== undefined) { const p = await auth.setPassword(tenantId, id, b.password); if (p.error) return res.status(400).json({ error: p.error }); }
    await audit(tenantId, { type: 'sme', id: req.sme.user.id }, 'sme.user_updated', 'sme_user', id, { status: b.status, password_changed: b.password !== undefined });
    res.json({ ok: true });
  });
  r.post('/api/admin/users/:id/magic-link', admin, async (req, res) => {
    const u = await db.one(`SELECT * FROM nca_sme_users WHERE id = :id AND tenant_id = :t AND status = 'active'`, { id: Number(req.params.id) || 0, t: tenantId });
    if (!u) return res.status(404).json({ error: 'Account not found.' });
    const link = await auth.createMagicLink(tenantId, u.email);
    const sent = await notify.smeMagicLink(tenantId, u.id, link.linkId, `${notify.publicUrl()}/architecture/sme/magic/${link.token}`, u.language);
    res.json({ ok: true, emailed: !!sent.sent, reason: sent.sent ? null : sent.reason });
  });

  r.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  return r;
};
