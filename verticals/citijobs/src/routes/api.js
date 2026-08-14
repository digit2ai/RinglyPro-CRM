'use strict';

/**
 * Citi Opportunity Tracker — REST API.
 * Everything is scoped to req.user.tenant_id, and every profile_id the caller
 * supplies is re-resolved against that tenant before it is used. A profile id
 * from a request body is a claim, not a fact.
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');

const router = express.Router();
const { User, Profile, Req, Tracked, Match, Query, Run, Skill, Tailoring, STATUSES, CLOSE_REASONS } = require('../models');
const workday = require('../services/workday');
const skills = require('../services/skills');
const tailorSvc = require('../services/tailor');
const pdf = require('../services/pdf');
const agent = require('../services/agent');
const matcher = require('../services/matcher');
const prefilter = require('../services/prefilter');
const employers = require('../services/employers');

const SECRET = process.env.CITIJOBS_JWT_SECRET || process.env.JWT_SECRET || 'citijobs-2026-secret';
const COOKIE = 'citijobs_token';
const MAX_AGE = 1000 * 60 * 60 * 24 * 30;

// ── Auth ─────────────────────────────────────────────────────────────────────

router.post('/auth/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').toLowerCase().trim();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.tenant_id) { user.tenant_id = user.id; await user.save(); }
    const token = jwt.sign(
      { id: user.id, tenant_id: user.tenant_id, email: user.email, name: user.name, role: user.role },
      SECRET, { expiresIn: '30d' }
    );
    res.cookie(COOKIE, token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: MAX_AGE, path: '/citi-tracker' });
    res.json({ success: true, user: { email: user.email, name: user.name } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/auth/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/citi-tracker' });
  res.json({ success: true });
});

router.get('/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ user: req.user, model: matcher.hasModel() ? matcher.MODEL : null, agent_enabled: agent.enabled() });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function tid(req) { return req.user.tenant_id; }

/** Resolve a profile inside the caller's tenant, or 404. Never trust an id. */
async function ownProfile(req, id) {
  const where = { tenant_id: tid(req) };
  if (id) where.id = Number(id);
  const p = await Profile.findOne({ where, order: [['id', 'ASC']] });
  return p;
}

function daysUntil(dateOnly) {
  if (!dateOnly) return null;
  const d = new Date(String(dateOnly) + 'T23:59:59Z');
  const ms = d.getTime() - Date.now();
  return Math.floor(ms / 86400000);
}

function reqPayload(r, match) {
  return {
    employer: r.employer || 'citi',
    employer_name: employers.nameOf(r.employer || 'citi'),
    req_id: r.req_id,
    title: r.title,
    location: r.location,
    address: r.address,
    remote_type: r.remote_type,
    time_type: r.time_type,
    job_family: r.job_family,
    job_family_group: r.job_family_group,
    posted_on: r.posted_on,
    close_date: r.close_date,
    // Honest countdown: null when Citi states no close date, never a guess.
    days_to_close: daysUntil(r.close_date),
    salary_min_cents: r.salary_min_cents ? Number(r.salary_min_cents) : null,
    salary_max_cents: r.salary_max_cents ? Number(r.salary_max_cents) : null,
    salary_source: r.salary_source,
    url_workday: r.url_workday,
    url_citi_careers: r.url_citi_careers,
    // Offered as a click-out for a human. The agent never fetches it —
    // jobs.citi.com/robots.txt disallows /search-jobs/.
    // Citi-only click-out. Offering it for a JPMorgan requisition would send
    // the owner to a search that cannot possibly find it.
    url_citi_search: (r.employer || 'citi') === 'citi'
      ? `https://jobs.citi.com/search-jobs/${encodeURIComponent(r.req_id)}` : null,
    feed_status: r.feed_status,
    detail_fetched: r.detail_fetched,
    first_seen_at: r.first_seen_at,
    last_seen_at: r.last_seen_at,
    match: match ? {
      score: match.score, rationale: match.rationale,
      scored_by: match.scored_by, is_simulated: match.is_simulated
    } : null
  };
}

// ── Profiles ─────────────────────────────────────────────────────────────────

