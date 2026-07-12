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

// Health
app.get('/health', (req, res) => res.json({ service: 'ringlypro-lite', ok: true, ts: new Date().toISOString() }));

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
app.use('/api', require('./routes/api'));                // dashboard (auth-gated inside)
app.use('/api/billing', require('./routes/billing'));
app.use('/webhooks', require('./routes/webhooks'));      // /webhooks/stripe
app.use('/internal/economics', require('./routes/unit-economics'));

// Telephony webhooks (Twilio hits these)
app.use('/voice', require('./routes/voice-relay'));

// Static assets + pages
app.use(express.static(PUBLIC));
const page = (file) => (req, res) => res.sendFile(path.join(PUBLIC, file));
app.get('/', optionalAuth, (req, res) => res.redirect(req.user ? '/dashboard' : '/login'));
app.get('/login', page('login.html'));
app.get('/signup', page('onboarding.html'));
app.get('/onboarding', page('onboarding.html'));
app.get('/dashboard', page('dashboard.html'));

// Debug error surface (parity with the verticals pattern)
app.get('/debug/lite-error', (req, res) => res.json({ service: 'ringlypro-lite', ok: true }));

module.exports = app;
