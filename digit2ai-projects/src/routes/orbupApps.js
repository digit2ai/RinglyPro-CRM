'use strict';

// =============================================================
// orbupApps — OrbUp App Builder (Lovable-style): build a REAL working
// single-file web app from natural language, edit it, and host it at a
// magic link. Credit-metered against orbup_users.
//
//   apiRouter (mounted at /api/v1/orbup):
//     POST /build            { email, prompt, name? }  -> builds an app (spends NEW_APP_COST)
//     POST /apps/:token/edit { email, instruction }    -> edits an app (spends EDIT_COST)
//     GET  /apps?email=                                 -> the user's apps
//     GET  /credits?email=                              -> balance + grant info
//
//   viewerRouter (mounted at /app, public):
//     GET  /:token           -> serves the live app HTML
// =============================================================

const express = require('express');
const crypto = require('crypto');
const { sequelize } = require('../models');
const generator = require('../services/orbupAppGenerator');

const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || 'https://aiagent.ringlypro.com').replace(/\/+$/, '');
const NEW_APP_COST = parseInt(process.env.ORBUP_APP_BUILD_CREDITS || '5', 10);
const EDIT_COST = parseInt(process.env.ORBUP_APP_EDIT_CREDITS || '1', 10);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DAILY_GRANT = 5;
const MONTHLY_CAP = 30;

function validEmail(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || '')); }
function todayStr() { return new Date().toISOString().slice(0, 10); }        // YYYY-MM-DD
function monthStr() { return new Date().toISOString().slice(0, 7); }         // YYYY-MM

// Grant up to DAILY_GRANT credits once per day, capped at MONTHLY_CAP per month.
// Returns the up-to-date user row (or null if the account doesn't exist).
async function ensureGrant(email) {
  const [rows] = await sequelize.query(
    'SELECT id, name, email, plan, credits, grant_day, grant_month, month_granted FROM orbup_users WHERE email = :email LIMIT 1',
    { replacements: { email } }
  );
  const u = rows && rows[0];
  if (!u) return null;
  const today = todayStr();
  const month = monthStr();
  if (u.grant_day === today) return u;   // already granted today

  let monthGranted = u.grant_month === month ? (u.month_granted || 0) : 0;
  const grant = Math.max(0, Math.min(DAILY_GRANT, MONTHLY_CAP - monthGranted));
  const newCredits = (u.credits || 0) + grant;
  monthGranted += grant;
  await sequelize.query(
    `UPDATE orbup_users SET credits = :c, grant_day = :d, grant_month = :m, month_granted = :mg, updated_at = NOW() WHERE email = :email`,
    { replacements: { c: newCredits, d: today, m: month, mg: monthGranted, email } }
  );
  if (grant > 0) {
    await sequelize.query(
      `INSERT INTO orbup_credit_txns (email, delta, reason, balance_after, created_at) VALUES (:email, :delta, 'daily_grant', :bal, NOW())`,
      { replacements: { email, delta: grant, bal: newCredits } }
    ).catch(() => {});
  }
  u.credits = newCredits; u.grant_day = today; u.grant_month = month; u.month_granted = monthGranted;
  return u;
}

async function spend(email, amount, reason) {
  const u = await ensureGrant(email);
  if (!u) return { ok: false, error: 'account_not_found' };
  if ((u.credits || 0) < amount) return { ok: false, error: 'insufficient_credits', credits: u.credits || 0, needed: amount };
  const bal = (u.credits || 0) - amount;
  await sequelize.query('UPDATE orbup_users SET credits = :c, updated_at = NOW() WHERE email = :email', { replacements: { c: bal, email } });
  await sequelize.query(
    `INSERT INTO orbup_credit_txns (email, delta, reason, balance_after, created_at) VALUES (:email, :delta, :reason, :bal, NOW())`,
    { replacements: { email, delta: -amount, reason: String(reason || 'spend').slice(0, 40), bal } }
  ).catch(() => {});
  return { ok: true, credits: bal };
}

// ------------------------------------------------------------------
const apiRouter = express.Router();

