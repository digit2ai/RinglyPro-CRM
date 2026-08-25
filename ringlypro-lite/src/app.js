'use strict';

/**
 * RinglyPro Lite — Express app (ISOLATED sibling app; not mounted into
 * full RinglyPro). Own routes, own static dashboard, own DB.
 */
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { optionalAuth } = require('./middleware/auth');

const app = express();
app.set('trust proxy', 1);

// Stripe webhook needs the raw body — mount BEFORE json parser.
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));   // Twilio webhooks are urlencoded
app.use(cookieParser());

const PUBLIC = path.join(__dirname, '..', 'public');

// Health. `ok` used to mean "the process is up", which stayed true while the
// database was unreachable and every signup 503'd — so the check that exists to
// catch that outage was the one surface that could not see it. It now probes the
// connection and reports `db` honestly. It deliberately still answers 200: this
// path is Render's healthCheckPath, and failing it during a database outage
// would fail the deploy and roll back — hiding the very message that names the
// cause. Liveness and database reachability are reported as separate facts.
const sequelize = require('./db');
const { reason: dbErrorReason } = require('./utils/db-error');

app.get('/health', async (req, res) => {
  const body = { service: 'ringlypro-lite', ok: true, ts: new Date().toISOString() };
  try {
    // Bounded: the pool would otherwise sit on `acquire` (30s) and the health
    // check itself would time out before it could report the failure.
    await Promise.race([
      sequelize.authenticate(),
      new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('probe timeout'), { code: 'ETIMEDOUT' })), 5000).unref())
    ]);
    body.db = { ok: true };
  } catch (e) {
    body.db = { ok: false, code: dbErrorReason(e) };
    console.error('[lite:health] database unreachable:', e.original?.message || e.message);
  }
  res.json(body);
});

// Public config (no auth) — drives the billing UI. Billing is ON by default now
// (US plan is live); set LITE_BILLING_ENABLED=0 to return to free mode.
function envDisabled(v) { return ['0', 'false', 'no', 'off'].includes(String(v || '').trim().toLowerCase()); }
app.get('/api/config', (req, res) => res.json({
  billing_enabled: !envDisabled(process.env.LITE_BILLING_ENABLED),
  // Shared demo lines — one language each (Spanish default + English), so a
  // prospect hears Lina in their language before a dedicated DID is provisioned.
  demo_number: process.env.LITE_DEMO_NUMBER || '+18132120813',
  demo_number_es: process.env.LITE_DEMO_NUMBER || '+18132120813',
  demo_number_en: process.env.LITE_DEMO_NUMBER_EN || '+17627611589'
}));

// API routers
app.use('/api/auth', require('./routes/auth'));
app.use('/api/onboarding', require('./routes/onboarding'));
app.use('/api/webchat', require('./routes/webchat'));       // PUBLIC live chat (CORS) — must be before the /api gate
app.use('/api/public-booking', require('./routes/public-booking')); // PUBLIC tenant-scoped booking (CORS) — before the /api gate
app.use('/api/billing', require('./routes/billing'));
app.use('/api', require('./routes/api'));                // dashboard (auth-gated inside) — generic /api catch-all, mount LAST
app.use('/webhooks', require('./routes/webhooks'));      // /webhooks/stripe
app.use('/internal/economics', require('./routes/unit-economics'));

// Telephony webhooks (Twilio hits these)
app.use('/voice', require('./routes/voice-relay'));

// Static assets + pages
app.use(express.static(PUBLIC));
const page = (file) => (req, res) => res.sendFile(path.join(PUBLIC, file));
// Bare app root → dashboard if logged in, else the branded marketing landing
// (so ringlypro-lite.onrender.com shows the RinglyPro Lite page, not a raw login).
const LANDING_URL = process.env.LITE_LANDING_URL || 'https://ringlypro.com/';
app.get('/', optionalAuth, (req, res) => res.redirect(req.user ? '/dashboard' : LANDING_URL));
app.get('/login', page('login.html'));
app.get('/signup', page('onboarding.html'));
app.get('/onboarding', page('onboarding.html'));
app.get('/dashboard', page('dashboard.html'));

// Debug error surface (parity with the verticals pattern)
app.get('/debug/lite-error', (req, res) => res.json({ service: 'ringlypro-lite', ok: true }));

module.exports = app;
