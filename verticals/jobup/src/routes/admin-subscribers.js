'use strict';

// =============================================================
// SUBSCRIBER OPERATIONS — the owner's fix-it bench.
//
// WHY THIS EXISTS, AND WHY IT IS NOT THE SUBSCRIBERS CONSOLE.
// A paying subscriber went four days with an empty board while her agent
// reported success every morning. Nothing in either console could have shown
// that: /admin is aggregates-only and /subscribers-admin is the billing
// register, which is deliberately blind to career data. Diagnosing it took
// direct database queries. This is that diagnosis, as a screen.
//
// THE BOUNDARY IS PRESERVED, NOT WAIVED.
//   * The subscriber LIST stays pseudonymised — same projection as /admin.
//   * Opening ONE subscriber requires a written reason of 15+ characters,
//     exactly like impersonation, and writes an audit row before any private
//     data is read. That grant is a signed 30-minute case token scoped to that
//     one tenant, so it cannot be reused for another and cannot outlive the
//     support task it was opened for.
//   * Every write is audited again, individually, with the reason carried
//     forward. "I opened a case" is not consent to change ten things silently.
//
// WHAT IT DELIBERATELY DOES NOT DO.
//   * It never sends anything on a subscriber's behalf — no outreach, no
//     applications, no email. The whole product is built on the subscriber
//     approving what goes out; an operator bypassing that is worse than a bug.
//   * It never edits their résumé or their profile. Targeting is operational;
//     the résumé is theirs.
// =============================================================

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const express = require('express');

const { models, scoped } = require('../models');
const agents = require('../services/agents');
const jobsource = require('../services/jobsource');
const geo = require('../services/geo');
const settingsSvc = require('../services/settings');
const brain = require('../services/brain');

const router = express.Router();

// Served from src/views, never from public/ — a static file under public/ is
// reachable by anyone who guesses the name, credential or not.
const OPS_PAGE = require('fs').readFileSync(
  require('path').join(__dirname, '..', 'views', 'admin-ops.html'), 'utf8');

/**
 * The page itself carries NO subscriber data — every row on it is fetched
 * through the authed endpoints below, so serving the shell before the cookie
 * check leaks nothing and keeps the login redirect simple.
 */
router.get(['/ops', '/ops/'], (req, res) => res.type('html').send(OPS_PAGE));

// EXACTLY the admin console's secret, not a near-copy. A case token is an
// admin-console credential; deriving it from a different fallback chain
// (JWT_SECRET, say) means the two disagree the moment one env var is set and
// not the other, and the failure reads as "session expired" rather than as a
// configuration mismatch.
const SECRET = process.env.JOBUP_JWT_SECRET || 'dev-only-insecure-secret';
const CASE_MINUTES = parseInt(process.env.JOBUP_ADMIN_CASE_MINUTES || '30', 10);
const MIN_REASON = 15;

// requireOwner and audit belong to the admin console; reuse them rather than
// writing a second copy of an auth check.
const adminRoutes = require('./admin');
const requireOwner = adminRoutes.requireOwner;

async function audit(actor, action, reason, tenantId) {
  try {
    await models.audit_log.create({
      tenant_id: tenantId || 0, actor: 'admin:' + actor, action,
      reason: reason || null, created_at: new Date(),
    });
  } catch (e) { /* the audit table must never break the operation it records */ }
}

/**
 * A case is a grant to look at ONE subscriber, for a short time, for a stated
 * reason. Signed rather than stored: Render runs more than one instance, and a
 * case opened on one of them has to be honoured by the others.
 */
function requireCase(req, res, next) {
  const raw = req.get('x-jobup-case') || (req.body || {}).case_token || req.query.case_token;
  if (!raw) {
    return res.status(403).json({
      error: 'no open case for this subscriber',
      note: `Open one with a written reason of ${MIN_REASON}+ characters. It is recorded permanently.`,
    });
  }
  let claim;
  try { claim = jwt.verify(String(raw), SECRET); } catch (e) {
    return res.status(403).json({ error: 'case expired or invalid — open a new one' });
  }
  if (claim.purpose !== 'ops' || claim.adm !== req.admin.email) {
    return res.status(403).json({ error: 'this case does not belong to you' });
  }
  const want = parseInt(req.params.tenantId, 10);
  if (claim.tid !== want) {
    // A case for tenant 12 must never read tenant 13.
    return res.status(403).json({ error: 'this case is open on a different subscriber' });
  }
  req.opsCase = claim;
  next();
}

