'use strict';

/**
 * AI READINESS DEPARTMENT — a department inside the MCP Brain, mounted at
 * /ai-readiness.
 *
 * Mission: take a CEO from fear to confidence about adopting AI, and leave
 * them with a personalised roadmap plus a next step small enough to say yes to
 * in the room.
 *
 * Five agents behind one Brain. Every capability is a registered tool, and
 * every channel — this console, a voice orb, an external MCP client — calls
 * the same tools through the same five gates. See src/brain.js.
 *
 * Login-only for sponsors. The one public surface is the read-only roadmap
 * link a sponsor mints for the CEO after the meeting, which is keyed by an
 * unguessable token and shows a frozen version.
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const router = express.Router();

const { sequelize } = require('./models');
const { brain } = require('./department');
const { seedSponsors, verify } = require('./services/sponsors');
const store = require('./services/engagement-store');
const interview = require('./engines/interview');
const llm = require('./services/llm');

const AUTH_SECRET = process.env.AIR_JWT_SECRET || process.env.JWT_SECRET || 'ai-readiness-2026-secret';
const publicDir = path.join(__dirname, '..', 'public');

router.use(express.json({ limit: '2mb' }));
router.use(express.urlencoded({ extended: true }));

/* ── auth gate ───────────────────────────────────────────────────────────── */
function getCookie(req, name) {
  const h = req.headers.cookie || '';
  const m = h.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

const PUBLIC_EXACT = ['/login', '/health', '/favicon.svg', '/manifest.webmanifest', '/sw.js'];
const PUBLIC_ASSET = /\.(png|svg|webmanifest|css|js|woff2?|ico)$/i;

router.use((req, res, next) => {
  const token = getCookie(req, 'air_token');
  if (token) { try { req.user = jwt.verify(token, AUTH_SECRET); } catch (e) { /* invalid */ } }

  const p = req.path;
  if (PUBLIC_EXACT.includes(p) || PUBLIC_ASSET.test(p)) return next();
  if (p.startsWith('/api/v1/auth/')) return next();
  // The CEO's read-only link. Token-keyed, no session.
  if (p.startsWith('/roadmap/') || p.startsWith('/api/v1/public/roadmap/')) return next();
  if (req.user) return next();

  if (p.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
  return res.redirect('/ai-readiness/login?next=' + encodeURIComponent(req.originalUrl || '/ai-readiness/'));
});

/** Session context handed to the Brain. tenant_id NEVER comes from the body. */
function ctxFrom(req, channel) {
  return {
    tenant_id: req.user.tenant_id || req.user.id,
    user_id: req.user.id,
    role: req.user.role || 'sponsor',
    channel: channel || 'admin',
    actor: `sponsor:${req.user.email || req.user.id}`,
    identity_verified: true
  };
}

/* ── health ──────────────────────────────────────────────────────────────── */
router.get('/health', async (req, res) => {
  let db = 'down';
  try { await sequelize.authenticate(); db = 'up'; } catch (e) { db = 'down'; }
  res.json({
    status: 'healthy',
    service: 'AI Readiness Department',
    db,
    agents: brain.agents.length,
    tools: brain.toolCount,
    narrative_model: llm.available() ? llm.MODEL : 'heuristic (no ANTHROPIC_API_KEY)',
    note: 'Numbers are deterministic in every configuration. The model writes prose only.',
    // Named so the live guarantees are checkable from outside, and so a deploy
    // that has not picked up a change to them is visible rather than inferred.
    narrative_guards: ['invented_figures_rejected', 'guarantee_language_rejected', 'markdown_stripped', 'figures_labeled_one_meaning_each']
  });
});

/* ── auth ────────────────────────────────────────────────────────────────── */
router.post('/api/v1/auth/login', async (req, res) => {
  try {
    const row = await verify(req.body.email, req.body.password);
    if (!row) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign(
      { id: row.id, tenant_id: row.tenant_id || row.id, email: row.email, name: row.name, role: row.role, lang: row.lang },
      AUTH_SECRET, { expiresIn: '30d' }
    );
    res.setHeader('Set-Cookie', `air_token=${encodeURIComponent(token)}; Path=/ai-readiness; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 86400}`);
    res.json({ success: true, user: { id: row.id, email: row.email, name: row.name, role: row.role, lang: row.lang } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/api/v1/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'air_token=; Path=/ai-readiness; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  res.json({ success: true });
});

router.get('/api/v1/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ success: true, user: req.user });
});

/* ── the Brain surface ───────────────────────────────────────────────────── */
// The single execution door. Everything the console does goes through here,
// so the console has no privileged path the other channels lack.
router.get('/api/v1/agents', (req, res) => {
  res.json({ success: true, department: 'AI Readiness Department', agents: brain.listAgents() });
});

router.get('/api/v1/tools/list', (req, res) => {
  const channel = req.query.channel || 'admin';
  res.json({
    success: true,
    channel,
    tools: brain.listTools({ channel, role: req.user.role || 'sponsor', identity_verified: true })
  });
});

router.post('/api/v1/tools/call', async (req, res) => {
  const { tool, arguments: args, channel } = req.body || {};
  if (!tool) return res.status(400).json({ error: 'tool is required' });
  const result = await brain.callTool(tool, args || {}, ctxFrom(req, channel));
  // Authorization denials are 403; everything else is 200 with success:false,
  // so a client can tell "you may not" from "it did not work".
  const denied = result && result.code &&
    ['forbidden', 'role_forbidden', 'channel_forbidden', 'agent_not_enabled', 'cost_cap'].includes(result.code);
  res.status(denied ? 403 : 200).json(result);
});

/* ── convenience REST over the same tools ────────────────────────────────── */
const call = (tool, argFn) => async (req, res) => {
  const result = await brain.callTool(tool, argFn(req), ctxFrom(req));
  res.status(result && result.success === false && /not found/i.test(result.error || '') ? 404 : 200).json(result);
};

router.get('/api/v1/interview', call('readiness_director.get_interview',
  req => ({ engagement_id: req.query.engagement_id ? Number(req.query.engagement_id) : undefined, section: req.query.section })));

router.get('/api/v1/engagements', call('readiness_director.list_engagements',
  req => ({ stage: req.query.stage })));

router.post('/api/v1/engagements', call('readiness_director.open_engagement', req => req.body || {}));

router.get('/api/v1/engagements/:id', call('readiness_director.engagement_status',
  req => ({ engagement_id: Number(req.params.id) })));

router.post('/api/v1/engagements/:id/answers', call('readiness_director.record_answers',
  req => ({ engagement_id: Number(req.params.id), section: req.body.section, payload: req.body.payload, answered_by: req.body.answered_by })));

router.post('/api/v1/engagements/:id/run', call('readiness_director.run_department',
  req => ({ engagement_id: Number(req.params.id), skip_narrative: !!(req.body || {}).skip_narrative })));

router.post('/api/v1/engagements/:id/publish', call('readiness_director.publish_to_ceo',
  req => ({ engagement_id: Number(req.params.id) })));

router.post('/api/v1/engagements/:id/decision', call('readiness_director.record_decision',
  req => ({ engagement_id: Number(req.params.id), decision: req.body.decision, note: req.body.note })));

/** The assembled roadmap for the console (sponsor-scoped). */
router.get('/api/v1/engagements/:id/roadmap', async (req, res) => {
  try {
    const tenant_id = req.user.tenant_id || req.user.id;
    const eng = await store.loadEngagement(tenant_id, Number(req.params.id));
    if (!eng) return res.status(404).json({ error: 'Engagement not found' });
    const roadmap = await store.latestRoadmap(tenant_id, eng.id);
    if (!roadmap) return res.status(404).json({ error: 'No roadmap yet. Run the department first.' });
    const findings = await store.loadFindings(tenant_id, eng.id);
    res.json({
      success: true,
      engagement: {
        id: eng.id, company_name: eng.company_name, ceo_name: eng.ceo_name,
        industry: eng.industry, country: eng.country, lang: eng.lang,
        stage: eng.stage, decision: eng.decision, share_token: eng.share_token
      },
      roadmap, findings
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── approvals ───────────────────────────────────────────────────────────── */
router.get('/api/v1/approvals', async (req, res) => {
  try {
    const { Approval } = require('./models');
    const rows = await Approval.findAll({
      where: { tenant_id: req.user.tenant_id || req.user.id, status: 'pending' },
      order: [['created_at', 'DESC']], limit: 100
    });
    res.json({ success: true, approvals: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/v1/approvals/:id', async (req, res) => {
  const result = await brain.executeApproval({
    tenant_id: req.user.tenant_id || req.user.id,
    approval_id: Number(req.params.id),
    user_id: req.user.id,
    approve: req.body.approve !== false
  });
  res.json(result);
});

/* ── activity: what the department actually did ──────────────────────────── */
router.get('/api/v1/activity', async (req, res) => {
  try {
    const { Call } = require('./models');
    const { Op } = require('sequelize');
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);
    const since = new Date(Date.now() - days * 86400000);
    const rows = await Call.findAll({
      where: { tenant_id: req.user.tenant_id || req.user.id, created_at: { [Op.gte]: since } },
      order: [['created_at', 'DESC']], limit: 300
    });
    const byAgent = {};
    brain.agents.forEach(a => { byAgent[a.id] = { id: a.id, name: a.name, calls: 0, failures: 0 }; });
    rows.forEach(r => {
      const e = byAgent[r.agent];
      if (!e) return;
      e.calls++; if (!r.success) e.failures++;
    });
    res.json({
      success: true, period_days: days, total_calls: rows.length,
      agents: Object.values(byAgent),
      recent: rows.slice(0, 60).map(r => ({
        at: r.created_at, agent: r.agent, tool: r.tool, channel: r.channel,
        success: r.success, error: r.error, latency_ms: r.latency_ms
      }))
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── the CEO's read-only link ────────────────────────────────────────────── */
router.get('/api/v1/public/roadmap/:token', async (req, res) => {
  try {
    const found = await store.byShareToken(req.params.token);
    if (!found) return res.status(404).json({ error: 'Not found' });
    const { engagement: eng, roadmap } = found;
    res.json({
      success: true,
      engagement: {
        company_name: eng.company_name, ceo_name: eng.ceo_name,
        industry: eng.industry, country: eng.country, lang: eng.lang
      },
      roadmap: {
        version: roadmap.version,
        created_at: roadmap.created_at,
        scorecard: roadmap.scorecard,
        phases: roadmap.phases,
        safe_next_step: roadmap.safe_next_step,
        executive_summary: roadmap.executive_summary,
        narrative_by: roadmap.narrative_by
        // talk_track is deliberately absent: it is the sponsor's script,
        // including how to read the room, and is not for the client.
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── pages ───────────────────────────────────────────────────────────────── */
router.get('/login', (req, res) => res.sendFile(path.join(publicDir, 'login.html')));
router.get('/roadmap/:token', (req, res) => res.sendFile(path.join(publicDir, 'roadmap.html')));
router.use(express.static(publicDir, { index: false }));
router.get('/', (req, res) => res.sendFile(path.join(publicDir, 'console.html')));

/* ── init ────────────────────────────────────────────────────────────────── */
(async function initialize() {
  try {
    await sequelize.sync({ alter: false });
    console.log('  AI READINESS database tables synced (air_*)');
    try {
      // sync({alter:false}) never adds columns to existing tables.
      await sequelize.query('ALTER TABLE air_sponsors ADD COLUMN IF NOT EXISTS tenant_id INTEGER');
      await sequelize.query('UPDATE air_sponsors SET tenant_id = id WHERE tenant_id IS NULL');
      await sequelize.query('ALTER TABLE air_engagements ADD COLUMN IF NOT EXISTS share_token VARCHAR(255)');
      await sequelize.query('ALTER TABLE air_engagements ADD COLUMN IF NOT EXISTS decision VARCHAR(255)');
      await sequelize.query('ALTER TABLE air_engagements ADD COLUMN IF NOT EXISTS decision_note TEXT');
      await sequelize.query('ALTER TABLE air_engagements ADD COLUMN IF NOT EXISTS decided_at TIMESTAMP WITH TIME ZONE');
      await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS air_engagements_share_token_idx ON air_engagements (share_token)');
    } catch (mErr) {
      console.error('  AI READINESS column ensure error:', mErr.message);
    }
    try {
      const s = await seedSponsors();
      console.log(`  AI READINESS sponsor accounts ensured (${s.total}, ${s.created} new)`);
    } catch (sErr) {
      console.error('  AI READINESS sponsor seed error:', sErr.message);
    }
  } catch (err) {
    console.error('  AI READINESS DB sync error:', err.message);
  }
})();

module.exports = router;
module.exports.brain = brain;
module.exports.interview = interview;
