/**
 * HISPATEC - Project Lifecycle Management
 * Tables: hispatec_projects, hispatec_project_members
 */

const express = require('express');
const router = express.Router();
const { Sequelize, QueryTypes } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

// -- Auth middleware --
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'hispatec-jwt-secret-2026';
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Token requerido' });
  try {
    req.member = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ success: false, error: 'Token invalido' });
  }
}

// Valid lifecycle phases in order
const LIFECYCLE_PHASES = ['propuesta', 'analisis', 'equipo', 'recursos', 'ejecucion', 'completado'];

// ============================================================
// GET / -- List projects (paginated, filterable)
// ============================================================
router.get('/', async (req, res) => {
  try {
    const { status, sector, country, page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    const conditions = [];
    const replacements = {};

    if (status) {
      conditions.push('p.status = :status');
      replacements.status = status;
    }
    if (sector) {
      conditions.push('p.sector = :sector');
      replacements.sector = sector;
    }
    if (country) {
      conditions.push(':country = ANY(p.countries)');
      replacements.country = country;
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult = await sequelize.query(
      `SELECT COUNT(*) as total FROM hispatec_projects p ${where}`,
      { replacements, type: QueryTypes.SELECT }
    );
    const total = parseInt(countResult[0].total);

    const projects = await sequelize.query(
      `SELECT p.*, m.first_name || ' ' || m.last_name AS proposer_name
       FROM hispatec_projects p
       LEFT JOIN hispatec_members m ON m.id = p.proposer_member_id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT :limit OFFSET :offset`,
      { replacements: { ...replacements, limit: parseInt(limit), offset }, type: QueryTypes.SELECT }
    );

    return res.json({
      success: true,
      data: {
        projects,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
      }
    });
  } catch (err) {
    console.error('[hispatec-projects] GET / error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// POST / -- Create project proposal (auth required)
// ============================================================
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      title, description, sector, countries, pilot_type,
      budget_min, budget_est, budget_max,
      timeline_min_months, timeline_est_months, timeline_max_months
    } = req.body;

    if (!title || !description || !sector) {
      return res.status(400).json({ success: false, error: 'title, description y sector son requeridos' });
    }

    const countriesArray = Array.isArray(countries) ? countries : [];
    const countriesSql = `ARRAY[${countriesArray.map((_, i) => `:c${i}`).join(',')}]::TEXT[]`;
    const countryReplacements = {};
    countriesArray.forEach((c, i) => { countryReplacements[`c${i}`] = c; });

    const result = await sequelize.query(
      `INSERT INTO hispatec_projects
        (title, description, sector, countries, pilot_type,
         budget_min, budget_est, budget_max,
         timeline_min_months, timeline_est_months, timeline_max_months,
         status, proposer_member_id, created_at, updated_at)
       VALUES
        (:title, :description, :sector, ${countriesArray.length > 0 ? countriesSql : "ARRAY[]::TEXT[]"}, :pilot_type,
         :budget_min, :budget_est, :budget_max,
         :timeline_min_months, :timeline_est_months, :timeline_max_months,
         'propuesta', :proposer_member_id, NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          title, description, sector, pilot_type: pilot_type || null,
          budget_min: budget_min || null, budget_est: budget_est || null, budget_max: budget_max || null,
          timeline_min_months: timeline_min_months || null,
          timeline_est_months: timeline_est_months || null,
          timeline_max_months: timeline_max_months || null,
          proposer_member_id: req.member.id,
          ...countryReplacements
        },
        type: QueryTypes.SELECT
      }
    );

    return res.status(201).json({ success: true, data: result[0] });
  } catch (err) {
    console.error('[hispatec-projects] POST / error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// GET /:id -- Project detail with team members
// ============================================================
router.get('/:id', async (req, res) => {
  try {
    const projects = await sequelize.query(
      `SELECT p.*, m.first_name || ' ' || m.last_name AS proposer_name
       FROM hispatec_projects p
       LEFT JOIN hispatec_members m ON m.id = p.proposer_member_id
       WHERE p.id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
    );

    if (projects.length === 0) {
      return res.status(404).json({ success: false, error: 'Proyecto no encontrado' });
    }

    const members = await sequelize.query(
      `SELECT pm.*, m.first_name, m.last_name, m.email, m.country, m.sector
       FROM hispatec_project_members pm
       JOIN hispatec_members m ON m.id = pm.member_id
       WHERE pm.project_id = :id
       ORDER BY pm.joined_at ASC`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
    );

    return res.json({ success: true, data: { ...projects[0], team: members } });
  } catch (err) {
    console.error('[hispatec-projects] GET /:id error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// PUT /:id -- Update project (auth, proposer or admin only)
// ============================================================
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const projects = await sequelize.query(
      `SELECT * FROM hispatec_projects WHERE id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
    );

    if (projects.length === 0) {
      return res.status(404).json({ success: false, error: 'Proyecto no encontrado' });
    }

    const project = projects[0];
    if (project.proposer_member_id !== req.member.id && req.member.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Solo el proponente o admin puede editar' });
    }

    const {
      title, description, sector, countries, pilot_type,
      budget_min, budget_est, budget_max,
      timeline_min_months, timeline_est_months, timeline_max_months
    } = req.body;

    const sets = [];
    const replacements = { id: req.params.id };

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

    if (countries !== undefined) {
      const arr = Array.isArray(countries) ? countries : [];
      if (arr.length > 0) {
        const countriesSql = `ARRAY[${arr.map((_, i) => `:c${i}`).join(',')}]::TEXT[]`;
        sets.push(`countries = ${countriesSql}`);
        arr.forEach((c, i) => { replacements[`c${i}`] = c; });
      } else {
        sets.push("countries = ARRAY[]::TEXT[]");
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({ success: false, error: 'No hay campos para actualizar' });
    }

    sets.push('updated_at = NOW()');

    const result = await sequelize.query(
      `UPDATE hispatec_projects SET ${sets.join(', ')} WHERE id = :id RETURNING *`,
      { replacements, type: QueryTypes.SELECT }
    );

    return res.json({ success: true, data: result[0] });
  } catch (err) {
    console.error('[hispatec-projects] PUT /:id error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// POST /:id/advance -- Move project to next lifecycle phase
// ============================================================
router.post('/:id/advance', authMiddleware, async (req, res) => {
  try {
    const projects = await sequelize.query(
      `SELECT * FROM hispatec_projects WHERE id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
    );

    if (projects.length === 0) {
      return res.status(404).json({ success: false, error: 'Proyecto no encontrado' });
    }

    const project = projects[0];
    const currentIndex = LIFECYCLE_PHASES.indexOf(project.status);

    if (currentIndex === -1) {
      return res.status(400).json({ success: false, error: `Estado actual desconocido: ${project.status}` });
    }
    if (currentIndex === LIFECYCLE_PHASES.length - 1) {
      return res.status(400).json({ success: false, error: 'El proyecto ya esta completado' });
    }

    const nextPhase = LIFECYCLE_PHASES[currentIndex + 1];

    const result = await sequelize.query(
      `UPDATE hispatec_projects SET status = :nextPhase, updated_at = NOW() WHERE id = :id RETURNING *`,
      { replacements: { nextPhase, id: req.params.id }, type: QueryTypes.SELECT }
    );

    return res.json({
      success: true,
      data: result[0],
      transition: { from: project.status, to: nextPhase }
    });
  } catch (err) {
    console.error('[hispatec-projects] POST /:id/advance error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// POST /:id/join -- Join project team (auth required)
// ============================================================
router.post('/:id/join', authMiddleware, async (req, res) => {
  try {
    const projects = await sequelize.query(
      `SELECT id FROM hispatec_projects WHERE id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
    );

    if (projects.length === 0) {
      return res.status(404).json({ success: false, error: 'Proyecto no encontrado' });
    }

    // Check if already a member
    const existing = await sequelize.query(
      `SELECT id FROM hispatec_project_members WHERE project_id = :project_id AND member_id = :member_id`,
      { replacements: { project_id: req.params.id, member_id: req.member.id }, type: QueryTypes.SELECT }
    );

    if (existing.length > 0) {
      return res.status(409).json({ success: false, error: 'Ya eres miembro de este proyecto' });
    }

    const { role } = req.body;

    const result = await sequelize.query(
      `INSERT INTO hispatec_project_members (project_id, member_id, role, joined_at)
       VALUES (:project_id, :member_id, :role, NOW())
       RETURNING *`,
      {
        replacements: { project_id: req.params.id, member_id: req.member.id, role: role || 'colaborador' },
        type: QueryTypes.SELECT
      }
    );

    return res.status(201).json({ success: true, data: result[0] });
  } catch (err) {
    console.error('[hispatec-projects] POST /:id/join error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// POST /:id/evaluate -- Monte Carlo evaluation placeholder
// ============================================================
router.post('/:id/evaluate', authMiddleware, async (req, res) => {
  try {
    const projects = await sequelize.query(
      `SELECT * FROM hispatec_projects WHERE id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
    );

    if (projects.length === 0) {
      return res.status(404).json({ success: false, error: 'Proyecto no encontrado' });
    }

    const project = projects[0];

    // Mock Monte Carlo simulation result
    const budgetEst = parseFloat(project.budget_est) || 100000;
    const timelineEst = parseInt(project.timeline_est_months) || 12;

    const mockResult = {
      simulation: 'monte_carlo',
      iterations: 10000,
      budget: {
        p10: Math.round(budgetEst * 0.8),
        p50: Math.round(budgetEst * 1.0),
        p90: Math.round(budgetEst * 1.4),
        mean: Math.round(budgetEst * 1.05),
        std_dev: Math.round(budgetEst * 0.15)
      },
      timeline_months: {
        p10: Math.round(timelineEst * 0.85),
        p50: timelineEst,
        p90: Math.round(timelineEst * 1.35),
        mean: Math.round(timelineEst * 1.05),
        std_dev: Math.round(timelineEst * 0.12)
      },
      success_probability: 0.72,
      risk_score: 'medio',
      note: 'Resultado simulado -- se conectara a motor de calculo real'
    };

    return res.json({ success: true, data: mockResult });
  } catch (err) {
    console.error('[hispatec-projects] POST /:id/evaluate error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// POST /:id/assign -- Team optimization placeholder
// ============================================================
router.post('/:id/assign', authMiddleware, async (req, res) => {
  try {
    const projects = await sequelize.query(
      `SELECT * FROM hispatec_projects WHERE id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
    );

    if (projects.length === 0) {
      return res.status(404).json({ success: false, error: 'Proyecto no encontrado' });
    }

    const members = await sequelize.query(
      `SELECT pm.*, m.first_name, m.last_name, m.sector, m.country
       FROM hispatec_project_members pm
       JOIN hispatec_members m ON m.id = pm.member_id
       WHERE pm.project_id = :id`,
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
    );

    const mockAssignment = {
      project_id: parseInt(req.params.id),
      current_team_size: members.length,
      recommended_additions: [
        { role: 'lider_tecnico', sector: projects[0].sector, priority: 'alta' },
        { role: 'analista_financiero', sector: 'finanzas', priority: 'media' }
      ],
      coverage_score: members.length >= 3 ? 0.85 : 0.45,
      note: 'Resultado simulado -- se conectara a motor de optimizacion real'
    };

    return res.json({ success: true, data: mockAssignment });
  } catch (err) {
    console.error('[hispatec-projects] POST /:id/assign error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