router.get('/profiles', async (req, res) => {
  const rows = await Profile.findAll({ where: { tenant_id: tid(req) }, order: [['id', 'ASC']] });
  res.json({
    profiles: rows.map((p) => ({
      id: p.id, slug: p.slug, display_name: p.display_name, headline: p.headline,
      target_titles: p.target_titles, target_locations: p.target_locations,
      countries: p.countries, internal: p.internal,
      score_threshold: p.score_threshold, active: p.active,
      min_salary_cents: p.min_salary_cents ? Number(p.min_salary_cents) : 0,
      hide_unpriced: !!p.hide_unpriced
    }))
  });
});

router.patch('/profiles/:id', async (req, res) => {
  const p = await ownProfile(req, req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  for (const k of ['display_name', 'headline', 'target_titles', 'target_locations', 'countries', 'internal', 'score_threshold', 'active', 'min_salary_cents', 'hide_unpriced']) {
    if (req.body[k] !== undefined) p[k] = req.body[k];
  }
  await p.save();
  res.json({ success: true });
});

// ── The board ────────────────────────────────────────────────────────────────

router.get('/board', async (req, res) => {
  try {
    const profile = await ownProfile(req, req.query.profile_id);
    if (!profile) return res.status(404).json({ error: 'No profile' });
    const where = { tenant_id: tid(req), profile_id: profile.id };
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.employer) where.employer = String(req.query.employer);
    if (String(req.query.archived || '0') !== '1') where.archived = false;

    const rows = await Tracked.findAll({ where, order: [['status_changed_at', 'DESC']], limit: 500 });
    const ids = rows.map((r) => r.req_id);
    const reqs = await Req.findAll({ where: { tenant_id: tid(req), req_id: { [Op.in]: ids.length ? ids : ['__none__'] } } });
    const byId = new Map(reqs.map((r) => [(r.employer || 'citi') + ':' + r.req_id, r]));
    const matches = await Match.findAll({ where: { tenant_id: tid(req), profile_id: profile.id, req_id: { [Op.in]: ids.length ? ids : ['__none__'] } } });
    const mById = new Map(matches.map((m) => [(m.employer || 'citi') + ':' + m.req_id, m]));
    const tailorings = await Tailoring.findAll({
      where: { tenant_id: tid(req), profile_id: profile.id, req_id: { [Op.in]: ids.length ? ids : ['__none__'] } },
      order: [['version', 'DESC']]
    });
    const tById = new Map();
    for (const t of tailorings) { const k2 = (t.employer || 'citi') + ':' + t.req_id; if (!tById.has(k2)) tById.set(k2, t); }

    // Ranked by match, best first. An unscored row sorts last rather than as a
    // zero, so "not scored yet" never reads as "scored badly"; ties fall back
    // to most recent movement.
    const byMatch = (a, b) => {
      const sa = a.req.match ? a.req.match.score : -1;
      const sb = b.req.match ? b.req.match.score : -1;
      if (sb !== sa) return sb - sa;
      return new Date(b.status_changed_at) - new Date(a.status_changed_at);
    };

    res.json({
      profile: {
        id: profile.id, slug: profile.slug, display_name: profile.display_name,
        score_threshold: profile.score_threshold,
        min_salary_cents: profile.min_salary_cents ? Number(profile.min_salary_cents) : 0,
        hide_unpriced: !!profile.hide_unpriced
      },
      // Stated so the board can never look empty for a reason it does not show.
      filtered_out: rows.length,
      items: rows.map((t) => {
        const k = (t.employer || 'citi') + ':' + t.req_id;
        const r = byId.get(k);
        const tl = tById.get(k);
        return {
          id: t.id, status: t.status, status_reason: t.status_reason,
          status_changed_at: t.status_changed_at, applied_at: t.applied_at,
          next_action: t.next_action, next_action_due: t.next_action_due,
          notes: t.notes, source: t.source, archived: t.archived,
          req: r ? reqPayload(r, mById.get(k))
            : { req_id: t.req_id, employer: t.employer, employer_name: employers.nameOf(t.employer), title: '(requisition not in pool)' },
          tailoring: tl ? { id: tl.id, version: tl.version, sent: tl.sent, coverage_pct: (tl.keyword_coverage || {}).pct, generated_at: tl.generated_at } : null
        };
      })
        // Pay floor AND match floor. A requisition you have acted on is never
        // hidden — you cannot track an application you can no longer see — but
        // an untouched row below the threshold has no business on the board.
        .filter((it) => ['applied', 'interview', 'offer', 'closed'].includes(it.status)
          || (prefilter.salaryAllowed(it.req, profile).ok
              && (!it.req.match || it.req.match.score >= (profile.score_threshold || 70))))
        .sort(byMatch)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/board', async (req, res) => {
  try {
    const profile = await ownProfile(req, req.body.profile_id);
    if (!profile) return res.status(404).json({ error: 'No profile' });
    const req_id = String(req.body.req_id || '').trim();
    if (!req_id) return res.status(400).json({ error: 'req_id required' });
    const employer = String(req.body.employer || 'citi');
    const exists = await Tracked.findOne({ where: { tenant_id: tid(req), profile_id: profile.id, employer, req_id } });
    if (exists) return res.json({ success: true, id: exists.id, already: true });
    const row = await Tracked.create({
      tenant_id: tid(req), profile_id: profile.id, employer, req_id,
      status: String(req.body.status || 'saved'), source: 'manual'
    });
    res.status(201).json({ success: true, id: row.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Status is the strongest training signal in the app, so a status change also
 * re-weights the requisition's vocabulary. Weights move ranking only — they can
 * never change a skill's `kind`, which is the line that keeps the compounding
 * loop pointed at the owner instead of away from them.
 */
router.patch('/board/:id', async (req, res) => {
  try {
    const row = await Tracked.findOne({ where: { id: Number(req.params.id), tenant_id: tid(req) } });
    if (!row) return res.status(404).json({ error: 'Not found' });
    const profile = await ownProfile(req, row.profile_id);
    if (!profile) return res.status(404).json({ error: 'Not found' });

    const prev = row.status;
    if (req.body.status !== undefined) {
      const s = String(req.body.status);
      if (!STATUSES.includes(s)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
      row.status = s;
      row.status_changed_at = new Date();
      if (s === 'applied' && !row.applied_at) row.applied_at = new Date();
      if (s === 'closed') {
        const reason = String(req.body.status_reason || '');
        if (!CLOSE_REASONS.includes(reason)) {
          return res.status(400).json({ error: `closing requires status_reason: ${CLOSE_REASONS.join(', ')}` });
        }
        row.status_reason = reason;
      } else {
        row.status_reason = null;
      }
    }
    for (const k of ['notes', 'next_action', 'next_action_due', 'contacts']) {
      if (req.body[k] !== undefined) row[k] = req.body[k];
    }
    if (req.body.archived !== undefined) row.archived = !!req.body.archived;
    await row.save();

    let retrained = 0;
    if (req.body.status !== undefined && row.status !== prev) {
      const outcome = row.status === 'closed' ? row.status_reason : row.status;
      const r = await Req.findOne({ where: { tenant_id: tid(req), employer: row.employer, req_id: row.req_id } });
      if (r && r.description_text) {
        const terms = skills.extractTerms([r.title, r.description_text].join('\n'), { max: 25 })
          .filter((t) => t.weight >= 3);
        retrained = await skills.applyOutcome(profile, terms, outcome);
      }
    }
    res.json({ success: true, status: row.status, terms_retrained: retrained });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Requisition pool ─────────────────────────────────────────────────────────

router.get('/reqs', async (req, res) => {
  try {
    const profile = await ownProfile(req, req.query.profile_id);
    const where = { tenant_id: tid(req) };
    if (req.query.q) {
      const q = `%${String(req.query.q)}%`;
      where[Op.or] = [{ title: { [Op.iLike]: q } }, { req_id: { [Op.iLike]: q } }, { location: { [Op.iLike]: q } }];
    }
    if (String(req.query.open_only || '1') === '1') where.feed_status = 'open';
    if (req.query.employer) where.employer = String(req.query.employer);
    const rows = await Req.findAll({ where, order: [['first_seen_at', 'DESC']], limit: Math.min(200, Number(req.query.limit || 60)) });
    let mById = new Map();
    let tracked = new Set();
    if (profile) {
      const ids = rows.map((r) => r.req_id);
      const ms = await Match.findAll({ where: { tenant_id: tid(req), profile_id: profile.id, req_id: { [Op.in]: ids.length ? ids : ['__none__'] } } });
      mById = new Map(ms.map((m) => [(m.employer || 'citi') + ':' + m.req_id, m]));
      const ts = await Tracked.findAll({ where: { tenant_id: tid(req), profile_id: profile.id, req_id: { [Op.in]: ids.length ? ids : ['__none__'] } }, attributes: ['req_id', 'employer'] });
      tracked = new Set(ts.map((t) => (t.employer || 'citi') + ':' + t.req_id));
    }
    res.json({
      items: rows
        .map((r) => Object.assign(reqPayload(r, mById.get((r.employer || 'citi') + ':' + r.req_id)),
          { tracked: tracked.has((r.employer || 'citi') + ':' + r.req_id) }))
        .filter((r) => !profile || prefilter.salaryAllowed(r, profile).ok)
        .sort((a, b) => {
          const sa = a.match ? a.match.score : -1;
          const sb = b.match ? b.match.score : -1;
          if (sb !== sa) return sb - sa;
          return new Date(b.first_seen_at) - new Date(a.first_seen_at);
        })
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/reqs/:reqId', async (req, res) => {
  const w = { tenant_id: tid(req), req_id: String(req.params.reqId) };
  if (req.query.employer) w.employer = String(req.query.employer);
  const r = await Req.findOne({ where: w });
  if (!r) return res.status(404).json({ error: 'Not found' });
  const profile = await ownProfile(req, req.query.profile_id);
  const m = profile ? await Match.findOne({ where: { tenant_id: tid(req), profile_id: profile.id, employer: r.employer, req_id: r.req_id } }) : null;
  res.json(Object.assign(reqPayload(r, m), { description_text: r.description_text }));
});

/** Paste a req id, a Workday URL, or a jobs.citi.com link. */
router.post('/reqs/import', async (req, res) => {
  try {
    const row = await agent.importReq(tid(req), req.body.input, { employer: req.body.employer || null });
    let boarded = null;
    if (req.body.board !== false) {
      const profile = await ownProfile(req, req.body.profile_id);
      if (profile) {
        const exists = await Tracked.findOne({ where: { tenant_id: tid(req), profile_id: profile.id, employer: row.employer, req_id: row.req_id } });
        boarded = exists || await Tracked.create({
          tenant_id: tid(req), profile_id: profile.id, employer: row.employer, req_id: row.req_id,
          status: String(req.body.status || 'saved'), source: 'manual'
        });
      }
    }
    res.status(201).json({ success: true, req: reqPayload(row, null), tracked_id: boarded ? boarded.id : null });
  } catch (e) {
    if (e.code === 'AMBIGUOUS') {
      // Not an error the user caused — the id shape genuinely belongs to more
      // than one bank. Hand back the candidates so they can name it.
      return res.status(409).json({ error: e.message, code: 'AMBIGUOUS', candidates: e.candidates || [] });
    }
    const code = e.code === 'NOT_FOUND' ? 404 : (e.code === 'NO_REQ_ID' ? 400 : 500);
    res.status(code).json({ error: e.message });
  }
});

// ── Tailoring ────────────────────────────────────────────────────────────────

router.post('/tailor', async (req, res) => {
  try {
    const profile = await ownProfile(req, req.body.profile_id);
    if (!profile) return res.status(404).json({ error: 'No profile' });
    const rw = { tenant_id: tid(req), req_id: String(req.body.req_id || '') };
    if (req.body.employer) rw.employer = String(req.body.employer);
    const r = await Req.findOne({ where: rw });
    if (!r) return res.status(404).json({ error: 'Requisition not found' });
    if (!r.description_text) return res.status(400).json({ error: 'This requisition has no description yet. Run the agent or re-import it.' });

    const claimable = await skills.claimable(profile.id);
    const rejected = await Skill.findAll({ where: { profile_id: profile.id, kind: skills.KIND.REJECTED }, attributes: ['norm'] });
    const rejectedNorms = new Set(rejected.map((x) => x.norm));

    const out = await tailorSvc.tailor(profile, r, { claimableTerms: claimable, rejectedNorms });

    // The compounding loop: harvest the posting's language into the SEARCH
    // vocabulary. This can never make anything claimable.
    const learned = await skills.learnVocabulary(profile, out.jd_terms.filter((t) => t.weight >= 3), { req_id: r.req_id });

    const last = await Tailoring.findOne({
      where: { tenant_id: tid(req), profile_id: profile.id, employer: r.employer, req_id: r.req_id },
      order: [['version', 'DESC']]
    });
    const version = last ? last.version + 1 : 1;

    const row = await Tailoring.create({
      tenant_id: tid(req), profile_id: profile.id, employer: r.employer, req_id: r.req_id, version,
      content: out.content, keyword_coverage: out.keyword_coverage, gaps: out.gaps,
      tailored_by: out.tailored_by, is_simulated: out.is_simulated, model: out.model,
      dropped: out.dropped
    });

    // A tailoring implies interest; put it on the board if it is not already.
    const exists = await Tracked.findOne({ where: { tenant_id: tid(req), profile_id: profile.id, employer: r.employer, req_id: r.req_id } });
    if (!exists) {
      await Tracked.create({ tenant_id: tid(req), profile_id: profile.id, employer: r.employer, req_id: r.req_id, status: 'saved', source: 'manual' });
    }

    res.status(201).json({
      success: true, id: row.id, version,
      keyword_coverage: out.keyword_coverage, gaps: out.gaps,
      tailored_by: out.tailored_by, is_simulated: out.is_simulated,
      dropped: out.dropped, vocabulary_learned: learned.length,
      pdf_url: `/citi-tracker/api/v1/tailorings/${row.id}/pdf`
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/tailorings', async (req, res) => {
  const profile = await ownProfile(req, req.query.profile_id);
  if (!profile) return res.status(404).json({ error: 'No profile' });
  const where = { tenant_id: tid(req), profile_id: profile.id };
  if (req.query.req_id) where.req_id = String(req.query.req_id);
  const rows = await Tailoring.findAll({ where, order: [['generated_at', 'DESC']], limit: 100 });
  res.json({
    items: rows.map((t) => ({
      id: t.id, req_id: t.req_id, version: t.version, sent: t.sent, sent_at: t.sent_at,
      coverage: t.keyword_coverage, gaps: t.gaps, tailored_by: t.tailored_by,
      is_simulated: t.is_simulated, dropped: t.dropped, generated_at: t.generated_at,
      pdf_url: `/citi-tracker/api/v1/tailorings/${t.id}/pdf`
    }))
  });
});

router.get('/tailorings/:id', async (req, res) => {
  const t = await Tailoring.findOne({ where: { id: Number(req.params.id), tenant_id: tid(req) } });
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json({
    id: t.id, req_id: t.req_id, version: t.version, content: t.content,
    coverage: t.keyword_coverage, gaps: t.gaps, dropped: t.dropped,
    tailored_by: t.tailored_by, is_simulated: t.is_simulated, sent: t.sent,
    generated_at: t.generated_at
  });
});

/** The PDF is re-rendered from stored content — never read off an ephemeral disk. */
router.get('/tailorings/:id/pdf', async (req, res) => {
  try {
    const t = await Tailoring.findOne({ where: { id: Number(req.params.id), tenant_id: tid(req) } });
    if (!t) return res.status(404).json({ error: 'Not found' });
    const buf = await pdf.render(t.content, { title: `${t.content.name} — Citi ${t.req_id}` });
    const name = pdf.filename(t.content.name, t.req_id, t.version);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${req.query.dl === '1' ? 'attachment' : 'inline'}; filename="${name}"`);
    res.setHeader('Content-Length', buf.length);
    res.end(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/tailorings/:id', async (req, res) => {
  const t = await Tailoring.findOne({ where: { id: Number(req.params.id), tenant_id: tid(req) } });
  if (!t) return res.status(404).json({ error: 'Not found' });
  if (req.body.sent !== undefined) {
    t.sent = !!req.body.sent;
    t.sent_at = t.sent ? new Date() : null;
    await t.save();
  }
  res.json({ success: true, sent: t.sent });
});

// ── Skills ───────────────────────────────────────────────────────────────────

router.get('/skills', async (req, res) => {
  const profile = await ownProfile(req, req.query.profile_id);
  if (!profile) return res.status(404).json({ error: 'No profile' });
  const kinds = req.query.kind ? [String(req.query.kind)] : null;
  const rows = await skills.all(profile.id, kinds);
  res.json({
    items: rows.map((s) => ({
      id: s.id, term: s.term, kind: s.kind, evidence: s.evidence,
      weight: Number(s.weight), hits: s.hits, source: s.source,
      first_seen_req_id: s.first_seen_req_id, confirmed_at: s.confirmed_at
    })),
    counts: rows.reduce((a, s) => { a[s.kind] = (a[s.kind] || 0) + 1; return a; }, {})
  });
});

/** THE ONLY PATH TO CLAIMABLE. Evidence is required, deliberately. */
router.post('/skills/confirm', async (req, res) => {
  try {
    const profile = await ownProfile(req, req.body.profile_id);
    if (!profile) return res.status(404).json({ error: 'No profile' });
    const row = await skills.confirmVerified(profile, req.body.term, req.body.evidence, { req_id: req.body.req_id || null });
    res.json({ success: true, id: row.id, kind: row.kind });
  } catch (e) {
    res.status(e.code === 'EVIDENCE_REQUIRED' ? 400 : 500).json({ error: e.message });
  }
});

router.post('/skills/adjacent', async (req, res) => {
  try {
    const profile = await ownProfile(req, req.body.profile_id);
    if (!profile) return res.status(404).json({ error: 'No profile' });
    const row = await skills.markAdjacent(profile, req.body.term, { req_id: req.body.req_id || null });
    res.json({ success: true, id: row.id, kind: row.kind });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/skills/reject', async (req, res) => {
  try {
    const profile = await ownProfile(req, req.body.profile_id);
    if (!profile) return res.status(404).json({ error: 'No profile' });
    const row = await skills.reject(profile, req.body.term);
    res.json({ success: true, id: row.id, kind: row.kind });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── The agent ────────────────────────────────────────────────────────────────

router.post('/agent/run', async (req, res) => {
  try {
    const out = await agent.runDaily(tid(req), { trigger: 'manual', maxRequests: req.body.max_requests });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/agent/status', async (req, res) => {
  const last = await Run.findOne({ where: { tenant_id: tid(req) }, order: [['started_at', 'DESC']] });
  const runs = await Run.findAll({ where: { tenant_id: tid(req) }, order: [['started_at', 'DESC']], limit: 10 });
  const pool = await Req.count({ where: { tenant_id: tid(req) } });
  res.json({
    enabled: agent.enabled(),
    model: matcher.hasModel() ? matcher.MODEL : null,
    scoring_mode: matcher.hasModel() ? 'model' : 'heuristic (no ANTHROPIC_API_KEY — scores are labelled simulated)',
    feed: workday.config(),
    employers: employers.list().map((e) => ({ key: e.key, name: e.name, adapter: e.adapter,
      total_is_capped: e.total_is_capped, careers_url: e.careers_url })),
    pool_size: pool,
    last_run: last ? {
      id: last.id, run_date: last.run_date, started_at: last.started_at, finished_at: last.finished_at,
      ok: last.ok, trigger: last.trigger, queries_run: last.queries_run, http_requests: last.http_requests,
      reqs_seen: last.reqs_seen, reqs_new: last.reqs_new, scored: last.scored, boarded: last.boarded,
      closed_swept: last.closed_swept, cost_usd: Number((last.cost_cents / 100).toFixed(4)),
      budget_hit: last.budget_hit, errors: last.errors
    } : null,
    runs: runs.map((r) => ({ id: r.id, run_date: r.run_date, ok: r.ok, reqs_new: r.reqs_new, boarded: r.boarded, http_requests: r.http_requests }))
  });
});

router.get('/queries', async (req, res) => {
  const rows = await Query.findAll({ where: { tenant_id: tid(req) }, order: [['weight', 'DESC'], ['id', 'ASC']] });
  res.json({ items: rows });
});

router.post('/queries', async (req, res) => {
  try {
    const search_text = String(req.body.search_text || '').trim();
    if (!search_text) return res.status(400).json({ error: 'search_text required' });
    const exists = await Query.findOne({ where: { tenant_id: tid(req), employer: String(req.body.employer || 'citi'), search_text } });
    if (exists) return res.json({ success: true, id: exists.id, already: true });
    const row = await Query.create({
      tenant_id: tid(req), employer: String(req.body.employer || 'citi'),
      label: String(req.body.label || search_text),
      search_text, weight: Number(req.body.weight || 1), max_pages: Number(req.body.max_pages || 5),
      source: 'manual'
    });
    res.status(201).json({ success: true, id: row.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/queries/:id', async (req, res) => {
  const row = await Query.findOne({ where: { id: Number(req.params.id), tenant_id: tid(req) } });
  if (!row) return res.status(404).json({ error: 'Not found' });
  for (const k of ['label', 'search_text', 'enabled', 'weight', 'max_pages', 'employer']) {
    if (req.body[k] !== undefined) row[k] = req.body[k];
  }
  await row.save();
  res.json({ success: true });
});

router.delete('/queries/:id', async (req, res) => {
  const n = await Query.destroy({ where: { id: Number(req.params.id), tenant_id: tid(req) } });
  res.json({ success: true, deleted: n });
});

module.exports = router;
