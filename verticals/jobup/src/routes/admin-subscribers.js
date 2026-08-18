'use strict';

// =============================================================
// SUBSCRIBER OPERATIONS — the owner's fix-it bench.
//
// WHY THIS EXISTS.
// A paying subscriber went four days with an empty board while her agent
// reported success every morning. Neither console could have shown that:
// /admin is aggregates-only and /subscribers-admin is the billing register,
// which is deliberately blind to career data. Diagnosing it took direct
// database queries. This is that diagnosis, as a screen.
//
// IT IS ONE CLICK, DELIBERATELY.
// This shipped behind a written-reason gate, copied from the impersonation
// rule in admin.js. That rule is for a company with staff, where "who looked
// at this customer, and why" is a real question with a real answer. Here the
// operator is the sole owner looking at their own subscribers, and the console
// one door over already lists every name, email and payment behind the same
// credential — so the gate protected nothing that was not already visible, and
// charged a paragraph of typing every thirty minutes for it.
//
// Friction that buys no safety is not caution, it is just friction, and the
// predictable end of it is an operator who stops opening the screen at all.
//
// WHAT IS KEPT, BECAUSE IT COSTS THE OPERATOR NOTHING.
// Every read and every write still writes its own audit row, naming what was
// touched. Nobody has to type anything for that to happen — which is exactly
// why it will still be true in six months.
//
// WHAT IT DELIBERATELY DOES NOT DO.
//   * It never sends anything on a subscriber's behalf — no outreach, no
//     applications, no email. The whole product is built on the subscriber
//     approving what goes out; an operator bypassing that is worse than a bug.
//   * It never edits their résumé or their profile. Targeting is operational;
//     the résumé is theirs. Editable fields are an allowlist, not a merge.
// =============================================================

const express = require('express');

const { models, scoped } = require('../models');
const agents = require('../services/agents');
const jobsource = require('../services/jobsource');
const geo = require('../services/geo');
const settingsSvc = require('../services/settings');
const resumeSvc = require('../services/resume');
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
 * Record that this subscriber was opened, and carry on.
 *
 * This replaces a signed per-tenant "case token" the operator had to mint by
 * writing a reason. The token was real security machinery solving a problem
 * this deployment does not have — one owner, their own subscribers, the same
 * credential that already shows every name and payment next door. What was
 * actually worth keeping is the audit row, and that needs no ceremony.
 */
async function noteOpen(req, res, next) {
  const tenantId = parseInt(req.params.tenantId, 10);
  if (!Number.isInteger(tenantId)) return res.status(400).json({ error: 'bad subscriber id' });
  await audit(req.admin.email, 'ops.open:' + tenantId, null, tenantId);
  next();
}

// ---------------------------------------------------------------
// The list. Who they are, plus the operational signals that say WHICH
// subscriber needs attention.
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
    const setRow = await scoped('settings', s.id).findOne({});
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
    // Onboarding could not reach the model for this account. The daily agent
    // retries, so this should clear itself; if it persists, the model is down.
    if (setRow && setRow.settings && setRow.settings.targeting
        && setRow.settings.targeting.roles_widened === false) flags.push('roles not widened');
    if (last && new Date(last.created_at) < new Date(Date.now() - 3 * 86400000)) flags.push('stale');

    out.push({
      id: s.id,
      status: s.status,
      activation: s.activation,
      // Named, because an operations screen you cannot read is not one. The
      // billing register already lists every name and email behind the same
      // credential, so hashing them here protected nothing and only made the
      // operator open each row to find out who they were looking at.
      name: s.name || null,
      email: s.email || null,
      address: s.address || null,
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
    note: 'Every open and every change writes its own audit row automatically.',
  });
});

