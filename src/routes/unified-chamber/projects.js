/**
 * Unified projects + invitations + meetings + signoff + plan-versions router.
 * Mounted under /:chamber_slug/api -- all queries scoped by req.chamber_id.
 *
 * Ported from chamber-template/routes/projects.js to unified schema (single
 * `projects`, `project_invitations`, `project_signoffs`, etc. tables with
 * chamber_id FK).
 */
const express = require('express');
const crypto = require('crypto');
const { sequelize, QueryTypes, authMiddleware, isSuperadmin } = require('./lib/shared');
const { scoreMember } = require('./lib/scoring');
const { runCascade, maybeAutoClose } = require('./lib/p2b-cascade');
const { autoInitWorkspaceFromPlan } = require('./lib/workspace-init');
const planGenerator = require('../../../chamber-template/lib/plan-generator');
const ical = require('../../../chamber-template/lib/ical');

const router = express.Router();
const LIFECYCLE_PHASES = ['proposal', 'analysis', 'team', 'resources', 'execution', 'completed'];

// =====================================================================
// LIST (with scope filter: mine | invited | open_rfq | all)
// =====================================================================
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, sector, country, plan_status, scope, page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    const conditions = ['p.chamber_id = :c'];
    const replacements = { c: req.chamber_id, current_member_id: req.member.id };

    if (status) { conditions.push('p.status = :status'); replacements.status = status; }
    if (sector) { conditions.push('p.sector = :sector'); replacements.sector = sector; }
    if (country) { conditions.push(':country = ANY(p.countries)'); replacements.country = country; }
    if (plan_status) { conditions.push('p.plan_status = :plan_status'); replacements.plan_status = plan_status; }

    if (scope === 'mine') {
      conditions.push('p.proposer_member_id = :current_member_id');
    } else if (scope === 'invited') {
      conditions.push(`(
        EXISTS (SELECT 1 FROM project_invitations i WHERE i.chamber_id = :c AND i.project_id = p.id AND i.member_id = :current_member_id)
        OR EXISTS (SELECT 1 FROM project_members pmx WHERE pmx.chamber_id = :c AND pmx.project_id = p.id AND pmx.member_id = :current_member_id)
      )`);
    } else if (scope === 'open_rfq') {
      conditions.push(`p.plan_status = 'recruiting'`);
      conditions.push(`p.recruitment_closed_at IS NULL`);
      conditions.push(`p.proposer_member_id != :current_member_id`);
      conditions.push(`NOT EXISTS (SELECT 1 FROM project_invitations i WHERE i.chamber_id = :c AND i.project_id = p.id AND i.member_id = :current_member_id)`);
      conditions.push(`NOT EXISTS (SELECT 1 FROM project_members pmx WHERE pmx.chamber_id = :c AND pmx.project_id = p.id AND pmx.member_id = :current_member_id)`);
    }

    const sa = await isSuperadmin(req.member.id, req.chamber_id);

    conditions.push(`(
      p.visibility != 'archived'
      AND (p.plan_status NOT IN ('draft') OR p.proposer_member_id = :current_member_id)
    )`);

    const where = 'WHERE ' + conditions.join(' AND ');
    const countResult = await sequelize.query(
      `SELECT COUNT(*) AS total FROM projects p ${where}`,
      { replacements, type: QueryTypes.SELECT }
    );
    const total = parseInt(countResult[0].total);
    const projects = await sequelize.query(
      `SELECT p.id, p.title, p.description, p.sector, p.countries, p.pilot_type,
              p.budget_min, p.budget_est, p.budget_max,
              p.timeline_min_months, p.timeline_est_months, p.timeline_max_months,
              p.status, p.plan_status, p.visibility, p.proposer_member_id,
              p.recruitment_deadline, p.recruitment_closed_at, p.recruitment_closed_by,
              p.monte_carlo_result,
              p.created_at, p.updated_at,
              CASE
                WHEN p.visibility = 'participants_only' AND p.proposer_member_id != :current_member_id
                     AND NOT EXISTS (SELECT 1 FROM project_members pm
                                     WHERE pm.chamber_id = :c AND pm.project_id = p.id AND pm.member_id = :current_member_id)
                THEN NULL
                ELSE p.plan_json
              END AS plan_json,
              m.first_name || ' ' || m.last_name AS proposer_name,
              (p.proposer_member_id = :current_member_id) AS is_mine,
              EXISTS (SELECT 1 FROM project_members pm2 WHERE pm2.chamber_id = :c AND pm2.project_id = p.id AND pm2.member_id = :current_member_id) AS is_participant,
              EXISTS (SELECT 1 FROM project_invitations i2 WHERE i2.chamber_id = :c AND i2.project_id = p.id AND i2.member_id = :current_member_id) AS has_invite
       FROM projects p LEFT JOIN members m ON m.id = p.proposer_member_id ${where}
       ORDER BY p.created_at DESC LIMIT :limit OFFSET :offset`,
      { replacements: { ...replacements, limit: parseInt(limit), offset }, type: QueryTypes.SELECT }
    );

    let viewerProfile = null;
    if (scope === 'open_rfq' && projects.length > 0) {
      const [vp] = await sequelize.query(
        `SELECT id, country, region_id, sector, sub_specialty, bio, company_name, trust_score
         FROM members WHERE chamber_id = :c AND id = :id`,
        { replacements: { c: req.chamber_id, id: req.member.id }, type: QueryTypes.SELECT }
      );
      viewerProfile = vp;
    }

    const enriched = projects.map(p => {
      const isStub = (p.visibility === 'participants_only' && p.plan_json === null && !sa);
      let matched_roles = null;
      if (scope === 'open_rfq' && viewerProfile && p.plan_json && Array.isArray(p.plan_json.team_roles_required)) {
        matched_roles = p.plan_json.team_roles_required
          .map((role, idx) => ({
            role_index: idx,
            role_title: role.role_title,
            must_have: !!role.must_have,
            commitment_pct: role.commitment_pct || null,
            required_skills: role.required_skills || [],
            score: scoreMember(viewerProfile, role)
          }))
          .filter(r => r.score >= 0.25)
          .sort((a, b) => b.score - a.score);
      }
      return { ...p, is_stub: isStub, matched_roles };
    });
    const finalProjects = scope === 'open_rfq'
      ? enriched.filter(p => p.matched_roles && p.matched_roles.length > 0)
      : enriched;

    return res.json({
      success: true,
      data: {
        projects: finalProjects,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// CREATE (manual, non-AI)
// =====================================================================
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description, sector, countries, pilot_type, budget_min, budget_est, budget_max,
            timeline_min_months, timeline_est_months, timeline_max_months } = req.body;
    if (!title || !description || !sector) {
      return res.status(400).json({ success: false, error: 'title, description and sector are required' });
    }
    const countriesArray = Array.isArray(countries) ? countries : [];
    const countriesSql = countriesArray.length > 0
      ? `ARRAY[${countriesArray.map((_, i) => `:cc${i}`).join(',')}]::TEXT[]`
      : "ARRAY[]::TEXT[]";
    const cr = {}; countriesArray.forEach((c, i) => { cr[`cc${i}`] = c; });
    const result = await sequelize.query(
      `INSERT INTO projects
       (chamber_id, title, description, sector, countries, pilot_type,
        budget_min, budget_est, budget_max,
        timeline_min_months, timeline_est_months, timeline_max_months,
        status, proposer_member_id, created_at, updated_at)
       VALUES (:c, :title, :description, :sector, ${countriesSql}, :pilot_type,
               :budget_min, :budget_est, :budget_max,
               :timeline_min_months, :timeline_est_months, :timeline_max_months,
               'proposal', :proposer, NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          c: req.chamber_id, title, description, sector, pilot_type: pilot_type || null,
          budget_min: budget_min || null, budget_est: budget_est || null, budget_max: budget_max || null,
          timeline_min_months: timeline_min_months || null,
          timeline_est_months: timeline_est_months || null,
          timeline_max_months: timeline_max_months || null,
          proposer: req.member.id, ...cr
        },
        type: QueryTypes.SELECT
      }
    );
    return res.status(201).json({ success: true, data: result[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// AI plan draft generation (P2B Stage 0)
// =====================================================================
router.post('/draft', authMiddleware, async (req, res) => {
  try {
    const { vision, sector, countries, budget_tier } = req.body;
    if (!vision || vision.trim().length < 50) {
      return res.status(400).json({ success: false, error: 'vision must be at least 50 chars' });
    }
    if (vision.length > 1500) {
      return res.status(400).json({ success: false, error: 'vision must be under 1500 chars' });
    }

    const { plan, usage } = await planGenerator.generatePlan({
      vision: vision.trim(), sector, countries, budget_tier
    });

    const countriesArray = Array.isArray(countries) ? countries : [];
    const countriesSql = countriesArray.length > 0
      ? `ARRAY[${countriesArray.map((_, i) => `:cc${i}`).join(',')}]::TEXT[]`
      : "ARRAY[]::TEXT[]";
    const cr = {}; countriesArray.forEach((c, i) => { cr[`cc${i}`] = c; });

    const result = await sequelize.query(
      `INSERT INTO projects
       (chamber_id, title, description, sector, countries, plan_json, plan_status, visibility,
        status, proposer_member_id, created_at, updated_at)
       VALUES (:c, :title, :description, :sector, ${countriesSql},
               :plan_json, 'draft', 'public_plan', 'proposal', :proposer, NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          c: req.chamber_id,
          title: plan.title || 'Untitled P2B Project',
          description: plan.executive_summary || '',
          sector: sector || null,
          plan_json: JSON.stringify(plan),
          proposer: req.member.id,
          ...cr
        },
        type: QueryTypes.SELECT
      }
    );
    return res.status(201).json({ success: true, data: { project_id: result[0].id, plan_json: plan, usage } });
  } catch (err) {
    console.error('[unified plan-draft]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// LIST invitations inbox (must be BEFORE /:id so /invitations doesn't match)
// =====================================================================
router.get('/invitations/inbox', authMiddleware, async (req, res) => {
  try {
    const inv = await sequelize.query(
      `SELECT i.*, p.title AS project_title, p.plan_status,
              m.first_name || ' ' || m.last_name AS invited_by_name
       FROM project_invitations i
       JOIN projects p ON p.id = i.project_id
       LEFT JOIN members m ON m.id = i.invited_by_member_id
       WHERE i.chamber_id = :c AND i.member_id = :me
       ORDER BY i.invited_at DESC`,
      { replacements: { c: req.chamber_id, me: req.member.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: inv });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// GET single project (with team + fill_status + viewer role)
// =====================================================================
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    let projects = await sequelize.query(
      `SELECT p.*, m.first_name || ' ' || m.last_name AS proposer_name
       FROM projects p LEFT JOIN members m ON m.id = p.proposer_member_id
       WHERE p.chamber_id = :c AND p.id = :id`,
      { replacements: { c: req.chamber_id, id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (projects.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });

    await maybeAutoClose(sequelize, req.chamber_id, projects[0]);
    projects = await sequelize.query(
      `SELECT p.*, m.first_name || ' ' || m.last_name AS proposer_name
       FROM projects p LEFT JOIN members m ON m.id = p.proposer_member_id
       WHERE p.chamber_id = :c AND p.id = :id`,
      { replacements: { c: req.chamber_id, id: req.params.id }, type: QueryTypes.SELECT }
    );
    const project = projects[0];

    const sa = await isSuperadmin(req.member.id, req.chamber_id);
    const isProposer = project.proposer_member_id === req.member.id;
    const [pmRow] = await sequelize.query(
      `SELECT 1 FROM project_members WHERE chamber_id = :c AND project_id = :p AND member_id = :m`,
      { replacements: { c: req.chamber_id, p: req.params.id, m: req.member.id }, type: QueryTypes.SELECT }
    );
    const isParticipant = !!pmRow;

    if (project.visibility === 'participants_only') {
      if (!isParticipant && !sa && !isProposer) {
        return res.json({
          success: true,
          data: {
            id: project.id, title: project.title, status: project.status,
            plan_status: project.plan_status, visibility: project.visibility,
            is_stub: true, participant_count: 0
          }
        });
      }
    }
    if (project.plan_status === 'draft' && !isProposer && !sa) {
      return res.status(403).json({ success: false, error: 'Draft is private to proposer' });
    }

    const members = await sequelize.query(
      `SELECT pm.*, m.first_name, m.last_name, m.email, m.country, m.sector, m.trust_score
       FROM project_members pm JOIN members m ON m.id = pm.member_id
       WHERE pm.chamber_id = :c AND pm.project_id = :id ORDER BY pm.joined_at ASC`,
      { replacements: { c: req.chamber_id, id: req.params.id }, type: QueryTypes.SELECT }
    );

    let fill_status = null;
    if (project.plan_json && Array.isArray(project.plan_json.team_roles_required)) {
      fill_status = project.plan_json.team_roles_required.map((role, idx) => {
        const filled = members.filter(pm => pm.role_index === idx);
        return {
          role_index: idx,
          role_title: role.role_title,
          must_have: !!role.must_have,
          filled_count: filled.length,
          filled_by: filled.map(f => ({ member_id: f.member_id, name: `${f.first_name} ${f.last_name}` }))
        };
      });
    }

    return res.json({
      success: true,
      data: {
        ...project,
        team: members,
        fill_status,
        viewer_role: { is_superadmin: sa, is_proposer: isProposer, is_participant: isParticipant }
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// UPDATE (proposer only)
// =====================================================================
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const projects = await sequelize.query(
      `SELECT * FROM projects WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (projects.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });
    if (projects[0].proposer_member_id !== req.member.id) {
      return res.status(403).json({ success: false, error: 'Only the proposer can edit' });
    }

    const allowed = ['title', 'description', 'sector', 'pilot_type',
      'budget_min', 'budget_est', 'budget_max',
      'timeline_min_months', 'timeline_est_months', 'timeline_max_months'];
    const sets = []; const r = { c: req.chamber_id, id: req.params.id };
    for (const k of allowed) {
      if (k in req.body) { sets.push(`${k} = :${k}`); r[k] = req.body[k]; }
    }
    if (sets.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    sets.push('updated_at = NOW()');
    const result = await sequelize.query(
      `UPDATE projects SET ${sets.join(', ')} WHERE chamber_id = :c AND id = :id RETURNING *`,
      { replacements: r, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: result[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// PUT /:id/plan
// =====================================================================
router.put('/:id/plan', authMiddleware, async (req, res) => {
  try {
    const projects = await sequelize.query(
      `SELECT id, proposer_member_id, plan_status FROM projects WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (projects.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });
    if (projects[0].proposer_member_id !== req.member.id) {
      return res.status(403).json({ success: false, error: 'Only the proposer can edit the plan' });
    }
    if (!['draft', 'published'].includes(projects[0].plan_status)) {
      return res.status(400).json({ success: false, error: `Cannot edit plan in status: ${projects[0].plan_status}` });
    }
    const { plan_json } = req.body;
    const validation = planGenerator.validatePlan(plan_json);
    if (!validation.ok) return res.status(400).json({ success: false, error: validation.error });

    const result = await sequelize.query(
      `UPDATE projects SET plan_json = :pj, updated_at = NOW()
       WHERE chamber_id = :c AND id = :id RETURNING *`,
      { replacements: { c: req.chamber_id, id: req.params.id, pj: JSON.stringify(plan_json) }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: result[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// POST /:id/advance (lifecycle phase)
// =====================================================================
router.post('/:id/advance', authMiddleware, async (req, res) => {
  try {
    const projects = await sequelize.query(
      `SELECT * FROM projects WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (projects.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });
    const cur = LIFECYCLE_PHASES.indexOf(projects[0].status);
    if (cur === -1 || cur === LIFECYCLE_PHASES.length - 1) {
      return res.status(400).json({ success: false, error: 'Cannot advance' });
    }
    const next = LIFECYCLE_PHASES[cur + 1];
    const result = await sequelize.query(
      `UPDATE projects SET status = :n, updated_at = NOW() WHERE chamber_id = :c AND id = :id RETURNING *`,
      { replacements: { c: req.chamber_id, id: req.params.id, n: next }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: result[0], transition: { from: projects[0].status, to: next } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// POST /:id/join
// =====================================================================
router.post('/:id/join', authMiddleware, async (req, res) => {
  try {
    const proj = await sequelize.query(
      `SELECT id FROM projects WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (proj.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });
    const existing = await sequelize.query(
      `SELECT id FROM project_members WHERE chamber_id = :c AND project_id = :p AND member_id = :m`,
      { replacements: { c: req.chamber_id, p: req.params.id, m: req.member.id }, type: QueryTypes.SELECT }
    );
    if (existing.length > 0) return res.status(409).json({ success: false, error: 'Already a project member' });
    const result = await sequelize.query(
      `INSERT INTO project_members (chamber_id, project_id, member_id, role, joined_at)
       VALUES (:c, :p, :m, :role, NOW()) RETURNING *`,
      {
        replacements: {
          c: req.chamber_id, p: req.params.id, m: req.member.id, role: req.body.role || 'collaborator'
        },
        type: QueryTypes.SELECT
      }
    );
    return res.status(201).json({ success: true, data: result[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// POST /:id/evaluate (Monte Carlo - cached or computed)
// =====================================================================
router.post('/:id/evaluate', authMiddleware, async (req, res) => {
  try {
    const [project] = await sequelize.query(
      `SELECT * FROM projects WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    if (project.monte_carlo_result) {
      return res.json({ success: true, data: project.monte_carlo_result, cached: true });
    }

    const { monteCarloProject } = require('../../../chamber-template/chamber-math');
    const teamMembers = await sequelize.query(
      `SELECT pm.member_id, m.trust_score
       FROM project_members pm JOIN members m ON m.id = pm.member_id
       WHERE pm.chamber_id = :c AND pm.project_id = :p`,
      { replacements: { c: req.chamber_id, p: req.params.id }, type: QueryTypes.SELECT }
    );
    const teamSize = teamMembers.length || 1;
    const avgTrust = teamMembers.length > 0
      ? teamMembers.reduce((s, m) => s + parseFloat(m.trust_score || 0.7), 0) / teamMembers.length
      : 0.7;
    const teamRoles = (project.plan_json && project.plan_json.team_roles_required) || [];
    const teamScore = Math.min(1, teamSize / Math.max(1, teamRoles.length || 1));

    const budgetEst = parseFloat(project.budget_est) || 200000;
    const budgetMin = parseFloat(project.budget_min) || budgetEst * 0.75;
    const budgetMax = parseFloat(project.budget_max) || budgetEst * 1.5;
    const timeEst = parseInt(project.timeline_est_months) || 6;
    const timeMin = parseInt(project.timeline_min_months) || Math.max(2, Math.floor(timeEst * 0.7));
    const timeMax = parseInt(project.timeline_max_months) || Math.ceil(timeEst * 1.5);

    const mc = monteCarloProject({
      budget_min: budgetMin, budget_est: budgetEst, budget_max: budgetMax,
      budget_available: budgetMax,
      timeline_min: timeMin, timeline_est: timeEst, timeline_max: timeMax,
      deadline_months: timeMax,
      team_score: teamScore, alignment_score: avgTrust
    }, 10000);

    return res.json({
      success: true,
      data: {
        ...mc,
        success_probability: mc.viabilityScore,
        risk_score: mc.semaphore.toLowerCase(),
        iterations: 10000,
        budget: { p10: Math.round(mc.percentiles.p10), p50: Math.round(mc.percentiles.p50), p90: Math.round(mc.percentiles.p90), mean: Math.round(mc.percentiles.p50) },
        timeline_months: { p10: timeMin, p50: timeEst, p90: timeMax },
        team_size: teamSize, avg_trust: avgTrust, cached: false
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// POST /:id/publish (draft -> recruiting + 30d deadline + auto AI invitations)
// =====================================================================
router.post('/:id/publish', authMiddleware, async (req, res) => {
  try {
    const [project] = await sequelize.query(
      `SELECT * FROM projects WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    if (project.proposer_member_id !== req.member.id) {
      return res.status(403).json({ success: false, error: 'Only the proposer can publish' });
    }
    if (project.plan_status !== 'draft') {
      return res.status(400).json({ success: false, error: `Already ${project.plan_status}` });
    }
    const validation = planGenerator.validatePlan(project.plan_json);
    if (!validation.ok) return res.status(400).json({ success: false, error: validation.error });

    const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const [updated] = await sequelize.query(
      `UPDATE projects
       SET plan_status = 'recruiting', visibility = 'public_plan',
           recruitment_deadline = :dl, updated_at = NOW()
       WHERE chamber_id = :c AND id = :id RETURNING *`,
      { replacements: { c: req.chamber_id, id: req.params.id, dl: deadline }, type: QueryTypes.SELECT }
    );

    let invitationsCreated = 0;
    try {
      const plan = project.plan_json;
      if (Array.isArray(plan.team_roles_required)) {
        const members = await sequelize.query(
          `SELECT id, first_name, last_name, email, country, region_id, sector,
                  sub_specialty, bio, company_name, trust_score
           FROM members WHERE chamber_id = :c AND id != :proposer AND status = 'active'`,
          { replacements: { c: req.chamber_id, proposer: project.proposer_member_id }, type: QueryTypes.SELECT }
        );
        const N = 3;
        for (let i = 0; i < plan.team_roles_required.length; i++) {
          const role = plan.team_roles_required[i];
          const ranked = members
            .map(m => ({ member: m, score: scoreMember(m, role) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, N);
          for (const r of ranked) {
            const [existing] = await sequelize.query(
              `SELECT id FROM project_invitations
               WHERE chamber_id = :c AND project_id = :p AND member_id = :m AND role_index = :i`,
              { replacements: { c: req.chamber_id, p: req.params.id, m: r.member.id, i }, type: QueryTypes.SELECT }
            );
            if (existing) continue;
            await sequelize.query(
              `INSERT INTO project_invitations
               (chamber_id, project_id, member_id, role_index, role_title, status, match_score, invited_by_member_id, invited_at)
               VALUES (:c, :p, :m, :i, :rt, 'pending', :s, :inv, NOW())`,
              {
                replacements: {
                  c: req.chamber_id, p: req.params.id, m: r.member.id, i,
                  rt: role.role_title || `Role ${i + 1}`, s: r.score.toFixed(3), inv: req.member.id
                }
              }
            );
            invitationsCreated++;
          }
        }
      }
    } catch (invErr) {
      console.error('[unified publish auto-invite]', invErr.message);
    }

    return res.json({ success: true, data: { ...updated, invitations_created: invitationsCreated } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// POST /:id/close-recruitment
// =====================================================================
router.post('/:id/close-recruitment', authMiddleware, async (req, res) => {
  try {
    const [project] = await sequelize.query(
      `SELECT id, proposer_member_id, plan_status, recruitment_closed_at
       FROM projects WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const sa = await isSuperadmin(req.member.id, req.chamber_id);
    if (project.proposer_member_id !== req.member.id && !sa) {
      return res.status(403).json({ success: false, error: 'Only proposer or superadmin can close recruitment' });
    }
    if (!['recruiting', 'fully_staffed'].includes(project.plan_status)) {
      return res.status(400).json({ success: false, error: `Cannot close from status: ${project.plan_status}` });
    }

    if (!project.recruitment_closed_at) {
      await sequelize.query(
        `UPDATE projects
         SET recruitment_closed_at = NOW(), recruitment_closed_by = 'manual', updated_at = NOW()
         WHERE chamber_id = :c AND id = :id`,
        { replacements: { c: req.chamber_id, id: req.params.id } }
      );
    }
    const cascadeResult = await runCascade(sequelize, req.chamber_id, req.params.id);
    return res.json({ success: true, data: cascadeResult });
  } catch (err) {
    console.error('[unified close-recruitment]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// POST /:id/reopen-recruitment
// =====================================================================
router.post('/:id/reopen-recruitment', authMiddleware, async (req, res) => {
  try {
    const days = Math.max(1, Math.min(60, parseInt(req.body && req.body.days_extension) || 14));
    const [project] = await sequelize.query(
      `SELECT id, proposer_member_id, plan_status FROM projects WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const sa = await isSuperadmin(req.member.id, req.chamber_id);
    if (project.proposer_member_id !== req.member.id && !sa) {
      return res.status(403).json({ success: false, error: 'Only proposer or superadmin can reopen recruitment' });
    }
    if (!['recruitment_failed', 'fully_staffed', 'pending_signoff'].includes(project.plan_status)) {
      return res.status(400).json({ success: false, error: `Cannot reopen from status: ${project.plan_status}` });
    }

    const newDeadline = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await sequelize.query(
      `UPDATE projects
       SET plan_status = 'recruiting', recruitment_closed_at = NULL, recruitment_closed_by = NULL,
           recruitment_deadline = :dl, monte_carlo_result = NULL, monte_carlo_at = NULL,
           updated_at = NOW()
       WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: req.params.id, dl: newDeadline } }
    );
    return res.json({ success: true, data: { plan_status: 'recruiting', recruitment_deadline: newDeadline, days_extension: days } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// POST /:id/invite-matches
// =====================================================================
router.post('/:id/invite-matches', authMiddleware, async (req, res) => {
  try {
    const projects = await sequelize.query(
      `SELECT id, proposer_member_id, plan_json, plan_status FROM projects WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (projects.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });
    const project = projects[0];
    if (project.proposer_member_id !== req.member.id) {
      return res.status(403).json({ success: false, error: 'Only the proposer can invite' });
    }
    if (project.plan_status !== 'published' && project.plan_status !== 'recruiting') {
      return res.status(400).json({ success: false, error: 'Plan must be published before inviting' });
    }
    const plan = project.plan_json;
    if (!plan || !Array.isArray(plan.team_roles_required) || plan.team_roles_required.length === 0) {
      return res.status(400).json({ success: false, error: 'Plan has no team_roles_required' });
    }

    const members = await sequelize.query(
      `SELECT id, first_name, last_name, email, country, region_id, sector,
              sub_specialty, bio, company_name, trust_score
       FROM members WHERE chamber_id = :c AND id != :proposer AND status = 'active'`,
      { replacements: { c: req.chamber_id, proposer: project.proposer_member_id }, type: QueryTypes.SELECT }
    );

    const N = parseInt(req.body.top_n || 3);
    const byRole = []; let invitationsCreated = 0;
    for (let i = 0; i < plan.team_roles_required.length; i++) {
      const role = plan.team_roles_required[i];
      const ranked = members
        .map(m => ({ member: m, score: scoreMember(m, role) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, N);
      const invited = [];
      for (const r of ranked) {
        const [existing] = await sequelize.query(
          `SELECT id, status FROM project_invitations
           WHERE chamber_id = :c AND project_id = :p AND member_id = :m AND role_index = :i`,
          { replacements: { c: req.chamber_id, p: req.params.id, m: r.member.id, i }, type: QueryTypes.SELECT }
        );
        if (existing) {
          invited.push({ member_id: r.member.id, name: `${r.member.first_name} ${r.member.last_name}`, score: r.score, status: existing.status, existing: true });
          continue;
        }
        await sequelize.query(
          `INSERT INTO project_invitations
           (chamber_id, project_id, member_id, role_index, role_title, status, match_score, invited_by_member_id, invited_at)
           VALUES (:c, :p, :m, :i, :rt, 'pending', :s, :inv, NOW())`,
          {
            replacements: {
              c: req.chamber_id, p: req.params.id, m: r.member.id, i,
              rt: role.role_title || `Role ${i + 1}`, s: r.score.toFixed(3), inv: req.member.id
            }
          }
        );
        invitationsCreated++;
        invited.push({ member_id: r.member.id, name: `${r.member.first_name} ${r.member.last_name}`, score: r.score, status: 'pending' });
      }
      byRole.push({ role_index: i, role_title: role.role_title, must_have: !!role.must_have, invitees: invited });
    }

    if (project.plan_status === 'published') {
      await sequelize.query(
        `UPDATE projects SET plan_status = 'recruiting', updated_at = NOW()
         WHERE chamber_id = :c AND id = :id`,
        { replacements: { c: req.chamber_id, id: req.params.id } }
      );
    }
    return res.json({ success: true, data: { invitations_created: invitationsCreated, by_role: byRole } });
  } catch (err) {
    console.error('[unified invite-matches]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// POST /:id/invitations/:inv_id/respond (accept/decline + auto-cascade if all roles filled)
// =====================================================================
router.post('/:id/invitations/:inv_id/respond', authMiddleware, async (req, res) => {
  try {
    const { action, message } = req.body;
    if (!['accept', 'decline'].includes(action)) {
      return res.status(400).json({ success: false, error: 'action must be accept or decline' });
    }
    const [inv] = await sequelize.query(
      `SELECT * FROM project_invitations
       WHERE chamber_id = :c AND id = :inv AND project_id = :p`,
      { replacements: { c: req.chamber_id, inv: req.params.inv_id, p: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!inv) return res.status(404).json({ success: false, error: 'Invitation not found' });
    if (inv.member_id !== req.member.id) {
      return res.status(403).json({ success: false, error: 'Not your invitation' });
    }
    if (inv.status !== 'pending') {
      return res.status(400).json({ success: false, error: `Invitation already ${inv.status}` });
    }
    const newStatus = action === 'accept' ? 'accepted' : 'declined';
    await sequelize.query(
      `UPDATE project_invitations
       SET status = :s, responded_at = NOW(), message = :msg
       WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, s: newStatus, msg: message || null, id: req.params.inv_id } }
    );

    if (action === 'accept') {
      const [exists] = await sequelize.query(
        `SELECT id FROM project_members WHERE chamber_id = :c AND project_id = :p AND member_id = :m`,
        { replacements: { c: req.chamber_id, p: req.params.id, m: req.member.id }, type: QueryTypes.SELECT }
      );
      if (!exists) {
        await sequelize.query(
          `INSERT INTO project_members
           (chamber_id, project_id, member_id, role, role_title, role_index, invitation_id, joined_at)
           VALUES (:c, :p, :m, 'collaborator', :rt, :ri, :inv, NOW())`,
          {
            replacements: {
              c: req.chamber_id, p: req.params.id, m: req.member.id,
              rt: inv.role_title, ri: inv.role_index, inv: inv.id
            }
          }
        );
      }

      const [proj] = await sequelize.query(
        `SELECT plan_json FROM projects WHERE chamber_id = :c AND id = :id`,
        { replacements: { c: req.chamber_id, id: req.params.id }, type: QueryTypes.SELECT }
      );
      const plan = proj && proj.plan_json;
      if (plan && Array.isArray(plan.team_roles_required) && plan.team_roles_required.length > 0) {
        const filled = await sequelize.query(
          `SELECT role_index, COUNT(*) AS n FROM project_members
           WHERE chamber_id = :c AND project_id = :p AND role_index IS NOT NULL
           GROUP BY role_index`,
          { replacements: { c: req.chamber_id, p: req.params.id }, type: QueryTypes.SELECT }
        );
        const filledMap = {};
        filled.forEach(r => { filledMap[r.role_index] = parseInt(r.n); });
        const allRolesFilled = plan.team_roles_required.every((r, i) => filledMap[i] && filledMap[i] >= 1);
        if (allRolesFilled) {
          await sequelize.query(
            `UPDATE projects
             SET plan_status = 'fully_staffed',
                 recruitment_closed_at = COALESCE(recruitment_closed_at, NOW()),
                 recruitment_closed_by = COALESCE(recruitment_closed_by, 'auto_team_locked'),
                 updated_at = NOW()
             WHERE chamber_id = :c AND id = :id AND plan_status IN ('published','recruiting')`,
            { replacements: { c: req.chamber_id, id: req.params.id } }
          );
          try {
            await runCascade(sequelize, req.chamber_id, req.params.id);
          } catch (e) {
            console.error('[unified respond auto-cascade]', e.message);
          }
        }
      }
    }
    return res.json({ success: true, data: { invitation_id: inv.id, status: newStatus } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// POST /:id/request-join
// =====================================================================
router.post('/:id/request-join', authMiddleware, async (req, res) => {
  try {
    const { role_index, message } = req.body;
    if (typeof role_index !== 'number') {
      return res.status(400).json({ success: false, error: 'role_index required' });
    }
    const [proj] = await sequelize.query(
      `SELECT plan_json, plan_status FROM projects WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!proj) return res.status(404).json({ success: false, error: 'Project not found' });
    if (!['published', 'recruiting'].includes(proj.plan_status)) {
      return res.status(400).json({ success: false, error: `Cannot request join in status: ${proj.plan_status}` });
    }
    const role = proj.plan_json && proj.plan_json.team_roles_required && proj.plan_json.team_roles_required[role_index];
    if (!role) return res.status(400).json({ success: false, error: 'Invalid role_index' });

    const [existing] = await sequelize.query(
      `SELECT id, status FROM project_invitations
       WHERE chamber_id = :c AND project_id = :p AND member_id = :m AND role_index = :i`,
      { replacements: { c: req.chamber_id, p: req.params.id, m: req.member.id, i: role_index }, type: QueryTypes.SELECT }
    );
    if (existing) return res.status(409).json({ success: false, error: `Already ${existing.status} for this role` });

    await sequelize.query(
      `INSERT INTO project_invitations
       (chamber_id, project_id, member_id, role_index, role_title, status, match_score, message, invited_at)
       VALUES (:c, :p, :m, :i, :rt, 'pending', NULL, :msg, NOW())`,
      {
        replacements: {
          c: req.chamber_id, p: req.params.id, m: req.member.id, i: role_index,
          rt: role.role_title, msg: message || 'Self-nominated'
        }
      }
    );
    return res.status(201).json({ success: true, data: { message: 'Request submitted; awaiting proposer review' } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// GET /:id/invitations (proposer view)
// =====================================================================
router.get('/:id/invitations', authMiddleware, async (req, res) => {
  try {
    const [proj] = await sequelize.query(
      `SELECT proposer_member_id FROM projects WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!proj) return res.status(404).json({ success: false, error: 'Project not found' });
    const sa = await isSuperadmin(req.member.id, req.chamber_id);
    if (proj.proposer_member_id !== req.member.id && !sa) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    const inv = await sequelize.query(
      `SELECT i.*, m.first_name, m.last_name, m.email, m.sector, m.country
       FROM project_invitations i JOIN members m ON m.id = i.member_id
       WHERE i.chamber_id = :c AND i.project_id = :p
       ORDER BY i.role_index, i.match_score DESC NULLS LAST, i.invited_at DESC`,
      { replacements: { c: req.chamber_id, p: req.params.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: inv });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// POST /:id/book-final-meeting
// =====================================================================
router.post('/:id/book-final-meeting', authMiddleware, async (req, res) => {
  try {
    const [proj] = await sequelize.query(
      `SELECT * FROM projects WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!proj) return res.status(404).json({ success: false, error: 'Project not found' });

    const sa = await isSuperadmin(req.member.id, req.chamber_id);
    if (proj.proposer_member_id !== req.member.id && !sa) {
      return res.status(403).json({ success: false, error: 'Only proposer or superadmin can book' });
    }
    if (proj.plan_status !== 'fully_staffed' && proj.plan_status !== 'pending_signoff') {
      return res.status(400).json({ success: false, error: `Cannot book in status: ${proj.plan_status}` });
    }

    const participants = await sequelize.query(
      `SELECT pm.member_id, m.first_name, m.last_name, m.email
       FROM project_members pm JOIN members m ON m.id = pm.member_id
       WHERE pm.chamber_id = :c AND pm.project_id = :p`,
      { replacements: { c: req.chamber_id, p: req.params.id }, type: QueryTypes.SELECT }
    );
    const [proposer] = await sequelize.query(
      `SELECT id AS member_id, first_name, last_name, email FROM members WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: proj.proposer_member_id }, type: QueryTypes.SELECT }
    );
    const allAttendees = [...participants];
    if (proposer && !participants.some(p => p.member_id === proposer.member_id)) {
      allAttendees.push(proposer);
    }
    const attendeeIds = allAttendees.map(a => a.member_id);

    const proposed = req.body.proposed_datetime
      ? new Date(req.body.proposed_datetime)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    if (!req.body.proposed_datetime) proposed.setUTCHours(14, 0, 0, 0);
    const duration = parseInt(req.body.duration_minutes) || 60;

    const uid = ical.generateUID(req.params.id, 'final_review');
    const videoLink = ical.generateJitsiLink(req.params.id);
    const planTitle = (proj.plan_json && proj.plan_json.title) || proj.title;
    const icsBody = ical.buildICal({
      uid, startsAt: proposed, durationMinutes: duration,
      summary: `Final Review -- ${planTitle}`,
      description: `Final review and digital sign-off of the business plan for "${planTitle}".\n\nVideo link: ${videoLink}`,
      location: videoLink,
      organizerEmail: 'noreply@camaravirtual.app',
      organizerName: 'CamaraVirtual.app',
      attendees: allAttendees.map(a => ({ email: a.email, name: `${a.first_name} ${a.last_name}` }))
    });

    const [meeting] = await sequelize.query(
      `INSERT INTO project_meetings
       (chamber_id, project_id, meeting_type, scheduled_at, duration_minutes, video_link, ical_event_uid, attendees, status, created_at, updated_at)
       VALUES (:c, :p, 'final_review', :sa, :d, :vl, :uid, :att::int[], 'scheduled', NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          c: req.chamber_id, p: req.params.id, sa: proposed, d: duration, vl: videoLink, uid,
          att: '{' + attendeeIds.join(',') + '}'
        },
        type: QueryTypes.SELECT
      }
    );
    await sequelize.query(
      `UPDATE projects SET plan_status = 'pending_signoff', updated_at = NOW()
       WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: req.params.id } }
    );

    return res.status(201).json({
      success: true,
      data: {
        meeting, ics: icsBody, attendee_count: allAttendees.length,
        attendees: allAttendees.map(a => ({ email: a.email, name: `${a.first_name} ${a.last_name}` }))
      }
    });
  } catch (err) {
    console.error('[unified book-meeting]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// GET /:id/meetings
// =====================================================================
router.get('/:id/meetings', authMiddleware, async (req, res) => {
  try {
    const meetings = await sequelize.query(
      `SELECT * FROM project_meetings
       WHERE chamber_id = :c AND project_id = :p ORDER BY scheduled_at DESC`,
      { replacements: { c: req.chamber_id, p: req.params.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: meetings });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// GET /:id/meetings/:mid/ics (no auth -- people add to calendar from email link)
// =====================================================================
router.get('/:id/meetings/:mid/ics', async (req, res) => {
  try {
    const [meeting] = await sequelize.query(
      `SELECT m.*, p.title, p.plan_json
       FROM project_meetings m JOIN projects p ON p.id = m.project_id
       WHERE m.chamber_id = :c AND m.id = :mid AND m.project_id = :p`,
      { replacements: { c: req.chamber_id, mid: req.params.mid, p: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!meeting) return res.status(404).send('Meeting not found');

    const attendees = await sequelize.query(
      `SELECT id, first_name, last_name, email FROM members
       WHERE chamber_id = :c AND id = ANY(:ids::int[])`,
      {
        replacements: { c: req.chamber_id, ids: '{' + (meeting.attendees || []).join(',') + '}' },
        type: QueryTypes.SELECT
      }
    );

    const planTitle = (meeting.plan_json && meeting.plan_json.title) || meeting.title;
    const ics = ical.buildICal({
      uid: meeting.ical_event_uid,
      startsAt: new Date(meeting.scheduled_at),
      durationMinutes: meeting.duration_minutes,
      summary: `Final Review -- ${planTitle}`,
      description: `Final review and digital sign-off of the business plan.\n\nVideo link: ${meeting.video_link}`,
      location: meeting.video_link,
      organizerEmail: 'noreply@camaravirtual.app',
      organizerName: 'CamaraVirtual.app',
      attendees: attendees.map(a => ({ email: a.email, name: `${a.first_name} ${a.last_name}` }))
    });
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="final-review-${req.params.id}.ics"`);
    return res.send(ics);
  } catch (err) {
    return res.status(500).send(err.message);
  }
});

// =====================================================================
// POST /:id/signoff
// =====================================================================
router.post('/:id/signoff', authMiddleware, async (req, res) => {
  try {
    const { typed_name, agreed } = req.body;
    if (!agreed) return res.status(400).json({ success: false, error: 'Must agree to plan' });
    if (!typed_name || typed_name.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'Type your full name to sign' });
    }
    const [proj] = await sequelize.query(
      `SELECT * FROM projects WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!proj) return res.status(404).json({ success: false, error: 'Project not found' });
    if (!['pending_signoff', 'fully_staffed'].includes(proj.plan_status)) {
      return res.status(400).json({ success: false, error: `Cannot sign off in status: ${proj.plan_status}` });
    }

    const isProposer = proj.proposer_member_id === req.member.id;
    let isParticipant = isProposer;
    if (!isParticipant) {
      const [pm] = await sequelize.query(
        `SELECT 1 FROM project_members WHERE chamber_id = :c AND project_id = :p AND member_id = :m`,
        { replacements: { c: req.chamber_id, p: req.params.id, m: req.member.id }, type: QueryTypes.SELECT }
      );
      isParticipant = !!pm;
    }
    if (!isParticipant) return res.status(403).json({ success: false, error: 'Not a project participant' });

    const planVersionHash = crypto.createHash('sha256')
      .update(JSON.stringify(proj.plan_json || {})).digest('hex');

    const [existing] = await sequelize.query(
      `SELECT id FROM project_signoffs
       WHERE chamber_id = :c AND project_id = :p AND member_id = :m`,
      { replacements: { c: req.chamber_id, p: req.params.id, m: req.member.id }, type: QueryTypes.SELECT }
    );
    if (existing) return res.status(409).json({ success: false, error: 'Already signed' });

    await sequelize.query(
      `INSERT INTO project_signoffs
       (chamber_id, project_id, member_id, signed_at, plan_version_hash, signature_method, signature_payload, ip_address, user_agent)
       VALUES (:c, :p, :m, NOW(), :h, 'typed_name', :sig, :ip, :ua)`,
      {
        replacements: {
          c: req.chamber_id, p: req.params.id, m: req.member.id, h: planVersionHash,
          sig: typed_name.trim(),
          ip: req.ip || (req.connection && req.connection.remoteAddress) || null,
          ua: (req.headers['user-agent'] || '').substring(0, 500)
        }
      }
    );

    const [{ count: participantCount }] = await sequelize.query(
      `SELECT COUNT(*) AS count FROM (
         SELECT proposer_member_id AS member_id FROM projects WHERE chamber_id = :c AND id = :p
         UNION
         SELECT member_id FROM project_members WHERE chamber_id = :c AND project_id = :p
       ) sub`,
      { replacements: { c: req.chamber_id, p: req.params.id }, type: QueryTypes.SELECT }
    );
    const [{ count: signedCount }] = await sequelize.query(
      `SELECT COUNT(*) AS count FROM project_signoffs WHERE chamber_id = :c AND project_id = :p`,
      { replacements: { c: req.chamber_id, p: req.params.id }, type: QueryTypes.SELECT }
    );

    const allSigned = parseInt(signedCount) >= parseInt(participantCount);
    let newStatus = 'pending_signoff';
    let workspaceInit = null;
    if (allSigned) {
      newStatus = 'signed_off';
      await sequelize.query(
        `UPDATE projects SET plan_status = 'signed_off', visibility = 'participants_only', updated_at = NOW()
         WHERE chamber_id = :c AND id = :id`,
        { replacements: { c: req.chamber_id, id: req.params.id } }
      );
      try {
        workspaceInit = await autoInitWorkspaceFromPlan(sequelize, req.chamber_id, req.params.id, req.member.id);
        if (!workspaceInit.skipped) newStatus = 'executing';
      } catch (e) {
        console.error('[unified auto-init workspace]', e.message);
      }
    }
    return res.json({
      success: true,
      data: {
        signed: true, all_signed: allSigned,
        signed_count: parseInt(signedCount), total_participants: parseInt(participantCount),
        new_status: newStatus, workspace_init: workspaceInit
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// GET /:id/signoff-status
// =====================================================================
router.get('/:id/signoff-status', authMiddleware, async (req, res) => {
  try {
    const [proj] = await sequelize.query(
      `SELECT id, proposer_member_id, plan_status FROM projects WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!proj) return res.status(404).json({ success: false, error: 'Project not found' });

    const participants = await sequelize.query(
      `SELECT DISTINCT m.id, m.first_name, m.last_name, m.email
       FROM members m
       WHERE m.chamber_id = :c
         AND (m.id = :proposer
              OR m.id IN (SELECT member_id FROM project_members WHERE chamber_id = :c AND project_id = :p))`,
      { replacements: { c: req.chamber_id, proposer: proj.proposer_member_id, p: req.params.id }, type: QueryTypes.SELECT }
    );
    const signoffs = await sequelize.query(
      `SELECT member_id, signed_at, signature_payload FROM project_signoffs
       WHERE chamber_id = :c AND project_id = :p`,
      { replacements: { c: req.chamber_id, p: req.params.id }, type: QueryTypes.SELECT }
    );
    const signedSet = new Set(signoffs.map(s => s.member_id));
    const result = participants.map(p => ({
      member_id: p.id, name: `${p.first_name} ${p.last_name}`, email: p.email,
      signed: signedSet.has(p.id),
      signed_at: signoffs.find(s => s.member_id === p.id)?.signed_at || null
    }));
    return res.json({
      success: true,
      data: {
        plan_status: proj.plan_status,
        total_participants: participants.length,
        signed_count: signoffs.length,
        all_signed: signoffs.length >= participants.length,
        participants: result
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// POST /:id/amend-plan
// =====================================================================
router.post('/:id/amend-plan', authMiddleware, async (req, res) => {
  try {
    const { plan_json, reason } = req.body;
    if (!plan_json) return res.status(400).json({ success: false, error: 'plan_json required' });
    const validation = planGenerator.validatePlan(plan_json);
    if (!validation.ok) return res.status(400).json({ success: false, error: validation.error });

    const [project] = await sequelize.query(
      `SELECT * FROM projects WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const sa = await isSuperadmin(req.member.id, req.chamber_id);
    if (project.proposer_member_id !== req.member.id && !sa) {
      return res.status(403).json({ success: false, error: 'Only proposer or superadmin can amend' });
    }
    if (!['fully_staffed', 'pending_signoff'].includes(project.plan_status)) {
      return res.status(400).json({ success: false, error: `Cannot amend in status: ${project.plan_status}` });
    }

    const oldHash = crypto.createHash('sha256').update(JSON.stringify(project.plan_json || {})).digest('hex');
    await sequelize.query(
      `INSERT INTO project_plan_versions
       (chamber_id, project_id, plan_json, plan_version_hash, created_by_member_id, amendment_reason, created_at)
       VALUES (:c, :p, :pj, :h, :m, :r, NOW())`,
      {
        replacements: {
          c: req.chamber_id, p: req.params.id,
          pj: JSON.stringify(project.plan_json || {}), h: oldHash, m: req.member.id,
          r: reason || 'Amendment'
        }
      }
    );
    await sequelize.query(
      `UPDATE projects SET plan_json = :pj, plan_status = 'pending_signoff', updated_at = NOW()
       WHERE chamber_id = :c AND id = :id`,
      { replacements: { c: req.chamber_id, id: req.params.id, pj: JSON.stringify(plan_json) } }
    );
    const [{ count: signaturesInvalidated }] = await sequelize.query(
      `WITH d AS (DELETE FROM project_signoffs WHERE chamber_id = :c AND project_id = :p RETURNING id)
       SELECT COUNT(*) AS count FROM d`,
      { replacements: { c: req.chamber_id, p: req.params.id }, type: QueryTypes.SELECT }
    );
    try {
      await sequelize.query(
        `INSERT INTO project_messages (chamber_id, project_id, member_id, body, created_at)
         VALUES (:c, :p, :m, :b, NOW())`,
        {
          replacements: {
            c: req.chamber_id, p: req.params.id, m: req.member.id,
            b: '[SYSTEM] Plan amended. All previous signatures invalidated. All participants must re-sign.\n\nReason: ' + (reason || '(no reason provided)')
          }
        }
      );
    } catch (e) { /* table may not exist yet */ }

    return res.json({
      success: true,
      data: {
        message: 'Plan amended. All signatures invalidated.',
        signatures_invalidated: parseInt(signaturesInvalidated),
        new_status: 'pending_signoff', re_sign_required: true
      }
    });
  } catch (err) {
    console.error('[unified amend-plan]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================================
// GET /:id/plan-versions
// =====================================================================
router.get('/:id/plan-versions', authMiddleware, async (req, res) => {
  try {
    const versions = await sequelize.query(
      `SELECT v.id, v.plan_version_hash, v.created_at, v.amendment_reason,
              m.first_name || ' ' || m.last_name AS created_by_name
       FROM project_plan_versions v LEFT JOIN members m ON m.id = v.created_by_member_id
       WHERE v.chamber_id = :c AND v.project_id = :p
       ORDER BY v.created_at DESC`,
      { replacements: { c: req.chamber_id, p: req.params.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: versions });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id/plan-versions/:vid', authMiddleware, async (req, res) => {
  try {
    const [v] = await sequelize.query(
      `SELECT v.*, m.first_name || ' ' || m.last_name AS created_by_name
       FROM project_plan_versions v LEFT JOIN members m ON m.id = v.created_by_member_id
       WHERE v.chamber_id = :c AND v.project_id = :p AND v.id = :vid`,
      { replacements: { c: req.chamber_id, p: req.params.id, vid: req.params.vid }, type: QueryTypes.SELECT }
    );
    if (!v) return res.status(404).json({ success: false, error: 'Version not found' });
    return res.json({ success: true, data: v });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
