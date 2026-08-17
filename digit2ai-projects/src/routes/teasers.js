'use strict';

// =============================================================
// teasers — one-click voice POC teasers for project requests.
//
//   adminRouter  (mounted under authenticateToken):
//     POST /teaser-admin/projects/:id/generate   -> AI-generate + store, returns share URL
//     GET  /teaser-admin/projects/:id/list        -> recent teasers for a project
//     GET  /teaser-admin/:token                    -> one teaser (for preview/regenerate)
//     POST /teaser-admin/:token/send               -> email | sms | whatsapp + ready links
//
//   publicRouter (mounted BEFORE auth at /teaser):
//     GET  /:token            -> full standalone teaser page (Lina voice orb + POC)
//     GET  /:token/segments   -> JSON narration (voice, lang, segments)
// =============================================================

const express = require('express');
const crypto = require('crypto');
const { sequelize, Project, Company } = require('../models');
const generator = require('../services/voiceTeaserGenerator');
const teaserSend = require('../services/teaserSend');
const appSimulator = require('./appSimulator'); // renderSimulatorPage — embedded in the teaser

const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || 'https://aiagent.ringlypro.com').replace(/\/+$/, '');

function teaserUrl(token) { return `${PUBLIC_BASE}/projects/teaser/${token}`; }

async function loadTeaser(token) {
  const [rows] = await sequelize.query(
    'SELECT * FROM d2_project_teasers WHERE token = :token LIMIT 1',
    { replacements: { token } }
  );
  return rows && rows[0] ? rows[0] : null;
}

function contentOf(row) {
  if (!row) return null;
  return typeof row.content_json === 'string' ? JSON.parse(row.content_json) : row.content_json;
}

function jsonOf(v, dflt) {
  if (v == null) return dflt;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch (_) { return dflt; } }
  return v;
}

// Real client IP behind Cloudflare (CF-Connecting-IP is set by CF and not forgeable
// like X-Forwarded-For). Used to rate-limit the public Copilot.
function clientIp(req) {
  return req.headers['cf-connecting-ip'] || (req.ip || '').replace(/^::ffff:/, '') || 'unknown';
}

// Per-token + per-IP + per-day caps for the public Plan Copilot chat. In-memory,
// self-evicting — hard ceiling on cost regardless of abuse.
const CHAT_TURN_CAP = parseInt(process.env.ORBUP_PLAN_CHAT_TURN_CAP || '40', 10);   // per token (session)
const CHAT_DAILY_CAP = parseInt(process.env.ORBUP_PLAN_CHAT_DAILY_CAP || '300', 10); // per IP/day
const _chatTurns = new Map();  // token -> count
const _chatDaily = new Map();  // ip -> { day, count }
function chatRateCheck(token, ip) {
  const turns = (_chatTurns.get(token) || 0) + 1;
  if (turns > CHAT_TURN_CAP) return { allowed: false, reason: 'session' };
  const day = Math.floor(Date.now() / 86400000);
  const d = _chatDaily.get(ip);
  const count = (d && d.day === day ? d.count : 0) + 1;
  if (count > CHAT_DAILY_CAP) return { allowed: false, reason: 'daily' };
  _chatTurns.set(token, turns);
  _chatDaily.set(ip, { day, count });
  if (_chatTurns.size > 5000) _chatTurns.clear();
  if (_chatDaily.size > 5000) { for (const [k, v] of _chatDaily) if (v.day !== day) _chatDaily.delete(k); }
  return { allowed: true };
}

// Build the fresh client-safe projection for a teaser's project (allowlisted).
async function basePlanFor(row, lang) {
  if (!row || !row.project_id) return null;
  const project = await Project.findByPk(row.project_id).catch(() => null);
  if (!project) return null;
  const { clientPlanFromTriage } = require('../services/clientPlanFromTriage');
  return { project, plan: clientPlanFromTriage(project.toJSON ? project.toJSON() : project, { lang }) };
}

// =====================================================
// ADMIN ROUTER
// =====================================================
const adminRouter = express.Router();
adminRouter.use(express.json({ limit: '2mb' }));

