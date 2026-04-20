// Chamber Template - Projects Routes Factory
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
  router.get('/', async (req, res) => {
    try {
      const { status, sector, country, page = 1, limit = 20 } = req.query;
      const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
      const conditions = []; const replacements = {};
      if (status) { conditions.push('p.status = :status'); replacements.status = status; }
      if (sector) { conditions.push('p.sector = :sector'); replacements.sector = sector; }
      if (country) { conditions.push(':country = ANY(p.countries)'); replacements.country = country; }
      const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
      const countResult = await sequelize.query(`SELECT COUNT(*) as total FROM ${t}_projects p ${where}`, { replacements, type: QueryTypes.SELECT });
      const total = parseInt(countResult[0].total);
      const projects = await sequelize.query(
        `SELECT p.*, m.first_name || ' ' || m.last_name AS proposer_name
         FROM ${t}_projects p LEFT JOIN ${t}_members m ON m.id = p.proposer_member_id ${where}
         ORDER BY p.created_at DESC LIMIT :limit OFFSET :offset`,
        { replacements: { ...replacements, limit: parseInt(limit), offset }, type: QueryTypes.SELECT }
      );
      return res.json({ success: true, data: { projects, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } } });
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
  router.get('/:id', async (req, res) => {
    try {
      const projects = await sequelize.query(`SELECT p.*, m.first_name || ' ' || m.last_name AS proposer_name FROM ${t}_projects p LEFT JOIN ${t}_members m ON m.id = p.proposer_member_id WHERE p.id = :id`, { replacements: { id: req.params.id }, type: QueryTypes.SELECT });
      if (projects.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });
      const members = await sequelize.query(`SELECT pm.*, m.first_name, m.last_name, m.email, m.country, m.sector FROM ${t}_project_members pm JOIN ${t}_members m ON m.id = pm.member_id WHERE pm.project_id = :id ORDER BY pm.joined_at ASC`, { replacements: { id: req.params.id }, type: QueryTypes.SELECT });
      return res.json({ success: true, data: { ...projects[0], team: members } });
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

  return router;
};