// ---------------------------------------------------------------
// The list. Pseudonymised, plus the operational signals that say WHICH
// subscriber needs attention — counts, never content.
// ---------------------------------------------------------------
router.get('/subscribers/ops', requireOwner, async (req, res) => {
  const subs = await models.subscribers.findAll({});
  const out = [];

  for (const s of subs) {
    const runs = await scoped('agent_runs', s.id).findAll({});
    const hunts = runs.filter((r) => r.agent === 'hunter')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const matches = await scoped('job_matches', s.id).findAll({});
    const scores = await scoped('job_scores', s.id).findAll({});
    const prof = await scoped('profiles', s.id).findOne({});
    const last = hunts[0] || null;

    // The signal that actually mattered and that nothing surfaced: an agent
    // running clean, charging, and filing nothing, day after day.
    const filedEver = matches.length > 0;
    const scoredEver = scores.length || hunts.reduce((n, r) => n + (Number(r.scored) || 0), 0);
    const flags = [];
    if (s.status === 'active' && !prof) flags.push('no profile');
    if (s.status === 'active' && !hunts.length) flags.push('never hunted');
    if (scoredEver >= 12 && !filedEver) flags.push('scoring but never filing');
    if (last && last.status === 'idle') flags.push('last run idle');
    if (last && new Date(last.created_at) < new Date(Date.now() - 3 * 86400000)) flags.push('stale');

    out.push({
      id: s.id,
      status: s.status,
      activation: s.activation,
      // Same pseudonymised projection the aggregates console uses. A name is
      // revealed by opening a case, not by loading a list.
      email_domain: String(s.email || '').split('@')[1] || null,
      email_ref: crypto.createHash('sha256').update(String(s.email || '')).digest('hex').slice(0, 10),
      created_at: s.created_at,
      has_site: Boolean(s.address),
      matches: matches.length,
      scored: scoredEver,
      runs: hunts.length,
      last_run_at: last ? last.created_at : null,
      last_run_status: last ? last.status : null,
      last_run_summary: last ? last.summary : null,
      flags,
    });
  }

  out.sort((a, b) => (b.flags.length - a.flags.length) || (b.id - a.id));
  res.json({
    subscribers: out,
    needs_attention: out.filter((x) => x.flags.length).length,
    note: 'Identities are withheld here by design. Open a case on one subscriber to see and change anything.',
  });
});

// ---------------------------------------------------------------
// Open a case. This is the only door to a subscriber's private data.
// ---------------------------------------------------------------
router.post('/subscribers/:tenantId/open', requireOwner, async (req, res) => {
  const tenantId = parseInt(req.params.tenantId, 10);
  const reason = String((req.body || {}).reason || '').trim();
  if (!Number.isInteger(tenantId)) return res.status(400).json({ error: 'bad subscriber id' });
  if (reason.length < MIN_REASON) {
    return res.status(400).json({
      error: `a written reason of at least ${MIN_REASON} characters is required`,
      note: 'It is recorded permanently against your account and this subscriber.',
    });
  }
  const sub = await models.subscribers.findOne({ where: { id: tenantId } });
  if (!sub) return res.status(404).json({ error: 'no such subscriber' });

  // Audited BEFORE anything private is read.
  await audit(req.admin.email, 'ops.open:' + tenantId, reason, tenantId);

  const token = jwt.sign(
    { tid: tenantId, adm: req.admin.email, purpose: 'ops', reason, jti: crypto.randomUUID() },
    SECRET, { expiresIn: CASE_MINUTES + 'm' });

  res.json({
    ok: true, tenant_id: tenantId, case_token: token, expires_min: CASE_MINUTES,
    subscriber: { id: sub.id, name: sub.name, email: sub.email, status: sub.status,
                  activation: sub.activation, address: sub.address, created_at: sub.created_at },
    note: 'Recorded against ' + req.admin.email + '. Send it as the x-jobup-case header.',
  });
});