// Passwordless "return by email" login — matches an existing account so the
// user can get back into their workspace on a new device/browser. No secret is
// sent (free tier, no sensitive data); email is the workspace identity.
apiRouter.post('/login', async (req, res) => {
  try {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    if (!validEmail(email)) return res.status(400).json({ success: false, error: 'A valid email is required' });
    const [rows] = await sequelize.query('SELECT name, email, plan FROM orbup_users WHERE email = :email LIMIT 1', { replacements: { email } });
    const u = rows && rows[0];
    if (!u) return res.status(404).json({ success: false, error: 'account_not_found' });
    res.json({ success: true, name: u.name || '', email: u.email, plan: u.plan || 'free' });
  } catch (err) {
    console.error('[orbupApps] login error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/credits', async (req, res) => {
  try {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!validEmail(email)) return res.status(400).json({ success: false, error: 'A valid email is required' });
    const u = await ensureGrant(email);
    if (!u) return res.status(404).json({ success: false, error: 'account_not_found' });
    res.json({ success: true, credits: u.credits || 0, plan: u.plan || 'free', new_app_cost: NEW_APP_COST, edit_cost: EDIT_COST, daily_grant: DAILY_GRANT, monthly_cap: MONTHLY_CAP });
  } catch (err) {
    console.error('[orbupApps] credits error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/apps', async (req, res) => {
  try {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!validEmail(email)) return res.status(400).json({ success: false, error: 'A valid email is required' });
    const [rows] = await sequelize.query(
      `SELECT token, name, prompt, model, version, status, created_at, updated_at
         FROM orbup_apps WHERE lower(owner_email) = :email AND COALESCE(status,'ready') <> 'error'
         ORDER BY updated_at DESC LIMIT 60`,
      { replacements: { email } }
    );
    res.json({
      success: true,
      apps: (rows || []).map(a => ({
        token: a.token, name: a.name, prompt: a.prompt, version: a.version, status: a.status || 'ready',
        created_at: a.created_at, updated_at: a.updated_at,
        url: `${PUBLIC_BASE}/projects/app/${a.token}`
      }))
    });
  } catch (err) {
    console.error('[orbupApps] list error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Poll target for the async build/edit — the workspace hits this every few seconds.
apiRouter.get('/apps/:token/status', async (req, res) => {
  try {
    const token = req.params.token;
    if (!UUID_RE.test(String(token || ''))) return res.status(404).json({ success: false, error: 'not_found' });
    const [rows] = await sequelize.query('SELECT token, name, status, version, error FROM orbup_apps WHERE token = :token LIMIT 1', { replacements: { token } });
    const a = rows && rows[0];
    if (!a) return res.status(404).json({ success: false, error: 'not_found' });
    res.json({ success: true, status: a.status || 'ready', name: a.name, version: a.version, error: a.error || null, url: `${PUBLIC_BASE}/projects/app/${token}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/build', async (req, res) => {
  try {
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    const prompt = String(b.prompt || '').trim();
    if (!validEmail(email)) return res.status(400).json({ success: false, error: 'A valid email is required' });
    if (prompt.length < 12) return res.status(400).json({ success: false, error: 'Describe the app in a bit more detail.' });

    const paid = await spend(email, NEW_APP_COST, 'app_build');
    if (!paid.ok) {
      if (paid.error === 'account_not_found') return res.status(404).json({ success: false, error: 'account_not_found' });
      return res.status(402).json({ success: false, error: 'insufficient_credits', credits: paid.credits, needed: NEW_APP_COST });
    }

    // Generation of a rich app runs 60-120s — past the Cloudflare edge ceiling.
    // So we CREATE the app row as 'building', return immediately, and generate in
    // the background; the client polls GET /apps/:token/status.
    const token = crypto.randomUUID();
    const provisionalName = generator.titleFrom(prompt);
    await sequelize.query(
      `INSERT INTO orbup_apps (token, owner_email, name, prompt, code, model, version, status, created_at, updated_at)
       VALUES (:token, :email, :name, :prompt, NULL, NULL, 1, 'building', NOW(), NOW())`,
      { replacements: { token, email, name: provisionalName.slice(0, 120), prompt: prompt.slice(0, 2000) } }
    );
    res.json({ success: true, token, url: `${PUBLIC_BASE}/projects/app/${token}`, name: provisionalName, status: 'building', credits: paid.credits });

    // ---- background build (fire-and-forget) ----
    (async () => {
      async function refund() { await sequelize.query('UPDATE orbup_users SET credits = credits + :c WHERE email = :email', { replacements: { c: NEW_APP_COST, email } }).catch(() => {}); }
      try {
        const built = await generator.generate({ prompt, name: b.name });
        if (built.model === 'fallback' || built.truncated || !built.code || built.code.length < 400) {
          await refund();
          await sequelize.query("UPDATE orbup_apps SET status='error', error=:e, updated_at=NOW() WHERE token=:token",
            { replacements: { token, e: built.truncated ? 'too_big' : 'generation_failed' } }).catch(() => {});
          return;
        }
        await sequelize.query(
          "UPDATE orbup_apps SET code=:code, name=:name, model=:model, status='ready', updated_at=NOW() WHERE token=:token",
          { replacements: { token, code: built.code, name: String(built.title || provisionalName).slice(0, 120), model: built.model } }
        );
      } catch (e) {
        console.error('[orbupApps] background build failed:', e && e.message);
        await refund();
        await sequelize.query("UPDATE orbup_apps SET status='error', error=:e, updated_at=NOW() WHERE token=:token", { replacements: { token, e: String((e && e.message) || 'error').slice(0, 300) } }).catch(() => {});
      }
    })();
  } catch (err) {
    console.error('[orbupApps] build error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/apps/:token/edit', async (req, res) => {
  try {
    const token = req.params.token;
    if (!UUID_RE.test(String(token || ''))) return res.status(404).json({ success: false, error: 'not_found' });
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    const instruction = String(b.instruction || '').trim();
    if (!validEmail(email)) return res.status(400).json({ success: false, error: 'A valid email is required' });
    if (instruction.length < 3) return res.status(400).json({ success: false, error: 'Describe the change.' });

    const [rows] = await sequelize.query('SELECT token, owner_email, code, version FROM orbup_apps WHERE token = :token LIMIT 1', { replacements: { token } });
    const app = rows && rows[0];
    if (!app) return res.status(404).json({ success: false, error: 'not_found' });
    if (String(app.owner_email).toLowerCase() !== email) return res.status(403).json({ success: false, error: 'not_your_app' });

    const paid = await spend(email, EDIT_COST, 'app_edit');
    if (!paid.ok) {
      if (paid.error === 'account_not_found') return res.status(404).json({ success: false, error: 'account_not_found' });
      return res.status(402).json({ success: false, error: 'insufficient_credits', credits: paid.credits, needed: EDIT_COST });
    }

    // Background edit (keeps the old code live until the new one is ready).
    await sequelize.query("UPDATE orbup_apps SET status='building', updated_at=NOW() WHERE token=:token", { replacements: { token } }).catch(() => {});
    res.json({ success: true, token, url: `${PUBLIC_BASE}/projects/app/${token}`, status: 'building', credits: paid.credits });

    (async () => {
      async function refund() { await sequelize.query('UPDATE orbup_users SET credits = credits + :c WHERE email = :email', { replacements: { c: EDIT_COST, email } }).catch(() => {}); }
      try {
        const edited = await generator.edit({ code: app.code, instruction });
        if (!edited || !edited.code || edited.code.length < 400 || edited.model === 'fallback') {
          await refund();
          await sequelize.query("UPDATE orbup_apps SET status='ready', updated_at=NOW() WHERE token=:token", { replacements: { token } }).catch(() => {});
          return;
        }
        const version = (app.version || 1) + 1;
        await sequelize.query("UPDATE orbup_apps SET code=:code, model=:model, version=:v, status='ready', updated_at=NOW() WHERE token=:token",
          { replacements: { code: edited.code, model: edited.model, v: version, token } });
      } catch (e) {
        console.error('[orbupApps] background edit failed:', e && e.message);
        await refund();
        await sequelize.query("UPDATE orbup_apps SET status='ready', updated_at=NOW() WHERE token=:token", { replacements: { token } }).catch(() => {});
      }
    })();
  } catch (err) {
    console.error('[orbupApps] edit error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ------------------------------------------------------------------
// Public viewer — serves the live app. CSP blocks all external egress
// (connect-src 'none') so a generated app can't exfiltrate, while inline
// CSS/JS (the app itself) still runs.
const viewerRouter = express.Router();
viewerRouter.get('/:token', async (req, res) => {
  try {
    const token = req.params.token;
    if (!UUID_RE.test(String(token || ''))) return res.status(404).type('html').send('<h1 style="font-family:system-ui;padding:40px">App not found</h1>');
    const [rows] = await sequelize.query('SELECT code, status FROM orbup_apps WHERE token = :token LIMIT 1', { replacements: { token } });
    const app = rows && rows[0];
    if (!app) return res.status(404).type('html').send('<h1 style="font-family:system-ui;padding:40px">App not found</h1>');
    // Still generating (fresh build, no code yet) — auto-refreshing placeholder.
    if (!app.code) {
      const building = app.status === 'building';
      return res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${building ? '<meta http-equiv="refresh" content="4">' : ''}<title>${building ? 'Building your app…' : 'App unavailable'}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0f17;color:#e9eef7;font-family:-apple-system,system-ui,sans-serif;text-align:center;padding:24px}.b{max-width:420px}.s{width:48px;height:48px;border:4px solid #233149;border-top-color:#7c5cff;border-radius:50%;animation:sp 1s linear infinite;margin:0 auto 20px}@keyframes sp{to{transform:rotate(360deg)}}h1{font-size:20px;margin:0 0 8px}p{color:#8ea0bd;line-height:1.6;font-size:14px}</style></head>
<body><div class="b">${building ? '<div class="s"></div><h1>Building your app…</h1><p>Our AI is writing it now — this page refreshes automatically and opens the moment it’s ready (about a minute).</p>' : '<h1>This build didn’t finish</h1><p>Head back to your workspace and try a more focused description — you weren’t charged.</p>'}</div></body></html>`);
    }
    res.removeHeader('X-Frame-Options');
    // Allow everything the app needs offline (inline JS/CSS, data:/blob: assets,
    // canvas/svg) while blocking ALL network egress (connect-src 'none').
    res.setHeader('Content-Security-Policy', "default-src 'self' data: blob:; script-src 'unsafe-inline' 'self' blob:; style-src 'unsafe-inline' 'self'; img-src data: blob: 'self'; font-src data: 'self'; media-src data: blob: 'self'; connect-src 'none'; base-uri 'none'; form-action 'none';");
    res.type('html').send(app.code);
  } catch (err) {
    console.error('[orbupApps] viewer error:', err);
    res.status(500).type('html').send('<h1 style="font-family:system-ui;padding:40px">Could not load app</h1>');
  }
});

module.exports = { apiRouter, viewerRouter, ensureGrant, spend, NEW_APP_COST, EDIT_COST };
