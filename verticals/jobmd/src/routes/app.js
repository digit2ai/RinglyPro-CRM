'use strict';

/**
 * THE APPLICATION API — what subscribers actually use.
 *
 * Three roles, three views. Every handler derives the account from the session
 * cookie and scopes its query by it; nothing trusts an id in a body. The three
 * scoping rules, stated once:
 *
 *   physician  — their own Talent Intelligence Record, their own matches
 *   hospital   — their own organisation's positions and the candidates on them
 *   recruiter  — the whole pipeline, because a JobMD.io recruiter works across
 *                clients; this is a deliberate widening, not an oversight
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');

const { Account, Physician, Organization, Position, Match, Pipeline, PipelineEvent, AgentAction } = require('../models');
const accounts = require('../services/accounts');
const matching = require('../services/matching');
const pipelineSvc = require('../services/pipeline');
const cv = require('../services/cv');
const agents = require('../services/agents');
const C = require('../services/corpus');

const router = express.Router();
const AUTH_SECRET = process.env.JOBMD_JWT_SECRET || process.env.JWT_SECRET || 'jobmd-dev-insecure-secret';
const TENANT = parseInt(process.env.JOBMD_TENANT_ID || '1', 10);
const COOKIE = 'jobmd_sub';

function getCookie(req, name) {
  const h = req.headers.cookie || '';
  const m = h.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
function setSession(res, account) {
  const token = jwt.sign({ id: account.id, role: account.role, tenant_id: account.tenant_id },
                         AUTH_SECRET, { expiresIn: '30d' });
  res.setHeader('Set-Cookie',
    COOKIE + '=' + encodeURIComponent(token) + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000');
}

// Load the account fresh on every request: a role change or a deactivation must
// take effect immediately, not when a 30-day cookie happens to expire.
router.use(async function (req, res, next) {
  const t = getCookie(req, COOKIE);
  if (!t) return next();
  try {
    const claim = jwt.verify(t, AUTH_SECRET);
    const a = await Account.findOne({ where: { id: claim.id, tenant_id: TENANT, status: 'active' } });
    if (a) req.account = a;
  } catch (e) { /* invalid or expired */ }
  next();
});

function requireAccount(req, res, next) {
  if (!req.account) return res.status(401).json({ error: 'Sign in to continue.' });
  next();
}
function requireRole() {
  const allowed = Array.prototype.slice.call(arguments);
  return function (req, res, next) {
    if (!req.account) return res.status(401).json({ error: 'Sign in to continue.' });
    if (allowed.indexOf(req.account.role) === -1) {
      return res.status(403).json({ error: 'This is not available to a ' + req.account.role + ' account.' });
    }
    next();
  };
}