// ---------------------------------------------------------------
// THE DIAGNOSIS. Everything it took direct SQL to work out last time.
// ---------------------------------------------------------------
router.get('/subscribers/:tenantId/diagnose', requireOwner, noteOpen, async (req, res) => {
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
    // What the next run will actually do, decided by the agent rather than
    // asked of the operator. Cost is measured from THIS subscriber's own runs
    // where there are any — a global average would be a guess presented as a
    // figure, and this one is spent in their name.
    next_run: (() => {
      const p = agents.plan(fresh, perDay);
      const scoredRuns = runs.filter((r) => r.agent === 'hunter' && r.scored > 0);
      const jobs = scoredRuns.reduce((n, r) => n + Number(r.scored || 0), 0);
      const spent = scoredRuns.reduce((n, r) => n + Number(r.cost_usd || 0), 0);
      const perJob = jobs ? spent / jobs : null;
      return { ...p, per_day: perDay,
               cost_estimate_usd: perJob ? Number((p.allowance * perJob).toFixed(3)) : null,
               cost_basis: perJob ? `measured from ${jobs} of their own scorings` : 'no runs yet' };
    })(),
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
/**
 * Run their matching. THE AGENT DECIDES HOW MANY.
 *
 * This took a "jobs to score" number from the operator and then ignored it
 * whenever the subscriber had a strong backlog — the box read 12 while the run
 * scored 40. A control that does not control is worse than none: it teaches
 * the operator to distrust the screen. The agent already knows the right
 * number (clear the strong backlog, else the daily rate), and /diagnose states
 * it before the button is pressed.
 */
router.post('/subscribers/:tenantId/run', requireOwner, noteOpen, async (req, res) => {
  const tenantId = parseInt(req.params.tenantId, 10);
  try {
    const r = await agents.hunter(tenantId, { trigger: 'admin' });
    await audit(req.admin.email, `ops.run:${tenantId} scored=${r.scored || 0}`, null, tenantId);
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Re-run the presence agent — cheap, no model, regenerates their public surfaces. */
router.post('/subscribers/:tenantId/presence', requireOwner, noteOpen, async (req, res) => {
  const tenantId = parseInt(req.params.tenantId, 10);
  try {
    const r = await agents.presence(tenantId);
    await audit(req.admin.email, 'ops.presence:' + tenantId, null, tenantId);
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

router.patch('/subscribers/:tenantId/targeting', requireOwner, noteOpen, async (req, res) => {
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
    null, tenantId);
  res.json({ ok: true, changed, targeting: next.targeting, quotas: next.quotas });
});

/**
 * Widen an EXISTING subscriber's role targets to the titles employers post.
 *
 * New signups get this automatically. Everyone who signed up before it existed
 * is still searching on the titles they have HELD — and those are precisely the
 * titles employers do not advertise. One subscriber's targets read "Sales
 * Executive"; the job she wanted was posted as "Account Executive" and she
 * matched none of them. Another's read "Technology Executive | Digital
 * Transformation Leader", which is a résumé headline, not a job title anybody
 * posts anywhere.
 *
 * It only ever APPENDS. What the subscriber chose is never removed or
 * reordered, and the whole thing is one audited operator action rather than
 * something that happens to their account behind their back.
 */
router.post('/subscribers/:tenantId/widen-roles', requireOwner, noteOpen, async (req, res) => {
  const tenantId = parseInt(req.params.tenantId, 10);
  const row = await scoped('settings', tenantId).findOne({});
  const profRow = await scoped('profiles', tenantId).findOne({});
  if (!row || !profRow) return res.status(404).json({ error: 'no profile or settings on file' });

  const cur = settingsSvc.sanitize(row.settings);
  const existing = (cur.targeting.roles || []).map((r) => r.title).filter(Boolean);

  let suggested = [];
  try {
    const mt = await resumeSvc.marketTitles(profRow.resume_json || {});
    // With no model key this returns the subscriber's own titles and labels
    // itself simulated — nothing to add, and it must say so rather than
    // reporting a success that changed nothing.
    if (mt && !mt.is_simulated) suggested = mt.titles || [];
  } catch (e) {
    return res.status(502).json({ error: 'could not reach the model: ' + e.message });
  }

  const have = new Set(existing.map((t) => t.toLowerCase()));
  const added = suggested.filter((t) => !have.has(String(t).toLowerCase()));
  if (!added.length) {
    return res.json({ ok: true, added: [], roles: existing,
      note: suggested.length ? 'Nothing to add — their targets already cover the posted titles.'
                             : 'No model available on this instance, so no titles could be suggested.' });
  }

  const next = settingsSvc.sanitize({ ...cur, targeting: { ...cur.targeting,
    roles: existing.concat(added).map((t) => ({ title: t })) } });
  await scoped('settings', tenantId).update({ settings: next }, { id: row.id });
  await audit(req.admin.email, `ops.widen_roles:${tenantId} [+${added.join(', ')}]`, null, tenantId);
  res.json({ ok: true, added, roles: next.targeting.roles.map((r) => r.title) });
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
router.post('/subscribers/:tenantId/rescore', requireOwner, noteOpen, async (req, res) => {
  const tenantId = parseInt(req.params.tenantId, 10);
  const ledger = await scoped('job_scores', tenantId).findAll({});
  const unfiled = ledger.filter((r) => !r.filed);
  for (const r of unfiled) await scoped('job_scores', tenantId).destroy({ id: r.id });
  await audit(req.admin.email, `ops.rescore:${tenantId} reopened=${unfiled.length}`,
    null, tenantId);
  res.json({
    ok: true, reopened: unfiled.length, kept_filed: ledger.length - unfiled.length,
    note: 'Those postings can be scored again. Filed matches were not touched.',
  });
});

module.exports = router;
module.exports.noteOpen = noteOpen;
module.exports.EDITABLE = EDITABLE;
