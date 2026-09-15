'use strict';

/**
 * INCENTIVA — new-construction buyer platform. Mounted at /incentiva.
 *
 * A consumer front door: buyers see their buying power, every active new-home
 * community near their target area, and each builder's incentives verified by
 * a licensed agent, compared in monthly-payment terms. The platform connects
 * them, at no cost, to a licensed sales associate who pays the platform
 * per consult held. A DIGIT2AI and agent partnership; BuyersLine is a technology
 * company, not a brokerage and not a lender.
 *
 * Invariants (see CLAUDE.md "BuyersLine"):
 *  - Only verified, fresh, unexpired incentives reach a buyer (nca_v_incentives_buyer_safe).
 *  - A detected decrease or removal hides at once; a new or larger offer waits for an agent.
 *  - Only a licensed agent account can confirm an incentive.
 *  - The model writes prose, never a figure; payments are deterministic.
 *  - Billing is per consult held and nothing transaction-contingent.
 *  - Email lives only in services/notify.js and SMS only in services/sms.js; every buyer message checks consent.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const auth = require('./services/auth');
const llm = require('./services/llm');
const { TENANT_ID, rateLimit, ipHash, audit } = require('./services/util');
const { startScheduler } = require('./services/monitor');

function createApp(opts = {}) {
  const tenantId = opts.tenantId || TENANT_ID;
  const router = express.Router();
  const publicDir = path.join(__dirname, '..', 'public');

  router.use(express.json({ limit: '200kb' }));
  router.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });

  // HTML shells carry {{BASE}} and are substituted at serve time, so one file serves any mount.
  const shellCache = {};
  function shell(file) {
    return (req, res) => {
      try {
        if (!shellCache[file] || process.env.NODE_ENV !== 'production') shellCache[file] = fs.readFileSync(path.join(publicDir, file), 'utf8');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        if (file !== 'index.html') res.setHeader('X-Robots-Tag', 'noindex');
        res.send(shellCache[file].split('{{BASE}}').join(req.baseUrl));
      } catch (e) {
        res.status(500).send('Page unavailable');
      }
    };
  }

  router.get('/health', async (req, res) => {
    let dbOk = false, dbErr = null;
    if (db.configured) {
      try { await db.ensureSchema(); await db.q('SELECT 1 AS ok'); dbOk = true; } catch (e) { dbErr = e.message.slice(0, 120); }
    }
    res.json({
      ok: dbOk, service: 'buyersline', database: dbOk ? 'connected' : (db.configured ? 'error' : 'not_configured'), database_error: dbErr,
      model_configured: llm.configured(), monitor_enabled: process.env.INCENTIVA_MONITOR_GO === '1',
      agent_console: auth.configured() ? 'configured' : 'closed', weak_password: auth.configured() ? auth.weakPassword() : null,
      agent_account: !!(process.env.INCENTIVA_AGENT_EMAIL && process.env.INCENTIVA_AGENT_PASSWORD),
      listings: require('./services/rentcast').configured() ? 'rentcast_connected' : 'not_connected',
      report_review: process.env.INCENTIVA_REPORT_REVIEW === 'auto' ? 'auto_when_compliance_passes' : 'agent_approval_required',
      agents: require('./services/agents').status(),
      site_gate: require('./services/archgate').siteGateOn() ? 'on' : 'off',
      research_model: require('./services/research').modelStatus(),
      research_daily: process.env.INCENTIVA_RESEARCH_DAILY === 'off' ? 'off' : 'on (6-10 a.m. Eastern)',
      architecture_page: require('./services/archgate').configured() ? (require('./services/archgate').weak() ? 'configured_weak_password' : 'configured') : 'closed',
      transports: require('./services/notify').configured() ? 'email only (SendGrid): report-ready to buyers who consented, approval alerts to the reviewer' : 'none (nothing auto-sends)'
    });
  });

  // ── Search engines: robots.txt and sitemap.xml answer even while the site gate is on. ──
  // They carry no private content. Google can only index the pages once INCENTIVA_SITE_GATE=off.
  function publicOrigin(req) {
    const env = String(process.env.INCENTIVA_PUBLIC_URL || '').replace(/\/+$/, '');
    if (env) return env;
    return 'https://' + String(req.headers.host || 'buyersline.app').replace(/[^A-Za-z0-9.:-]/g, '') + req.baseUrl;
  }
  router.get('/robots.txt', (req, res) => {
    const origin = publicOrigin(req);
    res.type('text/plain').setHeader('Cache-Control', 'public, max-age=3600');
    res.send(['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /api/', 'Disallow: /gate/', 'Disallow: /architecture', 'Disallow: /r/', 'Disallow: /meet/', 'Disallow: /unsubscribe/', '', `Sitemap: ${origin}/sitemap.xml`, ''].join('\n'));
  });
  router.get('/sitemap.xml', (req, res) => {
    const origin = publicOrigin(req);
    const today = new Date().toISOString().slice(0, 10);
    const url = (loc, alt) => `<url><loc>${loc}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq>${alt ? `<xhtml:link rel="alternate" hreflang="en" href="${loc}?lang=en"/><xhtml:link rel="alternate" hreflang="es" href="${loc}?lang=es"/>` : ''}</url>`;
    res.type('application/xml').setHeader('Cache-Control', 'public, max-age=3600');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${url(origin + '/', true)}${url(origin + '/search', true)}</urlset>\n`);
  });

  // ── Site gate (owner request 2026-09-15): the whole site needs a sign-in until it is public ──
  // Owner: INCENTIVA_ARCHITECTURE_USER / _PASSWORD (no defaults, fails shut). Preview logins: created on
  // /gate/signup, usable only after the owner approves them on /gate/accounts. INCENTIVA_SITE_GATE=off opens the site.
  // Left open on purpose: /health, robots.txt, sitemap.xml, the Twilio SMS webhook (signature-checked) and the
  // RFC 8058 one-click unsubscribe POST from mail clients.
  const archgate = require('./services/archgate');
  const notify = require('./services/notify');
  function gateHeaders(res) { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex, nofollow'); }
  function sameOrigin(req) {
    const o = req.headers.origin || req.headers.referer;
    if (!o) return true;
    try { return new URL(o).host === req.headers.host; } catch (e) { return false; }
  }
  const gateForm = express.urlencoded({ extended: false, limit: '4kb' });
  const html = (res, code, body) => res.status(code).type('html').send(body);
  router.get('/gate/login', (req, res) => { gateHeaders(res); html(res, archgate.configured() ? 200 : 503, archgate.configured() ? archgate.loginPage(req.baseUrl, null, req.query.next || req.baseUrl + '/', req.query.reset === '1' ? 'Password saved. Sign in with your new password.' : null) : archgate.closedPage(req.baseUrl)); });
  router.post(['/gate/login', '/architecture/login'], gateForm, async (req, res) => {
    gateHeaders(res);
    const b = req.body || {};
    const next = archgate.safeNext(req.baseUrl, b.next || req.baseUrl + '/');
    if (!archgate.configured()) return html(res, 503, archgate.closedPage(req.baseUrl));
    const login = b.email != null ? b.email : b.user;
    if (!rateLimit('arch:' + ipHash(req), 10, 15 * 60e3) || !rateLimit('arch-e:' + String(login || '').toLowerCase().slice(0, 200), 10, 60 * 60e3)) return html(res, 429, archgate.loginPage(req.baseUrl, 'Too many attempts. Wait 15 minutes.', next));
    try {
      const out = await archgate.authenticate(tenantId, login, b.password);
      if (out.error === 'pending') return html(res, 403, archgate.loginPage(req.baseUrl, 'Your login is waiting for the owner to approve it. You will get an email when it is approved.', next));
      if (out.error) { await audit(tenantId, { type: 'anonymous' }, 'gate.login_failed', null, null, {}); return html(res, 401, archgate.loginPage(req.baseUrl, 'Email or password is incorrect.', next)); }
      const value = out.kind === 'owner' ? archgate.sign(Date.now() + archgate.TTL_MS) : archgate.signAccount(out.user, Date.now() + archgate.TTL_MS);
      archgate.setCookie(req, res, value, archgate.TTL_MS);
      await audit(tenantId, { type: out.kind === 'owner' ? 'owner' : 'site_user', id: out.user ? out.user.id : null }, 'gate.login', out.user ? 'site_user' : null, out.user ? out.user.id : null, {});
      res.redirect(303, next);
    } catch (e) { console.error('[incentiva] gate login', e.message); html(res, 500, archgate.loginPage(req.baseUrl, 'Sign-in failed. Try again.', next)); }
  });
  router.post(['/gate/logout', '/architecture/logout'], (req, res) => { archgate.setCookie(req, res, '', 0); res.redirect(303, req.baseUrl + '/'); });

  router.get('/gate/signup', (req, res) => { gateHeaders(res); html(res, archgate.configured() ? 200 : 503, archgate.configured() ? archgate.signupPage(req.baseUrl) : archgate.closedPage(req.baseUrl)); });
  router.post('/gate/signup', gateForm, async (req, res) => {
    gateHeaders(res);
    if (!archgate.configured()) return html(res, 503, archgate.closedPage(req.baseUrl));
    if (!sameOrigin(req)) return html(res, 403, archgate.signupPage(req.baseUrl, 'Not allowed.'));
    if (!rateLimit('gsignup:' + ipHash(req), 5, 3600e3)) return html(res, 429, archgate.signupPage(req.baseUrl, 'Too many new logins from this connection. Try again later.'));
    const b = req.body || {};
    try {
      const out = await archgate.createAccount(tenantId, b.email, b.password, b.confirm);
      if (out.error) return html(res, 400, archgate.signupPage(req.baseUrl, out.error));
      if (out.created) {
        await audit(tenantId, { type: 'site_user', id: out.created.id }, 'gate.login_requested', 'site_user', out.created.id, {});
        notify.later(notify.siteLoginRequested, tenantId, out.created, archgate.ownerEmail());
      }
      html(res, 200, archgate.signupPage(req.baseUrl, null, true));
    } catch (e) { console.error('[incentiva] gate signup', e.message); html(res, 500, archgate.signupPage(req.baseUrl, 'That did not work. Try again.')); }
  });

  router.get('/gate/forgot', (req, res) => { gateHeaders(res); html(res, archgate.configured() ? 200 : 503, archgate.configured() ? archgate.forgotPage(req.baseUrl) : archgate.closedPage(req.baseUrl)); });
  router.post('/gate/forgot', gateForm, async (req, res) => {
    gateHeaders(res);
    if (!archgate.configured()) return html(res, 503, archgate.closedPage(req.baseUrl));
    if (!sameOrigin(req)) return html(res, 403, archgate.forgotPage(req.baseUrl, 'Not allowed.'));
    const email = String((req.body || {}).email || '').trim().toLowerCase().slice(0, 200);
    if (!rateLimit('gforgot:' + ipHash(req), 5, 3600e3) || !rateLimit('gforgot-e:' + email, 3, 3600e3)) return html(res, 429, archgate.forgotPage(req.baseUrl, 'Too many requests. Try again later.'));
    try {
      const r = await archgate.requestReset(tenantId, email);
      if (r) { notify.later(notify.sitePasswordReset, tenantId, r.user, r.token); await audit(tenantId, { type: 'site_user', id: r.user.id }, 'gate.reset_requested', 'site_user', r.user.id, {}); }
    } catch (e) { console.error('[incentiva] gate forgot', e.message); }
    html(res, 200, archgate.forgotPage(req.baseUrl, null, true)); // same answer whether or not the email has a login
  });
  router.get('/gate/reset', async (req, res) => {
    gateHeaders(res);
    if (!archgate.configured()) return html(res, 503, archgate.closedPage(req.baseUrl));
    const tok = String(req.query.t || '').slice(0, 400);
    const u = await archgate.readResetToken(tenantId, tok).catch(() => null);
    html(res, u ? 200 : 400, archgate.resetPage(req.baseUrl, tok, null, !u));
  });
  router.post('/gate/reset', gateForm, async (req, res) => {
    gateHeaders(res);
    if (!archgate.configured()) return html(res, 503, archgate.closedPage(req.baseUrl));
    if (!sameOrigin(req)) return html(res, 403, 'Not allowed.');
    if (!rateLimit('greset:' + ipHash(req), 10, 3600e3)) return html(res, 429, 'Too many attempts. Try again later.');
    const b = req.body || {};
    const out = await archgate.resetPassword(tenantId, b.t, b.password, b.confirm).catch(() => ({ error: 'expired' }));
    if (out.error === 'expired') return html(res, 400, archgate.resetPage(req.baseUrl, '', null, true));
    if (out.error) return html(res, 400, archgate.resetPage(req.baseUrl, String(b.t || ''), out.error));
    await audit(tenantId, { type: 'site_user', id: out.user.id }, 'gate.password_reset', 'site_user', out.user.id, {});
    res.redirect(303, req.baseUrl + '/gate/login?reset=1');
  });

  // Checker: only the owner credential approves logins. An approved login cannot approve anyone.
  router.get('/gate/accounts', async (req, res) => {
    gateHeaders(res);
    if (!archgate.configured()) return html(res, 503, archgate.closedPage(req.baseUrl));
    if (!archgate.valid(req)) return html(res, 401, archgate.loginPage(req.baseUrl, 'Sign in with the owner login to review new logins.', req.originalUrl));
    html(res, 200, archgate.accountsPage(req.baseUrl, await archgate.listAccounts(tenantId)));
  });
  router.post('/gate/accounts/:id', gateForm, async (req, res) => {
    gateHeaders(res);
    if (!archgate.configured() || !archgate.valid(req)) return res.status(401).type('text').send('Owner sign-in required');
    if (!sameOrigin(req)) return res.status(403).type('text').send('Not allowed.');
    const row = await archgate.decide(tenantId, req.params.id, (req.body || {}).decision, archgate.ownerEmail());
    if (row) {
      await audit(tenantId, { type: 'owner' }, 'gate.login_' + row.status, 'site_user', row.id, {});
      if (row.status === 'approved') notify.later(notify.siteLoginApproved, tenantId, row);
    }
    res.redirect(303, req.baseUrl + '/gate/accounts');
  });

  // SME knowledge capture: anyone past the site sign-in opens it without a second password (owner request
  // 2026-09-15). Its own accounts and single-use emailed links still work for experts who have no preview login.
  router.use('/architecture/sme', require('./sme/routes')(tenantId));
  router.use(async (req, res, next) => {
    if (!archgate.siteGateOn()) return next();
    if (req.path === '/api/v1/public/sms/inbound' || (req.method === 'POST' && /^\/api\/v1\/public\/unsubscribe\/[A-Za-z0-9_-]+$/.test(req.path))) return next();
    gateHeaders(res);
    if (!archgate.configured()) return req.path.startsWith('/api/') ? res.status(503).json({ error: 'Closed' }) : html(res, 503, archgate.closedPage(req.baseUrl));
    try { if (await archgate.identify(req, tenantId)) return next(); } catch (e) { console.error('[incentiva] gate identify', e.message); }
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Sign in required' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(401).type('text').send('Sign in required');
    html(res, 401, archgate.loginPage(req.baseUrl, null, req.originalUrl));
  });

  // PWA: manifests and worker are generated per mount (src/services/pwa.js). Registered before static.
  const pwa = require('./services/pwa');
  router.get('/manifest.webmanifest', (req, res) => pwa.send(res, 'application/manifest+json', JSON.stringify(pwa.buyerManifest(req), null, 2)));
  router.get('/admin/manifest.webmanifest', (req, res) => pwa.send(res, 'application/manifest+json', JSON.stringify(pwa.consoleManifest(req), null, 2)));
  router.get('/sw.js', (req, res) => pwa.send(res, 'application/javascript; charset=utf-8', pwa.serviceWorker(req)));
  router.get('/offline', shell('offline.html'));

  router.get('/', shell('index.html'));
  router.get('/r/:token', shell('report.html'));
  router.get(['/search', '/buscar'], shell('search.html'));
  router.get(['/login', '/admin/login'], shell('login.html'));
  router.get(['/admin', '/admin/'], shell('admin.html'));
  router.get('/meet/:token', shell('meet.html'));
  router.get('/unsubscribe/:token', shell('unsubscribe.html'));
  // Architecture page: always signed-in (the site gate below may be off; this page never is).
  const archView = path.join(__dirname, 'views', 'architecture.html');
  router.get('/architecture', async (req, res) => {
    gateHeaders(res);
    if (!archgate.configured()) return res.status(503).type('html').send(archgate.closedPage(req.baseUrl));
    if (!(await archgate.identify(req, tenantId).catch(() => null))) return res.status(401).type('html').send(archgate.loginPage(req.baseUrl, null, req.originalUrl));
    try { res.type('html').send(fs.readFileSync(archView, 'utf8').split('{{BASE}}').join(req.baseUrl)); }
    catch (e) { res.status(500).send('Page unavailable'); }
  });
  router.get(['/index.html', '/report.html', '/login.html', '/admin.html', '/search.html', '/offline.html', '/meet.html', '/unsubscribe.html', '/architecture.html'], (req, res) => res.redirect(301, req.baseUrl + '/'));

  router.use('/api/v1/public', require('./routes/public')({ tenantId, allowModel: opts.allowModel, allowGeocode: opts.allowGeocode }));

  // ── Auth ──────────────────────────────────────────────────────────────────
  router.post('/api/v1/auth/login', async (req, res) => {
    if (!auth.configured()) return res.status(503).json({ error: 'Agent console is not configured' });
    if (!rateLimit('login:' + ipHash(req), 10, 15 * 60e3)) return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes.' });
    try {
      await auth.ensureAccounts(tenantId);
      const u = await auth.login(tenantId, req.body.email, req.body.password);
      if (!u) { await audit(tenantId, { type: 'anonymous' }, 'auth.login_failed', null, null, {}); return res.status(401).json({ error: 'Email or password is incorrect' }); }
      auth.setCookie(res, auth.sign(u), auth.TTL_SECONDS);
      await audit(tenantId, { type: 'agent', id: u.id }, 'auth.login', 'user', u.id, {});
      res.json({ ok: true, user: auth.publicUser(u) });
    } catch (e) { console.error('[incentiva] login', e); res.status(500).json({ error: 'Sign-in failed. Try again.' }); }
  });
  router.post('/api/v1/auth/logout', (req, res) => { auth.setCookie(res, '', 0); res.json({ ok: true }); });
  router.get('/api/v1/auth/me', auth.requireAgent(tenantId), (req, res) => res.json({ user: auth.publicUser(req.user) }));

  router.use('/api/v1/agent', auth.requireAgent(tenantId), require('./routes/agent')());

  router.use(express.static(publicDir, { index: false, maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));

  // An unowned path ends here, never in the CRM.
  router.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    res.status(404).type('html').send(`<!doctype html><meta charset="utf-8"><title>Not found · BuyersLine</title><body style="font-family:system-ui;padding:40px;background:#FFFFFF;color:#26213F;font-family:Mulish,system-ui,sans-serif"><h1>Page not found</h1><p><a href="${req.baseUrl}/" style="color:#C93D00">Go to BuyersLine</a></p>`);
  });

  if (opts.boot !== false && db.configured) {
    db.ensureSchema()
      .then(() => auth.ensureAccounts(tenantId))
      .then(() => { if (startScheduler(tenantId)) console.log('[incentiva] monitor scheduler on'); })
      .then(() => { if (require('./services/agents').start(tenantId)) console.log('[incentiva] follow-up, hand-off and scheduler agents on'); })
      .then(async () => {
        if (process.env.INCENTIVA_SEED_DEMO === '1') {
          const { seedDemo } = require('./services/seed');
          const r = await seedDemo(tenantId, {});
          console.log('[incentiva] demo seed', JSON.stringify(r));
        }
      })
      .catch((e) => console.error('[incentiva] boot:', e.message));
  }
  return router;
}

module.exports = createApp();
module.exports.createApp = createApp;
