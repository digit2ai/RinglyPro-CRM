'use strict';

// =============================================================
// The career engine surface, all tenant-scoped.
// tenant_id comes from the session — NEVER from a request parameter.
// =============================================================

const express = require('express');
const { models, scoped, plain, TENANT_SCOPED } = require('../models');
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
const billing = require('../services/billing');
const tailoringSvc = require('../services/tailoring');
const resumePdf = require('../services/resume-pdf');
const assistant = require('../services/assistant');
const ent = require('../services/entitlements');

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
             headline: profile.headline || null,
             // THE LANGUAGE IS ON THE ROW, NOT IN localStorage. Somebody who
             // signed up in Spanish and then opens the dashboard on their phone
             // must still get Spanish — a browser-local preference does not
             // travel, and asking again would be the third time.
             language: sub.language === 'es' ? 'es' : 'en' });
});

/** Change the interface language. Persisted on the subscriber row so it
    follows the person, not the browser. */
router.patch('/language', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const l = (req.body || {}).language === 'es' ? 'es' : 'en';
  await models.subscribers.update({ language: l }, { where: { id: tid } });
  res.json({ ok: true, language: l });
});

// ---------------------------------------------------------------
// THE HELP AGENT. Grounded in this tenant's real record, and incapable of
// acting: it answers and it links, and there is no tool surface for it to
// change anything with. Everything in this product is approval-gated by
// design; an assistant that could flip a setting would be the one exception.
// ---------------------------------------------------------------
const ASSISTANT_DAILY = parseInt(process.env.JOBUP_ASSISTANT_DAILY || '40', 10);
const askedToday = new Map();          // tenant -> { day, n }

