// Chamber Template - Projects Routes Factory
const planGenerator = require('../lib/plan-generator');

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
      const projects = await sequelize.query(
        `SELECT p.*, m.first_name || ' ' || m.last_name AS proposer_name
         FROM ${t}_projects p LEFT JOIN ${t}_members m ON m.id = p.proposer_member_id
         WHERE p.id = :id`,
        { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
      );
      if (projects.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });
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

  // POST /:id/evaluate
  router.post('/:id/evaluate', authMiddleware, async (req, res) => {
    try {
      const projects = await sequelize.query(`SELECT * FROM ${t}_projects WHERE id = :id`, { replacements: { id: req.params.id }, type: QueryTypes.SELECT });
      if (projects.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });
      const project = projects[0];
      const budgetEst = parseFloat(project.budget_est) || 100000;
      const timelineEst = parseInt(project.timeline_est_months) || 12;
      const mockResult = {
        simulation: 'monte_carlo', iterations: 10000,
        budget: { p10: Math.round(budgetEst * 0.8), p50: Math.round(budgetEst), p90: Math.round(budgetEst * 1.4), mean: Math.round(budgetEst * 1.05) },
        timeline_months: { p10: Math.round(timelineEst * 0.85), p50: timelineEst, p90: Math.round(timelineEst * 1.35) },
        success_probability: 0.72, risk_score: 'medium'
      };
      return res.json({ success: true, data: mockResult });
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

  // POST /:id/publish -- transition draft -> published
  router.post('/:id/publish', authMiddleware, async (req, res) => {
    try {
      const projects = await sequelize.query(
        `SELECT id, proposer_member_id, plan_status, plan_json FROM ${t}_projects WHERE id = :id`,
        { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
      );
      if (projects.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });
      if (projects[0].proposer_member_id !== req.member.id) {
        return res.status(403).json({ success: false, error: 'Only the proposer can publish' });
      }
      if (projects[0].plan_status !== 'draft') {
        return res.status(400).json({ success: false, error: `Already ${projects[0].plan_status}` });
      }
      const validation = planGenerator.validatePlan(projects[0].plan_json);
      if (!validation.ok) return res.status(400).json({ success: false, error: validation.error });

      const result = await sequelize.query(
        `UPDATE ${t}_projects SET plan_status = 'published', visibility = 'public_plan', updated_at = NOW()
         WHERE id = :id RETURNING *`,
        { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
      );
      return res.json({ success: true, data: result[0] });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