// ---------------------------------------------------------------
// THE DIAGNOSIS. Everything it took direct SQL to work out last time.
// ---------------------------------------------------------------
router.get('/subscribers/:tenantId/diagnose', requireOwner, requireCase, async (req, res) => {
  const tenantId = parseInt(req.params.tenantId, 10);
  const sub = await models.subscribers.findOne({ where: { id: tenantId } });
  if (!sub) return res.status(404).json({ error: 'no such subscriber' });

  const profRow = await scoped('profiles', tenantId).findOne({});
  const setRow = await scoped('settings', tenantId).findOne({});
  const profile = (profRow && profRow.resume_json) || {};
  const settings = settingsSvc.sanitize((setRow && setRow.settings) || {});

  const pool = await agents.poolWindow();
  const stats = {};
  let ranked = jobsource.prefilter(pool, profile, settings, (profRow && profRow.source_text) || '', stats);

  // Country/state policy runs after the pre-filter and before any model call,
  // so the preview has to apply it too or it would promise rows the run drops.
  const geoDropped = [];
  ranked = ranked.filter((r) => {
    const v = geo.evaluate(r.job.location, settings.geo || {});
    if (v.verdict === geo.VERDICT.BLOCK) { geoDropped.push(v.reason); return false; }
    return true;
  });
  ranked = jobsource.diversify(ranked);

  const matches = await scoped('job_matches', tenantId).findAll({});
  const ledger = await scoped('job_scores', tenantId).findAll({});
  const seen = new Set([...matches, ...ledger].map((m) => m.job_id));
  const fresh = ranked.filter((r) => !seen.has(r.job.id));

  const runs = (await scoped('agent_runs', tenantId).findAll({}))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 15);
  const perDay = (settings.quotas && settings.quotas.jobs_scored_per_day) || 6;

  // Say plainly what is wrong, in the order it needs fixing. This is the part
  // that would have answered "why is her board empty" in one glance.
  const findings = [];
  if (!profRow) findings.push({ level: 'blocking', text: 'No profile on file — nothing to match against.' });
  if (!settingsSvc.pageRoles(settings).length) {
    findings.push({ level: 'blocking', text: 'No role targets set. The pre-filter has almost nothing to match on.' });
  }
  const d = stats.dropped || {};
  if (d.work_mode) {
    findings.push({ level: 'warn', text: `Work-mode preference rules out ${d.work_mode.toLocaleString()} postings.` });
  }
  if (d.excluded_keyword) {
    findings.push({ level: 'warn', text: `Excluded keywords rule out ${d.excluded_keyword.toLocaleString()} postings.` });
  }
  if (d.must_include) {
    findings.push({ level: 'warn', text: `Required keywords rule out ${d.must_include.toLocaleString()} postings.` });
  }
  if (geoDropped.length) {
    findings.push({ level: 'info', text: `Location policy blocks ${geoDropped.length.toLocaleString()} postings.` });
  }
  const scoredEver = ledger.length || runs.reduce((n, r) => n + (Number(r.scored) || 0), 0);
  if (scoredEver >= 12 && !matches.length) {
    findings.push({ level: 'blocking',
      text: `Scored ${scoredEver} postings and filed none. Minimum score is ${(settings.targeting || {}).min_score || 0}.` });
  }
  if (!ranked.length) {
    findings.push({ level: 'blocking', text: 'Their targeting matches nothing in the current pool.' });
  } else if (!fresh.length) {
    findings.push({ level: 'info', text: 'Every posting matching their targeting has already been scored.' });
  }
  if (!brain.enabled()) {
    findings.push({ level: 'info', text: 'No model key on this instance — scores would be heuristic and labelled.' });
  }
  if (!findings.length) findings.push({ level: 'ok', text: 'Nothing anomalous. The agent has work queued and is filing.' });

  res.json({
    subscriber: { id: sub.id, name: sub.name, email: sub.email, status: sub.status,
                  activation: sub.activation, address: sub.address },
    findings,
    profile: {
      headline: profile.headline || null, location: profile.location || null,
      skills: (profile.skills || []).length, experience: (profile.experience || []).length,
      edited_at: profile.edited_at || null,
    },
    targeting: settings.targeting || {},
    geo: settings.geo || {},
    quotas: settings.quotas || {},
    funnel: {
      pool: pool.length,
      considered: stats.considered || 0,
      admitted: stats.kept || 0,
      dropped: stats.dropped || {},
      geo_blocked: geoDropped.length,
      after_geo: ranked.length,
      already_scored: seen.size,
      queued: fresh.length,
      per_day: perDay,
      days_of_queue: perDay ? Math.floor(fresh.length / perDay) : 0,
    },
    // Exactly the rows the next run will score, in order.
    next_up: fresh.slice(0, perDay).map((r) => ({
      job_id: r.job.id, rank: r.prescore, employer: r.job.employer,
      title: r.job.title, location: r.job.location, url: r.job.url,
    })),
    queue_preview: fresh.slice(perDay, perDay + 20).map((r) => ({
      job_id: r.job.id, rank: r.prescore, employer: r.job.employer,
      title: r.job.title, location: r.job.location,
    })),
    matches: matches
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 50)
      .map((m) => ({ id: m.id, job_id: m.job_id, score: m.score, stage: m.stage,
                     title: m.title, employer: m.employer, explanation: m.explanation,
                     is_simulated: m.is_simulated, created_at: m.created_at })),
    runs: runs.map((r) => ({ agent: r.agent, status: r.status, trigger: r.trigger,
                             scored: r.scored, cost_usd: r.cost_usd, summary: r.summary,
                             created_at: r.created_at })),
  });
});

