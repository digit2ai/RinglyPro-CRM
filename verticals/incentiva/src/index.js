'use strict';

/**
 * INCENTIVA — new-construction buyer platform. Mounted at /incentiva.
 *
 * A consumer front door: buyers see their buying power, every active new-home
 * community near their target area, and each builder's incentives verified by
 * a licensed agent, compared in monthly-payment terms. The platform connects
 * them, at no cost, to a licensed sales associate (Ole) who pays the platform
 * per consult held. A DIGIT2AI x Ole partnership; BuyersLine is a technology
 * company, not a brokerage and not a lender.
 *
 * Invariants (see CLAUDE.md "BuyersLine"):
 *  - Only verified, fresh, unexpired incentives reach a buyer (nca_v_incentives_buyer_safe).
 *  - A detected decrease or removal hides at once; a new or larger offer waits for an agent.
 *  - Only a licensed agent account can confirm an incentive.
 *  - The model writes prose, never a figure; payments are deterministic.
 *  - Billing is per consult held and nothing transaction-contingent.
 *  - Nothing sends: there is no mail or SMS transport in this vertical.
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
      transports: require('./services/notify').configured() ? 'email only (SendGrid): report-ready to buyers who consented, approval alerts to the reviewer' : 'none (nothing auto-sends)'
    });
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
  router.get(['/index.html', '/report.html', '/login.html', '/admin.html', '/search.html', '/offline.html'], (req, res) => res.redirect(301, req.baseUrl + '/'));

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
