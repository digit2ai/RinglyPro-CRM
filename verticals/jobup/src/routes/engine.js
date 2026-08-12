'use strict';

// =============================================================
// The career engine surface, all tenant-scoped.
// tenant_id comes from the session — NEVER from a request parameter.
// =============================================================

const express = require('express');
const { models, scoped, plain } = require('../models');
const authSvc = require('../services/auth');
const settingsSvc = require('../services/settings');
const addresses = require('../services/addresses');
const mailer = require('../services/mailer');
const photos = require('../services/photos');
const profileSvc = require('../services/profile');
const multer = require('multer');
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: photos.MAX_BYTES },
});
const analytics = require('../services/analytics');
const agents = require('../services/agents');
const resumeSvc = require('../services/resume');
const brain = require('../services/brain');

const router = express.Router();

// Session -> tenant. The ONLY source of tenant_id.
function auth(req, res) {
  const token = (req.cookies && req.cookies.jobup_token) ||
    (req.headers.authorization || '').replace(/^Bearer /, '');
  const p = token ? authSvc.readSession(token) : null;
  if (!p) { res.status(401).json({ error: 'not signed in' }); return null; }
  return p.tid;
}

const issue = authSvc.issueSession;

router.get('/me', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const sub = await models.subscribers.findOne({ where: { id: tid } });
  if (!sub) return res.status(404).json({ error: 'not found' });
  const pRow = await scoped('profiles', tid).findOne({});
  const profile = (pRow && pRow.resume_json) || {};
  res.json({ id: sub.id, email: sub.email, name: sub.name, address: sub.address, status: sub.status,
             headline: profile.headline || null });
});

router.get('/settings', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const row = await scoped('settings', tid).findOne({});
  res.json({ settings: settingsSvc.sanitize((row && row.settings) || {}) });
});

router.put('/settings', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  // sanitize() forces approval_required back on, every time.
  const clean = settingsSvc.sanitize(req.body && req.body.settings);
  const row = await scoped('settings', tid).findOne({});
  if (row) await scoped('settings', tid).update({ settings: clean }, { id: row.id });
  else await scoped('settings', tid).create({ settings: clean });
  res.json({ settings: clean });
});

router.get('/matches', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const rows = await scoped('job_matches', tid).findAll({ order: [['score', 'DESC']], limit: 100 });
  const out = [];
  for (const m of rows) {
    const job = await models.jobs.findOne({ where: { id: m.job_id } });
    out.push({ ...plain(m), job: plain(job) || null });
  }
  res.json({ matches: out });
});

const STAGES = ['new', 'saved', 'applied', 'screening', 'interviewing', 'offer', 'closed'];

/**
 * Move a match through the pipeline.
 *
 * The Pipeline tab has always shown seven columns, but only ONE transition
 * existed — 'I applied'. Six of the seven were unreachable, so a real search
 * (screening -> interviewing -> offer) could never be tracked, which is most of
 * what a pipeline is for.
 */
router.patch('/matches/:id', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const t = scoped('job_matches', tid);
  const row = await t.findOne({ id: parseInt(req.params.id, 10) });
  if (!row) return res.status(404).json({ error: 'not found' });

  const patch = {};
  if (req.body && req.body.stage !== undefined) {
    if (!STAGES.includes(req.body.stage)) {
      return res.status(400).json({ error: 'unknown stage', stages: STAGES });
    }
    patch.stage = req.body.stage;
    patch.stage_changed_at = new Date();
  }
  if (req.body && typeof req.body.note === 'string') patch.note = req.body.note.slice(0, 4000);
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'nothing to change' });

  await t.update(patch, { id: row.id });
  res.json({ ok: true, match: plain(await t.findOne({ id: row.id })) });
});

/**
 * Track an inbound message in the pipeline.
 *
 * Opportunities and the pipeline were separate worlds: a recruiter could reach
 * you, you could draft a reply, and then there was nowhere to record that it
 * went to a screen and then an interview. Half of a real search happens in
 * conversations nobody's agent found.
 */
