'use strict';

/**
 * AI RADAR — capture AI discoveries from the phone's share sheet. Mounted at /airadar.
 *
 * You are scrolling Instagram / Facebook / TikTok / X and something AI-shaped
 * goes by. Share it into AI Radar and it lands in an inbox with the company
 * name, the company website and a short description already drafted; you fix
 * whatever the draft got wrong and move on. Search, filter, rate and export the
 * whole log later.
 *
 * Login-only (no public signup). Multi-tenant: every item is scoped to
 * tenant_id (= the user's id). Installable PWA with a Web Share Target, plus a
 * token capture endpoint for iOS Shortcuts (iOS has no Web Share Target).
 * Emoji-free.
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const router = express.Router();

const { sequelize } = require('./models');
const { seedUsers } = require('./services/users');

const AUTH_SECRET = process.env.AIRADAR_JWT_SECRET || process.env.JWT_SECRET || 'airadar-2026-secret';
const publicDir = path.join(__dirname, '..', 'public');

// ── Body parsing (scoped to this router) ─────────────────────────────────────
router.use(express.json({ limit: '2mb' }));
router.use(express.urlencoded({ extended: true }));

// ── Auth gate ────────────────────────────────────────────────────────────────
function getCookie(req, name) {
  const h = req.headers.cookie || '';
  const m = h.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
const PUBLIC_EXACT = ['/login', '/health', '/favicon.svg', '/manifest.webmanifest', '/sw.js'];
const PUBLIC_ASSET = /\.(png|svg|webmanifest|css|js|woff2?|ico)$/i;

router.use((req, res, next) => {
  const token = getCookie(req, 'airadar_token');
  if (token) { try { req.user = jwt.verify(token, AUTH_SECRET); } catch (e) { /* invalid */ } }

  const p = req.path;
  if (PUBLIC_EXACT.includes(p) || PUBLIC_ASSET.test(p)) return next();
  if (p.startsWith('/api/v1/auth/login') || p.startsWith('/api/v1/auth/logout')) return next();
  if (p.startsWith('/api/v1/capture')) return next(); // token-authed inside the route
  if (p === '/s') return next();                      // one-tap save link, token in the query
  if (req.user) return next();

  if (p.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
  // Preserve where they were going (a share-target hit lands here when logged out).
  const next_ = encodeURIComponent(req.originalUrl || '/airadar/');
  return res.redirect('/airadar/login?next=' + next_);
});

// ── Login page ───────────────────────────────────────────────────────────────
router.get('/login', (req, res) => res.sendFile(path.join(publicDir, 'login.html')));

// ── Web Share Target ─────────────────────────────────────────────────────────
// The manifest points share_target here. SAVE IMMEDIATELY — no form, no wait.
// Sharing a post has to feel like sending it to yourself on WhatsApp: it is in
// the bucket before the page finishes loading, and the details fill themselves
// in afterwards. Only when there is no link at all do we open the add sheet.
const { saveLink } = require('./services/save');
const { User } = require('./models');

async function handleShare(req, res, src) {
  try {
    const url = String(src.url || '').slice(0, 4000);
    let text = String(src.text || '').slice(0, 4000);
    const title = String(src.title || '').slice(0, 500);

    // Android often puts the link inside `text` rather than `url`.
    let link = url;
    if (!link && text) {
      const m = text.match(/https?:\/\/\S+/);
      if (m) { link = m[0]; text = text.replace(m[0], '').trim(); }
    }
    if (!link) {
      const qs = new URLSearchParams({ share: '1', text: [title, text].filter(Boolean).join(' ') });
      return res.redirect('/airadar/?' + qs.toString());
    }

    const user = await User.findByPk(req.user.id);
    if (!user) return res.redirect('/airadar/login');

    const item = await saveLink({ user, url: link, text: [title, text].filter(Boolean).join(' ') });
    return res.redirect('/airadar/?saved=' + item.id);
  } catch (e) {
    console.error('AI Radar share error:', e.message);
    return res.redirect('/airadar/?share_error=1');
  }
}

router.get('/share', (req, res) => handleShare(req, res, req.query));
// Some platforms POST a share target even when the manifest declares GET.
router.post('/share', (req, res) => handleShare(req, res, req.body || {}));

// ── /s — the dumb-client save link ───────────────────────────────────────────
//   GET /airadar/s?k=<capture_token>&u=<the link, raw or encoded>
//
// Built for iOS Shortcuts. A shortcut running inside a share extension is
// sandboxed and its own network requests are unreliable (iOS -1005 "the network
// connection was lost"), but handing a plain URL to Safari via "Open URLs"
// always works. So: no POST, no JSON body, no request for the shortcut to make.
//
// `u` is read straight off the raw query string, so the shared link does NOT
// have to be URL-encoded — a share sheet hands over links with their own ? and
// & intact and this must not mangle them.
router.get('/s', async (req, res) => {
  try {
    const qs = String(req.originalUrl || '').split('?').slice(1).join('?');
    const m = qs.match(/(?:^|&)u=([\s\S]*)$/);        // everything after u= is the link
    let link = m ? m[1] : '';
    if (link && /%[0-9a-f]{2}/i.test(link) && !/^https?:\/\/[^%]*$/i.test(link)) {
      try { link = decodeURIComponent(link); } catch (e) { /* keep the raw form */ }
    }
    link = link.replace(/\+/g, ' ').trim();

    const key = String(req.query.k || '').trim();
    const user = key.length >= 20 ? await User.findOne({ where: { capture_token: key } }) : null;
    if (!user) return res.status(401).send(page('Not saved', 'That save link is not valid. Open Setup in AI Radar and copy the address again.', false));
    if (!/^https?:\/\//i.test(link)) return res.status(400).send(page('Not saved', 'No link came through from the share sheet.', false));

    const item = await saveLink({ user, url: link, text: String(req.query.t || '') });
    return res.send(page('Saved', link.replace(/^https?:\/\/(www\.)?/, ''), true, item.id));
  } catch (e) {
    console.error('AI Radar /s error:', e.message);
    return res.status(500).send(page('Not saved', e.message, false));
  }
});

// A deliberately tiny confirmation page: it exists only to flash "Saved" and
// get out of the way. No auth, no app shell, no network calls.
function page(title, detail, good, id) {
  const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)} — AI Radar</title>