// ── Sign up / sign in ──────────────────────────────────────────────────────
router.post('/auth/signup', async function (req, res) {
  try {
    const v = accounts.validate(req.body || {});
    if (v.errors.length) return res.status(400).json({ error: v.errors[0], errors: v.errors });
    if (await Account.findOne({ where: { email: v.email } })) {
      return res.status(409).json({ error: 'An account already exists for that email address.' });
    }
    let org_id = null;
    if (v.role === 'hospital') {
      const org = await Organization.create({
        tenant_id: TENANT,
        name: String(req.body.org_name).trim().slice(0, 200),
        org_type: ['hospital', 'health_system', 'idn'].indexOf(req.body.org_type) !== -1 ? req.body.org_type : 'hospital',
        city: String(req.body.city || '').trim().slice(0, 120) || null,
        state: String(req.body.state || '').trim().toUpperCase().slice(0, 2) || null
      });
      org_id = org.id;
    }
    const account = await Account.create({
      tenant_id: TENANT, role: v.role, name: v.name, email: v.email,
      password_hash: await accounts.hash(v.password), org_id: org_id
    });
    // A physician gets an empty Talent Intelligence Record immediately, so the
    // dashboard has something to complete rather than something to create.
    if (v.role === 'physician') {
      await Physician.create({ tenant_id: TENANT, account_id: account.id });
    }
    setSession(res, account);
    res.status(201).json({ ok: true, account: accounts.publicAccount(account) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/auth/login', async function (req, res) {
  try {
    const email = accounts.normEmail((req.body || {}).email);
    const a = await Account.findOne({ where: { email, tenant_id: TENANT } });
    // One message for both cases: a different one tells a stranger which
    // addresses have accounts.
    if (!a || a.status !== 'active' || !(await accounts.check((req.body || {}).password, a.password_hash))) {
      return res.status(401).json({ error: 'That email and password do not match an account.' });
    }
    a.last_login_at = new Date();
    await a.save();
    setSession(res, a);
    res.json({ ok: true, account: accounts.publicAccount(a) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/auth/logout', function (req, res) {
  res.setHeader('Set-Cookie', COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});

router.get('/me', requireAccount, async function (req, res) {
  try {
    const out = { account: accounts.publicAccount(req.account) };
    if (req.account.role === 'physician') {
      out.profile = await Physician.findOne({ where: { account_id: req.account.id, tenant_id: TENANT } });
      out.completeness = profileCompleteness(out.profile);
    }
    if (req.account.org_id) {
      out.organization = await Organization.findOne({ where: { id: req.account.org_id, tenant_id: TENANT } });
    }
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── The Talent Intelligence Record ────────────────────────────────────────
const EDITABLE = ['specialty', 'subspecialty', 'education', 'residency', 'fellowship',
  'board_certified', 'board_certifications', 'licenses', 'years_experience',
  'current_organization', 'previous_organizations', 'leadership', 'clinical_interests',
  'procedure_expertise', 'robotic_platforms', 'robotic_years', 'robotic_cases_annual',
  'robotics_program_leadership', 'academic_experience', 'publications',
  'geographic_preferences', 'relocation_willing', 'compensation_expectation',
  'employment_preference', 'call_tolerance', 'available_from', 'credentialing_notes',
  'recruitment_status'];

// The fields a match actually depends on. Completeness is measured against
// these, not against every column, so the number means "how matchable am I".
const MATCH_CRITICAL = ['specialty', 'years_experience', 'board_certified', 'licenses',
  'geographic_preferences', 'compensation_expectation', 'available_from', 'employment_preference'];

function profileCompleteness(p) {
  if (!p) return { percent: 0, missing: MATCH_CRITICAL.slice() };
  const missing = MATCH_CRITICAL.filter(function (f) {
    const v = p[f];
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'boolean') return false;      // an explicit yes OR no is an answer
    return v === null || v === undefined || v === '';
  });
  return { percent: Math.round(100 * (MATCH_CRITICAL.length - missing.length) / MATCH_CRITICAL.length),
           missing: missing };
}

router.get('/profile', requireRole('physician'), async function (req, res) {
  const p = await Physician.findOne({ where: { account_id: req.account.id, tenant_id: TENANT } });
  res.json({ profile: p, completeness: profileCompleteness(p), specialties: C.MEDICAL_SPECIALTIES });
});

router.put('/profile', requireRole('physician'), async function (req, res) {
  try {
    const p = await Physician.findOne({ where: { account_id: req.account.id, tenant_id: TENANT } });
    if (!p) return res.status(404).json({ error: 'No profile found.' });
    const body = req.body || {};
    EDITABLE.forEach(function (f) { if (Object.prototype.hasOwnProperty.call(body, f)) p[f] = body[f]; });
    // A specialty outside the taxonomy would never match anything, so it is
    // refused here rather than silently stored.
    if (p.specialty && C.MEDICAL_SPECIALTIES.indexOf(p.specialty) === -1) {
      return res.status(400).json({ error: 'Choose a specialty from the list.', specialties: C.MEDICAL_SPECIALTIES });
    }
    p.ai_summary = cv.summarize(p.get({ plain: true }));
    p.ai_summary_by = 'heuristic';
    p.updated_at = new Date();
    await p.save();
    res.json({ ok: true, profile: p, completeness: profileCompleteness(p) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Read a CV and PROPOSE fields. It never writes: the physician confirms.
router.post('/profile/cv', requireRole('physician'), async function (req, res) {
  const text = String((req.body || {}).text || '');
  if (text.trim().length < 40) {
    return res.status(400).json({ error: 'Paste the text of your CV so we can read it.' });
  }
  const out = cv.extract(text.slice(0, 60000));
  res.json(Object.assign({ ok: true }, out));
});

// ── Positions ──────────────────────────────────────────────────────────────
router.get('/positions', requireAccount, async function (req, res) {
  try {
    const where = { tenant_id: TENANT };
    if (req.account.role === 'hospital') where.org_id = req.account.org_id;
    else where.status = 'open';
    const rows = await Position.findAll({ where: where, order: [['created_at', 'DESC']], limit: 200 });
    const orgs = await Organization.findAll({ where: { tenant_id: TENANT } });
    const byId = {};
    orgs.forEach(function (o) { byId[o.id] = o; });
    res.json({ items: rows.map(function (r) {
      const j = r.get({ plain: true });
      j.organization = byId[r.org_id] ? { id: byId[r.org_id].id, name: byId[r.org_id].name,
                                          city: byId[r.org_id].city, state: byId[r.org_id].state } : null;
      return j;
    }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/positions', requireRole('hospital', 'recruiter'), async function (req, res) {
  try {
    const b = req.body || {};
    if (!String(b.title || '').trim()) return res.status(400).json({ error: 'Give the position a title.' });
    if (C.MEDICAL_SPECIALTIES.indexOf(b.specialty) === -1) {
      return res.status(400).json({ error: 'Choose a specialty from the list.', specialties: C.MEDICAL_SPECIALTIES });
    }
    let org_id = req.account.org_id;
    if (req.account.role === 'recruiter') org_id = parseInt(b.org_id, 10) || null;
    if (!org_id) return res.status(400).json({ error: 'Choose the organisation this position belongs to.' });
    const org = await Organization.findOne({ where: { id: org_id, tenant_id: TENANT } });
    if (!org) return res.status(404).json({ error: 'That organisation was not found.' });

    const pos = await Position.create({
      tenant_id: TENANT, org_id: org_id,
      title: String(b.title).trim().slice(0, 200),
      specialty: b.specialty,
      subspecialty: String(b.subspecialty || '').trim().slice(0, 120) || null,
      city: String(b.city || org.city || '').trim().slice(0, 120) || null,
      state: String(b.state || org.state || '').trim().toUpperCase().slice(0, 2) || null,
      employment_model: ['employed', 'independent', 'academic'].indexOf(b.employment_model) !== -1 ? b.employment_model : 'employed',
      compensation_min: parseInt(b.compensation_min, 10) || null,
      compensation_max: parseInt(b.compensation_max, 10) || null,
      call_schedule: ['none', 'light', 'moderate', 'heavy'].indexOf(b.call_schedule) !== -1 ? b.call_schedule : null,
      relocation_assistance: !!b.relocation_assistance,
      robotics_required: !!b.robotics_required,
      robotic_platforms: Array.isArray(b.robotic_platforms) ? b.robotic_platforms : [],
      min_years_experience: parseInt(b.min_years_experience, 10) || 0,
      board_certification_required: b.board_certification_required !== false,
      procedures: Array.isArray(b.procedures) ? b.procedures : [],
      start_date: b.start_date || null,
      created_by: req.account.id
    });
    res.status(201).json({ ok: true, position: pos });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Matching ───────────────────────────────────────────────────────────────
// A physician's matches: every open position, scored, best first.
router.get('/matches', requireRole('physician'), async function (req, res) {
  try {
    const p = await Physician.findOne({ where: { account_id: req.account.id, tenant_id: TENANT } });
    const comp = profileCompleteness(p);
    if (!p || !p.specialty) {
      return res.json({ items: [], completeness: comp,
        message: 'Add your specialty to your profile and matches will appear here.' });
    }
    const positions = await Position.findAll({ where: { tenant_id: TENANT, status: 'open' }, limit: 300 });
    const orgs = await Organization.findAll({ where: { tenant_id: TENANT } });
    const byId = {}; orgs.forEach(function (o) { byId[o.id] = o; });
    const plain = p.get({ plain: true });
    const scored = matching.matchPhysician(plain, positions.map(function (x) { return x.get({ plain: true }); }));

    // Persist so a recruiter sees the same number the physician saw.
    for (const m of scored) {
      await Match.upsert({ tenant_id: TENANT, physician_id: p.id, position_id: m.position_id,
                           score: m.score, dimensions: m.dimensions, reasons: m.reasons,
                           gaps: m.gaps, computed_at: new Date() });
    }
    const applied = await Pipeline.findAll({ where: { tenant_id: TENANT, physician_id: p.id } });
    const appliedTo = {}; applied.forEach(function (a) { appliedTo[a.position_id] = a.stage; });

    res.json({ completeness: comp, items: scored.map(function (m) {
      const o = byId[m.position.org_id];
      return { position_id: m.position_id, score: m.score, dimensions: m.dimensions,
               reasons: m.reasons, gaps: m.gaps, stage: appliedTo[m.position_id] || null,
               position: { id: m.position.id, title: m.position.title, specialty: m.position.specialty,
                 city: m.position.city, state: m.position.state,
                 employment_model: m.position.employment_model,
                 compensation_min: m.position.compensation_min, compensation_max: m.position.compensation_max,
                 call_schedule: m.position.call_schedule, robotics_required: m.position.robotics_required,
                 start_date: m.position.start_date,
                 organization: o ? { id: o.id, name: o.name } : null } };
    }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Ranked candidates for one position — the recruiter and hospital view.
router.get('/positions/:id/candidates', requireRole('recruiter', 'hospital'), async function (req, res) {
  try {
    const where = { id: parseInt(req.params.id, 10) || 0, tenant_id: TENANT };
    if (req.account.role === 'hospital') where.org_id = req.account.org_id;
    const pos = await Position.findOne({ where: where });
    if (!pos) return res.status(404).json({ error: 'Position not found.' });

    const docs = await Physician.findAll({ where: { tenant_id: TENANT, specialty: { [Op.ne]: null } }, limit: 500 });
    const accs = await Account.findAll({ where: { tenant_id: TENANT, role: 'physician' } });
    const byAcc = {}; accs.forEach(function (a) { byAcc[a.id] = a; });
    const ranked = matching.matchPosition(pos.get({ plain: true }),
                                          docs.map(function (d) { return d.get({ plain: true }); }));
    const rows = await Pipeline.findAll({ where: { tenant_id: TENANT, position_id: pos.id } });
    const stageBy = {}; rows.forEach(function (r) { stageBy[r.physician_id] = { stage: r.stage, id: r.id }; });

    res.json({ position: pos, items: ranked.map(function (m) {
      const a = byAcc[m.physician.account_id];
      const st = stageBy[m.physician_id];
      return { physician_id: m.physician_id, score: m.score, dimensions: m.dimensions,
               reasons: m.reasons, gaps: m.gaps,
               stage: st ? st.stage : null, pipeline_id: st ? st.id : null,
               candidate: { name: a ? a.name : 'Candidate #' + m.physician_id,
                 specialty: m.physician.specialty, years_experience: m.physician.years_experience,
                 board_certified: m.physician.board_certified,
                 robotic_platforms: m.physician.robotic_platforms,
                 licenses: m.physician.licenses, ai_summary: m.physician.ai_summary } };
    }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Pipeline ───────────────────────────────────────────────────────────────
async function moveStage(pipelineRow, stage, actorKind, actor) {
  const verdict = pipelineSvc.canSet(actorKind, actor, stage);
  if (!verdict.allowed) return { ok: false, error: verdict.reason };
  const from = pipelineRow.stage;
  pipelineRow.stage = stage;
  pipelineRow.set_by_kind = actorKind;
  pipelineRow.set_by = String(actor);
  pipelineRow.updated_at = new Date();
  await pipelineRow.save();
  await PipelineEvent.create({ tenant_id: pipelineRow.tenant_id, pipeline_id: pipelineRow.id,
                               from_stage: from, to_stage: stage, actor_kind: actorKind, actor: String(actor) });
  return { ok: true };
}

// A physician expressing interest. This is a PERSON acting, so it is allowed —
// and it is the only stage a physician can set.
router.post('/apply', requireRole('physician'), async function (req, res) {
  try {
    const p = await Physician.findOne({ where: { account_id: req.account.id, tenant_id: TENANT } });
    if (!p || !p.specialty) return res.status(400).json({ error: 'Complete your profile before applying.' });
    const pos = await Position.findOne({ where: { id: parseInt((req.body || {}).position_id, 10) || 0,
                                                 tenant_id: TENANT, status: 'open' } });
    if (!pos) return res.status(404).json({ error: 'That position is not open.' });
    const existing = await Pipeline.findOne({ where: { tenant_id: TENANT, physician_id: p.id, position_id: pos.id } });
    if (existing) return res.json({ ok: true, already: true, stage: existing.stage });
    const row = await Pipeline.create({ tenant_id: TENANT, physician_id: p.id, position_id: pos.id,
      stage: 'Interested', set_by_kind: 'person', set_by: String(req.account.id) });
    await PipelineEvent.create({ tenant_id: TENANT, pipeline_id: row.id, from_stage: null,
      to_stage: 'Interested', actor_kind: 'person', actor: String(req.account.id) });
    res.status(201).json({ ok: true, stage: row.stage });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/pipeline', requireRole('recruiter', 'hospital'), async function (req, res) {
  try {
    const where = { tenant_id: TENANT };
    if (req.account.role === 'hospital') {
      const mine = await Position.findAll({ where: { tenant_id: TENANT, org_id: req.account.org_id },
                                           attributes: ['id'] });
      where.position_id = { [Op.in]: mine.map(function (x) { return x.id; }).concat([-1]) };
    }
    const rows = await Pipeline.findAll({ where: where, order: [['updated_at', 'DESC']], limit: 400 });
    const posIds = Array.from(new Set(rows.map(function (r) { return r.position_id; })));
    const docIds = Array.from(new Set(rows.map(function (r) { return r.physician_id; })));
    const positions = await Position.findAll({ where: { id: { [Op.in]: posIds.concat([-1]) } } });
    const docs = await Physician.findAll({ where: { id: { [Op.in]: docIds.concat([-1]) } } });
    const accs = await Account.findAll({ where: { tenant_id: TENANT, role: 'physician' } });
    const P = {}; positions.forEach(function (x) { P[x.id] = x; });
    const D = {}; docs.forEach(function (x) { D[x.id] = x; });
    const A = {}; accs.forEach(function (x) { A[x.id] = x; });
    res.json({
      stages: pipelineSvc.STAGES,
      agent_authority: pipelineSvc.agentAuthorityTable(),
      items: rows.map(function (r) {
        const d = D[r.physician_id], pos = P[r.position_id];
        const a = d ? A[d.account_id] : null;
        return { id: r.id, stage: r.stage, set_by_kind: r.set_by_kind, updated_at: r.updated_at,
          candidate: { id: r.physician_id, name: a ? a.name : 'Candidate #' + r.physician_id,
                       specialty: d ? d.specialty : null, years_experience: d ? d.years_experience : null },
          position: pos ? { id: pos.id, title: pos.title, specialty: pos.specialty,
                            city: pos.city, state: pos.state } : null };
      })
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/pipeline/:id', requireRole('recruiter', 'hospital'), async function (req, res) {
  try {
    const row = await Pipeline.findOne({ where: { id: parseInt(req.params.id, 10) || 0, tenant_id: TENANT } });
    if (!row) return res.status(404).json({ error: 'Not found.' });
    if (req.account.role === 'hospital') {
      const pos = await Position.findOne({ where: { id: row.position_id, org_id: req.account.org_id } });
      if (!pos) return res.status(404).json({ error: 'Not found.' });
    }
    const stage = String((req.body || {}).stage || '');
    // An agent name may be supplied to record that automation moved this; the
    // allow-list then applies. Absent it, a person is moving it.
    const asAgent = (req.body || {}).as_agent;
    const r = asAgent
      ? await moveStage(row, stage, 'agent', String(asAgent))
      : await moveStage(row, stage, 'person', String(req.account.id));
    if (!r.ok) return res.status(403).json({ error: r.error });
    res.json({ ok: true, stage: row.stage });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
//  THE AGENTS. Every one of them drafts, proposes or flags. None of them
//  sends anything, and none can move a candidate — a stage change still goes
//  through pipeline.js and its allow-list.
// ══════════════════════════════════════════════════════════════════════════

async function pipelineContext(row) {
  const ph = await Physician.findOne({ where: { id: row.physician_id, tenant_id: TENANT } });
  const pos = await Position.findOne({ where: { id: row.position_id, tenant_id: TENANT } });
  const org = pos ? await Organization.findOne({ where: { id: pos.org_id, tenant_id: TENANT } }) : null;
  const acc = ph ? await Account.findOne({ where: { id: ph.account_id, tenant_id: TENANT } }) : null;
  const m = (ph && pos) ? matching.scoreMatch(ph.get({ plain: true }), pos.get({ plain: true })) : null;
  return {
    physician: ph ? ph.get({ plain: true }) : null,
    position: pos ? pos.get({ plain: true }) : null,
    organization: org ? org.get({ plain: true }) : null,
    candidateName: acc ? acc.name : 'Candidate #' + row.physician_id,
    reasons: m ? m.reasons : [], gaps: m ? m.gaps : [], score: m ? m.score : null
  };
}

async function scopedPipelineRow(req, id) {
  const row = await Pipeline.findOne({ where: { id: parseInt(id, 10) || 0, tenant_id: TENANT } });
  if (!row) return null;
  if (req.account.role === 'hospital') {
    const pos = await Position.findOne({ where: { id: row.position_id, org_id: req.account.org_id } });
    if (!pos) return null;
  }
  return row;
}

// Recruitment Outreach Agent — drafts an approach. Never sends.
router.post('/agents/outreach/:pipelineId', requireRole('recruiter', 'hospital'), async function (req, res) {
  try {
    const row = await scopedPipelineRow(req, req.params.pipelineId);
    if (!row) return res.status(404).json({ error: 'Not found.' });
    const ctx = await pipelineContext(row);
    if (!ctx.position) return res.status(404).json({ error: 'That position no longer exists.' });
    const draft = agents.outreachDraft(ctx);
    const saved = await AgentAction.create({
      tenant_id: TENANT, pipeline_id: row.id, agent: draft.agent, kind: draft.kind,
      subject: draft.subject, body: draft.body,
      payload: { grounded_in: draft.grounded_in, gaps_for_recruiter: draft.gaps_for_recruiter, score: ctx.score },
      status: 'draft', created_by: req.account.id
    });
    res.status(201).json({ ok: true, action: saved, note: draft.note });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Scheduling Agent — proposes times. Books nothing; it holds no calendar.
router.post('/agents/schedule/:pipelineId', requireRole('recruiter', 'hospital'), async function (req, res) {
  try {
    const row = await scopedPipelineRow(req, req.params.pipelineId);
    if (!row) return res.status(404).json({ error: 'Not found.' });
    const ctx = await pipelineContext(row);
    const prop = agents.schedulingPropose({ candidateName: ctx.candidateName, position: ctx.position });
    const saved = await AgentAction.create({
      tenant_id: TENANT, pipeline_id: row.id, agent: prop.agent, kind: prop.kind,
      subject: prop.subject, body: prop.body, payload: prop.payload,
      status: 'draft', created_by: req.account.id
    });
    res.status(201).json({ ok: true, action: saved, note: prop.note });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Follow-Up Agent — flags what has stalled. It never moves anyone.
router.get('/agents/followup', requireRole('recruiter', 'hospital'), async function (req, res) {
  try {
    const where = { tenant_id: TENANT };
    if (req.account.role === 'hospital') {
      const mine = await Position.findAll({ where: { tenant_id: TENANT, org_id: req.account.org_id }, attributes: ['id'] });
      where.position_id = { [Op.in]: mine.map(function (x) { return x.id; }).concat([-1]) };
    }
    const rows = await Pipeline.findAll({ where: where, limit: 500 });
    const posIds = Array.from(new Set(rows.map(function (r) { return r.position_id; })));
    const docIds = Array.from(new Set(rows.map(function (r) { return r.physician_id; })));
    const positions = await Position.findAll({ where: { id: { [Op.in]: posIds.concat([-1]) } } });
    const docs = await Physician.findAll({ where: { id: { [Op.in]: docIds.concat([-1]) } } });
    const accs = await Account.findAll({ where: { tenant_id: TENANT, role: 'physician' } });
    const P = {}; positions.forEach(function (x) { P[x.id] = x; });
    const D = {}; docs.forEach(function (x) { D[x.id] = x; });
    const A = {}; accs.forEach(function (x) { A[x.id] = x; });
    const enriched = rows.map(function (r) {
      const d = D[r.physician_id], a = d ? A[d.account_id] : null;
      return { id: r.id, stage: r.stage, updated_at: r.updated_at,
               candidateName: a ? a.name : 'Candidate #' + r.physician_id,
               positionTitle: P[r.position_id] ? P[r.position_id].title : '' };
    });
    res.json({ agent: 'Follow-Up Agent', items: agents.followupScan(enriched),
               thresholds: agents.STALL_DAYS,
               note: 'These are flags. Nothing has been moved; only a person can advance a stage.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Candidate Matching Agent — background rescan across everyone.
router.post('/agents/rescan', requireRole('recruiter'), async function (req, res) {
  try {
    const docs = await Physician.findAll({ where: { tenant_id: TENANT, specialty: { [Op.ne]: null } }, limit: 500 });
    const positions = await Position.findAll({ where: { tenant_id: TENANT, status: 'open' }, limit: 300 });
    let n = 0;
    for (const d of docs) {
      const plain = d.get({ plain: true });
      for (const pos of positions) {
        const m = matching.scoreMatch(plain, pos.get({ plain: true }));
        await Match.upsert({ tenant_id: TENANT, physician_id: d.id, position_id: pos.id,
          score: m.score, dimensions: m.dimensions, reasons: m.reasons, gaps: m.gaps,
          computed_at: new Date() });
        n++;
      }
    }
    res.json({ ok: true, agent: 'Candidate Matching Agent', physicians: docs.length,
               positions: positions.length, matches_written: n });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// The review queue. A person approves or discards; nothing leaves on its own.
router.get('/agents/actions', requireRole('recruiter', 'hospital'), async function (req, res) {
  try {
    const rows = await AgentAction.findAll({ where: { tenant_id: TENANT },
      order: [['created_at', 'DESC']], limit: 200 });
    res.json({ items: rows,
      note: 'Approving marks a draft ready to send by hand. This platform sends nothing itself.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/agents/actions/:id', requireRole('recruiter', 'hospital'), async function (req, res) {
  try {
    const row = await AgentAction.findOne({ where: { id: parseInt(req.params.id, 10) || 0, tenant_id: TENANT } });
    if (!row) return res.status(404).json({ error: 'Not found.' });
    const status = String((req.body || {}).status || '');
    // 'sent' is deliberately NOT accepted: the platform cannot know that, and
    // recording it would be the platform claiming it did something it did not.
    if (['approved', 'discarded', 'draft'].indexOf(status) === -1) {
      return res.status(400).json({ error: 'Status must be approved, discarded or draft.' });
    }
    if (typeof (req.body || {}).body === 'string') row.body = String(req.body.body).slice(0, 20000);
    row.status = status;
    row.reviewed_by = req.account.id;
    row.reviewed_at = new Date();
    await row.save();
    res.json({ ok: true, action: row });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Recruiter Copilot — plain English over the rows that actually exist.
router.post('/search', requireRole('recruiter', 'hospital'), async function (req, res) {
  try {
    const q = String((req.body || {}).q || '').slice(0, 500);
    const parsed = agents.parseQuery(q);
    const docs = await Physician.findAll({ where: { tenant_id: TENANT, specialty: { [Op.ne]: null } }, limit: 500 });
    const plain = docs.map(function (d) { return d.get({ plain: true }); });
    const hits = agents.applyQuery(parsed, plain);
    const accs = await Account.findAll({ where: { tenant_id: TENANT, role: 'physician' } });
    const A = {}; accs.forEach(function (x) { A[x.id] = x; });
    res.json({
      agent: 'Recruiter Copilot', query: q,
      applied: parsed.applied, ignored: parsed.ignored, searched: plain.length,
      items: hits.map(function (p) {
        const a = A[p.account_id];
        return { physician_id: p.id, name: a ? a.name : 'Candidate #' + p.id,
                 specialty: p.specialty, years_experience: p.years_experience,
                 board_certified: p.board_certified, licenses: p.licenses,
                 robotic_platforms: p.robotic_platforms, ai_summary: p.ai_summary };
      }),
      note: parsed.ignored.length
        ? 'These words were not understood and were NOT used as filters: ' + parsed.ignored.join(', ') + '.'
        : 'Every part of the question was applied as a filter.'
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/organizations', requireRole('recruiter'), async function (req, res) {
  const rows = await Organization.findAll({ where: { tenant_id: TENANT }, order: [['name', 'ASC']] });
  res.json({ items: rows });
});

// Reference data the forms need, straight from the corpus.
router.get('/reference', function (req, res) {
  res.json({
    specialties: C.MEDICAL_SPECIALTIES,
    stages: pipelineSvc.STAGES,
    dimensions: C.MATCHING_DIMENSIONS.map(function (d) { return d.dimension; }),
    robotic_platforms: cv.ROBOT_PLATFORMS,
    states: cv.STATES,
    employment_models: ['employed', 'independent', 'academic'],
    call_levels: ['none', 'light', 'moderate', 'heavy']
  });
});

module.exports = router;
module.exports.profileCompleteness = profileCompleteness;