router.post('/opportunities/:id/track', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const opps = scoped('opportunities', tid);
  const o = await opps.findOne({ id: parseInt(req.params.id, 10) });
  if (!o) return res.status(404).json({ error: 'not found' });

  const t2 = scoped('job_matches', tid);
  const already = (await t2.findAll({})).find((m) => m.opportunity_id === o.id);
  if (already) {
    return res.json({ ok: true, already: true, match: plain(already),
                      note: 'Already in your pipeline.' });
  }

  const row = await t2.create({
    job_id: null, source: 'inbound', opportunity_id: o.id,
    title: o.role || 'Inbound conversation',
    employer: o.company || o.from_name || null,
    score: null, stage: req.body && STAGES.includes(req.body.stage) ? req.body.stage : 'screening',
    stage_changed_at: new Date(),
    note: o.note ? String(o.note).slice(0, 1000) : null,
  });
  res.json({ ok: true, match: plain(row),
    note: 'Tracked. Move it through the stages as the conversation progresses.' });
});

/** Add a role you are tracking that nobody's agent found. */
router.post('/pipeline', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const b = req.body || {};
  const title = String(b.title || '').trim().slice(0, 250);
  if (!title) return res.status(400).json({ error: 'A role title is required.' });
  const stage = STAGES.includes(b.stage) ? b.stage : 'saved';

  const row = await scoped('job_matches', tid).create({
    job_id: null, source: 'manual', title,
    employer: String(b.employer || '').trim().slice(0, 250) || null,
    score: null, stage, stage_changed_at: new Date(),
    note: typeof b.note === 'string' ? b.note.slice(0, 4000) : null,
  });
  res.json({ ok: true, match: plain(row) });
});

router.delete('/matches/:id', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const t2 = scoped('job_matches', tid);
  const row = await t2.findOne({ id: parseInt(req.params.id, 10) });
  if (!row) return res.status(404).json({ error: 'not found' });
  // Only entries you added yourself. A Hunter match is re-created on the next
  // run anyway, so deleting one just makes it reappear.
  if (row.source === 'hunter') {
    return res.status(400).json({
      error: 'Move a found match to closed instead — deleting it only makes the Hunter find it again.' });
  }
  await t2.destroy({ id: row.id });
  res.json({ ok: true });
});

router.get('/pipeline', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const rows = plain(await scoped('job_matches', tid).findAll({}));
  const stages = STAGES;
  const by = {}; stages.forEach((s) => { by[s] = []; });
  for (const r of rows) {
    const job = r.job_id ? plain(await models.jobs.findOne({ where: { id: r.job_id } })) : null;
    (by[r.stage] || by.new).push({
      ...r, job,
      // One shape for the board whether the Hunter found it, a recruiter
      // brought it, or you typed it in.
      display_title: (job && job.title) || r.title || `#${r.job_id || r.id}`,
      display_employer: (job && job.employer) || r.employer || '',
    });
  }
  res.json({ pipeline: by, stages });
});

// Tailoring — enforces the no-invented-facts guard and the monthly quota.
router.post('/tailor/:jobId', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const sRow = await scoped('settings', tid).findOne({});
  const settings = settingsSvc.sanitize((sRow && sRow.settings) || {});

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const used = (await scoped('tailored_resumes', tid).findAll({}))
    .filter((r) => new Date(r.created_at) >= monthStart).length;
  const limit = settings.quotas.tailor_monthly_limit;
  if (used >= limit) {
    return res.status(429).json({ error: `Monthly tailoring limit reached (${used}/${limit}).`, used, limit });
  }

  const job = await models.jobs.findOne({ where: { id: parseInt(req.params.jobId, 10) } });
  if (!job) return res.status(404).json({ error: 'job not found' });

  const pRow = await scoped('profiles', tid).findOne({});
  const source = (pRow && pRow.source_text) || '';
  const t = await resumeSvc.tailor(source, job);

  const row = await scoped('tailored_resumes', tid).create({
    job_id: job.id, content: t.content, diff: t.changes,
    flagged_terms: t.flagged, is_simulated: t.is_simulated,
    // A version with flagged terms CANNOT be saved as confirmed.
    confirmed: t.flagged.length === 0,
  });

  res.json({
    id: row.id, changes: t.changes, flagged: t.flagged,
    requires_confirmation: t.flagged.length > 0,
    is_simulated: t.is_simulated,
    ats: resumeSvc.atsScore(t.content, job),
    used: used + 1, limit,
  });
});

