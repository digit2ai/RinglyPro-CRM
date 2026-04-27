// Chamber Template - Projects Routes Factory
const planGenerator = require('../lib/plan-generator');
const ical = require('../lib/ical');
const crypto = require('crypto');
const { runCascade, maybeAutoClose } = require('../lib/p2b-cascade');
const { autoInitWorkspaceFromPlan } = require('../lib/workspace-init');

module.exports = function createProjectRoutes(config) {
  const express = require('express');
  const router = express.Router();
  const { Sequelize, QueryTypes } = require('sequelize');
  const jwt = require('jsonwebtoken');
  require('dotenv').config();

  const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
    dialect: 'postgres', dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }, logging: false
  });

  const t = config.db_prefix;
  const JWT_SECRET = config.jwt_secret || `${t}-jwt-secret`;
  function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Token required' });
    try { req.member = jwt.verify(token, JWT_SECRET); req.member.id = req.member.member_id; next(); } catch (e) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }
  }

  const LIFECYCLE_PHASES = ['proposal', 'analysis', 'team', 'resources', 'execution', 'completed'];

  // GET /
  router.get('/', authMiddleware, async (req, res) => {
    try {
      const { status, sector, country, plan_status, page = 1, limit = 20 } = req.query;
      const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
      const conditions = []; const replacements = { current_member_id: req.member.id };
      if (status) { conditions.push('p.status = :status'); replacements.status = status; }
      if (sector) { conditions.push('p.sector = :sector'); replacements.sector = sector; }
      if (country) { conditions.push(':country = ANY(p.countries)'); replacements.country = country; }
      if (plan_status) { conditions.push('p.plan_status = :plan_status'); replacements.plan_status = plan_status; }

      // Look up viewer's access level
      const [viewer] = await sequelize.query(
        `SELECT access_level FROM ${t}_members WHERE id = :id`,
        { replacements: { id: req.member.id }, type: QueryTypes.SELECT }
      );
      const isSuperadmin = viewer && viewer.access_level === 'superadmin';

      // Visibility filter:
      //   - drafts visible only to proposer
      //   - public_plan visible to all
      //   - participants_only visible to participants + superadmin (others get stub)
      // We hide drafts in the list view unless they are mine.
      conditions.push(`(
        p.visibility != 'archived'
        AND (
          p.plan_status NOT IN ('draft')
          OR p.proposer_member_id = :current_member_id
        )
      )`);

      const where = 'WHERE ' + conditions.join(' AND ');
      const countResult = await sequelize.query(`SELECT COUNT(*) as total FROM ${t}_projects p ${where}`, { replacements, type: QueryTypes.SELECT });
      const total = parseInt(countResult[0].total);
      const projects = await sequelize.query(
        `SELECT p.id, p.title, p.description, p.sector, p.countries, p.pilot_type,
                p.budget_min, p.budget_est, p.budget_max,
                p.timeline_min_months, p.timeline_est_months, p.timeline_max_months,
                p.status, p.plan_status, p.visibility, p.proposer_member_id,
                p.created_at, p.updated_at,
                CASE
                  WHEN p.visibility = 'participants_only' AND p.proposer_member_id != :current_member_id
                       AND NOT EXISTS (SELECT 1 FROM ${t}_project_members pm
                                       WHERE pm.project_id = p.id AND pm.member_id = :current_member_id)
                  THEN NULL
                  ELSE p.plan_json
                END AS plan_json,
                m.first_name || ' ' || m.last_name AS proposer_name
         FROM ${t}_projects p LEFT JOIN ${t}_members m ON m.id = p.proposer_member_id ${where}
         ORDER BY p.created_at DESC LIMIT :limit OFFSET :offset`,
        { replacements: { ...replacements, limit: parseInt(limit), offset }, type: QueryTypes.SELECT }
      );

      // Mark stubs (private projects the viewer is not part of) as is_stub
      const enriched = projects.map(p => {
        const isStub = (p.visibility === 'participants_only' && p.plan_json === null && !isSuperadmin);
        return { ...p, is_stub: isStub };
      });

      return res.json({ success: true, data: { projects: enriched, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } } });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /
  router.post('/', authMiddleware, async (req, res) => {
    try {
      const { title, description, sector, countries, pilot_type, budget_min, budget_est, budget_max, timeline_min_months, timeline_est_months, timeline_max_months } = req.body;
      if (!title || !description || !sector) return res.status(400).json({ success: false, error: 'title, description and sector are required' });
      const countriesArray = Array.isArray(countries) ? countries : [];
      const countriesSql = countriesArray.length > 0 ? `ARRAY[${countriesArray.map((_, i) => `:c${i}`).join(',')}]::TEXT[]` : "ARRAY[]::TEXT[]";
      const countryReplacements = {}; countriesArray.forEach((c, i) => { countryReplacements[`c${i}`] = c; });
      const result = await sequelize.query(
        `INSERT INTO ${t}_projects (title, description, sector, countries, pilot_type, budget_min, budget_est, budget_max, timeline_min_months, timeline_est_months, timeline_max_months, status, proposer_member_id, created_at, updated_at)
         VALUES (:title, :description, :sector, ${countriesSql}, :pilot_type, :budget_min, :budget_est, :budget_max, :timeline_min_months, :timeline_est_months, :timeline_max_months, 'proposal', :proposer_member_id, NOW(), NOW()) RETURNING *`,
        { replacements: { title, description, sector, pilot_type: pilot_type || null, budget_min: budget_min || null, budget_est: budget_est || null, budget_max: budget_max || null, timeline_min_months: timeline_min_months || null, timeline_est_months: timeline_est_months || null, timeline_max_months: timeline_max_months || null, proposer_member_id: req.member.id, ...countryReplacements }, type: QueryTypes.SELECT }
      );
      return res.status(201).json({ success: true, data: result[0] });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /:id
  router.get('/:id', authMiddleware, async (req, res) => {
    try {
      let projects = await sequelize.query(
        `SELECT p.*, m.first_name || ' ' || m.last_name AS proposer_name
         FROM ${t}_projects p LEFT JOIN ${t}_members m ON m.id = p.proposer_member_id
         WHERE p.id = :id`,
        { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
      );
      if (projects.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });

      // Lazy auto-close if recruitment deadline expired
      await maybeAutoClose(sequelize, t, projects[0]);
      // Re-read in case state changed
      projects = await sequelize.query(
        `SELECT p.*, m.first_name || ' ' || m.last_name AS proposer_name
         FROM ${t}_projects p LEFT JOIN ${t}_members m ON m.id = p.proposer_member_id
         WHERE p.id = :id`,
        { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
      );
      const project = projects[0];

      // Visibility check for participants_only projects
      const [viewer] = await sequelize.query(
        `SELECT access_level FROM ${t}_members WHERE id = :id`,
        { replacements: { id: req.member.id }, type: QueryTypes.SELECT }
      );
      const isSuperadmin = viewer && viewer.access_level === 'superadmin';
      const isProposer = project.proposer_member_id === req.member.id;
      let isParticipant = false;
      if (project.visibility === 'participants_only') {
        const [pmRow] = await sequelize.query(
          `SELECT 1 FROM ${t}_project_members WHERE project_id = :p AND member_id = :m`,
          { replacements: { p: req.params.id, m: req.member.id }, type: QueryTypes.SELECT }
        );
        isParticipant = !!pmRow;
        if (!isParticipant && !isSuperadmin && !isProposer) {
          // Return stub only
          return res.json({
            success: true,
            data: {
              id: project.id,
              title: project.title,
              status: project.status,
              plan_status: project.plan_status,
              visibility: project.visibility,
              is_stub: true,
              participant_count: 0
            }
          });
        }
      }

      // Drafts visible only to proposer
      if (project.plan_status === 'draft' && !isProposer && !isSuperadmin) {
        return res.status(403).json({ success: false, error: 'Draft is private to proposer' });
      }

      const members = await sequelize.query(
        `SELECT pm.*, m.first_name, m.last_name, m.email, m.country, m.sector, m.trust_score
         FROM ${t}_project_members pm JOIN ${t}_members m ON m.id = pm.member_id
         WHERE pm.project_id = :id ORDER BY pm.joined_at ASC`,
        { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
      );

      // Build fill_status per role from plan_json.team_roles_required
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
          viewer_role: { is_superadmin: isSuperadmin, is_proposer: isProposer, is_participant: isParticipant }
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // PUT /:id
  router.put('/:id', authMiddleware, async (req, res) => {
    try {
      const projects = await sequelize.query(`SELECT * FROM ${t}_projects WHERE id = :id`, { replacements: { id: req.params.id }, type: QueryTypes.SELECT });
      if (projects.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });
      if (projects[0].proposer_member_id !== req.member.id) return res.status(403).json({ success: false, error: 'Only the proposer can edit' });
      const { title, description, sector, pilot_type, budget_min, budget_est, budget_max, timeline_min_months, timeline_est_months, timeline_max_months } = req.body;
      const sets = []; const replacements = { id: req.params.id };
      if (title !== undefined) { sets.push('title = :title'); replacements.title = title; }
      if (description !== undefined) { sets.push('description = :description'); replacements.description = description; }
      if (sector !== undefined) { sets.push('sector = :sector'); replacements.sector = sector; }
      if (pilot_type !== undefined) { sets.push('pilot_type = :pilot_type'); replacements.pilot_type = pilot_type; }
      if (budget_min !== undefined) { sets.push('budget_min = :budget_min'); replacements.budget_min = budget_min; }
      if (budget_est !== undefined) { sets.push('budget_est = :budget_est'); replacements.budget_est = budget_est; }
      if (budget_max !== undefined) { sets.push('budget_max = :budget_max'); replacements.budget_max = budget_max; }
      if (timeline_min_months !== undefined) { sets.push('timeline_min_months = :timeline_min_months'); replacements.timeline_min_months = timeline_min_months; }
      if (timeline_est_months !== undefined) { sets.push('timeline_est_months = :timeline_est_months'); replacements.timeline_est_months = timeline_est_months; }
      if (timeline_max_months !== undefined) { sets.push('timeline_max_months = :timeline_max_months'); replacements.timeline_max_months = timeline_max_months; }
      if (sets.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
      sets.push('updated_at = NOW()');
      const result = await sequelize.query(`UPDATE ${t}_projects SET ${sets.join(', ')} WHERE id = :id RETURNING *`, { replacements, type: QueryTypes.SELECT });
      return res.json({ success: true, data: result[0] });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /:id/advance
  router.post('/:id/advance', authMiddleware, async (req, res) => {
    try {
      const projects = await sequelize.query(`SELECT * FROM ${t}_projects WHERE id = :id`, { replacements: { id: req.params.id }, type: QueryTypes.SELECT });
      if (projects.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });
      const currentIndex = LIFECYCLE_PHASES.indexOf(projects[0].status);
      if (currentIndex === -1 || currentIndex === LIFECYCLE_PHASES.length - 1) return res.status(400).json({ success: false, error: 'Cannot advance' });
      const nextPhase = LIFECYCLE_PHASES[currentIndex + 1];
      const result = await sequelize.query(`UPDATE ${t}_projects SET status = :nextPhase, updated_at = NOW() WHERE id = :id RETURNING *`, { replacements: { nextPhase, id: req.params.id }, type: QueryTypes.SELECT });
      return res.json({ success: true, data: result[0], transition: { from: projects[0].status, to: nextPhase } });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /:id/join
  router.post('/:id/join', authMiddleware, async (req, res) => {
    try {
      const projects = await sequelize.query(`SELECT id FROM ${t}_projects WHERE id = :id`, { replacements: { id: req.params.id }, type: QueryTypes.SELECT });
      if (projects.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });
      const existing = await sequelize.query(`SELECT id FROM ${t}_project_members WHERE project_id = :project_id AND member_id = :member_id`, { replacements: { project_id: req.params.id, member_id: req.member.id }, type: QueryTypes.SELECT });
      if (existing.length > 0) return res.status(409).json({ success: false, error: 'Already a project member' });
      const result = await sequelize.query(`INSERT INTO ${t}_project_members (project_id, member_id, role, joined_at) VALUES (:project_id, :member_id, :role, NOW()) RETURNING *`, { replacements: { project_id: req.params.id, member_id: req.member.id, role: req.body.role || 'collaborator' }, type: QueryTypes.SELECT });
      return res.status(201).json({ success: true, data: result[0] });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /:id/evaluate -- now reads cached monte_carlo_result if present, else computes
  router.post('/:id/evaluate', authMiddleware, async (req, res) => {
    try {
      const [project] = await sequelize.query(`SELECT * FROM ${t}_projects WHERE id = :id`, { replacements: { id: req.params.id }, type: QueryTypes.SELECT });
      if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

      // Return cached result if available
      if (project.monte_carlo_result) {
        return res.json({ success: true, data: project.monte_carlo_result, cached: true });
      }

      // Otherwise force-run cascade evaluation in-line (won't transition status)
      const { monteCarloProject } = require('../chamber-math');
      const teamMembers = await sequelize.query(
        `SELECT pm.member_id, m.trust_score FROM ${t}_project_members pm
         JOIN ${t}_members m ON m.id = pm.member_id WHERE pm.project_id = :p`,
        { replacements: { p: req.params.id }, type: QueryTypes.SELECT }
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

      const result = {
        ...mc,
        success_probability: mc.viabilityScore,
        risk_score: mc.semaphore.toLowerCase(),
        iterations: 10000,
        budget: { p10: Math.round(mc.percentiles.p10), p50: Math.round(mc.percentiles.p50), p90: Math.round(mc.percentiles.p90), mean: Math.round(mc.percentiles.p50) },
        timeline_months: { p10: timeMin, p50: timeEst, p90: timeMax },
        team_size: teamSize,
        avg_trust: avgTrust,
        cached: false
      };

      return res.json({ success: true, data: result });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // ========================================================
  // P2B STAGE 0 -- AI-Generated Business Plan
  // ========================================================

  // POST /draft -- generate plan with Claude, save as draft
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
        vision: vision.trim(),
        sector,
        countries,
        budget_tier
      });

      const countriesArray = Array.isArray(countries) ? countries : [];
      const countriesSql = countriesArray.length > 0
        ? `ARRAY[${countriesArray.map((_, i) => `:c${i}`).join(',')}]::TEXT[]`
        : "ARRAY[]::TEXT[]";
      const countryReplacements = {};
      countriesArray.forEach((c, i) => { countryReplacements[`c${i}`] = c; });

      const result = await sequelize.query(
        `INSERT INTO ${t}_projects
         (title, description, sector, countries, plan_json, plan_status, visibility,
          status, proposer_member_id, created_at, updated_at)
         VALUES (:title, :description, :sector, ${countriesSql}, :plan_json, 'draft', 'public_plan',
                 'proposal', :proposer_id, NOW(), NOW())
         RETURNING *`,
        {
          replacements: {
            title: plan.title || 'Untitled P2B Project',
            description: plan.executive_summary || '',
            sector: sector || null,
            plan_json: JSON.stringify(plan),
            proposer_id: req.member.id,
            ...countryReplacements
          },
          type: QueryTypes.SELECT
        }
      );

      return res.status(201).json({
        success: true,
        data: { project_id: result[0].id, plan_json: plan, usage }
      });
    } catch (err) {
      console.error('[plan-draft] error:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // PUT /:id/plan -- update plan_json (proposer only)
  router.put('/:id/plan', authMiddleware, async (req, res) => {
    try {
      const projects = await sequelize.query(
        `SELECT id, proposer_member_id, plan_status FROM ${t}_projects WHERE id = :id`,
        { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
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
        `UPDATE ${t}_projects SET plan_json = :plan, updated_at = NOW() WHERE id = :id RETURNING *`,
        { replacements: { plan: JSON.stringify(plan_json), id: req.params.id }, type: QueryTypes.SELECT }
      );
      return res.json({ success: true, data: result[0] });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /:id/publish -- draft -> recruiting + 30-day deadline + auto-invite AI matches
  router.post('/:id/publish', authMiddleware, async (req, res) => {
    try {
      const projects = await sequelize.query(
        `SELECT * FROM ${t}_projects WHERE id = :id`,
        { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
      );
      if (projects.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });
      const project = projects[0];
      if (project.proposer_member_id !== req.member.id) {
        return res.status(403).json({ success: false, error: 'Only the proposer can publish' });
      }
      if (project.plan_status !== 'draft') {
        return res.status(400).json({ success: false, error: `Already ${project.plan_status}` });
      }
      const validation = planGenerator.validatePlan(project.plan_json);
      if (!validation.ok) return res.status(400).json({ success: false, error: validation.error });

      // Set 30-day deadline and transition straight to 'recruiting'
      const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const [updated] = await sequelize.query(
        `UPDATE ${t}_projects
         SET plan_status = 'recruiting',
             visibility = 'public_plan',
             recruitment_deadline = :dl,
             updated_at = NOW()
         WHERE id = :id RETURNING *`,
        { replacements: { id: req.params.id, dl: deadline }, type: QueryTypes.SELECT }
      );

      // Auto-invite AI matches (in-process, best-effort)
      let invitationsCreated = 0;
      try {
        const plan = project.plan_json;
        if (Array.isArray(plan.team_roles_required)) {
          const members = await sequelize.query(
            `SELECT id, first_name, last_name, email, country, region_id, sector,
                    sub_specialty, bio, company_name, trust_score
             FROM ${t}_members
             WHERE id != :proposer AND status = 'active'`,
            { replacements: { proposer: project.proposer_member_id }, type: QueryTypes.SELECT }
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
                `SELECT id FROM ${t}_project_invitations
                 WHERE project_id = :p AND member_id = :m AND role_index = :i`,
                { replacements: { p: req.params.id, m: r.member.id, i }, type: QueryTypes.SELECT }
              );
              if (existing) continue;
              await sequelize.query(
                `INSERT INTO ${t}_project_invitations
                 (project_id, member_id, role_index, role_title, status, match_score, invited_by_member_id, invited_at)
                 VALUES (:p, :m, :i, :rt, 'pending', :s, :inv, NOW())`,
                { replacements: { p: req.params.id, m: r.member.id, i, rt: role.role_title || `Role ${i+1}`, s: r.score.toFixed(3), inv: req.member.id } }
              );
              invitationsCreated++;
            }
          }
        }
      } catch (invErr) {
        console.error('[publish auto-invite]', invErr.message);
      }

      return res.json({ success: true, data: { ...updated, invitations_created: invitationsCreated } });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /:id/close-recruitment -- proposer hits "Close Bidding Now"
  router.post('/:id/close-recruitment', authMiddleware, async (req, res) => {
    try {
      const [project] = await sequelize.query(
        `SELECT id, proposer_member_id, plan_status, recruitment_closed_at FROM ${t}_projects WHERE id = :id`,
        { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
      );
      if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

      const [viewer] = await sequelize.query(
        `SELECT access_level FROM ${t}_members WHERE id = :m`,
        { replacements: { m: req.member.id }, type: QueryTypes.SELECT }
      );
      const isSuperadmin = viewer && viewer.access_level === 'superadmin';
      if (project.proposer_member_id !== req.member.id && !isSuperadmin) {
        return res.status(403).json({ success: false, error: 'Only proposer or superadmin can close recruitment' });
      }
      if (project.plan_status !== 'recruiting') {
        return res.status(400).json({ success: false, error: `Cannot close from status: ${project.plan_status}` });
      }
      if (project.recruitment_closed_at) {
        return res.status(400).json({ success: false, error: 'Recruitment already closed' });
      }

      await sequelize.query(
        `UPDATE ${t}_projects
         SET recruitment_closed_at = NOW(), recruitment_closed_by = 'manual', updated_at = NOW()
         WHERE id = :id`,
        { replacements: { id: req.params.id } }
      );

      const cascadeResult = await runCascade(sequelize, t, req.params.id);
      return res.json({ success: true, data: cascadeResult });
    } catch (err) {
      console.error('[close-recruitment]', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // ========================================================
  // P2B STAGE 1 -- Recruitment via published plan
  // ========================================================

  // Simple text-based scoring against a role spec
  function scoreMember(member, role) {
    let score = 0;
    let denom = 0;

    // Sector match (0-1)
    if (role.preferred_sectors && role.preferred_sectors.length > 0) {
      const sectorList = role.preferred_sectors.map(s => String(s).toLowerCase().trim());
      const ms = String(member.sector || '').toLowerCase();
      score += sectorList.some(s => ms.includes(s) || s.includes(ms)) ? 0.4 : 0;
      denom += 0.4;
    }

    // Region match by country / region_id (0-1)
    if (role.preferred_regions && role.preferred_regions.length > 0) {
      const regionList = role.preferred_regions.map(r => String(r).toLowerCase().trim());
      const mc = String(member.country || '').toLowerCase();
      const regionId = member.region_id;
      const match = regionList.some(r => mc.includes(r) || r.includes(mc) || `region${regionId}` === r);
      score += match ? 0.3 : 0;
      denom += 0.3;
    }

    // Skills overlap with required_skills against bio + sub_specialty (0-1)
    if (role.required_skills && role.required_skills.length > 0) {
      const haystack = (
        (member.bio || '') + ' ' +
        (member.sub_specialty || '') + ' ' +
        (member.company_name || '')
      ).toLowerCase();
      const hits = role.required_skills.filter(s =>
        haystack.includes(String(s).toLowerCase().substring(0, 8))
      ).length;
      const ratio = hits / role.required_skills.length;
      score += ratio * 0.2;
      denom += 0.2;
    }

    // Trust score baseline (0-1)
    score += parseFloat(member.trust_score || 0.7) * 0.1;
    denom += 0.1;

    return denom > 0 ? Math.min(1, score / denom) : 0;
  }

  // POST /:id/invite-matches -- AI-cosine match for each role + create invitations
  router.post('/:id/invite-matches', authMiddleware, async (req, res) => {
    try {
      const projects = await sequelize.query(
        `SELECT id, proposer_member_id, plan_json, plan_status FROM ${t}_projects WHERE id = :id`,
        { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
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

      // Fetch all potential members (excluding proposer + already-invited)
      const members = await sequelize.query(
        `SELECT id, first_name, last_name, email, country, region_id, sector,
                sub_specialty, bio, company_name, trust_score
         FROM ${t}_members
         WHERE id != :proposer AND status = 'active'`,
        { replacements: { proposer: project.proposer_member_id }, type: QueryTypes.SELECT }
      );

      const N = parseInt(req.body.top_n || 3);
      const byRole = [];
      let invitationsCreated = 0;

      for (let i = 0; i < plan.team_roles_required.length; i++) {
        const role = plan.team_roles_required[i];
        const ranked = members
          .map(m => ({ member: m, score: scoreMember(m, role) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, N);

        const invited = [];
        for (const r of ranked) {
          // Skip if already exists
          const [existing] = await sequelize.query(
            `SELECT id, status FROM ${t}_project_invitations
             WHERE project_id = :p AND member_id = :m AND role_index = :i`,
            { replacements: { p: req.params.id, m: r.member.id, i }, type: QueryTypes.SELECT }
          );
          if (existing) {
            invited.push({ member_id: r.member.id, name: `${r.member.first_name} ${r.member.last_name}`, score: r.score, status: existing.status, existing: true });
            continue;
          }

          await sequelize.query(
            `INSERT INTO ${t}_project_invitations
             (project_id, member_id, role_index, role_title, status, match_score, invited_by_member_id, invited_at)
             VALUES (:p, :m, :i, :rt, 'pending', :s, :inv, NOW())`,
            {
              replacements: {
                p: req.params.id,
                m: r.member.id,
                i,
                rt: role.role_title || `Role ${i+1}`,
                s: r.score.toFixed(3),
                inv: req.member.id
              }
            }
          );
          invitationsCreated++;
          invited.push({ member_id: r.member.id, name: `${r.member.first_name} ${r.member.last_name}`, score: r.score, status: 'pending' });
        }

        byRole.push({
          role_index: i,
          role_title: role.role_title,
          must_have: !!role.must_have,
          invitees: invited
        });
      }

      // Move plan_status to 'recruiting' if it was 'published'
      if (project.plan_status === 'published') {
        await sequelize.query(
          `UPDATE ${t}_projects SET plan_status = 'recruiting', updated_at = NOW() WHERE id = :id`,
          { replacements: { id: req.params.id } }
        );
      }

      return res.json({ success: true, data: { invitations_created: invitationsCreated, by_role: byRole } });
    } catch (err) {
      console.error('[invite-matches]', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /invitations -- list invitations for the current member
  router.get('/invitations/inbox', authMiddleware, async (req, res) => {
    try {
      const inv = await sequelize.query(
        `SELECT i.*, p.title AS project_title, p.plan_status,
                m.first_name || ' ' || m.last_name AS invited_by_name
         FROM ${t}_project_invitations i
         JOIN ${t}_projects p ON p.id = i.project_id
         LEFT JOIN ${t}_members m ON m.id = i.invited_by_member_id
         WHERE i.member_id = :me
         ORDER BY i.invited_at DESC`,
        { replacements: { me: req.member.id }, type: QueryTypes.SELECT }
      );
      return res.json({ success: true, data: inv });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /:id/invitations/:inv_id/respond -- accept or decline
  router.post('/:id/invitations/:inv_id/respond', authMiddleware, async (req, res) => {
    try {
      const { action, message } = req.body;
      if (!['accept', 'decline'].includes(action)) {
        return res.status(400).json({ success: false, error: 'action must be accept or decline' });
      }

      const [inv] = await sequelize.query(
        `SELECT * FROM ${t}_project_invitations WHERE id = :inv AND project_id = :p`,
        { replacements: { inv: req.params.inv_id, p: req.params.id }, type: QueryTypes.SELECT }
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
        `UPDATE ${t}_project_invitations
         SET status = :s, responded_at = NOW(), message = :msg
         WHERE id = :id`,
        { replacements: { s: newStatus, msg: message || null, id: req.params.inv_id } }
      );

      if (action === 'accept') {
        // Add to project_members
        const [exists] = await sequelize.query(
          `SELECT id FROM ${t}_project_members WHERE project_id = :p AND member_id = :m`,
          { replacements: { p: req.params.id, m: req.member.id }, type: QueryTypes.SELECT }
        );
        if (!exists) {
          await sequelize.query(
            `INSERT INTO ${t}_project_members
             (project_id, member_id, role, role_title, role_index, invitation_id, joined_at)
             VALUES (:p, :m, 'collaborator', :rt, :ri, :inv, NOW())`,
            {
              replacements: {
                p: req.params.id, m: req.member.id,
                rt: inv.role_title, ri: inv.role_index, inv: inv.id
              }
            }
          );
        }

        // Check fully_staffed: all must_have roles covered?
        const [proj] = await sequelize.query(
          `SELECT plan_json FROM ${t}_projects WHERE id = :id`,
          { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
        );
        const plan = proj && proj.plan_json;
        if (plan && Array.isArray(plan.team_roles_required)) {
          const filled = await sequelize.query(
            `SELECT role_index, COUNT(*) AS n FROM ${t}_project_members
             WHERE project_id = :p AND role_index IS NOT NULL GROUP BY role_index`,
            { replacements: { p: req.params.id }, type: QueryTypes.SELECT }
          );
          const filledMap = {};
          filled.forEach(r => { filledMap[r.role_index] = parseInt(r.n); });
          const allMustHaveFilled = plan.team_roles_required.every((r, i) =>
            !r.must_have || (filledMap[i] && filledMap[i] >= 1)
          );
          if (allMustHaveFilled) {
            await sequelize.query(
              `UPDATE ${t}_projects SET plan_status = 'fully_staffed', updated_at = NOW()
               WHERE id = :id AND plan_status IN ('published','recruiting')`,
              { replacements: { id: req.params.id } }
            );
          }
        }
      }

      return res.json({ success: true, data: { invitation_id: inv.id, status: newStatus } });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /:id/request-join -- self-nominate for a role (creates pending invitation)
  router.post('/:id/request-join', authMiddleware, async (req, res) => {
    try {
      const { role_index, message } = req.body;
      if (typeof role_index !== 'number') {
        return res.status(400).json({ success: false, error: 'role_index required' });
      }
      const [proj] = await sequelize.query(
        `SELECT plan_json, plan_status FROM ${t}_projects WHERE id = :id`,
        { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
      );
      if (!proj) return res.status(404).json({ success: false, error: 'Project not found' });
      if (!['published', 'recruiting'].includes(proj.plan_status)) {
        return res.status(400).json({ success: false, error: `Cannot request join in status: ${proj.plan_status}` });
      }
      const role = proj.plan_json && proj.plan_json.team_roles_required &&
                   proj.plan_json.team_roles_required[role_index];
      if (!role) return res.status(400).json({ success: false, error: 'Invalid role_index' });

      const [existing] = await sequelize.query(
        `SELECT id, status FROM ${t}_project_invitations
         WHERE project_id = :p AND member_id = :m AND role_index = :i`,
        { replacements: { p: req.params.id, m: req.member.id, i: role_index }, type: QueryTypes.SELECT }
      );
      if (existing) {
        return res.status(409).json({ success: false, error: `Already ${existing.status} for this role` });
      }

      await sequelize.query(
        `INSERT INTO ${t}_project_invitations
         (project_id, member_id, role_index, role_title, status, match_score, message, invited_at)
         VALUES (:p, :m, :i, :rt, 'pending', NULL, :msg, NOW())`,
        {
          replacements: {
            p: req.params.id, m: req.member.id, i: role_index,
            rt: role.role_title, msg: message || 'Self-nominated'
          }
        }
      );
      return res.status(201).json({ success: true, data: { message: 'Request submitted; awaiting proposer review' } });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /:id/invitations -- list invitations for the project (proposer)
  router.get('/:id/invitations', authMiddleware, async (req, res) => {
    try {
      const [proj] = await sequelize.query(
        `SELECT proposer_member_id FROM ${t}_projects WHERE id = :id`,
        { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
      );
      if (!proj) return res.status(404).json({ success: false, error: 'Project not found' });
      const [viewer] = await sequelize.query(
        `SELECT access_level FROM ${t}_members WHERE id = :id`,
        { replacements: { id: req.member.id }, type: QueryTypes.SELECT }
      );
      const isSuperadmin = viewer && viewer.access_level === 'superadmin';
      if (proj.proposer_member_id !== req.member.id && !isSuperadmin) {
        return res.status(403).json({ success: false, error: 'Not authorized' });
      }
      const inv = await sequelize.query(
        `SELECT i.*, m.first_name, m.last_name, m.email, m.sector, m.country
         FROM ${t}_project_invitations i
         JOIN ${t}_members m ON m.id = i.member_id
         WHERE i.project_id = :p
         ORDER BY i.role_index, i.match_score DESC NULLS LAST, i.invited_at DESC`,
        { replacements: { p: req.params.id }, type: QueryTypes.SELECT }
      );
      return res.json({ success: true, data: inv });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // ========================================================
  // P2B STAGE 2 -- Final Meeting & Digital Sign-off
  // ========================================================

  // POST /:id/book-final-meeting -- auto-book or manual
  router.post('/:id/book-final-meeting', authMiddleware, async (req, res) => {
    try {
      const [proj] = await sequelize.query(
        `SELECT * FROM ${t}_projects WHERE id = :id`,
        { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
      );
      if (!proj) return res.status(404).json({ success: false, error: 'Project not found' });

      const [viewer] = await sequelize.query(
        `SELECT access_level FROM ${t}_members WHERE id = :id`,
        { replacements: { id: req.member.id }, type: QueryTypes.SELECT }
      );
      const isSuperadmin = viewer && viewer.access_level === 'superadmin';
      if (proj.proposer_member_id !== req.member.id && !isSuperadmin) {
        return res.status(403).json({ success: false, error: 'Only proposer or superadmin can book' });
      }
      if (proj.plan_status !== 'fully_staffed' && proj.plan_status !== 'pending_signoff') {
        return res.status(400).json({ success: false, error: `Cannot book in status: ${proj.plan_status}` });
      }

      // Get participants
      const participants = await sequelize.query(
        `SELECT pm.member_id, m.first_name, m.last_name, m.email
         FROM ${t}_project_members pm
         JOIN ${t}_members m ON m.id = pm.member_id
         WHERE pm.project_id = :p`,
        { replacements: { p: req.params.id }, type: QueryTypes.SELECT }
      );
      // Always include proposer
      const [proposer] = await sequelize.query(
        `SELECT id AS member_id, first_name, last_name, email FROM ${t}_members WHERE id = :id`,
        { replacements: { id: proj.proposer_member_id }, type: QueryTypes.SELECT }
      );
      const allAttendees = [...participants];
      if (proposer && !participants.some(p => p.member_id === proposer.member_id)) {
        allAttendees.push(proposer);
      }
      const attendeeIds = allAttendees.map(a => a.member_id);

      const proposed = req.body.proposed_datetime
        ? new Date(req.body.proposed_datetime)
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      // Snap default to 14:00 UTC if no time was specified
      if (!req.body.proposed_datetime) {
        proposed.setUTCHours(14, 0, 0, 0);
      }
      const duration = parseInt(req.body.duration_minutes) || 60;

      const uid = ical.generateUID(req.params.id, 'final_review');
      const videoLink = ical.generateJitsiLink(req.params.id);

      // Build iCal
      const planTitle = (proj.plan_json && proj.plan_json.title) || proj.title;
      const icsBody = ical.buildICal({
        uid,
        startsAt: proposed,
        durationMinutes: duration,
        summary: `Final Review -- ${planTitle}`,
        description: `Final review and digital sign-off of the business plan for "${planTitle}".\n\nVideo link: ${videoLink}\n\nAll participants must review the plan and digitally sign off before the project enters execution.`,
        location: videoLink,
        organizerEmail: 'noreply@camaravirtual.app',
        organizerName: 'CamaraVirtual.app',
        attendees: allAttendees.map(a => ({ email: a.email, name: `${a.first_name} ${a.last_name}` }))
      });

      // Insert
      const [meeting] = await sequelize.query(
        `INSERT INTO ${t}_project_meetings
         (project_id, meeting_type, scheduled_at, duration_minutes, video_link, ical_event_uid, attendees, status, created_at, updated_at)
         VALUES (:p, 'final_review', :sa, :d, :vl, :uid, :att::int[], 'scheduled', NOW(), NOW())
         RETURNING *`,
        {
          replacements: {
            p: req.params.id, sa: proposed, d: duration, vl: videoLink, uid,
            att: '{' + attendeeIds.join(',') + '}'
          },
          type: QueryTypes.SELECT
        }
      );

      // Transition status -> pending_signoff
      await sequelize.query(
        `UPDATE ${t}_projects SET plan_status = 'pending_signoff', updated_at = NOW() WHERE id = :id`,
        { replacements: { id: req.params.id } }
      );

      return res.status(201).json({
        success: true,
        data: {
          meeting,
          ics: icsBody,
          attendee_count: allAttendees.length,
          attendees: allAttendees.map(a => ({ email: a.email, name: `${a.first_name} ${a.last_name}` }))
        }
      });
    } catch (err) {
      console.error('[book-meeting]', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /:id/meetings -- list scheduled meetings for project
  router.get('/:id/meetings', authMiddleware, async (req, res) => {
    try {
      const meetings = await sequelize.query(
        `SELECT * FROM ${t}_project_meetings WHERE project_id = :p ORDER BY scheduled_at DESC`,
        { replacements: { p: req.params.id }, type: QueryTypes.SELECT }
      );
      return res.json({ success: true, data: meetings });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /:id/meetings/:mid/ics -- download .ics file for a meeting
  router.get('/:id/meetings/:mid/ics', async (req, res) => {
    try {
      const [meeting] = await sequelize.query(
        `SELECT m.*, p.title, p.plan_json
         FROM ${t}_project_meetings m JOIN ${t}_projects p ON p.id = m.project_id
         WHERE m.id = :mid AND m.project_id = :p`,
        { replacements: { mid: req.params.mid, p: req.params.id }, type: QueryTypes.SELECT }
      );
      if (!meeting) return res.status(404).send('Meeting not found');

      const attendees = await sequelize.query(
        `SELECT id, first_name, last_name, email FROM ${t}_members
         WHERE id = ANY(:ids::int[])`,
        { replacements: { ids: '{' + meeting.attendees.join(',') + '}' }, type: QueryTypes.SELECT }
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

  // POST /:id/signoff -- digital sign-off by participant
  router.post('/:id/signoff', authMiddleware, async (req, res) => {
    try {
      const { typed_name, agreed } = req.body;
      if (!agreed) return res.status(400).json({ success: false, error: 'Must agree to plan' });
      if (!typed_name || typed_name.trim().length < 3) {
        return res.status(400).json({ success: false, error: 'Type your full name to sign' });
      }

      const [proj] = await sequelize.query(
        `SELECT * FROM ${t}_projects WHERE id = :id`,
        { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
      );
      if (!proj) return res.status(404).json({ success: false, error: 'Project not found' });
      if (!['pending_signoff', 'fully_staffed'].includes(proj.plan_status)) {
        return res.status(400).json({ success: false, error: `Cannot sign off in status: ${proj.plan_status}` });
      }

      // Verify member is participant or proposer
      const isProposer = proj.proposer_member_id === req.member.id;
      let isParticipant = isProposer;
      if (!isParticipant) {
        const [pm] = await sequelize.query(
          `SELECT 1 FROM ${t}_project_members WHERE project_id = :p AND member_id = :m`,
          { replacements: { p: req.params.id, m: req.member.id }, type: QueryTypes.SELECT }
        );
        isParticipant = !!pm;
      }
      if (!isParticipant) return res.status(403).json({ success: false, error: 'Not a project participant' });

      // Hash the plan_json at time of signing
      const planVersionHash = crypto.createHash('sha256')
        .update(JSON.stringify(proj.plan_json || {}))
        .digest('hex');

      // Insert (upsert: if already signed, update)
      const [existing] = await sequelize.query(
        `SELECT id FROM ${t}_project_signoffs WHERE project_id = :p AND member_id = :m`,
        { replacements: { p: req.params.id, m: req.member.id }, type: QueryTypes.SELECT }
      );
      if (existing) {
        return res.status(409).json({ success: false, error: 'Already signed' });
      }

      await sequelize.query(
        `INSERT INTO ${t}_project_signoffs
         (project_id, member_id, signed_at, plan_version_hash, signature_method, signature_payload, ip_address, user_agent)
         VALUES (:p, :m, NOW(), :h, 'typed_name', :sig, :ip, :ua)`,
        {
          replacements: {
            p: req.params.id,
            m: req.member.id,
            h: planVersionHash,
            sig: typed_name.trim(),
            ip: req.ip || req.connection.remoteAddress || null,
            ua: (req.headers['user-agent'] || '').substring(0, 500)
          }
        }
      );

      // Compute participants (proposer + project_members), then check unanimous
      const [{ count: participantCount }] = await sequelize.query(
        `SELECT COUNT(*) AS count FROM (
           SELECT proposer_member_id AS member_id FROM ${t}_projects WHERE id = :p
           UNION
           SELECT member_id FROM ${t}_project_members WHERE project_id = :p
         ) sub`,
        { replacements: { p: req.params.id }, type: QueryTypes.SELECT }
      );
      const [{ count: signedCount }] = await sequelize.query(
        `SELECT COUNT(*) AS count FROM ${t}_project_signoffs WHERE project_id = :p`,
        { replacements: { p: req.params.id }, type: QueryTypes.SELECT }
      );

      const allSigned = parseInt(signedCount) >= parseInt(participantCount);
      let newStatus = 'pending_signoff';
      let workspaceInit = null;
      if (allSigned) {
        newStatus = 'signed_off';
        await sequelize.query(
          `UPDATE ${t}_projects SET plan_status = 'signed_off', visibility = 'participants_only', updated_at = NOW()
           WHERE id = :id`,
          { replacements: { id: req.params.id } }
        );

        // Auto-initialize workspace from plan (no manual click needed)
        try {
          workspaceInit = await autoInitWorkspaceFromPlan(sequelize, t, req.params.id, req.member.id);
          if (!workspaceInit.skipped) newStatus = 'executing';
        } catch (initErr) {
          console.error('[auto-init workspace]', initErr.message);
        }
      }

      return res.json({
        success: true,
        data: {
          signed: true,
          all_signed: allSigned,
          signed_count: parseInt(signedCount),
          total_participants: parseInt(participantCount),
          new_status: newStatus,
          workspace_init: workspaceInit
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /:id/signoff-status
  router.get('/:id/signoff-status', authMiddleware, async (req, res) => {
    try {
      const [proj] = await sequelize.query(
        `SELECT id, proposer_member_id, plan_status FROM ${t}_projects WHERE id = :id`,
        { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
      );
      if (!proj) return res.status(404).json({ success: false, error: 'Project not found' });

      const participants = await sequelize.query(
        `SELECT DISTINCT m.id, m.first_name, m.last_name, m.email
         FROM ${t}_members m
         WHERE m.id = :proposer
            OR m.id IN (SELECT member_id FROM ${t}_project_members WHERE project_id = :p)`,
        { replacements: { proposer: proj.proposer_member_id, p: req.params.id }, type: QueryTypes.SELECT }
      );
      const signoffs = await sequelize.query(
        `SELECT member_id, signed_at, signature_payload FROM ${t}_project_signoffs WHERE project_id = :p`,
        { replacements: { p: req.params.id }, type: QueryTypes.SELECT }
      );
      const signedSet = new Set(signoffs.map(s => s.member_id));
      const result = participants.map(p => ({
        member_id: p.id,
        name: `${p.first_name} ${p.last_name}`,
        email: p.email,
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

  return router;
};