adminRouter.post('/projects/:id/generate', async (req, res) => {
  try {
    const project = await Project.findByPk(req.params.id);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    let company_name = '';
    if (project.company_id && Company) {
      const c = await Company.findByPk(project.company_id).catch(() => null);
      company_name = c ? c.name : '';
    }
    const projObj = { ...project.toJSON(), company_name };

    const teaser = await generator.generate(projObj, { lang: req.body && req.body.lang });
    const token = crypto.randomUUID();
    await sequelize.query(
      `INSERT INTO d2_project_teasers (workspace_id, project_id, token, title, lang, voice, content_json, status, model, created_at, updated_at)
       VALUES (:workspace_id, :project_id, :token, :title, :lang, :voice, CAST(:content AS JSONB), 'ready', :model, NOW(), NOW())`,
      { replacements: {
        workspace_id: project.workspace_id || 1,
        project_id: project.id,
        token,
        title: teaser.title,
        lang: teaser.lang,
        voice: teaser.voice,
        content: JSON.stringify(teaser),
        model: teaser.model
      } }
    );
    res.json({ success: true, token, url: teaserUrl(token), teaser });
  } catch (err) {
    console.error('[teasers] generate failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Regenerate a teaser IN PLACE — same token/URL, fresh content. Lets an
// already-sent magic link be refreshed (e.g. apply new copy rules) without
// breaking the link the client already has.
adminRouter.post('/:token/regenerate', async (req, res) => {
  try {
    const row = await loadTeaser(req.params.token);
    if (!row) return res.status(404).json({ success: false, error: 'Teaser not found' });
    const project = await Project.findByPk(row.project_id);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    let company_name = '';
    if (project.company_id && Company) {
      const c = await Company.findByPk(project.company_id).catch(() => null);
      company_name = c ? c.name : '';
    }
    const projObj = { ...project.toJSON(), company_name };
    const lang = (req.body && req.body.lang) || row.lang;
    const teaser = await generator.generate(projObj, { lang });

    await sequelize.query(
      `UPDATE d2_project_teasers
         SET title = :title, lang = :lang, voice = :voice, content_json = CAST(:content AS JSONB),
             model = :model, status = 'ready', updated_at = NOW()
       WHERE token = :token`,
      { replacements: {
        token: row.token, title: teaser.title, lang: teaser.lang, voice: teaser.voice,
        content: JSON.stringify(teaser), model: teaser.model
      } }
    );
    res.json({ success: true, token: row.token, url: teaserUrl(row.token), teaser });
  } catch (err) {
    console.error('[teasers] regenerate failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

adminRouter.get('/projects/:id/list', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT token, title, lang, status, created_at FROM d2_project_teasers
       WHERE project_id = :pid ORDER BY created_at DESC LIMIT 20`,
      { replacements: { pid: req.params.id } }
    );
    res.json({ success: true, data: rows.map(r => ({ ...r, url: teaserUrl(r.token) })) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

adminRouter.get('/:token', async (req, res) => {
  try {
    const row = await loadTeaser(req.params.token);
    if (!row) return res.status(404).json({ success: false, error: 'Teaser not found' });
    res.json({ success: true, token: row.token, url: teaserUrl(row.token), teaser: contentOf(row) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

adminRouter.post('/:token/send', async (req, res) => {
  try {
    const row = await loadTeaser(req.params.token);
    if (!row) return res.status(404).json({ success: false, error: 'Teaser not found' });
    const { channel, to } = req.body || {};
    if (!['email', 'sms', 'whatsapp'].includes(channel)) {
      return res.status(400).json({ success: false, error: 'channel must be email | sms | whatsapp' });
    }
    const teaser = contentOf(row);
    const result = await teaserSend.send({ channel, to, teaser, url: teaserUrl(row.token), lang: row.lang });
    res.json({ success: true, result });
  } catch (err) {
    console.error('[teasers] send failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// PUBLIC ROUTER
// =====================================================
const publicRouter = express.Router();

publicRouter.get('/:token/segments', async (req, res) => {
  try {
    const row = await loadTeaser(req.params.token);
    if (!row) return res.status(404).json({ error: 'not found' });
    const t = contentOf(row);
    res.json({ voice: t.voice, lang: t.lang, segments: t.segments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Interactive app-mockup simulator carried by THIS teaser. Rendered as a
// standalone page in "embed" mode so the teaser can iframe it inline. Keeps the
// whole experience (voice + clickable app) under a single teaser magic link.
publicRouter.get('/:token/simulator', async (req, res) => {
  try {
    const row = await loadTeaser(req.params.token);
    if (!row) return res.status(404).type('html').send('<h1>Not found</h1>');
    const t = contentOf(row);
    if (!t || !t.simulator) {
      return res.status(404).type('html').send('<h1 style="font-family:system-ui;padding:24px;color:#888">No simulator for this teaser.</h1>');
    }
    res.type('html').send(appSimulator.renderSimulatorPage(t.simulator, {
      token: row.token,
      projectId: row.project_id,
      embed: req.query.embed === '1'
    }));
  } catch (err) {
    console.error('[teasers] simulator viewer failed:', err);
    res.status(500).type('html').send('<h1>Error</h1>');
  }
});

// The client-safe Feasibility & Build Plan for THIS teaser. Token-scoped
// (IDOR-safe). Returns the ALLOWLISTED projection only — never the raw triage,
// monetization, or verdict. Polled by the Studio page while triage runs.
//   { status: 'pending' | 'ready' | 'unavailable', plan? }
publicRouter.get('/:token/plan', async (req, res) => {
  try {
    const row = await loadTeaser(req.params.token);
    if (!row || !row.project_id) return res.status(404).json({ status: 'unavailable' });
    const t = contentOf(row);
    const lang = (req.query.lang || (t && t.lang) || 'en');
    const { findLeaks } = require('../services/clientPlanFromTriage');

    // Prefer the prospect's Copilot-refined working plan; else the fresh projection.
    const working = jsonOf(row.client_plan_json, null);
    let plan = working;
    if (!plan) {
      const base = await basePlanFor(row, lang);
      if (!base) return res.json({ status: 'unavailable' });
      if (!base.plan) return res.json({ status: 'pending' }); // triage not done yet
      plan = base.plan;
    }

    // Defence in depth: never ship a plan that carries an internal marker.
    const leaks = findLeaks(plan);
    if (leaks.length) {
      console.error('[teasers] PLAN LEAK BLOCKED for token %s: %j', row.token, leaks);
      return res.json({ status: 'unavailable' });
    }
    return res.json({ status: 'ready', plan, refined: !!working });
  } catch (err) {
    console.error('[teasers] plan projection failed:', err.message);
    res.status(500).json({ status: 'unavailable', error: 'plan_error' });
  }
});

// Plan Copilot — the prospect chats with their plan and refines it before booking.
// Token-scoped, rate-limited, cost-capped. Context = client-safe plan + the
// prospect's own request ONLY, so it structurally cannot leak internal analysis.
//   body: { message, history? }  ->  { mode, reply, plan?, diff?, refined }
publicRouter.post('/:token/plan/chat', async (req, res) => {
  try {
    if (process.env.ORBUP_PLAN_CHAT === '0') return res.status(403).json({ error: 'disabled' });
    const row = await loadTeaser(req.params.token);
    if (!row || !row.project_id) return res.status(404).json({ error: 'not found' });

    const ip = clientIp(req);
    const rl = chatRateCheck(row.token, ip);
    if (!rl.allowed) {
      const es = (row.lang === 'es');
      return res.status(429).json({ error: rl.reason === 'daily'
        ? (es ? 'Has alcanzado el límite diario. Vuelve mañana o agenda una llamada.' : 'You\'ve hit today\'s limit. Come back tomorrow or book a call.')
        : (es ? 'Esta sesión llegó a su límite. Agenda una llamada para continuar.' : 'This session reached its limit. Book a call to keep going.') });
    }

    const b = req.body || {};
    const lang = (b.lang || row.lang || 'en');
    const base = await basePlanFor(row, lang);
    if (!base || !base.plan) return res.status(409).json({ error: 'plan_not_ready' });

    // Current working plan = refined version if any, else the fresh projection.
    const current = jsonOf(row.client_plan_json, null) || base.plan;
    const project = base.project.toJSON ? base.project.toJSON() : base.project;
    const request = {
      description: project.description, target_users: project.target_users,
      current_process: project.current_process, timeline: project.timeline
    };

    const copilot = require('../services/planCopilot');
    const out = await copilot.chat({ plan: current, request, message: b.message, history: Array.isArray(b.history) ? b.history : [], lang });

    // Log the turn (capped) regardless of mode.
    const chatLog = jsonOf(row.client_plan_chat, []);
    chatLog.push({ role: 'user', text: String(b.message || '').slice(0, 1000) });
    if (out.reply) chatLog.push({ role: 'assistant', text: out.reply, mode: out.mode });
    const trimmedChat = chatLog.slice(-60);

    if (out.mode === 'edit' && out.plan) {
      const { findLeaks } = require('../services/clientPlanFromTriage');
      if (findLeaks(out.plan).length) return res.json({ mode: 'answer', reply: out.reply, refined: !!row.client_plan_json });
      const versions = jsonOf(row.client_plan_versions, []);
      versions.push(current); // push the pre-edit plan for undo
      await sequelize.query(
        `UPDATE d2_project_teasers SET client_plan_json = CAST(:plan AS JSONB),
           client_plan_versions = CAST(:versions AS JSONB), client_plan_chat = CAST(:chat AS JSONB),
           client_plan_at = NOW(), updated_at = NOW() WHERE token = :token`,
        { replacements: { token: row.token, plan: JSON.stringify(out.plan), versions: JSON.stringify(versions.slice(-20)), chat: JSON.stringify(trimmedChat) } }
      );
      return res.json({ mode: 'edit', reply: out.reply, plan: out.plan, diff: out.diff, refined: true, is_simulated: out.is_simulated });
    }

    // answer / clarify — persist only the transcript.
    await sequelize.query(
      `UPDATE d2_project_teasers SET client_plan_chat = CAST(:chat AS JSONB), updated_at = NOW() WHERE token = :token`,
      { replacements: { token: row.token, chat: JSON.stringify(trimmedChat) } }
    );
    return res.json({ mode: out.mode, reply: out.reply, refined: !!row.client_plan_json, is_simulated: out.is_simulated });
  } catch (err) {
    console.error('[teasers] plan chat failed:', err.message);
    res.status(500).json({ error: 'chat_error' });
  }
});

// Undo the last edit / reset to the original projection.
//   body: { action: 'undo' | 'reset' }  ->  { plan, refined }
publicRouter.post('/:token/plan/version', async (req, res) => {
  try {
    const row = await loadTeaser(req.params.token);
    if (!row || !row.project_id) return res.status(404).json({ error: 'not found' });
    const action = (req.body && req.body.action) || 'undo';
    const lang = (row.lang || 'en');

    if (action === 'reset') {
      await sequelize.query(
        `UPDATE d2_project_teasers SET client_plan_json = NULL, client_plan_versions = '[]', client_plan_at = NOW(), updated_at = NOW() WHERE token = :token`,
        { replacements: { token: row.token } }
      );
      const base = await basePlanFor(row, lang);
      return res.json({ plan: base && base.plan, refined: false });
    }

    // undo: pop the last saved version back into place.
    const versions = jsonOf(row.client_plan_versions, []);
    const prev = versions.pop();
    if (!prev) {
      await sequelize.query(`UPDATE d2_project_teasers SET client_plan_json = NULL, client_plan_versions = '[]' WHERE token = :token`, { replacements: { token: row.token } });
      const base = await basePlanFor(row, lang);
      return res.json({ plan: base && base.plan, refined: false });
    }
    const stillRefined = versions.length > 0;
    await sequelize.query(
      `UPDATE d2_project_teasers SET client_plan_json = CAST(:plan AS JSONB), client_plan_versions = CAST(:versions AS JSONB), updated_at = NOW() WHERE token = :token`,
      { replacements: { token: row.token, plan: JSON.stringify(prev), versions: JSON.stringify(versions) } }
    );
    return res.json({ plan: prev, refined: stillRefined || true });
  } catch (err) {
    console.error('[teasers] plan version failed:', err.message);
    res.status(500).json({ error: 'version_error' });
  }
});

publicRouter.get('/:token', async (req, res) => {
  try {
    const row = await loadTeaser(req.params.token);
    if (!row) return res.status(404).type('html').send('<h1>Teaser not found</h1>');
    // Never let the browser cache the teaser HTML — the plan + Copilot evolve, and
    // a stale cached page hides new features (e.g. the chat) from a returning visitor.
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.type('html').send(renderTeaserPage(contentOf(row), { projectId: row.project_id, token: row.token }));
  } catch (err) {
    console.error('[teasers] viewer failed:', err);
    res.status(500).type('html').send('<h1>Error</h1><pre>' + esc(err.message) + '</pre>');
  }
});

// =====================================================
// HTML RENDER
// =====================================================
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderTeaserPage(t, meta = {}) {
  const es = t.lang === 'es';
  const projectId = meta.projectId || '';
  const token = meta.token || '';
  // The teaser carries a clickable app-mockup simulator (generated alongside it).
  // When present, the POC section embeds the LIVE, navigable simulator via iframe
  // so the client can try their product; otherwise it falls back to the static mock.
  const hasSim = !!(t.simulator && token);
  const simHeight = hasSim && t.simulator.platform === 'web' ? 720 : 812;
  const segs = JSON.stringify(t.segments || []);
  // Brand default: the teaser voice is always México (Dalia) = Lina, regardless of
  // the teaser's narration language. The listener can switch via the accent picker.
  const voice = t.voice || 'lina';
  const ui = es
    ? { play: '▶ Que Lina lo explique todo', pause: '❚❚ Pausar', stop: '■ Detener', idle: 'Pulsa el botón para que Lina te lo explique.', neural: 'Voz neural HD', accent: 'Acento', role: 'Tu adelanto, narrado por la voz de IA de Digit2AI', poweredBy: 'Generado por el AI Architect de Digit2AI', cta: 'Hablar con el equipo' }
    : { play: '▶ Let Lina explain it all', pause: '❚❚ Pause', stop: '■ Stop', idle: 'Tap the button and let Lina walk you through it.', neural: 'HD neural voice', accent: 'Accent', role: 'Your teaser, narrated by the Digit2AI AI voice', poweredBy: 'Generated by the Digit2AI AI Architect', cta: 'Talk to the team' };

  const section = (id, heading, inner) => `
    <section id="${id}" class="sec">
      <h2>${esc(heading)}</h2>
      ${inner}
    </section>`;

  const bullets = (arr) => arr && arr.length ? `<ul class="bullets">${arr.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : '';
  const phases = (arr) => arr && arr.length ? `<div class="phases">${arr.map(p => `<div class="phase"><div class="phase-name">${esc(p.name)}</div><div class="phase-detail">${esc(p.detail)}</div></div>`).join('')}</div>` : '';

  // body_html fields come from the generator already-sanitized via normalize(); re-sanitize defensively.
  const safe = (html) => generator.sanitizePocHtml(html || '');

  const ctaEmail = 'mstagg@digit2ai.com';
  const ctaSubject = encodeURIComponent((es ? 'Adelanto: ' : 'Teaser: ') + (t.title || ''));

  return `<!DOCTYPE html>
<html lang="${es ? 'es' : 'en'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(t.title)} — Digit2AI</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#070b16;--bg2:#0b1224;--card:#101a32;--line:rgba(255,255,255,.08);--txt:#e6eefc;--mut:#8aa0c6;--cyan:#22d3ee;--violet:#7c5cff}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:radial-gradient(1200px 600px at 50% -10%,#16224a,var(--bg));color:var(--txt);line-height:1.7}
.wrap{max-width:880px;margin:0 auto;padding:40px 22px 80px}
.brand{font-size:12px;letter-spacing:4px;text-transform:uppercase;color:var(--violet);font-weight:800}
.hero{padding:18px 0 10px}
.hero h1{font-size:clamp(2rem,5vw,3.2rem);font-weight:800;line-height:1.1;margin:10px 0 8px;background:linear-gradient(135deg,#fff,#9bc7ff);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.hero .tag{color:var(--cyan);font-size:1.05rem;font-weight:600}
.hero .sub{color:var(--mut);margin-top:10px;font-size:1.05rem;max-width:640px}
/* Lina orb */
.lina{margin:30px 0;background:linear-gradient(180deg,var(--card),var(--bg2));border:1px solid var(--line);border-radius:20px;padding:24px;display:flex;gap:20px;align-items:center;box-shadow:0 20px 60px rgba(0,0,0,.45)}
.orb{position:relative;width:88px;height:88px;flex:0 0 88px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#bda4ff,#6a4bff 45%,#2a1f6b 100%);box-shadow:0 0 0 0 rgba(155,123,255,.5)}
.orb::after{content:"";position:absolute;inset:-8px;border-radius:50%;border:2px solid rgba(155,123,255,.35)}
.orb.speaking{animation:pulse 1.2s ease-in-out infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(155,123,255,.45)}70%{box-shadow:0 0 0 22px rgba(155,123,255,0)}100%{box-shadow:0 0 0 0 rgba(155,123,255,0)}}
.lina-meta{flex:1;min-width:0}
.lina-name{font-weight:700;font-size:17px}
.lina-role{color:var(--mut);font-size:13px;margin-bottom:12px}
.controls{display:flex;gap:10px;flex-wrap:wrap}
button{font:inherit;cursor:pointer;border-radius:9px;padding:9px 15px;font-size:13px;font-weight:600;border:1px solid var(--line);background:rgba(255,255,255,.06);color:#dbe6ff}
button.primary{background:linear-gradient(135deg,var(--cyan),var(--violet));color:#06122b;border:none;font-weight:700}
button:disabled{opacity:.45;cursor:default}
.status{font-size:12.5px;color:var(--mut);margin-top:11px;min-height:18px}
.voicepick{margin-top:11px;font-size:12.5px;color:var(--mut);display:flex;align-items:center;flex-wrap:wrap;gap:4px}
.voicepick select{font:inherit;background:#16203a;color:var(--txt);border:1px solid var(--line);border-radius:8px;padding:5px 8px;margin-left:6px}
.voicemode{margin-left:8px;color:#7cf2c0}
.sec{margin:34px 0;padding:24px;background:rgba(255,255,255,.025);border:1px solid var(--line);border-radius:16px;scroll-margin-top:20px}
.sec.active{border-color:rgba(124,92,255,.55);box-shadow:0 0 0 1px rgba(124,92,255,.25)}
.sec h2{font-size:1.45rem;margin-bottom:12px}
.sec p{color:#cdd9f2;margin:0 0 10px}
.bullets{list-style:none;display:grid;gap:8px;margin-top:6px}
.bullets li{padding-left:26px;position:relative;color:#cdd9f2}
.bullets li::before{content:"";position:absolute;left:0;top:9px;width:12px;height:12px;border-radius:3px;background:linear-gradient(135deg,var(--cyan),var(--violet))}
.poc-intro{color:var(--mut);font-size:13.5px;margin-bottom:14px}
.poc-frame{background:#0a122a;border:1px solid var(--line);border-radius:14px;padding:18px;overflow-x:auto}
.poc-frame *{max-width:100%}
.sim-badge{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.3px;color:#7cf2c0;background:rgba(124,242,192,.08);border:1px solid rgba(124,242,192,.25);border-radius:999px;padding:6px 13px;margin-bottom:14px}
.sim-badge::before{content:"";width:8px;height:8px;border-radius:50%;background:#7cf2c0;box-shadow:0 0 10px #7cf2c0;animation:pulse 1.4s infinite}
.sim-embed{background:#0a122a;border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4)}
.sim-open{margin-top:12px;text-align:center;font-size:13px}
.sim-open a{color:var(--cyan);text-decoration:none;font-weight:600}
.sim-open a:hover{text-decoration:underline}
.phases{display:grid;gap:12px;margin-top:8px}
.phase{background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.phase-name{font-weight:700;color:#cfe0ff}
.phase-detail{color:var(--mut);font-size:13.5px}
.cta{margin-top:34px;text-align:center;padding:34px 24px;background:linear-gradient(135deg,rgba(34,211,238,.12),rgba(124,92,255,.12));border:1px solid var(--line);border-radius:18px}
.cta h2{font-size:1.6rem;margin-bottom:8px}
.cta p{color:var(--mut);max-width:520px;margin:0 auto 18px}
.cta a{display:inline-block;background:linear-gradient(135deg,var(--cyan),var(--violet));color:#06122b;font-weight:700;text-decoration:none;padding:14px 30px;border-radius:10px}
.cta button.ts-cta-btn{display:inline-block;background:linear-gradient(135deg,var(--cyan),var(--violet));color:#06122b;font-weight:700;border:none;cursor:pointer;padding:14px 30px;border-radius:10px;font-size:1rem;font-family:inherit}
.ts-modal{display:none;position:fixed;inset:0;z-index:9999;align-items:center;justify-content:center;padding:20px}
.ts-modal-bd{position:absolute;inset:0;background:rgba(3,6,14,.78);backdrop-filter:blur(3px)}
.ts-modal-box{position:relative;z-index:1;width:100%;max-width:440px;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:26px 24px;box-shadow:0 30px 80px rgba(0,0,0,.6)}
.ts-modal-x{position:absolute;top:12px;right:15px;font-size:24px;line-height:1;color:var(--mut);background:none;border:none;cursor:pointer}
.ts-modal-title{font-size:1.3rem;font-weight:800}
.ts-modal-sub{color:var(--mut);font-size:.92rem;margin-top:6px}
.ts-slots{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:18px 0}
.ts-slots-load{grid-column:1/-1;color:var(--mut);font-size:.9rem;padding:10px 0}
.ts-slot{display:flex;flex-direction:column;gap:2px;background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:11px;padding:11px 12px;color:var(--txt);font-family:inherit;text-align:left;cursor:pointer}
.ts-slot:hover{border-color:var(--violet)}
.ts-slot.sel{border-color:var(--violet);background:rgba(124,92,255,.18)}
.ts-slot .d{font-weight:700;font-size:.85rem}
.ts-slot .t{color:var(--mut);font-size:.8rem}
.ts-modal-go{width:100%;margin-top:6px;background:linear-gradient(135deg,var(--cyan),var(--violet));color:#06122b;font-weight:700;border:none;cursor:pointer;padding:13px;border-radius:10px;font-size:1rem;font-family:inherit}
.ts-modal-go:disabled{opacity:.5;cursor:not-allowed}
.ts-modal-status{text-align:center;color:#fca5a5;font-size:.85rem;margin-top:10px;min-height:14px}
.ts-fields{display:flex;flex-direction:column;gap:9px;margin:2px 0 14px}
.ts-fld-lbl{font-size:.78rem;color:var(--mut);margin-bottom:-3px}
.ts-inp{width:100%;background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:10px;padding:11px 12px;color:var(--txt);font-family:inherit;font-size:.95rem}
.ts-inp:focus{outline:none;border-color:var(--violet)}
.ts-inp::placeholder{color:#5f7197}
.ts-phone{display:flex;gap:8px}
.ts-cc{flex:0 0 auto;max-width:140px;background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:10px;padding:11px 8px;color:var(--txt);font-family:inherit;font-size:.9rem}
.ts-phone .ts-inp{flex:1 1 auto}
.ts-pick-lbl{font-size:.78rem;color:var(--mut);margin:2px 0 -6px}
.ts-done{text-align:center;padding:14px 6px 6px}
.ts-done-check{width:64px;height:64px;border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:32px;color:#34d399;background:rgba(52,211,153,.14);border:1px solid rgba(52,211,153,.4)}
.ts-done-t{font-size:1.05rem;font-weight:700;color:#eafff5;line-height:1.45}
.ts-done-s{font-size:.86rem;color:var(--mut);margin-top:10px}
@media(max-width:480px){.ts-slots{grid-template-columns:1fr}}
.foot{margin-top:34px;text-align:center;color:#5f7197;font-size:12px}
@media(max-width:560px){.lina{flex-direction:column;text-align:center}.controls{justify-content:center}.voicepick{justify-content:center}}
/* Feasibility & Build Plan (real triage projection) */
.d2plan-load{color:var(--mut);font-size:.95rem;display:flex;align-items:center;gap:10px;padding:6px 0}
.d2plan-spin{width:15px;height:15px;border:2px solid rgba(124,92,255,.3);border-top-color:var(--violet);border-radius:50%;display:inline-block;animation:d2spin .8s linear infinite;flex:0 0 auto}
@keyframes d2spin{to{transform:rotate(360deg)}}
.d2feas{display:flex;align-items:center;gap:16px;margin:4px 0 20px;flex-wrap:wrap}
.d2feas-score{font-size:2.4rem;font-weight:800;line-height:1;background:linear-gradient(135deg,#34d399,#22d3ee);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.d2feas-score span{font-size:1rem;color:var(--mut);-webkit-text-fill-color:var(--mut)}
.d2feas-meta{flex:1 1 200px;min-width:180px}
.d2feas-label{font-weight:700;font-size:1.05rem}
.d2feas-bar{height:7px;border-radius:4px;background:rgba(255,255,255,.08);margin-top:8px;overflow:hidden}
.d2feas-fill{height:100%;border-radius:4px;background:linear-gradient(90deg,#34d399,#22d3ee)}
.d2plan-block{margin:18px 0}
.d2plan-block h3{font-size:.82rem;letter-spacing:1.5px;text-transform:uppercase;color:var(--cyan);font-weight:700;margin-bottom:8px}
.d2plan-block p{color:var(--txt);opacity:.94}
.d2plan-list{list-style:none;display:flex;flex-direction:column;gap:9px}
.d2plan-list li{background:rgba(255,255,255,.03);border:1px solid var(--line);border-radius:11px;padding:11px 14px;color:var(--txt)}
.d2plan-list li .rk{font-weight:600}
.d2plan-list li .dt{display:block;color:var(--mut);font-size:.9rem;margin-top:3px}
.d2plan-note{margin:22px 0 6px;padding:16px 18px;border-radius:14px;background:linear-gradient(135deg,rgba(52,211,153,.10),rgba(34,211,238,.08));border:1px solid var(--line);color:var(--txt)}
.d2plan-cta{margin-top:14px}
.d2plan-cta button{background:linear-gradient(135deg,var(--cyan),var(--violet));color:#06122b;font-weight:700;border:none;cursor:pointer;padding:13px 28px;border-radius:10px;font-size:1rem;font-family:inherit}
.d2plan-disc{color:#5f7197;font-size:12px;margin-top:16px;font-style:italic}
.d2plan-timeline{display:inline-flex;align-items:center;gap:8px;background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.25);border-radius:10px;padding:8px 14px;font-weight:600}
.d2plan-timeline b{font-size:1.25rem;color:var(--cyan)}
.d2flash{animation:d2flash 1s ease}
@keyframes d2flash{0%{background:rgba(124,92,255,.14)}100%{background:transparent}}
/* Plan Copilot chat */
.d2chat{margin-top:26px;border:1px solid var(--line);border-radius:18px;background:linear-gradient(180deg,var(--card),var(--bg2));overflow:hidden}
.d2chat-h{padding:14px 18px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px}
.d2chat-orb{width:26px;height:26px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#bda4ff,#6a4bff 45%,#2a1f6b 100%);flex:0 0 auto}
.d2chat-h .tt{font-weight:700}.d2chat-h .ss{color:var(--mut);font-size:12.5px}
.d2chat-log{max-height:340px;overflow-y:auto;padding:16px 18px;display:flex;flex-direction:column;gap:12px}
.d2msg{max-width:88%;padding:10px 13px;border-radius:13px;font-size:14.5px;line-height:1.5}
.d2msg.u{align-self:flex-end;background:linear-gradient(135deg,rgba(34,211,238,.16),rgba(124,92,255,.16));border:1px solid var(--line)}
.d2msg.a{align-self:flex-start;background:rgba(255,255,255,.04);border:1px solid var(--line)}
.d2msg.d{align-self:center;background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.35);color:#c7f9e5;font-size:13px;text-align:center}
.d2chat-suggest{display:flex;gap:8px;flex-wrap:wrap;padding:0 18px 12px}
.d2chip{background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:20px;padding:7px 13px;color:var(--txt);font:inherit;font-size:13px;cursor:pointer}
.d2chip:hover{border-color:var(--violet)}
.d2chat-in{display:flex;gap:9px;padding:12px 14px;border-top:1px solid var(--line)}
.d2chat-in input{flex:1;background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:11px;padding:12px 14px;color:var(--txt);font:inherit;font-size:14.5px;outline:none}
.d2chat-in input:focus{border-color:var(--violet)}
.d2chat-in button{background:linear-gradient(135deg,var(--cyan),var(--violet));color:#06122b;font-weight:700;border:none;cursor:pointer;padding:0 20px;border-radius:11px;font:inherit}
.d2chat-in button:disabled{opacity:.5;cursor:not-allowed}
.d2chat-ctl{padding:0 18px 12px;font-size:12.5px;color:var(--mut)}
.d2chat-ctl a{color:var(--cyan);text-decoration:none;cursor:pointer;margin-right:14px}
.d2chat-typing{color:var(--mut);font-size:13px;font-style:italic}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand">Digit2AI</div>

  <div class="hero" id="top">
    <h1>${esc(t.hero.headline)}</h1>
    <div class="tag">${esc(t.tagline)}</div>
    <div class="sub">${esc(t.hero.subhead)}</div>
  </div>

  <!-- Lina voice orb -->
  <div class="lina" id="lina">
    <div class="orb" id="orb"></div>
    <div class="lina-meta">
      <div class="lina-name">Lina · Digit2AI</div>
      <div class="lina-role">${ui.role}</div>
      <div class="controls">
        <button class="primary" id="playAll">${ui.play}</button>
        <button id="pause" disabled>${ui.pause}</button>
        <button id="stop" disabled>${ui.stop}</button>
      </div>
      <div class="status" id="status">${ui.idle}</div>
      <div class="voicepick">
        <label><input type="checkbox" id="neuralToggle" checked> ${ui.neural}</label>
        <span class="voicemode" id="voiceMode"></span>
        &nbsp;·&nbsp; ${ui.accent}:
        <select id="voiceSel">
          <option value="lina" selected>México (Dalia)</option>
          <option value="paloma">EE. UU. (Paloma)</option>
          <option value="salome">Colombia (Salomé)</option>
          <option value="elvira">España (Elvira)</option>
          <option value="ava">${es ? 'Inglés (Ava)' : 'English (Ava)'}</option>
        </select>
      </div>
    </div>
  </div>

  ${section('challenge', t.challenge.heading, safe(t.challenge.body_html))}
  ${section('solution', t.solution.heading, safe(t.solution.body_html))}
  ${token ? `<section id="d2plan" class="sec">
    <h2>${es ? 'Plan de factibilidad y construcción' : 'Feasibility &amp; Build Plan'}</h2>
    <div id="d2plan-body">
      <div class="d2plan-load"><span class="d2plan-spin"></span>${es ? 'Nuestra IA está evaluando tu proyecto — encaje, alcance y riesgos. Unos segundos…' : 'Our AI is assessing your project — fit, scope and risks. A few seconds…'}</div>
    </div>
  </section>` : ''}
  ${section('poc', t.poc.heading,
    hasSim
      ? `<div class="poc-intro">${esc(t.poc.intro)}</div>
         <div class="sim-badge">${es ? 'Simulador interactivo — toca los botones y navega tu app' : 'Interactive simulator — tap the buttons and navigate your app'}</div>
         <div class="sim-embed">
           <iframe src="/projects/teaser/${esc(token)}/simulator?embed=1" title="${esc(t.simulator.app_name || 'App simulator')}" loading="lazy" style="width:100%;height:${simHeight}px;border:0;display:block" allow="clipboard-write"></iframe>
         </div>
         <div class="sim-open"><a href="/projects/teaser/${esc(token)}/simulator" target="_blank" rel="noopener">${es ? 'Abrir el simulador en pantalla completa &rarr;' : 'Open the simulator full-screen &rarr;'}</a></div>`
      : `<div class="poc-intro">${esc(t.poc.intro)}</div><div class="poc-frame">${t.poc.html}</div>`)}
  ${section('value', t.value.heading, bullets(t.value.bullets))}
  ${t.deliverables.items && t.deliverables.items.length ? section('deliverables', t.deliverables.heading, bullets(t.deliverables.items)) : ''}
  ${section('plan', t.plan.heading, `${t.plan.summary ? `<p>${esc(t.plan.summary)}</p>` : ''}${phases(t.plan.phases)}`)}

  <div class="cta" id="cta">
    <h2>${esc(t.cta.heading)}</h2>
    <p>${esc(t.cta.body)}</p>
    ${projectId
      ? `<button type="button" id="ts-book-btn" class="ts-cta-btn">${ui.cta} &rarr;</button>`
      : `<a href="mailto:${ctaEmail}?subject=${ctaSubject}">${ui.cta} &rarr;</a>`}
  </div>

  <div class="foot">${ui.poweredBy}</div>
</div>

<script>
(function(){
  var segments = ${segs};
  var VOICE = ${JSON.stringify(voice)};
  var FALLBACK_LANG = ${JSON.stringify(es ? 'es-MX' : 'en-US')};
  var SECTION_IDS = [null,'challenge','solution','poc','plan','cta'];
  var NEURAL_URL = '/api/tts/edge';
  var synth = window.speechSynthesis;
  var orb=document.getElementById('orb'), status=document.getElementById('status');
  var playAll=document.getElementById('playAll'), pauseBtn=document.getElementById('pause'), stopBtn=document.getElementById('stop');
  var voiceSel=document.getElementById('voiceSel'), neuralToggle=document.getElementById('neuralToggle'), voiceMode=document.getElementById('voiceMode');
  var queue=[],qi=0,mode=null,runToken=0,paused=false,currentAudio=null,playbackMode=null,neuralOK=true,cache={},browserVoice=null;
  var voiceName = voiceSel ? voiceSel.value : VOICE;

  function pickBrowserVoice(){ if(!synth) return; var vs=synth.getVoices(); var p=vs.filter(function(v){return v.lang&&v.lang.toLowerCase().indexOf(FALLBACK_LANG.slice(0,2))===0;}); browserVoice=p[0]||vs[0]||null; }
  if(synth){ pickBrowserVoice(); synth.onvoiceschanged=pickBrowserVoice; }
  function useNeural(){ return neuralToggle.checked && neuralOK; }
  function setMode(){ voiceMode.textContent = useNeural()?'● HD':'○ '+(${JSON.stringify(es)}?'navegador':'browser'); }
  setMode();
  if(voiceSel) voiceSel.addEventListener('change',function(){ voiceName=this.value; clearCache(); });
  neuralToggle.addEventListener('change',setMode);
  function clearCache(){ Object.keys(cache).forEach(function(k){try{URL.revokeObjectURL(cache[k]);}catch(e){}}); cache={}; }

  function fetchNeural(idx){
    var key=voiceName+'|'+idx;
    if(cache[key]) return Promise.resolve(cache[key]);
    return fetch(NEURAL_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:segments[idx],voice:voiceName})})
      .then(function(r){if(!r.ok)throw new Error('http '+r.status);return r.blob();})
      .then(function(b){if(!b||b.size<200)throw new Error('empty');var u=URL.createObjectURL(b);cache[key]=u;return u;});
  }
  function setActive(idx){ document.querySelectorAll('.sec').forEach(function(s){s.classList.remove('active');}); var id=SECTION_IDS[idx]; if(id){var el=document.getElementById(id); if(el){el.classList.add('active'); el.scrollIntoView({behavior:'smooth',block:'start'});}} }
  function statusSpeaking(){ status.textContent = mode==='all' ? ((${JSON.stringify(es)}?'Lina está hablando… (':'Lina is speaking… (')+(qi+1)+(${JSON.stringify(es)}?' de ':' of ')+queue.length+')') : '…'; }

  function runQueue(token){
    if(token!==runToken) return;
    if(qi>=queue.length){ finish(); return; }
    var idx=queue[qi];
    setActive(idx);
    function advance(){ if(token!==runToken)return; qi++; runQueue(token); }
    if(useNeural()){
      status.textContent = ${JSON.stringify(es)}?'Preparando voz neural…':'Preparing neural voice…';
      if(qi+1<queue.length) fetchNeural(queue[qi+1]).catch(function(){});
      fetchNeural(idx).then(function(url){
        if(token!==runToken)return;
        playbackMode='neural'; currentAudio=new Audio(url);
        currentAudio.onended=advance;
        currentAudio.onerror=function(){neuralOK=false;setMode();advance();};
        orb.classList.add('speaking'); statusSpeaking();
        currentAudio.play().catch(function(){neuralOK=false;setMode();browserSpeak(idx,advance);});
      }).catch(function(){ if(token!==runToken)return; neuralOK=false; setMode(); browserSpeak(idx,advance); });
    } else { browserSpeak(idx,advance); }
  }
  function browserSpeak(idx,onEnd){
    if(!synth){ onEnd(); return; }
    playbackMode='browser';
    var u=new SpeechSynthesisUtterance(segments[idx]);
    if(browserVoice) u.voice=browserVoice;
    u.lang=browserVoice?browserVoice.lang:FALLBACK_LANG; u.rate=0.98; u.pitch=1.04;
    u.onstart=function(){orb.classList.add('speaking');statusSpeaking();};
    u.onend=onEnd; u.onerror=onEnd; synth.speak(u);
  }
  function start(q,m){
    if(synth) synth.cancel();
    if(currentAudio){try{currentAudio.pause();}catch(e){}currentAudio=null;}
    queue=q; qi=0; mode=m; paused=false; runToken++;
    pauseBtn.disabled=false; stopBtn.disabled=false; playAll.disabled=true; pauseBtn.textContent=${JSON.stringify(ui.pause)};
    runQueue(runToken);
  }
  function finish(){
    runToken++; orb.classList.remove('speaking'); document.querySelectorAll('.sec').forEach(function(s){s.classList.remove('active');});
    if(currentAudio){try{currentAudio.pause();}catch(e){}currentAudio=null;}
    pauseBtn.disabled=true; stopBtn.disabled=true; playAll.disabled=false;
    status.textContent=${JSON.stringify(es)}?'Listo. Pulsa de nuevo para repetir.':'Done. Tap again to replay.';
  }
  playAll.addEventListener('click',function(){ start(segments.map(function(_,i){return i;}),'all'); });
  pauseBtn.addEventListener('click',function(){
    if(!paused){ paused=true; pauseBtn.textContent=${JSON.stringify(es ? '▶ Reanudar' : '▶ Resume')}; orb.classList.remove('speaking'); status.textContent=${JSON.stringify(es?'En pausa.':'Paused.')};
      if(playbackMode==='neural'&&currentAudio) currentAudio.pause(); else if(synth) synth.pause(); }
    else { paused=false; pauseBtn.textContent=${JSON.stringify(ui.pause)}; orb.classList.add('speaking'); statusSpeaking();
      if(playbackMode==='neural'&&currentAudio) currentAudio.play(); else if(synth) synth.resume(); }
  });
  stopBtn.addEventListener('click',finish);
  window.addEventListener('beforeunload',function(){ if(synth) synth.cancel(); if(currentAudio){try{currentAudio.pause();}catch(e){}} });
})();
</script>

<div class="ts-modal" id="ts-book-modal">
  <div class="ts-modal-bd" data-close></div>
  <div class="ts-modal-box" role="dialog" aria-modal="true">
    <button class="ts-modal-x" data-close aria-label="Close">&times;</button>
    <div class="ts-modal-title">${es ? 'Agenda tu cita' : 'Book your appointment'}</div>
    <div id="ts-form">
      <div class="ts-modal-sub">${es ? 'Déjanos tus datos, elige un horario y confirma &mdash; en hora de Colombia (COT).' : 'Enter your details, pick a time, and confirm &mdash; times in Colombia time (COT).'}</div>
      <div class="ts-fields">
        <div>
          <div class="ts-fld-lbl">${es ? '1. Tu nombre' : '1. Your name'}</div>
          <input type="text" class="ts-inp" id="ts-name" autocomplete="name" placeholder="${es ? 'Nombre y apellido' : 'First and last name'}">
        </div>
        <div>
          <div class="ts-fld-lbl">${es ? '2. Celular (te enviamos la confirmación por SMS)' : '2. Mobile (we text you the confirmation)'}</div>
          <div class="ts-phone">
            <select class="ts-cc" id="ts-cc" aria-label="${es ? 'País' : 'Country'}"></select>
            <input type="tel" inputmode="tel" class="ts-inp" id="ts-tel" autocomplete="tel-national" placeholder="${es ? 'Número de celular' : 'Phone number'}">
          </div>
        </div>
      </div>
      <div class="ts-pick-lbl">${es ? '3. Elige un horario' : '3. Pick a time'}</div>
      <div class="ts-slots" id="ts-slots"></div>
      <button type="button" class="ts-modal-go" id="ts-confirm" disabled>${es ? 'Reservar cita' : 'Book appointment'}</button>
      <div class="ts-modal-status" id="ts-status" aria-live="polite"></div>
    </div>
    <div id="ts-done" class="ts-done" style="display:none"></div>
  </div>
</div>
<script>
(function(){
  var PID = ${JSON.stringify(String(projectId || ''))};
  var ES = ${es ? 'true' : 'false'};
  if(!PID) return;
  var btn = document.getElementById('ts-book-btn');
  var modal = document.getElementById('ts-book-modal');
  var slotsEl = document.getElementById('ts-slots');
  var confirmBtn = document.getElementById('ts-confirm');
  var statusEl = document.getElementById('ts-status');
  var nameEl = document.getElementById('ts-name');
  var ccEl = document.getElementById('ts-cc');
  var telEl = document.getElementById('ts-tel');
  var sel = null;
  var loc = ES ? 'es-CO' : 'en-US';
  // Friendly country picker — user types their local number, we format E.164.
  var COUNTRIES = [
    ['US','United States','+1'],['CO','Colombia','+57'],['MX','México','+52'],
    ['ES','España','+34'],['AR','Argentina','+54'],['PE','Perú','+51'],
    ['CL','Chile','+56'],['VE','Venezuela','+58'],['EC','Ecuador','+593'],
    ['PA','Panamá','+507'],['GT','Guatemala','+502'],['DO','Rep. Dominicana','+1'],
    ['CR','Costa Rica','+506'],['BO','Bolivia','+591'],['UY','Uruguay','+598'],
    ['PY','Paraguay','+595'],['HN','Honduras','+504'],['SV','El Salvador','+503'],
    ['NI','Nicaragua','+505'],['PR','Puerto Rico','+1'],['CA','Canada','+1'],
    ['BR','Brasil','+55'],['GB','United Kingdom','+44']
  ];
  (function fillCC(){
    if(!ccEl) return;
    var def = ES ? 'CO' : 'US';
    COUNTRIES.forEach(function(c){
      var o=document.createElement('option');
      o.value=c[2]; o.textContent=c[1]+' ('+c[2]+')';
      if(c[0]===def) o.selected=true;
      ccEl.appendChild(o);
    });
  })();
  function e164(){
    var raw=(telEl&&telEl.value||'').trim();
    if(!raw) return '';
    if(raw.charAt(0)==='+') return '+'+raw.slice(1).replace(/[^0-9]/g,'');
    var nat=raw.replace(/[^0-9]/g,'').replace(/^0+/,'');
    if(!nat) return '';
    var cc=(ccEl&&ccEl.value||'+1').replace(/[^0-9+]/g,'');
    return cc+nat;
  }
  var T = ES ? {
    loading:'Cargando horarios…', confirm:'Reservar cita', booking:'Reservando…',
    doneSub:'Revisa tu teléfono — te enviamos la confirmación por SMS.',
    none:'Sin horarios disponibles ahora — te contactaremos para agendar.',
    fail:'No se pudieron cargar los horarios. Inténtalo de nuevo.',
    booked:function(w){return 'Reservado para '+w+' COT. Te enviamos la confirmación por SMS — ¡nos vemos!';},
    err:'No se pudo reservar. Inténtalo de nuevo.', net:'No se pudo conectar. Inténtalo de nuevo.',
    needPhone:'Ingresa tu número de celular para enviarte la confirmación.'
  } : {
    loading:'Loading open slots…', confirm:'Book appointment', booking:'Booking…',
    doneSub:'Check your phone — we just sent your confirmation by SMS.',
    none:'No open slots right now — we\\'ll reach out to schedule.',
    fail:'Could not load slots. Please try again.',
    booked:function(w){return 'Booked for '+w+' COT. We just texted you the confirmation — see you then!';},
    err:'Could not book. Please try again.', net:'Could not reach the server. Please try again.',
    needPhone:'Enter your mobile number so we can text you the confirmation.'
  };
  function open(){ modal.style.display='flex'; document.body.style.overflow='hidden'; load(); }
  function close(){ modal.style.display='none'; document.body.style.overflow=''; }
  function load(){
    var form=document.getElementById('ts-form'); if(form) form.style.display='';
    var done=document.getElementById('ts-done'); if(done){ done.style.display='none'; done.innerHTML=''; }
    sel=null; confirmBtn.disabled=true; confirmBtn.style.display=''; confirmBtn.textContent=T.confirm; statusEl.textContent='';
    slotsEl.innerHTML='<div class="ts-slots-load">'+T.loading+'</div>';
    fetch('/projects/api/v1/intake/public/slots?count=6').then(function(r){return r.json();}).then(function(res){
      if(!res||!res.success||!res.data||!res.data.slots||!res.data.slots.length){ slotsEl.innerHTML='<div class="ts-slots-load">'+T.none+'</div>'; return; }
      slotsEl.innerHTML='';
      res.data.slots.forEach(function(sl2){
        var b=document.createElement('button'); b.type='button'; b.className='ts-slot';
        var dt=new Date(sl2.start_time);
        var day=dt.toLocaleString(loc,{timeZone:'America/Bogota',weekday:'short',month:'short',day:'numeric'});
        var tim=dt.toLocaleString(loc,{timeZone:'America/Bogota',hour:'numeric',minute:'2-digit'});
        b.innerHTML='<span class="d">'+day+'</span><span class="t">'+tim+' COT</span>';
        b.onclick=function(){ var all=slotsEl.querySelectorAll('.ts-slot'); for(var i=0;i<all.length;i++) all[i].classList.remove('sel'); b.classList.add('sel'); sel=sl2; confirmBtn.disabled=false; };
        slotsEl.appendChild(b);
      });
    }).catch(function(){ slotsEl.innerHTML='<div class="ts-slots-load">'+T.fail+'</div>'; });
  }
  confirmBtn.onclick=function(){
    if(!sel) return;
    var phone=e164();
    if(!phone || phone.replace(/[^0-9]/g,'').length<7){ statusEl.textContent=T.needPhone; if(telEl) telEl.focus(); return; }
    statusEl.textContent='';
    confirmBtn.disabled=true; confirmBtn.textContent=T.booking;
    fetch('/projects/api/v1/intake/public/book/'+PID,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({start_time:sel.start_time,end_time:sel.end_time,name:(nameEl&&nameEl.value||'').trim(),phone:phone,lang:(ES?'es':'en')})})
      .then(function(r){return r.json();}).then(function(res){
        if(res&&res.success){
          var w=new Date(sel.start_time).toLocaleString(loc,{timeZone:'America/Bogota',weekday:'long',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'});
          var form=document.getElementById('ts-form'); if(form) form.style.display='none';
          var done=document.getElementById('ts-done');
          if(done){ done.style.display='block'; done.innerHTML='<div class="ts-done-check">&#10003;</div><div class="ts-done-t">'+T.booked(w)+'</div><div class="ts-done-s">'+T.doneSub+'</div>'; }
        } else { statusEl.textContent=(res&&res.error)||T.err; confirmBtn.disabled=false; confirmBtn.textContent=T.confirm; }
      }).catch(function(){ statusEl.textContent=T.net; confirmBtn.disabled=false; confirmBtn.textContent=T.confirm; });
  };
  if(btn) btn.addEventListener('click', open);
  var closers = modal.querySelectorAll('[data-close]');
  for(var i=0;i<closers.length;i++) closers[i].addEventListener('click', close);
  document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modal.style.display==='flex') close(); });
})();
</script>

<script>
/* Feasibility & Build Plan + Plan Copilot — the prospect reads the real (client-
   safe) triage/premortem, then chats to refine it live before booking. Monetization
   + verdict are never sent to the browser; the Copilot can only touch client fields. */
(function(){
  var TOKEN = ${JSON.stringify(token || '')};
  var ES = ${JSON.stringify(es)};
  var box = document.getElementById('d2plan-body');
  if(!TOKEN || !box) return;
  var section = document.getElementById('d2plan');
  var history = [], chatMounted = false, sending = false;
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function listOf(arr, render){ return '<ul class="d2plan-list">'+arr.map(render).join('')+'</ul>'; }
  function block(title, inner){ return inner ? '<div class="d2plan-block"><h3>'+esc(title)+'</h3>'+inner+'</div>' : ''; }

  function render(plan){
    var L = plan.labels || {};
    var f = plan.feasibility || {};
    var html = '';
    if(f.score != null){
      html += '<div class="d2feas"><div class="d2feas-score">'+f.score+'<span>/10</span></div>'
        + '<div class="d2feas-meta"><div class="d2feas-label">'+esc(f.label)+'</div>'
        + '<div class="d2feas-bar"><div class="d2feas-fill" style="width:'+(f.score*10)+'%"></div></div></div></div>';
    }
    if(plan.problem) html += block(L.problem, '<p>'+esc(plan.problem)+'</p>');
    if(plan.why) html += block(L.why, '<p>'+esc(plan.why)+'</p>');
    if(plan.v1) html += block(L.v1, '<p>'+esc(plan.v1)+'</p>');
    if(plan.build_includes && plan.build_includes.length)
      html += block(L.includes, listOf(plan.build_includes, function(c){ return '<li>'+esc(c)+'</li>'; }));
    if(plan.timeline_weeks)
      html += block(L.timeline, '<div class="d2plan-timeline"><b>'+plan.timeline_weeks+'</b> '+esc(L.weeks||'weeks')+'</div>');
    if(plan.considerations && plan.considerations.length)
      html += block(L.cons, listOf(plan.considerations, function(c){ return '<li>'+esc(c)+'</li>'; }));
    if(plan.landscape && plan.landscape.length)
      html += block(L.land, listOf(plan.landscape, function(c){ return '<li>'+esc(c)+'</li>'; }));
    if(plan.risks && plan.risks.length)
      html += block(L.risks, listOf(plan.risks, function(r){ return '<li><span class="rk">'+esc(r.risk)+'</span>'+(r.detail?'<span class="dt">'+esc(r.detail)+'</span>':'')+'</li>'; }));
    if(plan.mitigations && plan.mitigations.length)
      html += block(L.mit, listOf(plan.mitigations, function(m){ return '<li>'+esc(m)+'</li>'; }));
    if(plan.need_from_you && plan.need_from_you.length)
      html += block(L.need, listOf(plan.need_from_you, function(n){ return '<li>'+esc(n)+'</li>'; }));
    if(plan.gate && plan.gate.note){
      html += '<div class="d2plan-note">'+esc(plan.gate.note)
        + '<div class="d2plan-cta"><button type="button" id="d2plan-cta-btn">'+esc(plan.gate.cta)+' &rarr;</button></div></div>';
    }
    if(plan.disclaimer) html += '<div class="d2plan-disc">'+esc(plan.disclaimer)+'</div>';
    box.innerHTML = html;
    box.classList.remove('d2flash'); void box.offsetWidth; box.classList.add('d2flash');
    var cb = document.getElementById('d2plan-cta-btn');
    if(cb) cb.onclick = function(){
      var bk = document.getElementById('ts-book-btn');
      var cta = document.getElementById('cta');
      if(cta) cta.scrollIntoView({behavior:'smooth',block:'center'});
      if(bk) setTimeout(function(){ bk.click(); }, 420);
    };
    if(!chatMounted){ mountChat(); chatMounted = true; }
  }

  // ---- Plan Copilot (chat to refine the plan) ----
  var T = ES ? {
    title:'Copiloto del plan', sub:'Pregúntame o ajusta el plan en lenguaje natural',
    ph:'Ej: hazlo un MVP de 2 semanas · agrega una app móvil',
    send:'Enviar', undo:'Deshacer', reset:'Volver al original', thinking:'Pensando…',
    hello:'Puedo explicarte cualquier parte de este plan o cambiarlo. Prueba: "resúmelo en 3 puntos", "hazlo un MVP de 2 semanas" o "agrega una app móvil".',
    chips:['Resúmelo en 3 puntos','Hazlo un MVP de 2 semanas','Agrega una app móvil'],
    updated:'Plan actualizado'
  } : {
    title:'Plan Copilot', sub:'Ask me anything, or reshape the plan in plain language',
    ph:'e.g. make it a 2-week MVP · add a mobile app',
    send:'Send', undo:'Undo', reset:'Reset to original', thinking:'Thinking…',
    hello:'I can explain any part of this plan or change it. Try: "summarize in 3 bullets", "make it a 2-week MVP", or "add a mobile app".',
    chips:['Summarize in 3 bullets','Make it a 2-week MVP','Add a mobile app'],
    updated:'Plan updated'
  };
  var logEl, inputEl, sendBtn;
  function mountChat(){
    var el = document.createElement('div'); el.className='d2chat'; el.id='d2chat';
    el.innerHTML =
      '<div class="d2chat-h"><span class="d2chat-orb"></span><div><div class="tt">'+esc(T.title)+'</div><div class="ss">'+esc(T.sub)+'</div></div></div>'
      + '<div class="d2chat-log" id="d2chat-log"></div>'
      + '<div class="d2chat-suggest" id="d2chat-chips">'+T.chips.map(function(c){return '<button type="button" class="d2chip">'+esc(c)+'</button>';}).join('')+'</div>'
      + '<div class="d2chat-ctl"><a id="d2chat-undo">'+esc(T.undo)+'</a><a id="d2chat-reset">'+esc(T.reset)+'</a></div>'
      + '<div class="d2chat-in"><input id="d2chat-input" type="text" placeholder="'+esc(T.ph)+'" autocomplete="off"><button id="d2chat-send" type="button">'+esc(T.send)+'</button></div>';
    section.appendChild(el);
    logEl = document.getElementById('d2chat-log');
    inputEl = document.getElementById('d2chat-input');
    sendBtn = document.getElementById('d2chat-send');
    addMsg('a', T.hello);
    sendBtn.onclick = doSend;
    inputEl.addEventListener('keydown', function(e){ if(e.key==='Enter'){ doSend(); } });
    Array.prototype.forEach.call(document.querySelectorAll('#d2chat-chips .d2chip'), function(b){
      b.onclick = function(){ inputEl.value = b.textContent; doSend(); };
    });
    document.getElementById('d2chat-undo').onclick = function(){ version('undo'); };
    document.getElementById('d2chat-reset').onclick = function(){ version('reset'); };
  }
  function addMsg(kind, text){
    var d = document.createElement('div'); d.className='d2msg '+kind; d.textContent=text;
    logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight; return d;
  }
  function doSend(){
    if(sending) return;
    var msg = (inputEl.value||'').trim(); if(!msg) return;
    inputEl.value=''; addMsg('u', msg); history.push({role:'user',text:msg});
    sending = true; sendBtn.disabled = true;
    var typing = addMsg('a', T.thinking); typing.classList.add('d2chat-typing');
    fetch('/projects/teaser/'+encodeURIComponent(TOKEN)+'/plan/chat',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ message: msg, history: history.slice(-8), lang: (ES?'es':'en') })
    }).then(function(r){ return r.json(); }).then(function(res){
      typing.remove();
      if(res && res.error){ addMsg('a', res.error); return; }
      if(res && res.reply){ addMsg('a', res.reply); history.push({role:'assistant',text:res.reply}); }
      if(res && res.mode==='edit' && res.plan){
        render(res.plan);
        if(res.diff){ var d=addMsg('d', T.updated+': '+res.diff); }
        section.scrollIntoView({behavior:'smooth',block:'nearest'});
      }
    }).catch(function(){ typing.remove(); addMsg('a', ES?'Error de conexión.':'Connection error.'); })
      .then(function(){ sending=false; sendBtn.disabled=false; inputEl.focus(); });
  }
  function version(action){
    fetch('/projects/teaser/'+encodeURIComponent(TOKEN)+'/plan/version',{
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action: action })
    }).then(function(r){ return r.json(); }).then(function(res){
      if(res && res.plan){ render(res.plan); addMsg('d', action==='reset'?(ES?'Plan restaurado al original.':'Plan reset to original.'):(ES?'Cambio deshecho.':'Change undone.')); }
    }).catch(function(){});
  }

  var tries = 0, MAX = 24; // ~72s ceiling; triage+premortem usually < 30s
  function poll(){
    fetch('/projects/teaser/'+encodeURIComponent(TOKEN)+'/plan?lang='+(ES?'es':'en'))
      .then(function(r){ return r.json(); })
      .then(function(res){
        if(res && res.status === 'ready' && res.plan){ render(res.plan); return; }
        if(res && res.status === 'unavailable'){ hide(); return; }
        if(++tries >= MAX){ hide(); return; }
        setTimeout(poll, 3000);
      })
      .catch(function(){ if(++tries >= MAX){ hide(); } else setTimeout(poll, 3000); });
  }
  function hide(){ var s=document.getElementById('d2plan'); if(s) s.style.display='none'; }
  poll();
})();
</script>
</body>
</html>`;
}

module.exports = { adminRouter, publicRouter, renderTeaserPage };