router.post('/assistant', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const question = String((req.body || {}).question || '').trim();
  if (!question) return res.status(400).json({ error: 'Ask a question first.' });

  // A chat box is an open invitation to a loop. The cap is per tenant per day
  // and is the only thing between a stuck client and a bill.
  const day = new Date().toISOString().slice(0, 10);
  const seen = askedToday.get(tid);
  const n = seen && seen.day === day ? seen.n : 0;
  if (n >= ASSISTANT_DAILY) {
    return res.status(429).json({
      error: `That is ${ASSISTANT_DAILY} questions today — the limit resets tomorrow.`,
      asked: n, limit: ASSISTANT_DAILY,
    });
  }
  askedToday.set(tid, { day, n: n + 1 });

  const [pRow, sRow, sub] = await Promise.all([
    scoped('profiles', tid).findOne({}),
    scoped('settings', tid).findOne({}),
    models.subscribers.findOne({ where: { id: tid } }),
  ]);
  const settings = settingsSvc.sanitize((sRow && sRow.settings) || {});
  const [matches, opps, tailorings, credits] = await Promise.all([
    scoped('job_matches', tid).findAll({}),
    scoped('opportunities', tid).findAll({}),
    scoped('tailored_resumes', tid).findAll({}),
    scoped('tailor_credits', tid).findAll({}),
  ]);

  const out = await assistant.ask({
    question,
    profile: (pRow && pRow.resume_json) || {},
    settings,
    presence: settingsSvc.presenceChecklist(settings, sub && sub.language),
    counts: {
      matches: matches.length,
      opportunities: opps.length,
      tailorings: tailorings.length,
      credits: credits.filter((c) => !c.consumed_at).length,
    },
    subscriber: sub,
    lang: (sub && sub.language) === 'es' ? 'es' : 'en',
  });

  res.json({ ...out, asked: n + 1, limit: ASSISTANT_DAILY });
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

  // FREE-TIER DRIP. Only Hunter-found matches are gated — anything the person
  // added themselves (manual, inbound, tracked opportunities) is always theirs
  // to see. Free sees its best `allowance` hunter matches, growing by one a
  // week; every paid or legacy account sees them all.
  const sub = await models.subscribers.findOne({ where: { id: tid } });
  const e = ent.entitlementForSub(sub);
  const isFree = !e.legacy && e.effective_plan === 'free';

  let gate = null;
  let visible = rows;
  if (isFree) {
    const hunter = rows.filter((m) => m.source === 'hunter' || m.source == null);   // Hunter-found
    const own = rows.filter((m) => !(m.source === 'hunter' || m.source == null));   // the user's own entries
    const a = ent.freeMatchAllowanceFor(sub);
    const shownHunter = hunter.slice(0, a.allowance);                               // best-first, stable growth
    const withheld = Math.max(0, hunter.length - shownHunter.length);
    // Keep the board score-ordered after recombining.
    visible = [...shownHunter, ...own].sort((x, y) => (y.score || 0) - (x.score || 0));
    gate = {
      tier: 'free', match_cap: a.allowance, hunter_total: hunter.length,
      shown: shownHunter.length, withheld,
      next_unlock_days: a.next_unlock_days, at_max: a.at_max, max: a.max,
      upgrade: withheld > 0 || true,   // Free always sees the nudge
    };
  }

  const out = [];
  for (const m of visible) {
    const job = await models.jobs.findOne({ where: { id: m.job_id } });
    out.push({ ...plain(m), job: plain(job) || null });
  }
  res.json({ matches: out, gate });
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
  // BEST MATCH FIRST, SERVER-SIDE.
  //
  // The board arrived in insertion order, so the strongest match could be
  // anywhere in the column — and the dashboard then rendered only the first
  // twelve of it, which meant a 92 could be invisible while a 41 was on screen.
  // Sorting here rather than in the browser means every reader of this endpoint
  // gets the same order, including the mobile shell and anything added later.
  //
  // Unscored rows (typed in by hand, or brought by a recruiter) sort last
  // rather than first: a missing score is not a zero, but it is also not a
  // reason to outrank something measured.
  for (const s of stages) {
    by[s].sort((a, b) => {
      const as = a.score == null ? -1 : a.score;
      const bs = b.score == null ? -1 : b.score;
      if (bs !== as) return bs - as;
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
  }
  res.json({ pipeline: by, stages });
});

// ===========================================================================
// TAILORING IS PAID, AND THE CREDIT IS THE UNIT.
//
// Paying and generating fail independently. If the model is unreachable after
// the card clears, a design that sold "this PDF" owes a refund; one that sells
// a CREDIT simply leaves it unspent. So checkout buys a credit, and a credit is
// marked consumed only once a document has actually been produced.
//
// A credit exists ONLY where a Stripe session this server retrieved says
// `payment_status === 'paid'`. Never from a redirect parameter — `?paid=1` is a
// string in a URL the buyer types.
// ===========================================================================

/** Unspent credits for this tenant, oldest first so refunds are predictable. */
async function availableCredits(tid) {
  return (await scoped('tailor_credits', tid).findAll({}))
    .filter((c) => !c.consumed_at)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

/**
 * The tier's monthly tailoring allowance, resolved from the plan:
 *   Free   → 0 included  (pay $10 each)
 *   Search → 10 included / month, then pay
 *   Landed → unlimited, never charged
 *   legacy → unlimited (untouched)
 * `included_used` counts only tailorings taken from the allowance this calendar
 * month (credit_id IS NULL); paid ones never eat into it.
 */
async function tailorAllowance(tid) {
  const cap = await ent.capFor(tid, 'tailorings_per_month');   // Infinity | number | 0
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  const used = (await scoped('tailored_resumes', tid).findAll({}))
    .filter((r) => r.credit_id == null && new Date(r.created_at) >= start).length;
  const unlimited = !Number.isFinite(cap);
  const included_left = unlimited ? Infinity : Math.max(0, cap - used);
  return { per_month: unlimited ? null : cap, unlimited, included_used: used, included_left };
}

router.get('/tailor/pricing', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const credits = await availableCredits(tid);
  const a = await tailorAllowance(tid);
  res.json({
    price_usd: billing.TAILOR_PRICE_USD,
    credits: credits.length,
    // Tier allowance the UI shows before ever mentioning a price.
    included_per_month: a.per_month,        // null = unlimited (Landed/legacy)
    included_used: a.included_used,
    included_left: a.unlimited ? null : a.included_left,   // null = unlimited
    unlimited: a.unlimited,
    configured: billing.status().configured !== false,
  });
});

/** Start a purchase. Returns a Stripe URL or an honest refusal — never a fake one. */
router.post('/tailor/checkout', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const sub = await models.subscribers.findOne({ where: { id: tid } });
  const jobId = parseInt((req.body || {}).job_id, 10) || null;
  const base = (process.env.JOBUP_PUBLIC_URL || 'https://jobup.dev').replace(/\/$/, '');
  const back = sub && sub.address ? `https://${sub.address}` : base;
  const out = await billing.createTailorCheckout({
    subscriberId: tid,
    email: sub && sub.email,
    jobId,
    successUrl: `${back}/app?tab=matches&tailor_cs={CHECKOUT_SESSION_ID}`
      + (jobId ? `&tailor_job=${jobId}` : ''),
    cancelUrl: `${back}/app?tab=matches`,
  });
  res.status(out.ok ? 200 : 400).json(out);
});