// Deterministic, free ATS scoring — no model call.
router.get('/ats/:jobId', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const job = await models.jobs.findOne({ where: { id: parseInt(req.params.jobId, 10) } });
  if (!job) return res.status(404).json({ error: 'job not found' });
  const pRow = await scoped('profiles', tid).findOne({});
  res.json(resumeSvc.atsScore((pRow && pRow.source_text) || '', job));
});

// An application is recorded ONLY when the subscriber confirms they submitted it.
router.post('/applications/:jobId/confirm', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const row = await scoped('applications', tid).create({
    job_id: parseInt(req.params.jobId, 10),
    confirmed_by_subscriber_at: new Date(),
  });
  await scoped('job_matches', tid).update({ stage: 'applied', stage_changed_at: new Date() }, { job_id: parseInt(req.params.jobId, 10) });
  res.json({ ok: true, id: row.id,
    note: 'Recorded because you confirmed you submitted it. JobUp never submits on your behalf.' });
});

/**
 * A short cooldown on the button, on top of the daily ceilings in the agent.
 *
 * The ceilings are the real defence — they are in the database and survive a
 * restart. This is the cheap one: a double-click, an impatient tap, or a script
 * hammering the endpoint should not run a hundred concurrent pool scans before
 * the first has finished reading how much is left.
 *
 * In memory on purpose: a cooldown that resets on deploy fails OPEN, which is
 * the right way for a nicety to fail. Nothing about spend depends on it.
 */
const runCooldown = new Map();
const RUN_COOLDOWN_MS = parseInt(process.env.JOBUP_RUN_COOLDOWN_MS || '20000', 10);

router.post('/agents/:name/run', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const name = req.params.name;
  if (!['hunter', 'presence'].includes(name)) {
    return res.status(400).json({ error: 'unknown agent' });
  }

  const key = `${tid}:${name}`;
  const last = runCooldown.get(key) || 0;
  const wait = RUN_COOLDOWN_MS - (Date.now() - last);
  if (wait > 0) {
    return res.status(429).json({
      error: `That is still running, or just finished. Try again in ${Math.ceil(wait / 1000)}s.`,
      retry_in_s: Math.ceil(wait / 1000),
    });
  }
  runCooldown.set(key, Date.now());
  if (runCooldown.size > 5000) runCooldown.clear();   // unbounded maps are a leak

  try {
    res.json(await agents[name](tid, { trigger: 'manual' }));
  } catch (e) {
    runCooldown.delete(key);   // a failed run should not cost you the cooldown
    res.status(500).json({ error: e.message });
  }
});

/** What is left of today, so the dashboard can say so before you press. */
router.get('/agents/budget', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const row = await scoped('settings', tid).findOne({});
  const st = settingsSvc.sanitize((row && row.settings) || {});
  const all = await agents.usedToday(tid);
  const manual = await agents.usedToday(tid, 'manual');
  const perDay = (st.quotas && st.quotas.jobs_scored_per_day) || 6;
  const manualCap = (st.quotas && st.quotas.manual_runs_per_day) != null
    ? st.quotas.manual_runs_per_day : 1;
  const budget = (st.cost_cap_usd || 8) / 30;
  res.json({
    manual_runs_used: all.manual_runs,
    manual_runs_per_day: manualCap,
    manual_runs_left: Math.max(0, manualCap - all.manual_runs),
    manual_jobs_left: Math.max(0, perDay - manual.scored),
    jobs_per_day: perDay,
    scored_today: all.all_scored,
    spent_today: Number(all.all_spent.toFixed(5)),
    daily_budget: Number(budget.toFixed(5)),
    runs_today: all.runs,
    resets: 'midnight UTC',
    note: 'Your manual search has its own daily allowance — the scheduled run never uses it up.',
  });
});

router.get('/agents/runs', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  res.json({ runs: plain(await scoped('agent_runs', tid).findAll({ order: [['created_at', 'DESC']], limit: 50 })) });
});

