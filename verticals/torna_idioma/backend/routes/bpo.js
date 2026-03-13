const express = require('express');
const router = express.Router();
const sequelize = require('../services/db.ti');
const auth = require('../middleware/auth.ti');

// List BPO partner companies
router.get('/companies', async (req, res) => {
  try {
    const [companies] = await sequelize.query(
      `SELECT *, (SELECT COUNT(*) FROM ti_bpo_placements WHERE company_id = c.id AND status = 'active') as active_placements
       FROM ti_bpo_companies c WHERE c.partnership_status IN ('active','hiring') ORDER BY c.name`
    );
    res.json({ success: true, companies });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get company detail
router.get('/companies/:id', async (req, res) => {
  try {
    const [[company]] = await sequelize.query(`SELECT * FROM ti_bpo_companies WHERE id = $1`, { bind: [req.params.id] });
    if (!company) return res.status(404).json({ error: 'Company not found' });
    const [placements] = await sequelize.query(
      `SELECT p.*, u.full_name FROM ti_bpo_placements p JOIN ti_users u ON p.user_id = u.id WHERE p.company_id = $1 ORDER BY p.placed_at DESC`,
      { bind: [req.params.id] }
    );
    company.placements = placements;
    res.json({ success: true, company });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create company (admin/official)
router.post('/companies', auth.admin, async (req, res) => {
  try {
    const { name, industry, contact_name, contact_email, contact_phone, spanish_positions, avg_salary_increase, partnership_status } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const [[company]] = await sequelize.query(
      `INSERT INTO ti_bpo_companies (name, industry, contact_name, contact_email, contact_phone, spanish_positions, avg_salary_increase, partnership_status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW()) RETURNING *`,
      { bind: [name, industry||null, contact_name||null, contact_email||null, contact_phone||null, spanish_positions||0, avg_salary_increase||null, partnership_status||'prospect'] }
    );
    res.status(201).json({ success: true, company });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Job board — list open positions across companies
router.get('/jobs', async (req, res) => {
  try {
    const [jobs] = await sequelize.query(
      `SELECT j.*, c.name as company_name, c.industry as company_industry
       FROM ti_bpo_jobs j JOIN ti_bpo_companies c ON j.company_id = c.id
       WHERE j.status = 'open' ORDER BY j.posted_at DESC`
    );
    res.json({ success: true, jobs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Apply for a job
router.post('/jobs/:id/apply', auth.any, async (req, res) => {
  try {
    const [[existing]] = await sequelize.query(
      `SELECT id FROM ti_bpo_applications WHERE user_id = $1 AND job_id = $2`,
      { bind: [req.user.id, req.params.id] }
    );
    if (existing) return res.status(409).json({ error: 'Already applied' });
    const { cover_note } = req.body;
    const [[app]] = await sequelize.query(
      `INSERT INTO ti_bpo_applications (user_id, job_id, cover_note, status, applied_at) VALUES ($1,$2,$3,'submitted',NOW()) RETURNING *`,
      { bind: [req.user.id, req.params.id, cover_note || null] }
    );
    res.status(201).json({ success: true, application: app });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// My applications
router.get('/my/applications', auth.any, async (req, res) => {
  try {
    const [apps] = await sequelize.query(
      `SELECT a.*, j.title, j.location, j.salary_range, j.spanish_level_required, c.name as company_name
       FROM ti_bpo_applications a JOIN ti_bpo_jobs j ON a.job_id = j.id JOIN ti_bpo_companies c ON j.company_id = c.id
       WHERE a.user_id = $1 ORDER BY a.applied_at DESC`,
      { bind: [req.user.id] }
    );
    res.json({ success: true, applications: apps });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// BPO program stats
router.get('/stats', async (req, res) => {
  try {
    const [[stats]] = await sequelize.query(`
      SELECT
        (SELECT COUNT(*) FROM ti_bpo_companies WHERE partnership_status IN ('active','hiring')) as total_companies,
        (SELECT COALESCE(SUM(spanish_positions),0) FROM ti_bpo_companies WHERE partnership_status IN ('active','hiring')) as total_positions,
        (SELECT COUNT(*) FROM ti_bpo_placements WHERE status = 'active') as active_placements,
        (SELECT COALESCE(AVG(salary_increase_pct),0) FROM ti_bpo_placements WHERE salary_increase_pct IS NOT NULL) as avg_salary_increase,
        (SELECT COUNT(*) FROM ti_bpo_jobs WHERE status = 'open') as open_jobs
    `);
    res.json({ success: true, stats });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