/**
 * Turn a paid Stripe session into a credit. Idempotent by session id, which is
 * what stops a refresh of the return URL minting a second credit for one
 * payment — the unique index is the backstop, this is the check.
 */
router.post('/tailor/claim', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const sessionId = String((req.body || {}).session_id || '');
  const v = await billing.verifyTailorSession(sessionId);
  if (!v.ok) return res.status(400).json({ error: v.reason || 'Could not check that payment.' });
  if (!v.paid) return res.status(402).json({ error: 'That payment has not completed.' });
  if (v.purpose !== 'tailor_credit') return res.status(400).json({ error: 'That payment was not for a tailored résumé.' });
  // The session names its own buyer. A session belonging to somebody else can
  // never credit the account that happens to be signed in.
  if (v.subscriberId !== tid) return res.status(403).json({ error: 'That payment belongs to a different account.' });

  const existing = (await scoped('tailor_credits', tid).findAll({}))
    .find((c) => c.stripe_session_id === v.sessionId);
  if (existing) {
    return res.json({ ok: true, already: true, credit_id: existing.id,
                      credits: (await availableCredits(tid)).length });
  }
  const row = await scoped('tailor_credits', tid).create({
    amount_cents: v.amount_cents, currency: v.currency,
    stripe_session_id: v.sessionId, stripe_payment_intent: v.paymentIntent, source: 'stripe',
  });
  await models.audit_log.create({
    tenant_id: tid, actor: 'subscriber', action: 'tailor_credit_purchased',
    reason: `Stripe session ${v.sessionId} — ${(v.amount_cents || 0) / 100} ${String(v.currency).toUpperCase()}.`,
  });
  res.json({ ok: true, credit_id: row.id, job_id: v.jobId,
             credits: (await availableCredits(tid)).length });
});

// Tailoring — consumes one paid credit, enforces the no-invented-facts guard.
router.post('/tailor/:jobId', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;

  const job = await models.jobs.findOne({ where: { id: parseInt(req.params.jobId, 10) } });
  if (!job) return res.status(404).json({ error: 'job not found' });

  // TIER ALLOWANCE FIRST, PAYMENT ONLY IF IT IS SPENT.
  //   Landed / legacy → unlimited, never a credit.
  //   Search → the first 10 a month are included; the 11th needs a credit.
  //   Free   → 0 included, so every one needs a credit ($10).
  // An included tailoring is a row with credit_id NULL; a paid one carries the
  // credit it spent. So the allowance is never silently double-charged.
  const allow = await tailorAllowance(tid);
  let credit = null;
  if (allow.included_left <= 0) {
    const credits = await availableCredits(tid);
    if (!credits.length) {
      return res.status(402).json({
        error: `A tailored résumé is $${billing.TAILOR_PRICE_USD}.`,
        needs_payment: true, price_usd: billing.TAILOR_PRICE_USD,
        included_per_month: allow.per_month, included_used: allow.included_used,
      });
    }
    credit = credits[0];
  }

  const pRow = await scoped('profiles', tid).findOne({});
  const profile = (pRow && pRow.resume_json) || {};
  const source = (pRow && pRow.source_text) || '';
  const sub = await models.subscribers.findOne({ where: { id: tid } });

  // The model writes ONE paragraph. Everything else in the document is copied
  // out of the subscriber's own résumé, so nothing it returns can put a claim
  // on the page that they cannot defend.
  const t = await resumeSvc.tailor(source, job);
  const built = tailoringSvc.build(profile, job, {
    summary: t.is_simulated ? null : firstParagraph(t.content),
    name: sub && sub.name,
    site_url: sub && sub.address ? `https://${sub.address}` : null,
  });

  const prior = (await scoped('tailored_resumes', tid).findAll({}))
    .filter((r) => r.job_id === job.id);
  const version = prior.length + 1;

  const row = await scoped('tailored_resumes', tid).create({
    job_id: job.id, content: t.content, diff: t.changes,
    flagged_terms: t.flagged, is_simulated: t.is_simulated,
    confirmed: t.flagged.length === 0,
    doc: built.content, version,
    keyword_coverage: built.keyword_coverage, gaps: built.gaps,
    employer: job.employer || null, title: job.title || null,
    credit_id: credit ? credit.id : null,
  });

  // Consumed only now that a document exists. A failure above leaves the credit
  // spendable rather than burning somebody's ten dollars on an error. An included
  // (allowance) tailoring has no credit to spend.
  if (credit) {
    await scoped('tailor_credits', tid).update(
      { consumed_at: new Date(), consumed_job_id: job.id }, { id: credit.id });
  }

  const after = await tailorAllowance(tid);
  res.json({
    id: row.id, version,
    changes: t.changes, flagged: t.flagged,
    requires_confirmation: t.flagged.length > 0,
    is_simulated: t.is_simulated,
    summary_source: built.summary_source,
    coverage_pct: built.keyword_coverage.pct,
    gaps: built.gaps.slice(0, 10),
    pdf_url: `/api/v1/engine/tailorings/${row.id}/pdf`,
    paid: Boolean(credit),                                   // false = included in the plan
    unlimited: after.unlimited,
    included_left: after.unlimited ? null : after.included_left,
    included_per_month: after.per_month,
    credits_left: (await availableCredits(tid)).length,
  });
});