// Full data export — real, complete, self-service (spec 8.7 / 19.1).
router.get('/export', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const sub = await models.subscribers.findOne({ where: { id: tid } });
  const out = { subscriber: sub, exported_at: new Date() };
  for (const t of ['profiles', 'settings', 'job_matches', 'tailored_resumes',
                   'applications', 'opportunities', 'outreach', 'agent_runs', 'invoices']) {
    out[t] = await scoped(t, tid).findAll({});
  }
  res.setHeader('Content-Disposition', 'attachment; filename="jobup-export.json"');
  res.json(out);
});

// Account deletion — removes the resume text itself, not only the row.
router.delete('/account', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  for (const t of ['profiles', 'settings', 'job_matches', 'tailored_resumes',
                   'applications', 'opportunities', 'outreach', 'agent_runs',
                   'invoices', 'sites', 'notification_prefs']) {
    await scoped(t, tid).destroy({});
  }
  await models.subscribers.destroy({ where: { id: tid } });
  res.json({ ok: true, note: 'Account and all personal data deleted, including stored resume text.' });
});

// ---------------------------------------------------------------
// Analytics — traffic to the subscriber's own public site.
// ---------------------------------------------------------------
router.get('/analytics', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const days = Math.min(90, Math.max(7, parseInt(req.query.days, 10) || 30));
  res.json(await analytics.summary(tid, days));
});

// ---------------------------------------------------------------
// Opportunities — INBOUND interest. The subscriber's own inbox.
// ---------------------------------------------------------------
router.get('/opportunities', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const rows = await scoped('opportunities', tid).findAll({
    order: [['created_at', 'DESC']], limit: 100,
  });
  const list = plain(rows);
  res.json({ opportunities: list, new_count: list.filter((r) => r.status === 'new').length });
});

router.patch('/opportunities/:id', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const t = scoped('opportunities', tid);
  const row = await t.findOne({ id: parseInt(req.params.id, 10) });
  if (!row) return res.status(404).json({ error: 'not found' });
  const patch = {};
  if (['new', 'read', 'replied', 'archived'].includes(req.body.status)) {
    patch.status = req.body.status;
    if (req.body.status === 'read' && !row.read_at) patch.read_at = new Date();
    if (req.body.status === 'replied') patch.replied_at = new Date();
  }
  if (typeof req.body.reply_draft === 'string') patch.reply_draft = req.body.reply_draft.slice(0, 8000);
  await t.update(patch, { id: row.id });
  res.json({ ok: true, opportunity: await t.findOne({ id: row.id }) });
});

/**
 * Draft a reply the subscriber sends THEMSELVES, from their own email client.
 * JobUp never sends it — the draft comes back with a mailto: the subscriber
 * clicks. That is what keeps replies coming from a person, not a bot.
 */