<link rel="icon" href="/airadar/favicon.svg">
<style>
 :root{color-scheme:dark}
 body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:28px;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#070b14;color:#e8f1fa;text-align:center}
 .c{max-width:340px}
 .m{width:74px;height:74px;border-radius:50%;margin:0 auto 22px;display:flex;align-items:center;justify-content:center;
  font-size:34px;font-weight:300;background:${good ? 'rgba(77,240,208,.14)' : 'rgba(255,143,143,.12)'};
  border:2px solid ${good ? '#4df0d0' : '#ff8f8f'};color:${good ? '#4df0d0' : '#ff8f8f'}}
 h1{margin:0 0 10px;font-size:25px;letter-spacing:-.4px}
 p{margin:0 0 26px;color:#8496ad;font-size:14px;line-height:1.55;word-break:break-word}
 a{display:inline-block;padding:13px 22px;border-radius:12px;text-decoration:none;font-weight:600;
  background:linear-gradient(90deg,#4df0d0,#00a3c4);color:#03231f}
</style></head><body><div class="c">
 <div class="m">${good ? '&#10003;' : '!'}</div>
 <h1>${esc(title)}</h1>
 <p>${esc(detail)}</p>
 <a href="/airadar/${id ? '?item=' + id : ''}">Open AI Radar</a>
</div></body></html>`;
}

// ── API routes ───────────────────────────────────────────────────────────────
router.use('/api/v1/auth', require('./routes/auth'));
router.use('/health', require('./routes/health'));
router.use('/api/v1/capture', require('./routes/capture'));

const items = require('./routes/items');
router.use('/api/v1/items', items);
// Convenience alias so the UI can POST /api/v1/enrich for a save-nothing draft.
router.post('/api/v1/enrich', (req, res, next) => { req.url = '/enrich'; items.handle(req, res, next); });

// ── Static app (no build step — self-contained HTML) ─────────────────────────
router.use(express.static(publicDir));
router.get('/', (req, res) => res.sendFile(path.join(publicDir, 'app.html')));

// ── Init: sync tables + ensure columns + seed owner (non-blocking) ───────────
(async function initialize() {
  try {
    await sequelize.sync({ alter: false });
    console.log('  AI RADAR database tables synced (ar_*)');
    // sync({alter:false}) never adds columns to existing tables — ensure idempotently.
    try {
      await sequelize.query('ALTER TABLE ar_users ADD COLUMN IF NOT EXISTS tenant_id INTEGER');
      await sequelize.query('ALTER TABLE ar_users ADD COLUMN IF NOT EXISTS capture_token VARCHAR(255)');
      await sequelize.query("ALTER TABLE ar_users ADD COLUMN IF NOT EXISTS lang VARCHAR(12) DEFAULT 'en'");
      await sequelize.query('UPDATE ar_users SET tenant_id = id WHERE tenant_id IS NULL');
      await sequelize.query('ALTER TABLE ar_items ADD COLUMN IF NOT EXISTS shared_text TEXT');
      await sequelize.query('ALTER TABLE ar_items ADD COLUMN IF NOT EXISTS source_title TEXT');
      await sequelize.query('ALTER TABLE ar_items ADD COLUMN IF NOT EXISTS thumbnail_url TEXT');
      await sequelize.query('ALTER TABLE ar_items ADD COLUMN IF NOT EXISTS notes TEXT');
      await sequelize.query('ALTER TABLE ar_items ADD COLUMN IF NOT EXISTS rating INTEGER DEFAULT 0');
      await sequelize.query("ALTER TABLE ar_items ADD COLUMN IF NOT EXISTS enriched_by VARCHAR(32) DEFAULT 'manual'");
      await sequelize.query('ALTER TABLE ar_items ADD COLUMN IF NOT EXISTS is_simulated BOOLEAN DEFAULT false');
      await sequelize.query('ALTER TABLE ar_items ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT false');
      await sequelize.query("ALTER TABLE ar_items ADD COLUMN IF NOT EXISTS enrich_status VARCHAR(16) DEFAULT 'none'");
      await sequelize.query("ALTER TABLE ar_items ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb");
      await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS ar_users_capture_token_idx ON ar_users (capture_token)');
    } catch (mErr) {
      console.error('  AI RADAR column ensure error:', mErr.message);
    }
    try {
      const u = await seedUsers();
      console.log(`  AI RADAR accounts ensured (${u.total}, ${u.created} new)`);
    } catch (uErr) {
      console.error('  AI RADAR user seed error:', uErr.message);
    }
  } catch (err) {
    console.error('  AI RADAR DB sync error:', err.message);
  }
})();

module.exports = router;