// ---------------------------------------------------------------
// RUN THEIR MATCHING NOW. Its own allowance, its own trigger.
// ---------------------------------------------------------------
router.post('/subscribers/:tenantId/run', requireOwner, requireCase, async (req, res) => {
  const tenantId = parseInt(req.params.tenantId, 10);
  const limit = Math.max(1, Math.min(50, parseInt((req.body || {}).limit, 10) || 12));
  try {
    const r = await agents.hunter(tenantId, { trigger: 'admin', limit });
    await audit(req.admin.email, `ops.run:${tenantId} scored=${r.scored || 0} limit=${limit}`,
      req.opsCase.reason, tenantId);
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Re-run the presence agent — cheap, no model, regenerates their public surfaces. */
router.post('/subscribers/:tenantId/presence', requireOwner, requireCase, async (req, res) => {
  const tenantId = parseInt(req.params.tenantId, 10);
  try {
    const r = await agents.presence(tenantId);
    await audit(req.admin.email, 'ops.presence:' + tenantId, req.opsCase.reason, tenantId);
    res.json({ ok: true, gaps: r.gaps, url: r.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Change the operational settings — and ONLY those.
 *
 * An allowlist, not a merge. Handing an operator a free-form settings editor
 * is how privacy flags and approval gates get switched off by accident; those
 * are the subscriber's, and `sanitize()` would force approval_required back on
 * anyway. What is here is what an operator has a legitimate reason to correct.
 */
const EDITABLE = ['roles', 'industries', 'employers', 'locations', 'must_include',
                  'exclude_keywords', 'seniority', 'min_score', 'remote_preference',
                  'work_modes', 'work_mode_strict', 'employment_types'];

router.patch('/subscribers/:tenantId/targeting', requireOwner, requireCase, async (req, res) => {
  const tenantId = parseInt(req.params.tenantId, 10);
  const body = (req.body || {}).targeting || {};
  const row = await scoped('settings', tenantId).findOne({});
  const current = settingsSvc.sanitize((row && row.settings) || {});

  const changed = [];
  const nextTargeting = { ...(current.targeting || {}) };
  for (const k of EDITABLE) {
    if (!Object.prototype.hasOwnProperty.call(body, k)) continue;
    const before = JSON.stringify(nextTargeting[k]);
    nextTargeting[k] = body[k];
    if (JSON.stringify(body[k]) !== before) changed.push(k);
  }
  if (!changed.length) return res.json({ ok: true, changed: [], note: 'nothing to change' });

  const next = settingsSvc.sanitize({ ...current, targeting: nextTargeting });

  // Quotas are separate from targeting and equally operational.
  const q = (req.body || {}).quotas || {};
  if (q.jobs_scored_per_day != null) {
    next.quotas = next.quotas || {};
    next.quotas.jobs_scored_per_day = Math.max(1, Math.min(40, parseInt(q.jobs_scored_per_day, 10) || 6));
    changed.push('quotas.jobs_scored_per_day');
  }

  if (row) await scoped('settings', tenantId).update({ settings: next }, { id: row.id });
  else await scoped('settings', tenantId).create({ settings: next });

  // Every field named individually — "I edited their settings" is not a record.
  await audit(req.admin.email, 'ops.targeting:' + tenantId + ' [' + changed.join(', ') + ']',
    req.opsCase.reason, tenantId);
  res.json({ ok: true, changed, targeting: next.targeting, quotas: next.quotas });
});

/**
 * Let the agent look again at postings it scored and did not file.
 *
 * The ledger exists so nothing is paid for twice. But after a fix — a widened
 * filter, a corrected profile — a posting rejected under the old settings
 * deserves a second look, and without this the subscriber is permanently
 * locked out of everything the broken version already dismissed. Filed matches
 * are never touched: those are on their board and may have been moved.
 */
router.post('/subscribers/:tenantId/rescore', requireOwner, requireCase, async (req, res) => {
  const tenantId = parseInt(req.params.tenantId, 10);
  const ledger = await scoped('job_scores', tenantId).findAll({});
  const unfiled = ledger.filter((r) => !r.filed);
  for (const r of unfiled) await scoped('job_scores', tenantId).destroy({ id: r.id });
  await audit(req.admin.email, `ops.rescore:${tenantId} reopened=${unfiled.length}`,
    req.opsCase.reason, tenantId);
  res.json({
    ok: true, reopened: unfiled.length, kept_filed: ledger.length - unfiled.length,
    note: 'Those postings can be scored again. Filed matches were not touched.',
  });
});

module.exports = router;
module.exports.requireCase = requireCase;
module.exports.EDITABLE = EDITABLE;
