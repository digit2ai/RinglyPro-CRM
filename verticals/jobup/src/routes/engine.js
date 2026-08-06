'use strict';

// =============================================================
// The career engine surface, all tenant-scoped.
// tenant_id comes from the session — NEVER from a request parameter.
// =============================================================

const express = require('express');
const { models, scoped } = require('../models');
const authSvc = require('../services/auth');
const settingsSvc = require('../services/settings');
const addresses = require('../services/addresses');
const mailer = require('../services/mailer');
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
    out.push({ ...m, job: job || null });
  }
  res.json({ matches: out });
});

router.get('/pipeline', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const rows = await scoped('job_matches', tid).findAll({});
  const stages = ['new', 'saved', 'applied', 'screening', 'interviewing', 'offer', 'closed'];
  const by = {}; stages.forEach((s) => { by[s] = []; });
  rows.forEach((r) => { (by[r.stage] || by.new).push(r); });
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
  await scoped('job_matches', tid).update({ stage: 'applied' }, { job_id: parseInt(req.params.jobId, 10) });
  res.json({ ok: true, id: row.id,
    note: 'Recorded because you confirmed you submitted it. JobUp never submits on your behalf.' });
});

router.get('/outreach', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  res.json({ outreach: await scoped('outreach', tid).findAll({ order: [['created_at', 'DESC']] }) });
});

// The only path that can approve. Nothing else may set approved_at.
router.post('/outreach/:id/approve', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  await scoped('outreach', tid).update(
    { approved_at: new Date(), consent_snapshot: { approved_by: 'subscriber', at: new Date() } },
    { id: parseInt(req.params.id, 10) }
  );
  res.json({ ok: true, note: 'Approved. Sending still respects quiet hours and a live consent check.' });
});

router.post('/agents/:name/run', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const name = req.params.name;
  if (!['hunter', 'broadcaster', 'presence'].includes(name)) {
    return res.status(400).json({ error: 'unknown agent' });
  }
  try {
    res.json(await agents[name](tid));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/agents/runs', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  res.json({ runs: await scoped('agent_runs', tid).findAll({ order: [['created_at', 'DESC']], limit: 50 }) });
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
  res.json({ opportunities: rows, new_count: rows.filter((r) => r.status === 'new').length });
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
  const [matches, opps, out, runs] = await Promise.all([
    scoped('job_matches', tid).findAll({}),
    scoped('opportunities', tid).findAll({}),
    scoped('outreach', tid).findAll({}),
    scoped('agent_runs', tid).findAll({ order: [['created_at', 'DESC']], limit: 5 }),
  ]);
  const fresh = (r) => new Date(r.created_at).getTime() >= since;
  const actions = [];
  const newMatches = matches.filter(fresh);
  const pendingOut = out.filter((o) => !o.approved_at);
  const newOpps = opps.filter((o) => o.status === 'new');
  const strong = matches.filter((m) => m.score >= 80 && m.stage === 'new');

  if (newOpps.length) actions.push({ kind: 'opportunity', n: newOpps.length,
    text: `${newOpps.length} inbound message${newOpps.length > 1 ? 's' : ''} waiting for a reply.` });
  if (pendingOut.length) actions.push({ kind: 'approval', n: pendingOut.length,
    text: `${pendingOut.length} outreach draft${pendingOut.length > 1 ? 's' : ''} need your approval before anything can send.` });
  if (strong.length) actions.push({ kind: 'match', n: strong.length,
    text: `${strong.length} strong match${strong.length > 1 ? 'es' : ''} (80+) you have not applied to yet.` });
  if (!actions.length) actions.push({ kind: 'clear', n: 0, text: 'Nothing needs you right now.' });

  res.json({
    actions,
    new_matches_24h: newMatches.length,
    pending_approvals: pendingOut.length,
    new_opportunities: newOpps.length,
    recent_runs: runs,
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