router.post('/opportunities/:id/draft-reply', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const t = scoped('opportunities', tid);
  const row = await t.findOne({ id: parseInt(req.params.id, 10) });
  if (!row) return res.status(404).json({ error: 'not found' });

  const pRow = await scoped('profiles', tid).findOne({});
  const profile = (pRow && pRow.resume_json) || {};
  const sRow = await scoped('settings', tid).findOne({});
  const settings = settingsSvc.sanitize((sRow && sRow.settings) || {});
  const facts = settingsSvc.outreachFacts(settings);

  let body; let simulated = false;
  const prompt = [
    'Draft a short, professional reply to this inbound message about a role.',
    'Use ONLY the facts given. Invent nothing — no availability, no salary, no',
    'work authorization unless it appears verbatim below. Plain text, no subject line.',
    '', 'THEIR MESSAGE:', row.note || '(no message body)',
    '', 'FROM:', [row.from_name, row.company, row.role].filter(Boolean).join(' · ') || 'unknown',
    '', 'ABOUT ME:', profile.headline || '', profile.summary || '',
    facts.lines.length ? '\nFACTS I HAVE STATED (quote exactly, or omit):\n' + facts.lines.join('\n') : '',
  ].join('\n');

  const out = await brain.json({
    system: 'You draft short professional replies. Return JSON: {"body": "..."}',
    prompt, maxTokens: 600,
  });
  if (out.ok && out.data && out.data.body) { body = String(out.data.body).trim(); }
  else {
    simulated = true;
    body = [
      `Hello${row.from_name ? ' ' + row.from_name : ''},`, '',
      `Thank you for reaching out about ${row.role || 'the role'}${row.company ? ' at ' + row.company : ''}.`,
      'I would be glad to learn more. What would be a good time to talk?',
      ...facts.lines, '', profile.name || '',
    ].filter((l) => l !== undefined).join('\n');
  }

  await t.update({ reply_draft: body, status: row.status === 'new' ? 'read' : row.status,
                   read_at: row.read_at || new Date() }, { id: row.id });

  const to = row.from_email || '';
  const subject = `Re: ${row.role || 'your message'}${row.company ? ' — ' + row.company : ''}`;
  res.json({
    ok: true, draft: body, is_simulated: simulated,
    mailto: `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    note: 'JobUp does not send this. Open it in your own mail client, edit it, and send it yourself.',
  });
});

// ---------------------------------------------------------------
// Today — the daily digest. Everything waiting on the subscriber.
// ---------------------------------------------------------------
router.get('/today', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const since = Date.now() - 86400000;
  const [matches, opps, runs] = await Promise.all([
    scoped('job_matches', tid).findAll({}),
    scoped('opportunities', tid).findAll({}),
    scoped('agent_runs', tid).findAll({ order: [['created_at', 'DESC']], limit: 5 }),
  ]);
  const fresh = (r) => new Date(r.created_at).getTime() >= since;
  const actions = [];
  const newMatches = matches.filter(fresh);
  const newOpps = opps.filter((o) => o.status === 'new');
  const strong = matches.filter((m) => m.score >= 80 && m.stage === 'new');

  if (newOpps.length) actions.push({ kind: 'opportunity', n: newOpps.length,
    text: `${newOpps.length} inbound message${newOpps.length > 1 ? 's' : ''} waiting for a reply.` });
  if (strong.length) actions.push({ kind: 'match', n: strong.length,
    text: `${strong.length} strong match${strong.length > 1 ? 'es' : ''} (80+) you have not applied to yet.` });
  if (!actions.length) actions.push({ kind: 'clear', n: 0, text: 'Nothing needs you right now.' });

  res.json({
    actions,
    new_matches_24h: newMatches.length,
    new_opportunities: newOpps.length,
    recent_runs: plain(runs),
  });
});

// ---------------------------------------------------------------
// Targets — the roles and employers the Hunter aims at.
// ---------------------------------------------------------------
router.get('/targets', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const sRow = await scoped('settings', tid).findOne({});
  const settings = settingsSvc.sanitize((sRow && sRow.settings) || {});
  res.json({
    role_targets: settings.role_targets || [],
    page_roles: settingsSvc.pageRoles(settings),
    excluded_employers: settings.excluded_employers || [],
    do_not_contact: settings.do_not_contact || [],
    countries: settings.countries || [],
    remote_only: Boolean(settings.remote_only),
  });
});

/**
 * Email an inbound message to yourself.
 *
 * USER-CLICKED ONLY — the subscriber presses a button, and it goes to their own
 * address and nowhere else. Reply-To is set to the recruiter, so hitting reply
 * in their own mail client answers the recruiter directly and the reply comes
 * from a person rather than from us.
 */
router.post('/opportunities/:id/email-me', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const t = scoped('opportunities', tid);
  const row = await t.findOne({ id: parseInt(req.params.id, 10) });
  if (!row) return res.status(404).json({ error: 'not found' });

  const sub = await models.subscribers.findOne({ where: { id: tid } });
  if (!sub || !sub.email) return res.status(400).json({ error: 'no address on file' });

  if (!mailer.configured()) {
    return res.status(503).json({ ...mailer.status(),
      error: 'Email is not configured on this deployment.' });
  }

  const body = mailer.renderOpportunity(row, sub.name);
  const r = await mailer.send({
    to: sub.email,
    subject: `${row.role || 'Message'}${row.company ? ' — ' + row.company : ''}`,
    text: body.text, html: body.html,
    replyTo: row.from_email || null,
  });
  if (!r.ok) return res.status(502).json(r);

  await models.audit_log.create({
    tenant_id: tid, actor: 'subscriber', action: 'email_to_self',
    reason: `opportunity ${row.id}`,
  });
  res.json({ ok: true, sent_to: sub.email,
    note: 'Sent to your own address. Reply from there to answer them directly.' });
});

router.get('/email/status', (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  res.json(mailer.status());
});

/**
 * Is the daily run on? A subscriber should be able to see whether their agents
 * actually run on their own, or only when they press a button.
 */
router.get('/schedule', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const st = require('../services/scheduler').status();
  const runs = await scoped('agent_runs', tid).findAll({ order: [['created_at', 'DESC']], limit: 1 });
  res.json({
    daily: st.enabled,
    last_run_for_you: runs.length ? runs[0].created_at : null,
    on_demand: 'Always available — the Run buttons work whether or not the daily run is on.',
    note: st.note,
  });
});

// ---------------------------------------------------------------
// The résumé record itself — every field, editable.
//
// This writes resume_json, which the site, resume.json, the JSON-LD, the agent
// card, llms.txt and the matcher all read. Editing here changes what recruiters
// see AND what the Hunter scores against, so it is bounded and shaped on the
// way in rather than trusted.
// ---------------------------------------------------------------
/**
 * The subscriber's own referral link and results.
 *
 * Deliberately returns NO referee names or emails. A referrer is owed a
 * commission, not a list of who their friends are — the invitee's identity is
 * not the referrer's to see.
 */
router.get('/referral', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  try {
    const referrals = require('../services/referrals');
    res.json(await referrals.statsFor(tid));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/profile', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const row = await scoped('profiles', tid).findOne({});
  const sub = await models.subscribers.findOne({ where: { id: tid } });
  res.json({
    profile: profileSvc.forEditor(row && row.resume_json),
    has_photo: Boolean(row && row.photo_asset_id),
    photo_url: row && row.photo_asset_id ? `/photo?v=${row.photo_asset_id}` : null,
    public_url: sub && sub.address ? `https://${sub.address}` : null,
    limits: profileSvc.LIMITS,
    note: 'Everything here is yours. Nothing is generated — empty stays empty.',
  });
});