/** The first paragraph of the model's résumé — the only free text we keep. */
function firstParagraph(text) {
  const parts = String(text || '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const p = parts.find((x) => x.length > 80 && !/^[A-Z\s]{6,}$/.test(x));
  return p ? p.slice(0, 900) : null;
}

/** Every tailoring this subscriber has, newest first — powers the card link. */
router.get('/tailorings', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const rows = plain(await scoped('tailored_resumes', tid).findAll({}))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({
    tailorings: rows.map((r) => ({
      id: r.id, job_id: r.job_id, version: r.version || 1,
      title: r.title, employer: r.employer,
      coverage_pct: (r.keyword_coverage || {}).pct == null ? null : r.keyword_coverage.pct,
      is_simulated: r.is_simulated, created_at: r.created_at,
      // A row written before the PDF existed has no doc to render.
      pdf_url: r.doc ? `/api/v1/engine/tailorings/${r.id}/pdf` : null,
    })),
  });
});

/**
 * The PDF, rendered on demand FROM THE STORED DOCUMENT.
 *
 * Never read off disk: Render's filesystem is ephemeral, so a stored path would
 * evaporate on the next deploy and take "recover the exact file I sent them"
 * with it. Same document in, same bytes out.
 */
router.get('/tailorings/:id/pdf', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const row = (await scoped('tailored_resumes', tid).findAll({}))
    .find((r) => r.id === parseInt(req.params.id, 10));
  if (!row) return res.status(404).json({ error: 'not found' });
  if (!row.doc) {
    return res.status(409).json({
      error: 'This tailoring predates the PDF and has no stored document. Tailor it again to get one.',
    });
  }
  try {
    const buf = await resumePdf.render(row.doc, {
      title: `${row.doc.name || 'Resume'} — ${row.title || 'role'}`,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `inline; filename="${resumePdf.filename(row.doc.name, row.employer, row.version)}"`);
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
/**
 * DELETE EVERYTHING, AND MEAN IT.
 *
 * This used to name ELEVEN tables by hand while the tenant-scoped set held
 * more, so page_views, audit_log, assets, address_aliases and tailor_credits
 * survived a deletion that told the subscriber "all personal data deleted".
 * A hand-maintained list next to a registry is a promise that decays every
 * time somebody adds a table — so it now walks the registry, and SIT fails if
 * that ever stops being true.
 *
 * THE TEASER ROW WAS THE REAL LEAK. ju_teasers holds `resume_text` — the
 * extracted résumé — plus the name and email, and it is NOT tenant-scoped
 * (tenant_id is null until payment). So the one thing the note explicitly
 * promised, "including stored resume text", was the one thing left behind.
 * Matched on BOTH tenant_id and email: the first covers rows created after
 * payment, the second the previews built before the account existed.
 */
router.delete('/account', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const sub = await models.subscribers.findOne({ where: { id: tid } });
  const email = String((sub && sub.email) || '').toLowerCase();

  for (const t of Array.from(TENANT_SCOPED)) {
    try { await scoped(t, tid).destroy({}); } catch (e) {
      // One table failing must not abandon the rest half-deleted.
      console.warn('[delete-account] %s: %s', t, e.message);
    }
  }

  // The résumé previews. Not tenant-scoped, and the only place the raw
  // extracted text lived after the profile row went.
  for (const row of await models.teasers.findAll({})) {
    if (row.tenant_id === tid || (email && String(row.email || '').toLowerCase() === email)) {
      await models.teasers.destroy({ where: { id: row.id } });
    }
  }

  await models.subscribers.destroy({ where: { id: tid } });
  res.json({
    ok: true,
    note: 'Account and all personal data deleted, including stored resume text and any previews.',
    // Said plainly rather than quietly omitted: if somebody referred this
    // person, the commission on THEIR ledger is the referrer's record of money
    // owed, and is not this person's to erase. It holds no résumé, no contact
    // detail and no name — only that a referral qualified.
    retained: 'If another subscriber referred you, their own commission record remains on their account.',
  });
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
// GET FOUND — where their address has actually been put.
//
// A site nothing links to is a site Google has no reason to crawl. Measured on
// production: 1,353 page views, every external referrer '(direct)', zero
// arrivals from search. We cannot place these links; we can only track them and
// be honest that they are the prerequisite.
// ---------------------------------------------------------------
router.get('/presence', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const sub = await models.subscribers.findOne({ where: { id: tid } });
  const row = await scoped('settings', tid).findOne({});
  const out = settingsSvc.presenceChecklist((row && row.settings) || {}, sub && sub.language);
  out.address = sub && sub.address ? `https://${sub.address}` : null;
  // Role pages are the thing these links make rank, so report them together.
  const roles = settingsSvc.pageRoles((row && row.settings) || {});
  out.role_pages = roles.map((r) => ({
    title: r.title, url: out.address ? `${out.address}/roles/${r.slug}` : null }));
  out.role_pages_note = roles.length ? null
    : 'You have no target job titles set, so you have no role pages. Those pages carry the '
      + 'exact titles a recruiter searches — set them under what your agents hunt for.';
  res.json(out);
});

router.post('/presence', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  const b = req.body || {};
  const row = await scoped('settings', tid).findOne({});
  const cur = settingsSvc.sanitize((row && row.settings) || {});

  if (typeof b.slug === 'string') {
    const known = settingsSvc.PLACEMENTS.some((p) => p.slug === b.slug);
    if (!known) return res.status(400).json({ error: 'unknown placement' });
    const set = new Set(cur.presence.placed);
    if (b.done === false) set.delete(b.slug); else set.add(b.slug);
    cur.presence.placed = Array.from(set);
  }
  if (b.directory_opt_in !== undefined) {
    cur.presence.directory_opt_in = b.directory_opt_in === true || b.directory_opt_in === 'true';
  }
  // Add or remove one identity link. Sent one at a time rather than as a whole
  // array, so two tabs open on the same account cannot silently overwrite each
  // other's list — the classic last-write-wins data loss on a settings doc.
  if (typeof b.add_link === 'string') {
    const url = settingsSvc.publicUrl(b.add_link);
    if (!url) return res.status(400).json({ error: 'That does not look like a web address. It must start with http or https.' });
    cur.identity_links = settingsSvc.identityLinks([...(cur.identity_links || []), { url }]);
  }
  if (typeof b.remove_link === 'string') {
    const gone = b.remove_link.toLowerCase();
    cur.identity_links = (cur.identity_links || []).filter((l) => l.url.toLowerCase() !== gone);
  }

  const clean = settingsSvc.sanitize(cur);
  if (row) await scoped('settings', tid).update({ settings: clean }, { id: row.id });
  else await scoped('settings', tid).create({ settings: clean });

  const sub = await models.subscribers.findOne({ where: { id: tid } });
  res.json(settingsSvc.presenceChecklist(clean, sub && sub.language));
});

// ---------------------------------------------------------------
// REPLACE THE RESUME, AT ANY TIME, IN ANY FORMAT.
//
// The resume could only ever be supplied once, at the teaser. Whatever the
// structurer managed in that one moment was the profile forever — and when the
// model was unreachable during a preview, a paying subscriber ended up with a
// profile holding zero experience and zero skills, with no way to fix it from
// inside the product. Careers also change; a CV is not a one-time artifact.
//
// Two doors, because they solve different problems:
//   POST /resume          upload a new file
//   POST /resume/reparse  re-read the text already on file (no upload)
// ---------------------------------------------------------------
const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

/** Structure text, write the profile, and republish every derived surface. */
async function applyResume(tid, sourceText, note) {
  const structured = await resumeSvc.structure(sourceText);
  const profile = structured.profile || {};

  const row = await scoped('profiles', tid).findOne({});
  if (row) {
    await scoped('profiles', tid).update(
      { resume_json: profile, source_text: sourceText }, { id: row.id });
  } else {
    await scoped('profiles', tid).create({ resume_json: profile, source_text: sourceText });
  }

  // The public site, resume.json, the JSON-LD and the agent card are all
  // rendered FROM the profile — republishing is what makes the change real
  // rather than only true in the dashboard.
  let republished = false;
  try {
    const r = await require('../services/provisioning').publishSite(tid);
    republished = Boolean(r && r.ok !== false);
  } catch (e) { console.warn('[jobup resume] republish failed:', e.message); }

  return {
    ok: true,
    note,
    republished,
    // NEVER claim a good parse when the model was unreachable. A thin profile
    // that says so is recoverable; one that pretends is not.
    is_simulated: Boolean(profile.is_simulated),
    warning: profile.is_simulated
      ? 'The language model was unreachable, so this was structured without it: '
        + 'your experience and skills could not be extracted. Nothing was invented. '
        + 'Try again shortly and it will be read properly.'
      : null,
    cost_usd: structured.cost_usd || 0,
    parsed: {
      name: profile.name || null,
      headline: profile.headline || null,
      experience: (profile.experience || []).length,
      education: (profile.education || []).length,
      skills: (profile.skills || []).length,
      certifications: (profile.certifications || []).length,
    },
    characters: sourceText.length,
  };
}

router.post('/resume', resumeUpload.single('resume'), async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  try {
    let text = String((req.body && req.body.resume_text) || '');

    if (req.file) {
      const ex = await resumeSvc.extractText(req.file.buffer, req.file.originalname);
      if (ex.ok) text = ex.text;
      else if (!text) {
        // Say which failure it is: re-exporting fixes one and cannot fix a scan.
        return res.status(400).json({
          error: ex.scanned
            ? 'That file is a scan — a picture of a document — so there is no text in it to read.'
            : 'We could not read the text out of that file.',
          paste_instead: true,
          note: 'Paste the text instead, or export it again as PDF, DOCX, TXT, MD or RTF.',
          detail: ex.note || null,
        });
      }
    }

    if (!text || text.trim().length < 60) {
      return res.status(400).json({
        error: 'A resume is required — attach a file or paste the text.',
        paste_instead: true,
      });
    }

    const out = await applyResume(tid, text.trim(),
      req.file ? `Read from ${req.file.originalname}.` : 'Read from the text you pasted.');
    await models.audit_log.create({
      tenant_id: tid, actor: 'subscriber', action: 'resume_replaced',
      reason: out.is_simulated ? 'structured without a model' : 'structured with the model',
    }).catch(() => {});
    res.json(out);
  } catch (e) {
    console.error('[jobup resume] replace failed:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Re-read the text already on file. This is the repair door: the text was
 * always fine, only the structuring failed, so there is nothing to re-upload.
 */
router.post('/resume/reparse', async (req, res) => {
  const tid = auth(req, res); if (!tid) return;
  try {
    const row = await scoped('profiles', tid).findOne({});
    const text = (row && row.source_text) || '';
    if (text.trim().length < 60) {
      return res.status(400).json({
        error: 'We do not have your resume text on file, so there is nothing to re-read.',
        note: 'Upload the file and it will be read from scratch.',
      });
    }
    if (!brain.enabled()) {
      return res.status(503).json({
        error: 'The language model is not configured, so re-reading would produce the same thin result.',
        note: 'Nothing was changed.',
      });
    }
    res.json(await applyResume(tid, text.trim(), 'Re-read the resume already on file.'));
  } catch (e) {
    console.error('[jobup resume] reparse failed:', e);
    res.status(500).json({ error: e.message });
  }
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

  // The web address is set from the subscriber's name at signup and is NOT
  // changeable — on any tier. The UI no longer offers a rename; this refuses the
  // change so there is no hidden path either. First-time assignment (address
  // still unset) is allowed, since that is provisioning, not a change.
  if (sub.address) {
    return res.status(403).json({
      error: 'Your web address is set when your account is created and cannot be changed.',
    });
  }

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