router.put('/profile', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const patch = (req.body && req.body.profile) || {};
  if (typeof patch !== 'object' || Array.isArray(patch)) {
    return res.status(400).json({ error: 'profile must be an object' });
  }

  const row = await scoped('profiles', tid).findOne({});
  const next = profileSvc.applyEdit(row && row.resume_json, patch);

  if (row) await scoped('profiles', tid).update({ resume_json: next }, { id: row.id });
  else await scoped('profiles', tid).create({ resume_json: next });

  // The public name follows the résumé name; the ADDRESS deliberately does not
  // — a link someone saved must not move because a headline was retyped.
  if (patch.name && next.name) {
    await models.subscribers.update({ name: next.name }, { where: { id: tid } });
  }

  res.json({
    ok: true,
    profile: profileSvc.forEditor(next),
    note: 'Saved. Your public page, resume.json and agent card all update immediately.',
  });
});

// ---------------------------------------------------------------
// Profile photo — replace or remove it.
//
// It could only be set at signup, so anyone who skipped it, or wanted a better
// one later, was stuck with initials forever.
// ---------------------------------------------------------------
router.post('/photo', photoUpload.single('photo'), async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  if (!req.file) return res.status(400).json({ error: 'No image received.' });

  const ph = photos.accept(req.file.buffer, req.file.mimetype);
  if (!ph.ok) return res.status(400).json({ error: ph.reason });

  const asset = await scoped('assets', tid).create({
    kind: 'photo', mime: ph.mime, bytes: ph.bytes, data: ph.base64,
  });

  const prof = await scoped('profiles', tid).findOne({});
  const previousId = prof && prof.photo_asset_id;
  if (prof) await scoped('profiles', tid).update({ photo_asset_id: asset.id }, { id: prof.id });
  else await scoped('profiles', tid).create({ resume_json: {}, photo_asset_id: asset.id });

  // Drop the old one rather than leaving orphaned image rows behind.
  if (previousId && previousId !== asset.id) {
    await scoped('assets', tid).destroy({ id: previousId });
  }

  res.json({ ok: true, bytes: ph.bytes, mime: ph.mime,
             url: '/photo?v=' + asset.id,
             note: 'Your photo is live. Reload your public page to see it.' });
});

router.delete('/photo', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const prof = await scoped('profiles', tid).findOne({});
  if (!prof || !prof.photo_asset_id) return res.json({ ok: true, note: 'No photo on file.' });
  await scoped('assets', tid).destroy({ id: prof.photo_asset_id });
  await scoped('profiles', tid).update({ photo_asset_id: null }, { id: prof.id });
  res.json({ ok: true, note: 'Photo removed. Your page shows your initials again.' });
});

router.get('/photo/status', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const prof = await scoped('profiles', tid).findOne({});
  const id = prof && prof.photo_asset_id;
  if (!id) return res.json({ has_photo: false, max_bytes: photos.MAX_BYTES });
  const a = await scoped('assets', tid).findOne({ id });
  res.json({ has_photo: Boolean(a), bytes: a && a.bytes, mime: a && a.mime,
             url: '/photo?v=' + id, max_bytes: photos.MAX_BYTES });
});

// ---------------------------------------------------------------
// Your web address — personalise it.
//
// The default comes from the person's name. If they do not like it, they set
// their own. The OLD address is kept forever: it redirects to the new one, and
// it can never be handed to anyone else, because a recruiter may be holding
// that link.
// ---------------------------------------------------------------
router.get('/address', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const sub = await models.subscribers.findOne({ where: { id: tid } });
  if (!sub) return res.status(404).json({ error: 'not found' });
  const aliases = await scoped('address_aliases', tid).findAll({});
  res.json({
    address: sub.address || null,
    url: sub.address ? `https://${sub.address}` : null,
    base_domain: addresses.BASE_DOMAIN,
    previous: aliases.map((a) => a.address),
    note: 'Any address you have used before keeps working and redirects here.',
  });
});

router.get('/address/check', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const v = addresses.validateLabel(req.query.label);
  if (!v.ok) return res.json({ available: false, reason: v.reason });

  const sub = await models.subscribers.findOne({ where: { id: tid } });
  const host = `${v.label}.${addresses.BASE_DOMAIN}`;
  if (sub && sub.address === host) {
    return res.json({ available: false, label: v.label, host, reason: 'That is already your address.' });
  }
  // One of their own retired addresses is free for them to take back.
  const ownAlias = await scoped('address_aliases', tid).findOne({ address: host });
  if (ownAlias) return res.json({ available: true, label: v.label, host, url: `https://${host}`, yours_previously: true });

  const taken = await addresses.isTaken(v.label);
  res.json(taken
    ? { available: false, label: v.label, host, reason: 'That address is already taken.' }
    : { available: true, label: v.label, host, url: `https://${host}` });
});

router.post('/address', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const v = addresses.validateLabel(req.body && req.body.label);
  if (!v.ok) return res.status(400).json({ error: v.reason });

  const sub = await models.subscribers.findOne({ where: { id: tid } });
  if (!sub) return res.status(404).json({ error: 'not found' });
  if (sub.status !== 'active') return res.status(403).json({ error: 'Your subscription is not active.' });

  const host = `${v.label}.${addresses.BASE_DOMAIN}`;
  if (sub.address === host) return res.json({ ok: true, address: host, url: `https://${host}`, unchanged: true });

  const ownAlias = await scoped('address_aliases', tid).findOne({ address: host });
  if (!ownAlias && await addresses.isTaken(v.label)) {
    return res.status(409).json({ error: 'That address is already taken.' });
  }

  const previous = sub.address;
  // Reserve the old one BEFORE switching, so a crash cannot free it.
  if (previous && previous !== host) {
    const existing = await scoped('address_aliases', tid).findOne({ address: previous });
    if (!existing) await scoped('address_aliases', tid).create({ address: previous });
  }
  // Taking back one of their own retired addresses releases it as an alias.
  if (ownAlias) await scoped('address_aliases', tid).destroy({ id: ownAlias.id });

  await models.subscribers.update({ address: host }, { where: { id: tid } });
  const site = await scoped('sites', tid).findOne({});
  if (site) await scoped('sites', tid).update({ address: host }, { id: site.id });

  await models.audit_log.create({
    tenant_id: tid, actor: 'subscriber', action: 'address_change',
    reason: `${previous || '(none)'} -> ${host}`,
  });

  res.json({
    ok: true, address: host, url: `https://${host}`, previous,
    note: previous
      ? `${previous} will keep working and now redirects here.`
      : 'Your address is live.',
  });
});

module.exports = router;
module.exports.issue = issue;
module.exports.auth = auth;
